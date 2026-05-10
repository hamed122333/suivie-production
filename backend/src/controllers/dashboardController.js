const TaskModel = require('../models/taskModel');
const StockImportModel = require('../models/stockImportModel');
const { isHttpError } = require('../utils/httpErrors');
const { applyTaskVisibility, parseWorkspaceId } = require('../utils/taskScope');

const dashboardController = {
  async getStats(req, res) {
    try {
      const workspaceId = parseWorkspaceId(req.query.workspaceId || req.query.workspace);
      const filters = applyTaskVisibility({ workspaceId }, req.user);
      const stats = await TaskModel.getDashboardStats(filters);
      const counts = stats.counts || {};

      const parseCount = (value) => Number.parseInt(value || 0, 10);

      const [tasks, stock] = await Promise.all([
        TaskModel.getAll(filters),
        StockImportModel.getAll(),
      ]);

      const clientBreakdown = {};
      const articleBreakdown = {};
      const categoryBreakdown = { CI: 0, CV: 0, DI: 0, DV: 0, FC: 0, FD: 0, PL: 0, OTHER: 0 };
      let totalQuantity = 0;
      let totalQuantityDone = 0;

      tasks.forEach((task) => {
        if (task.client_name) {
          clientBreakdown[task.client_name] = (clientBreakdown[task.client_name] || 0) + 1;
        }
        if (task.item_reference) {
          const prefix = task.item_reference.substring(0, 2).toUpperCase();
          const category = ['CI', 'CV', 'DI', 'DV', 'FC', 'FD', 'PL'].includes(prefix) ? prefix : 'OTHER';
          categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
          articleBreakdown[task.item_reference] = (articleBreakdown[task.item_reference] || 0) + 1;
        }
        totalQuantity += Number(task.quantity || 0);
        if (task.status === 'DONE') {
          totalQuantityDone += Number(task.quantity || 0);
        }
      });

      const topClients = Object.entries(clientBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const topArticles = Object.entries(articleBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([article, count]) => ({ article, count }));

      const stockSummary = {
        totalArticles: stock.length,
        totalQuantity: stock.reduce((sum, s) => sum + Number(s.quantity || 0), 0),
        availableQuantity: stock.reduce((sum, s) => sum + Number(s.available_quantity || 0), 0),
        reservedQuantity: stock.reduce((sum, s) => sum + Number(s.total_reserved || 0), 0),
        lowStockCount: stock.filter((s) => s.coverage_percent < 100).length,
        readyCount: stock.filter((s) => s.is_ready).length,
        pendingCount: stock.filter((s) => !s.is_ready).length,
      };

      res.json({
        counts: {
          totalTasks: parseCount(counts.total_tasks),
          totalTodo: parseCount(counts.total_todo),
          totalWaitingStock: parseCount(counts.total_waiting_stock),
          totalInProgress: parseCount(counts.total_in_progress),
          totalDone: parseCount(counts.total_done),
          totalBlocked: parseCount(counts.total_blocked),
          dueToday: parseCount(counts.due_today),
          overdue: parseCount(counts.overdue),
          dueThisWeek: parseCount(counts.due_this_week),
          completedToday: parseCount(counts.completed_today),
          totalQuantity,
          totalQuantityDone,
        },
        upcomingDue: stats.upcomingDue || [],
        blockedTasks: stats.blockedTasks || [],
        lineLoad: (stats.lineLoad || []).map((entry) => ({
          productionLine: entry.production_line,
          taskCount: parseCount(entry.task_count),
        })),
        analytics: {
          topClients,
          topArticles,
          categoryBreakdown,
          stockSummary,
        },
      });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = dashboardController;
