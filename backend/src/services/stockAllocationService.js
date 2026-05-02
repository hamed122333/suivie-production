const TaskModel = require('../models/taskModel');
const StockImportModel = require('../models/stockImportModel');

async function recalculateStockAllocation(itemReference, workspaceId) {
  if (!itemReference) return;

  // Récupérer le stock disponible
  const stock = await StockImportModel.findByArticle(itemReference);
  const availableStock = stock ? Number(stock.quantity || 0) : 0;

  // Récupérer toutes les tâches non DONE pour cet article, triées par date
  const allTasks = await TaskModel.getAll({
    status: 'WAITING_STOCK,TODO,IN_PROGRESS,BLOCKED',
    workspaceId,
  });

  const tasksForArticle = allTasks
    .filter(t => t.item_reference && t.item_reference.toUpperCase() === itemReference.toUpperCase() && t.status !== 'DONE')
    .sort((a, b) => {
      // Trier par date prévue (ascending = earlierst first)
      const dateA = a.planned_date || a.due_date || '9999-12-31';
      const dateB = b.planned_date || b.due_date || '9999-12-31';
      return dateA.localeCompare(dateB);
    });

  // Calculer l'allocation
  let stockRemaining = availableStock;
  const allocations = [];

  for (let i = 0; i < tasksForArticle.length; i++) {
    const task = tasksForArticle[i];
    const requested = Number(task.quantity || 0);
    const allocated = Math.min(requested, Math.max(0, stockRemaining));
    const deficit = Math.max(0, requested - allocated);

    allocations.push({
      taskId: task.id,
      priorityOrder: i + 1, // 1ère, 2ème, 3ème...
      quantityRequested: requested,
      quantityAllocated: allocated,
      stockDeficit: deficit,
      shouldBeWaitingStock: deficit > 0,
    });

    stockRemaining -= allocated;
  }

  // Mettre à jour les tâches dans la base de données
  for (const alloc of allocations) {
    await TaskModel.update(alloc.taskId, {
      stock_allocated: alloc.quantityAllocated,
      stock_deficit: alloc.stockDeficit,
      priority_order: alloc.priorityOrder,
    });

    // Si déficit > 0 et status n'est pas déjà WAITING_STOCK, passer à WAITING_STOCK
    const task = tasksForArticle.find(t => t.id === alloc.taskId);
    if (alloc.shouldBeWaitingStock && task.status !== 'WAITING_STOCK' && task.status !== 'DONE') {
      await TaskModel.updateStatus(
        alloc.taskId,
        'WAITING_STOCK',
        `Stock insuffisant: ${alloc.stockDeficit} pcs manquant(s)`,
        null,
        'system'
      );
    }
  }

  return allocations;
}

module.exports = {
  recalculateStockAllocation,
};
