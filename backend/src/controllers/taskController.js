const TaskModel = require('../models/taskModel');

const taskController = {
  async reorderBoard(req, res) {
    try {
      const { columnOrders, workspaceId } = req.body;
      if (!columnOrders || typeof columnOrders !== 'object') {
        return res.status(400).json({ error: 'columnOrders object is required' });
      }
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId is required' });
      }
      const wid = parseInt(workspaceId, 10);
      if (!Number.isInteger(wid)) return res.status(400).json({ error: 'Invalid workspaceId' });

      await TaskModel.reorderBoard(columnOrders, wid);
      const tasks = await TaskModel.getAll({ workspaceId: wid });
      res.json(tasks);
    } catch (err) {
      if (
        err.message &&
        (err.message.includes('Board order') ||
          err.message.includes('Duplicate') ||
          err.message.includes('Invalid task') ||
          err.message.includes('workspaceId'))
      ) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getAll(req, res) {
    try {
      const filters = {};
      if (req.query.assignedTo) filters.assignedTo = parseInt(req.query.assignedTo);
      if (req.query.status) filters.status = req.query.status;
      if (req.query.date) filters.date = req.query.date;
      if (req.query.workspaceId || req.query.workspace) {
        const raw = req.query.workspaceId || req.query.workspace;
        const wid = parseInt(raw, 10);
        if (!Number.isNaN(wid)) filters.workspaceId = wid;
      }

      // Visibility rules:
      // - super_admin: global view (all tasks)
      // - planner: global view (all tasks)
      // - others: only tasks they created
      if (req.user.role !== 'super_admin' && req.user.role !== 'planner') {
        filters.createdBy = req.user.id;
      }

      const tasks = await TaskModel.getAll(filters);
      res.json(tasks);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getById(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const { title, description, priority, workspaceId } = req.body;
      if (!title) return res.status(400).json({ error: 'Title is required' });
      if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

      const wid = parseInt(workspaceId, 10);
      if (!Number.isInteger(wid)) return res.status(400).json({ error: 'Invalid workspaceId' });

      const task = await TaskModel.create({
        title,
        description,
        priority,
        createdBy: req.user.id,
        workspaceId: wid,
      });
      res.status(201).json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async update(req, res) {
    try {
      const task = await TaskModel.update(req.params.id, req.body);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status, reasonBlocked } = req.body;
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (status === 'BLOCKED' && !reasonBlocked) {
        return res.status(400).json({ error: 'Reason required when blocking a task' });
      }

      const task = await TaskModel.updateStatus(
        req.params.id,
        status,
        reasonBlocked || null,
        req.user.id,
        req.user.role
      );
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      if (err.message === 'Not authorized to update this task') {
        return res.status(403).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async delete(req, res) {
    try {
      const task = await TaskModel.delete(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json({ message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = taskController;
