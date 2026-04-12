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
        return res.status(400).json({ error: 'Le nom de l\'espace est requis (min. 2 caractères)' });
      }

      const type = (workspace_type || 'STOCK').toUpperCase();
      if (!WorkspaceModel.VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `Type d'espace invalide. Types acceptés : ${WorkspaceModel.VALID_TYPES.join(', ')}` });
      }

      if (type === 'PREPARATION') {
        if (!planned_date) {
          return res.status(400).json({ error: 'La date de préparation est requise pour un espace En Préparation' });
        }
        const d = new Date(planned_date);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'La date de préparation est invalide' });
        }
      }

      const existing = await WorkspaceModel.findByName(trimmed);
      if (existing) {
        return res.status(400).json({ error: 'Un espace avec ce nom existe déjà' });
      }

      const workspace = await WorkspaceModel.create({
        name: trimmed,
        workspace_type: type,
        planned_date: type === 'PREPARATION' ? planned_date : null,
        created_by: req.user?.id || null,
      });
      res.status(201).json(workspace);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = workspaceController;

