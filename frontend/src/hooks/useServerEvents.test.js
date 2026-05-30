import { renderHook } from '@testing-library/react';
import useServerEvents from './useServerEvents';
import { AUTH_CHANGED_EVENT } from '../utils/authStorage';

// ── Mock minimal d'EventSource (absent de jsdom) ─────────────────────────────
class MockEventSource {
  static instances = [];
  static CLOSED = 2;
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    MockEventSource.instances.push(this);
  }
  addEventListener() {}
  close() { this.readyState = MockEventSource.CLOSED; }
}

describe('useServerEvents — connexion SSE conditionnée au token', () => {
  beforeEach(() => {
    global.EventSource = MockEventSource;
    MockEventSource.instances = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    // Ferme le singleton entre les tests (token retiré → listener déclenche disconnect)
    window.localStorage.removeItem('token');
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  });

  test('aucune connexion ouverte sans token (évite les 401 sur la page login)', () => {
    renderHook(() => useServerEvents({ 'tasks-updated': () => {} }));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  test('ouvre une connexion avec le token en query quand authentifié', () => {
    window.localStorage.setItem('token', 'jwt-abc-123');
    renderHook(() => useServerEvents({ 'tasks-updated': () => {} }));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('/api/events?token=jwt-abc-123');
  });

  test('une seule connexion partagée pour plusieurs abonnés', () => {
    window.localStorage.setItem('token', 'tok');
    renderHook(() => useServerEvents({ 'tasks-updated': () => {} }));
    renderHook(() => useServerEvents({ 'stock-updated': () => {} }));
    expect(MockEventSource.instances).toHaveLength(1);
  });
});
