const pool = require('../config/db');

function getExecutor(client) {
  return client || pool;
}

const TaskCommentModel = {
  async listByTask(taskId, client = null) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `SELECT c.*, u.name AS author_name, u.role AS author_role
       FROM task_comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC, c.id ASC`,
      [taskId]
    );

    return result.rows;
  },

  async create({ taskId, authorId, body }, client = null) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `INSERT INTO task_comments (task_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, authorId, body]
    );

    return result.rows[0];
  },
};

module.exports = TaskCommentModel;
