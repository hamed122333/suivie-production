const pool = require('../config/db');
const MAX_NOTIFICATIONS_PER_PAGE = 100;

let broadcast;
try {
  broadcast = require('../services/sseService').broadcast;
} catch (e) {
  broadcast = () => {};
}

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
    broadcast('notifications-updated', { type: 'task_created', count: taskIds.length });
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
    broadcast('notifications-updated', { type: 'date_updated' });
  },

  async createDateNegotiationNotificationBatch({ taskId, recipientUserIds, actorName, action, proposedDate }) {
    if (!taskId || !Array.isArray(recipientUserIds) || recipientUserIds.length === 0) return;
    const dateFmt = formatDateFR(proposedDate);
    const titleMap = {
      PROPOSE: `${actorName || 'Un planificateur'} — Date proposée`,
      ACCEPT:  `${actorName || 'Un planificateur'} — Date confirmée`,
      REJECT:  `${actorName || 'Un planificateur'} — Date refusée`,
    };
    const bodyMap = {
      PROPOSE: `${actorName || 'Un planificateur'} a proposé une date de livraison pour SP-${taskId} : ${dateFmt}`,
      ACCEPT:  `${actorName || 'Un planificateur'} a confirmé la date de livraison de SP-${taskId} : ${dateFmt}`,
      REJECT:  `${actorName || 'Un planificateur'} a refusé la date et contre-proposé le ${dateFmt} pour SP-${taskId}`,
    };
    const title = titleMap[action] || `${actorName} — Négociation date`;
    const body  = bodyMap[action]  || `Négociation de date sur SP-${taskId}`;
    const values = [];
    const placeholders = [];
    let index = 1;
    for (const uid of recipientUserIds) {
      values.push(uid, taskId, 'date_negotiation', title, body);
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})`);
      index += 5;
    }
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    broadcast('notifications-updated', { type: 'date_negotiation' });
  },

  async createEscalationNotification({ taskId, recipientUserId, commercialName, taskTitle }) {
    if (!taskId || !recipientUserId) return;
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        recipientUserId,
        taskId,
        'escalation',
        `🔥 Escalade urgente — ${commercialName}`,
        `${commercialName} a marqué SP-${taskId}${taskTitle ? ` (${taskTitle})` : ''} comme URGENTE hors stock. Action requise.`,
      ]
    );
    broadcast('notifications-updated', { type: 'escalation' });
  },

  /**
   * Notify all livreurs that a task is ready to be picked up and delivered.
   * Called when a task transitions to DONE.
   */
  async createReadyToDeliverNotifications({ taskId, recipientUserIds, plannerName, taskTitle }) {
    if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) return;
    const values = [];
    const placeholders = [];
    let index = 1;
    for (const uid of recipientUserIds) {
      values.push(
        uid,
        taskId,
        'ready_to_deliver',
        `🚚 Prêt à livrer — SP-${taskId}`,
        `${plannerName || 'Le planificateur'} a validé SP-${taskId}${taskTitle ? ` (${taskTitle})` : ''} — commande prête à livrer.`
      );
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})`);
      index += 5;
    }
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    broadcast('notifications-updated', { type: 'ready_to_deliver', taskId });
  },

  /**
   * Notify a commercial that new orders were imported and await their review.
   * @param {Array<{recipientUserId:number, count:number}>} entries
   */
  async createOrdersImportedNotifications(entries) {
    const list = (entries || []).filter((e) => e && e.recipientUserId && e.count > 0);
    if (list.length === 0) return;
    const values = [];
    const placeholders = [];
    let index = 1;
    for (const { recipientUserId, count } of list) {
      values.push(
        recipientUserId,
        null,
        'orders_imported',
        `📥 ${count} nouvelle${count > 1 ? 's' : ''} commande${count > 1 ? 's' : ''} à valider`,
        `${count} commande${count > 1 ? 's' : ''} vous ${count > 1 ? 'ont' : 'a'} été affectée${count > 1 ? 's' : ''} — à vérifier et valider dans « Commandes ».`
      );
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})`);
      index += 5;
    }
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    broadcast('notifications-updated', { type: 'orders_imported' });
  },

  /**
   * Batch-insert status-change notifications for multiple recipients.
   * One SQL statement instead of N individual INSERTs — eliminates N+1.
   */
  async createStatusChangedNotificationBatch({ taskId, recipientUserIds, changedByName, oldStatusLabel, newStatusLabel }) {
    if (!taskId || !Array.isArray(recipientUserIds) || recipientUserIds.length === 0) return;
    const title = `${changedByName || 'Un planificateur'} — ${newStatusLabel}`;
    const body  = `${changedByName || 'Un planificateur'} a fait passer SP-${taskId} de "${oldStatusLabel}" à "${newStatusLabel}"`;
    const values = [];
    const placeholders = [];
    let index = 1;
    for (const uid of recipientUserIds) {
      values.push(uid, taskId, 'status_updated', title, body);
      placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4})`);
      index += 5;
    }
    await pool.query(
      `INSERT INTO notifications (recipient_user_id, task_id, type, title, body)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    broadcast('notifications-updated', { type: 'status_updated' });
  },
};

module.exports = NotificationModel;
