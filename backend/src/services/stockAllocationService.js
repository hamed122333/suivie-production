const pool = require('../config/db');
const TaskModel = require('../models/taskModel');
const StockImportModel = require('../models/stockImportModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
const NotificationModel = require('../models/notificationModel');
const UserModel = require('../models/userModel');
const { broadcast } = require('./sseService');

/**
 * Single source of truth for stock allocation.
 *
 * Given an article reference, this function:
 * 1. Reads the total available stock (global, cross-workspace)
 * 2. Finds ALL active tasks for that article (any client, any workspace)
 * 3. Allocates stock FIFO by planned_date → due_date → id
 * 4. Persists stock_allocated, stock_deficit, priority_order on each task (badge)
 * 5. FORWARD-ONLY: when a task is fully covered (deficit === 0), the SYSTEM
 *    promotes it to DONE (Prêt à Livrer) from any of WAITING_STOCK / TODO /
 *    IN_PROGRESS. No demotion ever — a task never moves backward when stock drops.
 * 6. Logs history for every system promotion
 * 7. Broadcasts real-time updates
 *
 * Key rule: allocation is by ARTICLE CODE + QUANTITY only — client is irrelevant,
 * two clients ordering the same article compete for the same stock pool.
 *
 * Le planificateur pilote manuellement Hors Stock PF → À Préparer → En Préparation.
 * Le système ne fait QUE confirmer la disponibilité (→ Prêt à Livrer) et n'effectue
 * AUCUNE rétrogradation.
 */
/**
 * Wrapper concurrentiel : sérialise le recalcul d'un MÊME article via un verrou
 * consultatif PostgreSQL. Deux imports/approbations/cron sur le même article ne
 * s'entrelacent plus (intégrité). Les articles différents restent parallèles.
 *
 * Important (prod / Supabase) : on utilise pg_advisory_xact_lock DANS une
 * transaction (et non un verrou de SESSION) car le pooler transaction de Supabase
 * (pgBouncer) ne conserve pas la session entre deux requêtes → un verrou de
 * session « fuit ». Le verrou de transaction est, lui, lié à la transaction qui
 * épingle la connexion serveur, puis libéré au COMMIT.
 *
 * Best-effort : si le verrou ne peut pas être pris (latence, pooler, timeout),
 * on poursuit SANS verrou plutôt que de faire échouer l'import. `lock_timeout`
 * empêche tout blocage prolongé. La logique d'allocation est inchangée.
 */
async function recalculateStockAllocation(itemReference, options = {}) {
  if (!itemReference) return [];
  const lockKey = itemReference.toUpperCase().trim();
  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
  } catch (e) {
    // Verrou indisponible → dégradation gracieuse (recalcul sans verrou).
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      try { client.release(); } catch (_) { /* ignore */ }
      client = null;
    }
  }
  try {
    return await recalcAllocationCore(itemReference, options);
  } finally {
    if (client) {
      try { await client.query('COMMIT'); } catch (_) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      try { client.release(); } catch (_) { /* ignore */ }
    }
  }
}

