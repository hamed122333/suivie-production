const WorkspaceModel = require('../models/workspaceModel');

function getFrenchMonthName(monthIndex) {
  const monthNames = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  return monthNames[monthIndex] || '';
}

const workspaceController = {
  async getAll(req, res) {
    try {
      // Logic for automatic daily workspace
      let workspaces = await WorkspaceModel.getAll();
      
      const now = new Date();
      const monthName = getFrenchMonthName(now.getMonth());
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      const currentWorkspaceName = `Production ${day} ${monthName} ${year}`;
      
      const exists = workspaces.find((ws) => ws.name === currentWorkspaceName);
      
      if (!exists) {
        const newWorkspace = await WorkspaceModel.create({ name: currentWorkspaceName });
        // After creation, refetch all to keep them sorted as in DB
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
