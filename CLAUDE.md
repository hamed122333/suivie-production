# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Suivi Production** is a full-stack factory task tracking system for production management. It features Kanban boards, stock management, multi-workspace support, role-based access control, a commercial order import/review lifecycle, and bidirectional notifications between planners and commercials.

## Commands

### Docker (recommended)
```bash
docker compose -f docker-compose.dev.yml up --build      # Dev (hot reload, seed data)
docker compose -f docker-compose.prod.yml up -d --build   # Production (Nginx reverse proxy)
```

### Backend (`/backend`)
```bash
npm run dev        # Start with nodemon (port 5000)
npm start          # Production server
npm run migrate    # Run database migrations/setup
```

### Frontend (`/frontend`)
```bash
npm start          # Dev server (port 3000)
npm run build      # Production build (verify no errors/warnings)
npm test           # Run tests
```

## Architecture

### Stack
- **Frontend:** React 18, React Router, Axios, Vanilla CSS (BEM naming)
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL 15+ (pool in `backend/src/config/db.js`, IPv4-optimized for Supabase)
- **Auth:** JWT (24h tokens), bcryptjs
- **Real-time:** SSE via `sseService.js`; `broadcast(event, payload)` → `useServerEvents` hook on frontend

### Backend (`backend/src/`)
- `server.js` — Entry point; starts express + schedules daily auto-promotion `WAITING_STOCK → TODO`
- `app.js` — Express setup: CORS, rate limits (200 req/15min general, 20 req/15min auth), route mounting
- `routes/` — Express routers: auth, tasks, users, dashboard, workspaces, stock-import, notifications
- `controllers/` — Business logic layer, one file per domain
- `models/` — Direct PostgreSQL queries (no ORM), one file per domain
- `middleware/auth.js` — JWT verification + role-based access via `requireRoles()`; `super_admin` implicitly passes all role checks via `hasRole()`
- `services/stockAllocationService.js` — FIFO stock allocation algorithm
- `services/sseService.js` — `broadcast(event, payload)` pushes real-time events to all connected clients
- `services/emailService.js` — Nodemailer for password reset
- `constants/task.js` — Single source of truth for statuses, priorities, tracked fields
- `utils/` — Task validation, scope helpers (`taskScope.js`), article codes (`articleCode.js`), HTTP error factories

### Frontend (`frontend/src/`)
- `App.js` — Root router with protected routes
- `context/AuthContext.js` — Global user/auth state; `context/WorkspaceContext.js` — active workspace
- `services/api.js` — Axios instance with JWT interceptors; all API calls centralized here
- `pages/` — Full-page views: Dashboard, Kanban, Users, Stock, Auth, CommercialReviewPage, PendingOrdersPage
- `components/` — Reusable UI: KanbanBoard, KanbanToolbar, TaskCard, TaskDetailsPanel, modals
- `constants/task.js` — Mirrors backend constants (keep in sync manually)
- `hooks/useServerEvents.js` — Subscribes to SSE events; components use this for real-time refresh
- `utils/formatters.js` — Date formatting (`DD/MM/YYYY`), relative dates, number formatting, `getInitials()`

### Data Model
- **Task statuses (full):** `PENDING_APPROVAL` → commercial review → `WAITING_STOCK` or `TODO` → `IN_PROGRESS` → `DONE` → `DELIVERED` (+ `BLOCKED`)
- **`PENDING_APPROVAL`** is never shown on the Kanban board (`statusNotIn: ['PENDING_APPROVAL']` always injected by `applyTaskVisibility`); it only appears in the review tables
- **`TASK_BOARD_STATUSES`** (frontend `constants/task.js`): the six Kanban columns — `WAITING_STOCK, TODO, IN_PROGRESS, BLOCKED, DONE, DELIVERED`

### User Roles
| Role | Permissions |
|------|-------------|
| `super_admin` | Full access; user CRUD; view/fix all pending orders at `/pending-orders`; implicitly passes all `requireRoles()` checks |
| `planner` | Status updates, task modifications, Kanban drag & drop, date negotiation |
| `commercial` | Reviews and approves own pending orders at `/my-orders`; sees own tasks in Kanban filtered by `commercial_id` |
| `livreur` | Reads `IN_PROGRESS/DONE/DELIVERED` tasks; marks tasks as `DELIVERED` |
| `user` | Read-only (only tasks they created) |

- Tables: `users`, `workspaces`, `tasks`, `task_comments`, `task_history`, `notifications`, `password_reset_tokens`, `stock_imports`

### Environment Variables
Copy `backend/.env.example` to `backend/.env`. Key vars:
- `BOOTSTRAP_ADMIN_*` — Seeds the first `super_admin` on migration
- `JWT_SECRET` — Must be set in production (32+ chars)
- `DATABASE_URL` — PostgreSQL connection string
- `SMTP_*` — Email service for password reset
- `REACT_APP_API_URL` — Frontend → backend (default `http://localhost:5000`)

## Key Systems

### Commercial Order Import Lifecycle
Full flow from Excel file to Kanban:

