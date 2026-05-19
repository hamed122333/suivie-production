# Deep Debugging & Performance Audit — Suivi Production

Senior-level production debugging audit of the full stack (React frontend +
Express backend + Python OCR service). Findings cover repeated/duplicated API
requests, render loops, polling, rate limits, 404/429 causes, memory leaks,
over-fetching and backend bottlenecks.

## How to use this file

Each item below is a checkbox with a stable ID (`C1`, `H3`, `M2`, …). Fix one
at a time with the custom command:

```
/fix-bug C1
```

`/fix-bug <id>` diagnoses the bug, applies a production-ready fix, verifies it
(build/lint), and ticks the checkbox here. Work top-down: **Critical → High →
Medium → Low**.

## Severity legend

| Level | Meaning |
|-------|---------|
| 🔴 Critical | Broken feature or app-wide perf cascade. Fix immediately. |
| 🟠 High | Wasteful request/render amplification or 429 risk. Fix soon. |
| 🟡 Medium | Real inefficiency, not user-blocking. Schedule it. |
| 🟢 Low | Hardening / polish. Opportunistic. |

> Note: this project uses **React Context** for state — there is no Zustand.
> Audit items about "Zustand subscriptions / deprecated usage" are **N/A**.

---

## 🔴 Critical

- [x] **C1 — `PATCH /api/notifications/read-all` unreachable.**
  `backend/src/routes/notificationRoutes.js` — `/:id/read` was declared before
  `/read-all`, so Express matched `read-all` as the `:id` param and routed to
  `markAsRead`. **Impact:** the "Tout lire" button silently failed.
  **Fix:** literal `/read-all` route declared before the `/:id/read` param route.
  *(Fixed in audit session.)*

- [x] **C2 — AuthContext provider value not memoized.**
  `frontend/src/context/AuthContext.js` — value object + `login`/`logout` were
  re-created every render, re-rendering **every** consumer (Header, KanbanBoard,
  all pages). **Impact:** app-wide render cascade.
  **Fix:** `login`/`logout` wrapped in `useCallback`; provider value in `useMemo`.
  *(Fixed in audit session.)*

- [x] **C3 — WorkspaceContext provider value not memoized.**
  `frontend/src/context/WorkspaceContext.js` — same render cascade as C2.
  **Fix:** provider value wrapped in `useMemo`. *(Fixed in audit session.)*

- [x] **C4 — Camera MediaStream never stopped on unmount.**
  `frontend/src/pages/CapturePage.jsx` — `stopCamera` ran only on snap/cancel;
  navigating away left the camera track live. **Impact:** device resource leak,
  browser "camera in use" indicator stuck on.
  **Fix:** `stopCamera` made stable + `useEffect` cleanup releases it on unmount.
  *(Fixed in audit session.)*

## 🟠 High

- [ ] **H1 — `URL.createObjectURL` leak in CapturePage.**
  `frontend/src/pages/CapturePage.jsx:33` — preview object URLs are never
  revoked; each capture leaks one blob URL. **Impact:** memory growth across a
  capture session. **Fix:** revoke the previous URL before creating a new one,
  and revoke on unmount.

- [ ] **H2 — Redundant notification fetching.**
  `frontend/src/components/Header.js` — notifications fetched via three channels
  at once: 30s `setInterval`, `window` focus, and SSE `notifications-updated`.
  **Impact:** over-fetching / request amplification, feeds H5. **Fix:** make SSE
  the primary channel; keep polling only as a long-interval (60s) fallback; drop
  or debounce the focus refetch.

- [ ] **H3 — RollsPage 5s polling storm.**
  `frontend/src/pages/RollsPage.jsx:65-69` — `setInterval(refresh, 5000)` hits
  the OCR microservice every 5s per open tab, forever. **Impact:** request storm
  with multiple tabs / idle pages. **Fix:** lengthen the interval, pause polling
  while `document.hidden`, or switch to SSE/backoff.

- [ ] **H4 — KanbanPage refetches tasks on every URL change.**
  `frontend/src/pages/KanbanPage.js:30-47` — `fetchTasks` depends on
  `searchParams`; the workspace effect lists `fetchTasks` in deps, so unrelated
  query-param changes re-run it → redundant `GET /tasks`. **Fix:** read
  `searchParams` inside the effect or stabilize the dependency.

- [ ] **H5 — Rate-limit policy mismatch + 429 risk.**
  `backend/src/app.js:26-40` sets 500/15min general + 50/15min auth, but
  `CLAUDE.md` documents 200 + 20. With ~16+ concurrent users the notification
  poll alone can approach the shared limit and trigger 429s that block unrelated
  calls. **Fix:** align code and docs on one policy; re-evaluate the ceiling
  after H2 lands.

## 🟡 Medium

- [ ] **M1 — KanbanBoard error-timeout not cleared on unmount.**
  `frontend/src/components/KanbanBoard.js:188-192` — `errorTimeoutRef` timeout
  can fire after unmount → `setState` on an unmounted component. **Fix:** add a
  cleanup `useEffect` clearing the ref.