async function recalcAllocationCore(itemReference, options = {}) {
  // options.silent — suppress the final broadcast('tasks-updated') and batch the
  // ready-to-deliver notifications into a single broadcast. Used when this function
  // is called inside a loop (large stock import, recalculateAllArticles,
  // approveOrders) so the caller emits ONE broadcast at the end instead of N.
  const { silent = false } = options;
  if (!itemReference) return [];

  const normalizedRef = itemReference.toUpperCase().trim();

  // 1. Stock physique de l'article. La déduction réelle n'a lieu qu'à la LIVRAISON
  //    (statut Livré). Les fiches déjà en « Prêt à Livrer » (DONE) ont leur stock
  //    ENGAGÉ mais pas encore déduit → on le réserve hors de l'allocation pour ne
  //    pas le ré-attribuer à une autre commande.
  const physicalStock = Math.max(0, await StockImportModel.getStockQuantity(normalizedRef));
  const doneTasks = await TaskModel.getAll({ itemReference, status: 'DONE' });
  const committedToDone = doneTasks
    .filter(t => t.item_reference && t.item_reference.toUpperCase() === normalizedRef)
    .reduce((sum, t) => sum + Number(t.quantity || 0), 0);
  const availableStock = Math.max(0, physicalStock - committedToDone);

  // 2. All active tasks for this article, any workspace, any client
  const allTasks = await TaskModel.getAll({
    itemReference,
    statusIn: ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'],
  });

  // Extra safety: filter by article match (case-insensitive)
  const tasksForArticle = allTasks
    .filter(t => t.item_reference && t.item_reference.toUpperCase() === itemReference.toUpperCase())
    .sort((a, b) => {
      // FIFO: earliest delivery date first
      const dateA = a.planned_date || a.due_date || '9999-12-31';
      const dateB = b.planned_date || b.due_date || '9999-12-31';
      const cmp = new Date(dateA) - new Date(dateB);
      if (cmp !== 0) return cmp;
      // Tie-breaker: lowest ID first (oldest task)
      return a.id - b.id;
    });

  if (tasksForArticle.length === 0) return [];

  // 3. FIFO allocation
  let stockRemaining = availableStock;
  const allocations = [];

  for (let i = 0; i < tasksForArticle.length; i++) {
    const task = tasksForArticle[i];
    const requested = Number(task.quantity || 0);
    const allocated = Math.min(requested, Math.max(0, stockRemaining));
    const deficit = Math.max(0, requested - allocated);

    allocations.push({
      taskId: task.id,
      currentStatus: task.status,
      stockImportId: task.stock_import_id || null,
      title: task.title,
      commercialId: task.commercial_id || null,
      priorityOrder: i + 1,
      quantityRequested: requested,
      quantityAllocated: allocated,
      stockDeficit: deficit,
      isCovered: deficit === 0,
    });

    stockRemaining -= allocated;
  }

  // 4. Persist + status changes
  const promotedToDone = []; // fiches passées auto en « Prêt à Livrer » → notifier les livreurs
  for (const alloc of allocations) {
    // Always persist allocation fields (camelCase → updateFieldMap)
    await TaskModel.update(alloc.taskId, {
      stockAllocated: alloc.quantityAllocated,
      stockDeficit: alloc.stockDeficit,
      priorityOrder: alloc.priorityOrder,
    });

    // PROMOTION (avant uniquement) : couvert à 100% et statut actif amont
    // (Hors Stock PF / À Préparer / En Préparation) → Prêt à Livrer (DONE).
    // Aucune rétrogradation : une fiche non couverte reste où elle est.
    const PROMOTABLE = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS'];
    if (alloc.isCovered && PROMOTABLE.includes(alloc.currentStatus)) {
      try {
        await TaskModel.updateStatus(
          alloc.taskId,
          'DONE',
          null,
          null,
          'system',
          { systemAutoPromotion: true }
        );
        await TaskHistoryModel.log({
          taskId: alloc.taskId,
          actorId: null,
          actionType: 'stock_confirmed',
          fieldName: 'status',
          oldValue: alloc.currentStatus,
          newValue: 'DONE',
          message: `Stock PF disponible (${alloc.quantityAllocated} pcs) — passage automatique en Prêt à Livrer`,
        });
        // Pas de déduction ici : le stock est seulement ENGAGÉ. La soustraction
        // réelle se fait à la LIVRAISON (markDelivered → statut Livré).
        promotedToDone.push({ id: alloc.taskId, title: alloc.title, commercialId: alloc.commercialId });
      } catch (err) {
        console.error(`[Allocation] Failed to promote task ${alloc.taskId} → DONE:`, err.message);
      }
    }
  }

  // 4b. Notifier les livreurs des commandes devenues « Prêt à Livrer » (le système
  //     promeut hors du contrôleur, donc on déclenche ici la notification livreur).
  if (promotedToDone.length > 0) {
    try {
      const livreurs = await UserModel.findByRoles(['livreur']);
      const livreurIds = livreurs.map((l) => l.id);
      if (livreurIds.length > 0) {
        // Single batched insert + single broadcast for all promoted tasks
        // (avoids one 'notifications-updated' broadcast per task → 429 amplification).
        await NotificationModel.createReadyToDeliverNotificationsBatch({
          tasks: promotedToDone.map((t) => ({ taskId: t.id, title: t.title })),
          recipientUserIds: livreurIds,
          plannerName: 'Le système (stock confirmé)',
        });
      }
    } catch (err) {
      console.error('[Allocation] Failed to notify livreurs of ready-to-deliver tasks:', err.message);
    }

    // 4c. Notifier AUSSI le commercial responsable de chaque commande devenue
    //     « Prêt à Livrer » : sans ça, le commercial ne voit pas passer ses
    //     commandes en phase de livraison (promotion système, hors contrôleur).
    try {
      const withCommercial = promotedToDone.filter((t) => t.commercialId);
      if (withCommercial.length > 0) {
        const commercials = await UserModel.findByRoles(['commercial']);
        const byCode = new Map(
          commercials.filter((c) => c.commercial_id).map((c) => [c.commercial_id, c.id])
        );
        const entries = withCommercial
          .map((t) => ({ recipientUserId: byCode.get(t.commercialId), taskId: t.id, title: t.title }))
          .filter((e) => e.recipientUserId);
        if (entries.length > 0) {
          await NotificationModel.createReadyToDeliverCommercialNotifications({ entries });
        }
      }
    } catch (err) {
      console.error('[Allocation] Failed to notify commercials of ready-to-deliver tasks:', err.message);
    }
  }

  // 5. Notify frontend (skipped in silent mode — the caller emits one broadcast
  //    after its loop to avoid N broadcasts during bulk operations).
  if (!silent) {
    broadcast('tasks-updated', { source: 'allocation', article: itemReference });
  }

  return allocations;
}

/**
 * Recalculate ALL articles that have active tasks.
 * Used by the daily cron and the admin recalculate-all endpoint.
 */
async function recalculateAllArticles() {
  const allTasks = await TaskModel.getAll({
    statusIn: ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'],
  });

  const articles = [...new Set(
    allTasks
      .map(t => (t.item_reference || '').toUpperCase())
      .filter(Boolean)
  )];

  let totalProcessed = 0;
  for (const article of articles) {
    await recalculateStockAllocation(article, { silent: true });
    totalProcessed++;
  }

  // Single broadcast after the whole batch instead of one per article.
  if (totalProcessed > 0) {
    broadcast('tasks-updated', { source: 'allocation-all', count: totalProcessed });
  }

  return totalProcessed;
}

module.exports = {
  recalculateStockAllocation,
  recalculateAllArticles,
};
