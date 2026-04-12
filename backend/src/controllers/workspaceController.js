const WorkspaceModel = require('../models/workspaceModel');

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
      const { name, workspace_type, planned_date } = req.body;
      const trimmed = (name || '').trim();
      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Workspace name is required' });
      }

      const type = (workspace_type || 'STANDARD').toUpperCase();
      if (!WorkspaceModel.VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `Type d'espace invalide. Types acceptés : ${WorkspaceModel.VALID_TYPES.join(', ')}` });
      }

      if (type === 'PLANNED') {
        if (!planned_date) {
          return res.status(400).json({ error: 'La date planifiée est requise pour un espace de type Planifié' });
        }
        const d = new Date(planned_date);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'La date planifiée est invalide' });
        }
      }

      const existing = await WorkspaceModel.findByName(trimmed);
      if (existing) {
        return res.status(400).json({ error: 'Workspace already exists' });
      }

      const workspace = await WorkspaceModel.create({
        name: trimmed,
        workspace_type: type,
        planned_date: type === 'PLANNED' ? planned_date : null,
      });
      res.status(201).json(workspace);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = workspaceController;

