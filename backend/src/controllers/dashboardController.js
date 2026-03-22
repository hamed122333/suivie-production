const TaskModel = require('../models/taskModel');

const dashboardController = {
  async getStats(req, res) {
    try {
      const stats = await TaskModel.getDashboardStats();
      res.json({
        todayTotal: parseInt(stats.today_total),
        totalDone: parseInt(stats.total_done),
        totalInProgress: parseInt(stats.total_in_progress),
        totalBlocked: parseInt(stats.total_blocked),
        totalTodo: parseInt(stats.total_todo),
        grandTotal: parseInt(stats.grand_total)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = dashboardController;
