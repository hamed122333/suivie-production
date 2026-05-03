const pool = require('../config/db');
const MAX_NOTIFICATIONS_PER_PAGE = 100;

function formatDateFR(dateStr) {
  if (!dateStr) return 'non définie';
  const s = `${dateStr}`.slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

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
          `${createdByName || 'Un commercial'} — Nouvelle commande`,
          `${createdByName || 'Un commercial'} a créé la tâche SP-${taskId}`
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
    const safePerPage = Number.isInteger(perPage) && perPage > 0 ? Math.min(perPage, MAX_NOTIFICATIONS_PER_PAGE) : 20;
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

  async createDateChangedNotification({ taskId, recipientUserId, changedByName, fieldLabel, oldDate, newDate }) {
    if (!taskId || !recipientUserId) return;
    const oldFmt = formatDateFR(oldDate);
    const newFmt = formatDateFR(newDate);
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        recipientUserId,
        taskId,
        'date_updated',
        `${changedByName || 'Un planificateur'} — Date modifiée`,
        `${changedByName || 'Un planificateur'} a modifié la ${fieldLabel} de SP-${taskId} : ${oldFmt} → ${newFmt}`,
      ]
    );
  },

  async createDateNegotiationNotification({ taskId, recipientUserId, actorName, action, proposedDate }) {
    if (!taskId || !recipientUserId) return;
    const dateFmt = formatDateFR(proposedDate);
    const titleMap = {
      PROPOSE: `${actorName || 'Un planificateur'} — Date proposée`,
      ACCEPT:  `${actorName || 'Un planificateur'} — Date confirmée`,
      REJECT:  `${actorName || 'Un planificateur'} — Date refusée`,
    };
    const bodyMap = {
      PROPOSE: `${actorName || 'Un planificateur'} a proposé une date de livraison pour SP-${taskId} : ${dateFmt}`,
      ACCEPT:  `${actorName || 'Un planificateur'} a confirmé la date de livraison de SP-${taskId} : ${dateFmt}`,
      REJECT:  `${actorName || 'Un planificateur'} a refusé la date et contre-propose le ${dateFmt} pour SP-${taskId}`,
    };
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        recipientUserId,
        taskId,
        'date_negotiation',
        titleMap[action] || `${actorName} — Négociation date`,
        bodyMap[action] || `Négociation de date sur SP-${taskId}`,
      ]
    );
  },

  async createStatusChangedNotification({ taskId, recipientUserId, changedByName, oldStatusLabel, newStatusLabel }) {
    if (!taskId || !recipientUserId) return;
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        recipientUserId,
        taskId,
        'status_updated',
        `${changedByName || 'Un planificateur'} — ${newStatusLabel}`,
        `${changedByName || 'Un planificateur'} a fait passer SP-${taskId} de "${oldStatusLabel}" à "${newStatusLabel}"`,
      ]
    );
  },
};

module.exports = NotificationModel;
