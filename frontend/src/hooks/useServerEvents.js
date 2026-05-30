/**
 * useServerEvents — SSE singleton hub.
 *
 * All callers (Header, KanbanPage, DashboardPage, …) share ONE EventSource
 * per tab instead of opening N connections. Events are dispatched to every
 * registered callback for that event name.
 *
 * JWT token is passed as ?token=<jwt> because EventSource cannot send headers.
 * La connexion n'est ouverte QUE si un token est présent — sinon le backend
 * renverrait 401 en boucle (ex. sur la page de login). La connexion est
 * (re)établie automatiquement après login et fermée après logout via
 * l'événement AUTH_CHANGED_EVENT.
 */

import { useEffect, useRef } from 'react';
import { AUTH_CHANGED_EVENT } from '../utils/authStorage';

const RAW_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = RAW_API_URL.replace(/\/api\/?$/, '');

// ── Module-level singleton state ─────────────────────────────────────────────

let singleton  = null;           // the live EventSource
let retryTimer = null;
let retryDelay = 3000;
const MAX_RETRY_DELAY = 30_000;
let authListenerAttached = false;

// eventName → Set<callback>
const registry  = {};
// eventName → true (already wired on current ES instance)
const wiredOn   = new Set();

function getToken() {
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

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

function disconnect() {
  clearTimeout(retryTimer);
  retryTimer = null;
  if (singleton) {
    singleton.onerror = null;
    singleton.close();
    singleton = null;
  }
  wiredOn.clear();
}

function ensureConnected() {
  const token = getToken();

  // Pas de token → aucune connexion (évite les 401 répétés avant authentification)
  if (!token) {
    disconnect();
    return;
  }

  if (singleton && singleton.readyState !== EventSource.CLOSED) return;

  clearTimeout(retryTimer);
  const url = `${API_URL}/api/events?token=${encodeURIComponent(token)}`;

  singleton = new EventSource(url);
  wiredOn.clear();

  singleton.onopen = () => { retryDelay = 3000; };

  // Re-wire all already-registered event names on the new connection
  for (const name of Object.keys(registry)) {
    if ((registry[name]?.size ?? 0) > 0) wireEvent(name);
  }

  singleton.onerror = () => {
    if (singleton) singleton.close();
    singleton = null;
    wiredOn.clear();
    // Reconnexion uniquement si un token est toujours présent
    if (getToken()) {
      retryTimer = setTimeout(ensureConnected, retryDelay);
      retryDelay = Math.min(retryDelay * 1.5, MAX_RETRY_DELAY);
    }
  };
}

// Reconnecte après login / déconnecte après logout (une seule fois par onglet)
function attachAuthListener() {
  if (authListenerAttached || typeof window === 'undefined') return;
  authListenerAttached = true;
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    if (getToken()) ensureConnected();
    else disconnect();
  });
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

    attachAuthListener();
    ensureConnected();

    return () => {
      for (const name of names) {
        registry[name]?.delete(callbacks[name]);
      }
      // Leave the singleton open — other components may still be subscribed
    };
  }, []); // stable — handlers tracked via ref
}
