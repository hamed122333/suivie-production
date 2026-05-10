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
 * 4. Persists stock_allocated, stock_deficit, priority_order on each task
 * 5. Auto-demotes TODO/IN_PROGRESS/BLOCKED → WAITING_STOCK if deficit > 0
 * 6. Auto-promotes WAITING_STOCK → TODO if fully covered
 * 7. Logs history for every status change
 * 8. Broadcasts real-time updates
 *
 * Key rule: allocation is by ARTICLE CODE + QUANTITY only.
 * Client name is irrelevant — two clients ordering the same article compete
 * for the same stock pool.
 *
 * Edge cases handled:
 * - No stock at all → all tasks demoted to WAITING_STOCK
 * - Partial stock → tasks get partial allocation, deficit calculated
 * - Stock increases → waiting tasks promoted to TODO
 * - Stock decreases → tasks demoted to WAITING_STOCK
 * - Multiple tasks with same planned_date → sorted by ID (oldest first)
 * - Tasks with no dates → treated as latest priority (9999-12-31)
 * - Stock deleted → all tasks for that article recalculated
 * - Task deleted → stock freed, queue shifts up
 * - Task quantity changed → reallocate, may affect other tasks
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

    // DEMOTE: deficit > 0 and NOT already WAITING_STOCK → move to WAITING_STOCK
    if (!alloc.isCovered && alloc.currentStatus !== 'WAITING_STOCK' && alloc.currentStatus !== 'DONE') {
      try {
        await TaskModel.updateStatus(
          alloc.taskId,
          'WAITING_STOCK',
          `Stock insuffisant: ${alloc.stockDeficit} pcs manquant(s) sur ${alloc.quantityRequested} demandés`,
          null,
          'system'
        );
        await TaskHistoryModel.log({
          taskId: alloc.taskId,
          actorId: null,
          actionType: 'status_updated',
          fieldName: 'status',
          oldValue: alloc.currentStatus,
          newValue: 'WAITING_STOCK',
          message: `Stock insuffisant: ${alloc.stockDeficit} pcs manquant(s) — rétrogradé automatiquement (priorité #${alloc.priorityOrder})`,
        });
      } catch (err) {
        console.error(`[Allocation] Failed to demote task ${alloc.taskId}:`, err.message);
      }
    }

    // PROMOTE: fully covered and currently WAITING_STOCK → move to TODO
    if (alloc.isCovered && alloc.currentStatus === 'WAITING_STOCK') {
      try {
        await TaskModel.updateStatus(
          alloc.taskId,
          'TODO',
          null,
          null,
          'system'
        );
        await TaskHistoryModel.log({
          taskId: alloc.taskId,
          actorId: null,
          actionType: 'stock_confirmed',
          fieldName: 'status',
          oldValue: 'WAITING_STOCK',
          newValue: 'TODO',
          message: `Stock disponible: ${alloc.quantityAllocated} pcs alloués — promu automatiquement (priorité #${alloc.priorityOrder})`,
        });
      } catch (err) {
        console.error(`[Allocation] Failed to promote task ${alloc.taskId}:`, err.message);
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
