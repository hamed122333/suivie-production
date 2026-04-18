const pool = require('../config/db');

const NotificationModel = {
  async createTaskCreatedNotifications({ taskIds, recipientUserIds, createdByName }) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) return;
    if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) return;

    const values = [];
    const placeholders = [];
    let index = 1;

    for (const taskId of taskIds) {
      for (const recipientUserId of recipientUserIds) {
        values.push(
          recipientUserId,
          taskId,
          'task_created',
          'Nouvelle tache creee',
          `${createdByName || 'Un commercial'} a cree la tache SP-${taskId}`
        );
        placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})`);
        index += 5;
      }
    }

    await pool.query(
      `
      INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
      VALUES ${placeholders.join(', ')}
      `,
      values
    );
  },

  async listByRecipient({ recipientUserId, page = 1, perPage = 20 }) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safePerPage = Number.isInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 20;
    const offset = (safePage - 1) * safePerPage;

    const [itemsResult, totalResult, unreadResult] = await Promise.all([
      pool.query(
        `
        SELECT n.*, t.workspace_id, w.name AS workspace_name
        FROM notifications n
        LEFT JOIN tasks t ON t.id = n.task_id
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        WHERE n.recipient_user_id = $1
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $2 OFFSET $3
        `,
        [recipientUserId, safePerPage, offset]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1',
        [recipientUserId]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS unread FROM notifications WHERE recipient_user_id = $1 AND is_read = FALSE',
        [recipientUserId]
      ),
    ]);

    return {
      items: itemsResult.rows,
      total: totalResult.rows[0]?.total || 0,
      unread: unreadResult.rows[0]?.unread || 0,
      page: safePage,
      perPage: safePerPage,
    };
  },

  async markAsRead(id, recipientUserId) {
    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = TRUE,
          read_at = COALESCE(read_at, NOW())
      WHERE id = $1 AND recipient_user_id = $2
      RETURNING *
      `,
      [id, recipientUserId]
    );
    return result.rows[0] || null;
  },

  async markAllAsRead(recipientUserId) {
    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = TRUE,
          read_at = COALESCE(read_at, NOW())
      WHERE recipient_user_id = $1 AND is_read = FALSE
      RETURNING id
      `,
      [recipientUserId]
    );
    return result.rowCount;
  },
};

module.exports = NotificationModel;
