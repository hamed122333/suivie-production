import { useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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

    function connect() {
      es = new EventSource(`${API_URL}/api/events`);

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
        // Reconnect after 3s
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, []); // stable — handlers tracked via ref
}
