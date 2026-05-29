# AGENTS.md

High-signal guidance for OpenCode sessions in this repo.

## Dev Commands

```bash
# Backend (port 5000)
cd backend && npm run dev       # nodemon hot reload
cd backend && npm run migrate   # run `backend/schema.sql` + all `migrations/*.sql` (idempotent)
cd backend && npm run migrate:production-core  # runs selected prod migrations only
cd backend && npm run seed:commercials          # bulk create commercial accounts from seed-commercials.js
cd backend && npm start         # production server

# Frontend (port 3000)
cd frontend && npm start        # HOST=0.0.0.0, DANGEROUSLY_DISABLE_HOST_CHECK=true
cd frontend && npm run build    # verify no warnings

# Docker (three compose files)
docker compose -f docker-compose.dev.yml up --build    # dev + hot reload + seed
docker compose -f docker-compose.prod.yml up -d --build # prod Nginx on :80
docker compose up -d --build                            # prod-like, Nginx on :3000
```

## Architecture

**Monorepo** — two independent apps sharing no code, plus a Python OCR service:

| Package | Runtime | Port | Deploy |
|---------|---------|------|--------|
| `backend/` | Node.js 20 + Express | 5000 | Render |
| `frontend/` | React 18 + react-scripts | 3000 | Vercel |
| `ocr-service/` | Python (Flask?) | — | — |

**Database**: PostgreSQL 15+ (Supabase in production). Pool at `backend/src/config/db.js` forces IPv4 (`dns.setDefaultResultOrder('ipv4first')`) to avoid ENETUNREACH on Supabase. Migrations are plain SQL in `backend/migrations/` (16 files, prefixed 001–016), run via `run-setup.js` and `run-production-core-migration.js`. All use `CREATE ... IF NOT EXISTS` — safe to re-run.

**Rate limits** (in `backend/src/app.js`): 500 req/15min general, 50 req/15min auth (configurable via `API_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_MAX` env vars). SSE (`/api/events`) and health (`/api/health`) are excluded from rate limiting. `app.set('trust proxy', 1)` for Render.

## Key Constraints

- **Date format**: Always `DD/MM/YYYY` via `frontend/src/utils/formatters.js`, never `toLocaleDateString()`
- **CSS**: BEM naming only (`.task-card__title`, `.task-card__priority--high`)
- **Article codes**: Only `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL` prefixes valid (regex: `/^(CI|CV|DI|DV|FC|FD|PL)[A-Z0-9-]+$/` in `backend/src/utils/articleCode.js`)
- **Frontend/backend constants must stay in sync**: `frontend/src/constants/task.js` mirrors `backend/src/constants/task.js` manually. Currently backend has `DELIVERED` status but frontend `TASK_STATUS_ORDER` does not.

## Important Code Locations

| Purpose | File |
|---------|------|
| Express entry | `backend/src/server.js` → `backend/src/app.js` |
| Server cron (daily FIFO recalc) | `backend/src/server.js:12` |
| Task CRUD + import | `backend/src/controllers/taskController.js` |
| Role-based visibility | `backend/src/utils/taskScope.js` |
| JWT auth (hardened) | `backend/src/middleware/auth.js` |
| FIFO stock allocation | `backend/src/services/stockAllocationService.js` |
| SSE hub | `backend/src/services/sseService.js` |
| SSE endpoint | `backend/src/app.js:53` (`GET /api/events`) |
| SSE hook (frontend) | `frontend/src/hooks/useServerEvents.js` |
| Axios config | `frontend/src/services/api.js` |
| Auth storage utils | `frontend/src/utils/authStorage.js` |

## Frontend API Configuration

**Critical**: `api.js` uses `REACT_APP_API_URL` as axios `baseURL`. In production this is `/api` (Vercel proxy). In dev it's `http://localhost:5000/api`.

**SSE hook** (`useServerEvents.js`) strips trailing `/api` from the env var before appending `/api/events` — prevents `/api/api/events`. Never concatenate `/api` in EventSource URLs.

## Roles

Roles enforced in `backend/src/middleware/auth.js` and `backend/src/utils/taskScope.js`:
- `super_admin` — full access, user CRUD, all task management
- `planner` — status updates, Kanban drag & drop, date negotiation
- `commercial` — task creation (TODO only), import orders
- `livreur` — mark tasks DELIVERED (via `POST /tasks/:id/mark-delivered`)
- `user` — read-only

## Quirks

- **Stock is global**: All clients compete for same article pool
- **Workspaces auto-create**: Named `CMD DD-MM-YYYY` from order date
- **Notifications**: SSE for live push (3s→30s exponential backoff), polling fallback every 30s in `Header.js`
- **Task history**: All changes logged via `TaskHistoryModel.log()`
- **Stock Deduplication**: Two-phase (exact row → aggregated by article)
- **React StrictMode**: Enabled in dev — `useEffect` runs twice, SSE cleanup must be robust
- **Docker frontend hot reload**: Requires `CHOKIDAR_USEPOLLING=true` env var (set in `docker-compose.dev.yml`)
- **File upload**: 10MB limit via multer, Excel mime types only (`taskRoutes.js:7-11`)
- **Bootstrap admin**: Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` env vars; seeds on first `run-setup.js` run only if email doesn't exist

## Fixes Already Applied

Do not revert:
- JWT_SECRET throws in production if missing (`auth.js:6-8`)
- File upload validation (mime + size) in `taskRoutes.js:7-24`
- Database indexes (`migrations/013_add_performance_indexes.sql`)
- React error boundary (`frontend/src/components/ErrorBoundary.js`)
- Stock history tracking (`migrations/014_create_stock_history.sql`)
- SSE exponential backoff (3s → 30s max) prevents request storms

## Stock Allocation Modification Order

1. Update `stockAllocationService.js`
2. Test with real data via frontend
3. Verify `recalculateStockAllocation()` recalculates correctly

## Environment Setup

```bash
# backend/.env — copy from .env.example
# Key: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, FRONTEND_APP_URL
# BOOTSTRAP_ADMIN_* seeds first super_admin

# frontend/.env — copy from .env.example
# REACT_APP_API_URL=http://localhost:5000/api
```

## Testing

No test suites configured. `npm test` exits 0 in backend, runs `react-scripts test --passWithNoTests` in frontend.
