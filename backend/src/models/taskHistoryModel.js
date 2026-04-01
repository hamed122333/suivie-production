const pool = require('../config/db');

function getExecutor(client) {
  return client || pool;
}

const TaskHistoryModel = {
  async listByTask(taskId, client = null) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `SELECT h.*, u.name AS actor_name, u.role AS actor_role
       FROM task_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.task_id = $1
       ORDER BY h.created_at DESC, h.id DESC`,
      [taskId]
    );

    return result.rows;
  },

  async log(entry, client = null) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `INSERT INTO task_history (task_id, actor_id, action_type, field_name, old_value, new_value, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        entry.taskId,
        entry.actorId || null,
        entry.actionType,
        entry.fieldName || null,
        entry.oldValue == null ? null : String(entry.oldValue),
        entry.newValue == null ? null : String(entry.newValue),
        entry.message || null,
      ]
    );

    return result.rows[0];
  },

  async logMany(entries, client = null) {
    for (const entry of entries) {
      await this.log(entry, client);
    }
  },
};

module.exports = TaskHistoryModel;
