const UserModel = require('../models/userModel');

const VALID_ROLES = ['super_admin', 'planner', 'commercial', 'user'];

const userController = {
  async getAll(req, res) {
    try {
      const users = await UserModel.getAll();
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Le nom est obligatoire' });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'L\'email est obligatoire' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
      }

      const assignedRole = VALID_ROLES.includes(role) ? role : 'user';

      const existing = await UserModel.findByEmail(email.trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Cet email est déjà utilisé' });
      }

      const user = await UserModel.create(
        name.trim(),
        email.trim().toLowerCase(),
        password,
        assignedRole
      );
      res.status(201).json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async delete(req, res) {
    try {
      const u = await UserModel.delete(req.params.id);
      res.json({ message: 'Compte supprime' });
    } catch (err) {
      if (err.message.includes('introuvable')) {
         return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: 'Erreur lors de la suppression du compte' });
    }
  },
};

module.exports = userController;
