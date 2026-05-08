/**
 * Lightweight Server-Sent Events (SSE) hub.
 *
 * Any part of the backend can call `broadcast(event, data)` to push
 * a real-time message to every connected frontend client.
 *
 * Clients connect via GET /api/events (see route in app.js).
 */

const clients = new Set();

/** Register a new SSE client (Express response object). */
function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

/**
 * Broadcast an event to all connected clients.
 * @param {string} event  — event name the frontend listens for (e.g. 'stock-updated')
 * @param {object} [data] — optional JSON payload
 */
function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

module.exports = { addClient, broadcast };
