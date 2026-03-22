const UserModel = require('../models/userModel');

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
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password required' });
      }
      const existing = await UserModel.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      const user = await UserModel.create(name, email, password, role);
      res.status(201).json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = userController;
