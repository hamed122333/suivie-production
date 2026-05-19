import { useEffect, useRef } from 'react';

// REACT_APP_API_URL may or may not include a trailing /api (axis config
// expects it WITH /api). EventSource has no baseURL concept, so we strip any
// trailing /api here and append /api/events ourselves — avoids /api/api/events.
const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

/**
 * Subscribe to Server-Sent Events from the backend.
 *
 * @param {Record<string, (data: any) => void>} handlers
 *   Map of event names to callbacks, e.g. { 'stock-updated': (d) => refetch() }
 *
 * Reconnects automatically on disconnect (with 3s backoff).
 */
export default function useServerEvents(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let es;
    let retryTimer;
    let retryDelay = 3000;
    const MAX_RETRY_DELAY = 30000;

    function connect() {
      es = new EventSource(`${API_URL}/api/events`);

      // A successful (re)connection resets the backoff window.
      es.onopen = () => {
        retryDelay = 3000;
      };

      // Wire up each event
      const names = Object.keys(handlersRef.current);
      for (const name of names) {
        es.addEventListener(name, (event) => {
          try {
            const data = JSON.parse(event.data);
            handlersRef.current[name]?.(data);
          } catch {
            handlersRef.current[name]?.({});
          }
        });
      }

      es.onerror = () => {
        es.close();
        // Exponential backoff (3s → 30s max) so a down/404 endpoint
        // cannot turn into a request storm that trips the rate limiter.
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, []); // stable — handlers tracked via ref
}
