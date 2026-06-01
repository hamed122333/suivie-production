const TaskModel = require('../models/taskModel');
const StockImportModel = require('../models/stockImportModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
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
async function recalculateStockAllocation(itemReference) {
  if (!itemReference) return [];

  const normalizedRef = itemReference.toUpperCase().trim();

  // 1. Total stock available for this article (global)
  const availableStock = Math.max(0, await StockImportModel.getStockQuantity(normalizedRef));

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
      priorityOrder: i + 1,
      quantityRequested: requested,
      quantityAllocated: allocated,
      stockDeficit: deficit,
      isCovered: deficit === 0,
    });

    stockRemaining -= allocated;
  }

  // 4. Persist + status changes
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

        // Le produit fini quitte l'inventaire dès « Prêt à Livrer » → déduire le stock
        // (évite la double-allocation du même stock lors d'un recalcul ultérieur).
        try {
          if (alloc.stockImportId) {
            await StockImportModel.deductQuantity(alloc.stockImportId, alloc.quantityAllocated);
          } else {
            await StockImportModel.deductQuantityByArticle(normalizedRef, alloc.quantityAllocated);
          }
        } catch (e) {
          console.error(`[Allocation] Failed to deduct stock for task ${alloc.taskId}:`, e.message);
        }
      } catch (err) {
        console.error(`[Allocation] Failed to promote task ${alloc.taskId} → DONE:`, err.message);
      }
    }
  }

  // 5. Notify frontend
  broadcast('tasks-updated', { source: 'allocation', article: itemReference });

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
    await recalculateStockAllocation(article);
    totalProcessed++;
  }

  return totalProcessed;
}

module.exports = {
  recalculateStockAllocation,
  recalculateAllArticles,
};
