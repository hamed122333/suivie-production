/**
 * useServerEvents — SSE singleton hub.
 *
 * All callers (Header, KanbanPage, DashboardPage, …) share ONE EventSource
 * per tab instead of opening N connections. Events are dispatched to every
 * registered callback for that event name.
 *
 * JWT token is passed as ?token=<jwt> because EventSource cannot send headers.
 */

import { useEffect, useRef } from 'react';

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

// ── Module-level singleton state ─────────────────────────────────────────────

let singleton  = null;           // the live EventSource
let retryTimer = null;
let retryDelay = 3000;
const MAX_RETRY_DELAY = 30_000;

// eventName → Set<callback>
const registry  = {};
// eventName → true (already wired on current ES instance)
const wiredOn   = new Set();

function wireEvent(name) {
  if (!singleton || wiredOn.has(name)) return;
  wiredOn.add(name);
  singleton.addEventListener(name, (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { data = {}; }
    const cbs = registry[name];
    if (cbs) for (const cb of cbs) cb(data);
  });
}

function ensureConnected() {
  if (singleton && singleton.readyState !== EventSource.CLOSED) return;

  clearTimeout(retryTimer);
  const token = localStorage.getItem('token') || '';
  const url   = `${API_URL}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  singleton = new EventSource(url);
  wiredOn.clear();

  singleton.onopen = () => { retryDelay = 3000; };

  // Re-wire all already-registered event names on the new connection
  for (const name of Object.keys(registry)) {
    if ((registry[name]?.size ?? 0) > 0) wireEvent(name);
  }

  singleton.onerror = () => {
    singleton.close();
    singleton = null;
    wiredOn.clear();
    retryTimer = setTimeout(ensureConnected, retryDelay);
    retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to named SSE events.
 *
 * @param {Record<string, (data: any) => void>} handlers
 *   e.g. { 'stock-updated': (d) => refetch(), 'tasks-updated': refresh }
 *
 * Handlers object identity is allowed to change each render — latest version
 * is always called via ref.
 */
export default function useServerEvents(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const names = Object.keys(handlersRef.current);

    // Build stable per-event callbacks that delegate to the latest ref
    const callbacks = {};
    for (const name of names) {
      callbacks[name] = (data) => handlersRef.current[name]?.(data);

      if (!registry[name]) registry[name] = new Set();
      registry[name].add(callbacks[name]);

      // If the singleton is already alive, wire the new event name immediately
      if (singleton && singleton.readyState !== EventSource.CLOSED) {
        wireEvent(name);
      }
    }

    ensureConnected();

    return () => {
      for (const name of names) {
        registry[name]?.delete(callbacks[name]);
      }
      // Leave the singleton open — other components may still be subscribed
    };
  }, []); // stable — handlers tracked via ref
}