1. **Super admin imports** — `POST /api/tasks/import-orders` (super_admin only). Excel parsed; each row becomes a task with `status: 'PENDING_APPROVAL'`. The "Commercial 1" column (format `VL000001`) sets `commercial_id`. No FIFO runs yet.
2. **Super admin fixes anomalies** — `/pending-orders` → `PendingOrdersPage`. Shows all pending orders grouped by commercial; highlights missing/unresolved commercial codes, missing dates, missing client names. Admin can inline-edit to assign the correct commercial.
3. **Commercial reviews** — `/my-orders` → `CommercialReviewPage`. Each commercial sees only orders matching their `commercial_id`. They inspect stock coverage and urgency, then choose which to send to production.
4. **Commercial approves** — `POST /api/tasks/approve`. FIFO stock check runs → task becomes `TODO` or `WAITING_STOCK`. Planners notified. `broadcast('tasks-updated')` fires so all Kanban boards refresh in real-time.
5. **Kanban visibility** — Approved tasks appear in Kanban for planner/super_admin/livreur. Commercial sees their own approved tasks (filtered by `commercial_id`).

Key files: `taskController.js` (`importOrders`, `approveOrders`, `rejectOrders`, `getPendingApproval`), `CommercialReviewPage.js`, `PendingOrdersPage.js`, `taskScope.js`

### Stock Allocation (FIFO)
Automatic allocation by delivery date priority:
1. `recalculateStockAllocation(itemReference)` runs on task create/update/delete/status-change and after commercial approval
2. Tasks sorted by `planned_date`, then `due_date`, then `id` (deterministic FIFO)
3. Stock allocated sequentially; deficit > 0 → auto-transition to `WAITING_STOCK`
4. Bidirectional: `TODO → WAITING_STOCK` if stock becomes insufficient, `WAITING_STOCK → TODO` if stock becomes available
5. Daily midnight job also promotes eligible tasks

Key files: `stockAllocationService.js`, `StockAllocationBadge.js`, `taskController.js`

### Real-time (SSE)
- Backend: `broadcast(eventName, payload)` from `services/sseService.js` — call after any mutation visible to other users
- Frontend: `useServerEvents({ 'event-name': handler })` — subscribes in any component
- Events in use: `tasks-updated`, `stock-updated`, `notifications-updated`
- **Rule: always call `broadcast('tasks-updated', ...)` after task status changes, approvals, or rejections**

### Notification System
- **Commercial → Planner**: task creation notifications to all planners/super_admins
- **Planner → All Commercials**: status changes, date modifications, date negotiation
- Header polls every 60s as fallback; SSE `notifications-updated` handles real-time delivery

Key files: `notificationModel.js`, `notificationController.js`, `Header.js`

### Date Negotiation
- Actions: `PROPOSE`, `ACCEPT`, `REJECT` via `PUT /api/tasks/:id/date-negotiation`
- Status flow: `PENDING_PLANNER_REVIEW` ↔ `PENDING_COMMERCIAL_REVIEW` → `ACCEPTED`
- Full history tracked in `task_history`

### Task Visibility (`taskScope.js`)
`applyTaskVisibility(filters, user)` always injected in `getAll`, `exportExcel`, `getPendingApproval`:
- `super_admin` / `planner` → all tasks (except `PENDING_APPROVAL` on Kanban)
- `commercial` → only tasks where `commercial_id = user.commercial_id`
- `livreur` → only `IN_PROGRESS`, `DONE`, `DELIVERED`
- `user` → only tasks they created

### KanbanToolbar
Two-row toolbar:
- Row 1: search + filters (priority, category, critical deficit, predictive, commercial)
- Row 2: window-size tabs (Semaine / 2 Sem. / Mois / Tout) + nav arrows + day-bar histogram + stats + actions
- `onDateChange(from, to)` → KanbanPage → `plannedFrom`/`plannedTo` API params
- `onDaySelect(iso)` → KanbanPage → KanbanBoard `filterDate` (client-side single-day filter)
- Day bars only shown for `week` and `2weeks` window sizes

### Article Code Validation
- Allowed prefixes: `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL`
- Regex: `/^(CI|CV|DI|DV|FC|FD|PL)[A-Z0-9-]+$/`
- Defined in `backend/src/utils/articleCode.js`

### Commercial Code Format
- Format: `VL` + exactly 6 digits (e.g. `VL000001`)
- Stored on both `users.commercial_id` and `tasks.commercial_id`
- Validated in `importOrders` and `importCommercials`

### Excel Imports
- **Order import** (`importOrders`): forward-fills Date, Pièce no, Nom, Délai demandé across multi-line groups; reads "Commercial 1" column
- **Commercial import** (`importCommercials`): two-column Excel (code, name) → creates commercial accounts with auto-generated emails
- **Stock import**: two-phase deduplication; uses ExcelJS

## CSS Conventions
- BEM naming: `.task-card__title`, `.task-card__priority--high`
- CSS variables in `index.css` `:root` (e.g. `--color-primary`, `--radius-md`)
- Date format: always `DD/MM/YYYY` via `formatters.js` — never use `toLocaleDateString()` inline

## Frontend Routes
| Path | Component | Who sees it |
|------|-----------|-------------|
| `/kanban` | KanbanPage | All authenticated users |
| `/pending-orders` | PendingOrdersPage | super_admin — fix anomalies, view all pending |
| `/my-orders` | CommercialReviewPage | commercial — approve/reject own orders |
| `/dashboard` | DashboardPage | All |
| `/stock` | StockPage | All |
| `/users` | UsersPage | super_admin |