- [ ] **M2 — `taskBaseSelect` correlated subqueries (N+1).**
  `backend/src/models/taskModel.js:31-48` — `planned_by_name`/`planned_by_role`
  run a correlated subquery per row; a 500-task fetch = 500 subqueries.
  **Fix:** replace with a `LATERAL` join / window function, or denormalize.

- [ ] **M3 — TaskDetailsPanel escape-key listener re-attaches every render.**
  `frontend/src/components/TaskDetailsPanel.js:151-164` depends on `onClose`,
  which `KanbanBoard.js` passes as an inline arrow. **Impact:** listener removed
  + re-added on every parent render. **Fix:** wrap `onClose` in `useCallback`.

- [ ] **M4 — No request deduplication / caching in the API layer.**
  `frontend/src/services/api.js` — concurrent identical GETs are not coalesced.
  **Fix:** add a lightweight in-flight-request dedup map, or adopt React Query
  for cache + dedup.

- [ ] **M5 — stockAllocationService does N writes per recalculation.**
  `backend/src/services/stockAllocationService.js:86-142` — one `TaskModel.update`
  + one `TaskHistoryModel.log` per changed task. **Fix:** batch updates / history
  inserts in a single statement or transaction.

- [ ] **M6 — OCR pipeline blocks the Node event loop.**
  `backend/src/services/ocrService.js:76-132` — synchronous multi-pass OCR
  (~2-10s) blocks the thread; concurrent scans pile up. **Fix:** offload to a
  worker thread / job queue, or serialize with a concurrency limit.

## 🟢 Low

- [ ] **L1 — Unnecessary effect dependency in WorkspaceContext.**
  `frontend/src/context/WorkspaceContext.js:47-56` lists `refreshWorkspaces` in
  deps unnecessarily — harmless, simplify.

- [ ] **L2 — KanbanBoard columns/cards not `React.memo`'d.**
  `frontend/src/components/KanbanBoard.js` — expensive re-renders on large
  boards. **Fix:** `React.memo` the column + card components.

- [ ] **L3 — Daily auto-promotion scheduler is fragile.**
  `backend/src/server.js:10-21` — no lock, no failure retry, no catch-up if the
  server restarts near midnight. **Fix:** add a run lock + retry + startup
  catch-up check.

- [ ] **L4 — DB pool has no explicit `max` tuning.**
  `backend/src/config/db.js` — relies on the pg default (10). **Fix:** set an
  explicit `max` sized to the host / Supabase plan.

- [ ] **L5 — axios instance has no `timeout`.**
  `frontend/src/services/api.js` — hung requests never abort. **Fix:** set a
  sensible `timeout` (e.g. 15000ms) on the axios instance.

- [ ] **L6 — Import-success banner `setTimeout` not tracked/cleared.**
  `frontend/src/pages/DashboardPage.js:133`, `frontend/src/pages/KanbanPage.js:114`
  — minor `setState`-after-unmount edge case. **Fix:** store the timeout id and
  clear it in a cleanup effect.

---

## Verified healthy (no action)

- `/api/api/...` double-prefix — fixed in commit `069d586`; `useServerEvents.js`
  strips trailing `/api`. No remaining occurrences.
- `useServerEvents` handler-ref pattern — sound, no stale-closure leak.
- AuthContext token-refresh effect — guarded with a `cancelled` flag, no loop.
- 401 response interceptor — redirects once, guarded against a `/login` loop.
- SSE reconnect — exponential backoff (3s → 30s) with proper cleanup.

---

## Production hardening & monitoring recommendations

**Request consumption & caching**
- Coalesce concurrent identical GETs (M4); add short-TTL caching for dashboard /
  workspaces / users lists.
- Prefer SSE push over interval polling everywhere it already exists (H2, H3).

**Retry & backoff strategy**
- No blind axios retry loops — only retry idempotent GETs, with capped
  exponential backoff + jitter, and never retry on 4xx.
- Respect `Retry-After` on 429 responses.

**Rate-limiting strategy**
- One documented policy (H5). Consider per-route buckets so a polling endpoint
  cannot exhaust the budget for task/stock mutations.
- Exempt SSE (`/api/events`) from the limiter (already effectively the case).

**Logging**
- Add a request-id middleware and structured (JSON) logs on the backend.
- Slow-query log for DB calls over a threshold (helps spot M2/M5 in prod).
- Frontend: send `console.error` from API failures to an error tracker
  (Sentry-style) instead of only the console.

**Monitoring**
- Track 404 and 429 rates as first-class metrics/alerts.
- Event-loop lag gauge (catches M6 OCR blocking).
- OCR queue depth + per-scan duration.
- DB pool: active/idle/waiting connection counts.

**Scalability**
- Move OCR to worker threads or a separate queue/worker process (M6).
- Tune the DB pool to the deployment tier (L4).
- Batch write paths (M5) and remove N+1 reads (M2) before scaling user count.
