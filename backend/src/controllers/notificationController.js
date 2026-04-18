const NotificationModel = require('../models/notificationModel');

const notificationController = {
  async list(req, res) {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const perPage = Number.parseInt(req.query.perPage, 10) || 20;
      const data = await NotificationModel.listByRecipient({
        recipientUserId: req.user.id,
        page,
        perPage,
      });

      res.json({
        items: data.items,
        pagination: {
          total: data.total,
          page: data.page,
          perPage: data.perPage,
          totalPages: Math.max(1, Math.ceil(data.total / data.perPage)),
        },
        unreadCount: data.unread,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async markAsRead(req, res) {
    try {
      const notificationId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(notificationId) || notificationId < 1) {
        return res.status(400).json({ error: 'ID notification invalide' });
      }

      const updated = await NotificationModel.markAsRead(notificationId, req.user.id);
      if (!updated) {
        return res.status(404).json({ error: 'Notification introuvable' });
      }
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async markAllAsRead(req, res) {
    try {
      const updatedCount = await NotificationModel.markAllAsRead(req.user.id);
      res.json({ updatedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

module.exports = notificationController;
