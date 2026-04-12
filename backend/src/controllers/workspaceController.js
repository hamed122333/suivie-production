const WorkspaceModel = require('../models/workspaceModel');
const { WORKSPACE_TYPE_LIST, WORKSPACE_TYPES } = require('../constants/workspace');

const workspaceController = {
  async getAll(req, res) {
    try {
      const workspaces = await WorkspaceModel.getAll();
      res.json(workspaces);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, type } = req.body;
      const trimmed = (name || '').trim();
      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Workspace name is required' });
      }
      const normalizedType = `${type || ''}`.trim().toUpperCase() || WORKSPACE_TYPES.STOCK;
      if (!WORKSPACE_TYPE_LIST.includes(normalizedType)) {
        return res.status(400).json({ error: 'Invalid workspace type' });
      }
      const existing = await WorkspaceModel.findByName(trimmed);
      if (existing) {
        return res.status(400).json({ error: 'Workspace already exists' });
      }
      const workspace = await WorkspaceModel.create({ name: trimmed, type: normalizedType });
      res.status(201).json(workspace);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = workspaceController;
