# AGENTS.md

High-signal guidance for OpenCode sessions in this repo.

## Dev Commands

```bash
# Backend (port 5000)
cd backend && npm run dev    # nodemon hot reload
cd backend && npm run migrate # run migrations

# Frontend (port 3000)
cd frontend && npm start
cd frontend && npm run build  # verify no warnings
```

## Key Constraints

- **Branch**: Currently on `add-logique-for-tow-commands-with-same-ref` — most work happens here
- **Date format**: Always use `DD/MM/YYYY` via `formatters.js`, never `toLocaleDateString()`
- **CSS**: BEM naming only (`.task-card__title`, `.task-card__priority--high`)
- **Article codes**: Only `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL` prefixes valid (regex in `articleCode.js`)

## Important Code Locations

| Purpose | File |
|---------|------|
| FIFO stock allocation | `backend/src/services/stockAllocationService.js` |
| Task CRUD + import | `backend/src/controllers/taskController.js` |
| Role-based access | `backend/src/utils/taskScope.js` |
| JWT auth (hardened) | `backend/src/middleware/auth.js` |
| Real-time updates | SSE at `/api/events`, consumed in `useServerEvents` hook |

## Fixes Already Applied

These are already committed — don't revert:
- JWT secret now throws in production if missing (`auth.js`)
- File upload validation added (`taskRoutes.js`)
- Database indexes added (`migrations/013_add_performance_indexes.sql`)
- React error boundary added (`frontend/src/components/ErrorBoundary.js`)

## Quirks

- **Stock is global**: All clients compete for same article pool, not per-client
- **Workspaces auto-create**: Named `CMD DD-MM-YYYY` from order date
- **Notifications poll**: 30s interval in `Header.js` (SSE exists but not used for notifications)
- **Task history**: All changes logged via `TaskHistoryModel.log()`

## Required Order

When modifying stock allocation logic:
1. Update `stockAllocationService.js`
2. Test with real data via frontend
3. Verify `recalculateStockAllocation()` recalculates correctly

## Environment Setup

```bash
# Required: Create backend/.env from .env.example
# Key vars: DATABASE_URL, JWT_SECRET, SMTP_*
# BOOTSTRAP_ADMIN_* seeds first super_admin
```