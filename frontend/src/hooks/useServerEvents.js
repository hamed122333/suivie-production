import { useEffect, useRef } from 'react';

// REACT_APP_API_URL may include trailing /api (e.g. "http://localhost:5000/api").
// EventSource has no baseURL concept, so we must strip it before appending /api/events.
const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = RAW_API_URL.replace(/\/api$/, '');

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
        retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
        retryTimer = setTimeout(connect, retryDelay);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, []); // stable — handlers tracked via ref
}
