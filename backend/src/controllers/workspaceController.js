const WorkspaceModel = require('../models/workspaceModel');

const workspaceController = {
  async getAll(req, res) {
    try {
      let workspaces;
      if (req.user?.role === 'commercial') {
        await WorkspaceModel.ensureCommercialMonthlyWorkspace();
        workspaces = await WorkspaceModel.getCommercialMonthlyWorkspaces();
      } else {
        workspaces = await WorkspaceModel.getAll();
      }
      res.json(workspaces);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const { name } = req.body;
      const trimmed = (name || '').trim();
      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Workspace name is required' });
      }
      const existing = await WorkspaceModel.findByName(trimmed);
      if (existing) {
        return res.status(400).json({ error: 'Workspace already exists' });
      }
      const workspace = await WorkspaceModel.create({ name: trimmed });
      res.status(201).json(workspace);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = workspaceController;
