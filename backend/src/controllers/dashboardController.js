const TaskModel = require('../models/taskModel');
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

      res.json({
        counts: {
          totalTasks: parseCount(counts.total_tasks),
          totalTodo: parseCount(counts.total_todo),
          totalInProgress: parseCount(counts.total_in_progress),
          totalDone: parseCount(counts.total_done),
          totalBlocked: parseCount(counts.total_blocked),
          dueToday: parseCount(counts.due_today),
          overdue: parseCount(counts.overdue),
          dueThisWeek: parseCount(counts.due_this_week),
          completedToday: parseCount(counts.completed_today),
        },
        upcomingDue: stats.upcomingDue || [],
        blockedTasks: stats.blockedTasks || [],
        lineLoad: (stats.lineLoad || []).map((entry) => ({
          productionLine: entry.production_line,
          taskCount: parseCount(entry.task_count),
        })),
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
