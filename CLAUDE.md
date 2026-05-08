# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Suivi Production** is a full-stack factory task tracking system for production management. It features Kanban boards, stock management, multi-workspace support, role-based access control, and bidirectional notifications between planners and commercials.

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
npm run build      # Production build (verify no warnings)
npm test           # Run tests
```

## Architecture

### Stack
- **Frontend:** React 18, React Router, Axios, Vanilla CSS (BEM naming)
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL 15+ (pool in `backend/src/config/db.js`, IPv4-optimized for Supabase)
- **Auth:** JWT (24h tokens), bcryptjs

### Backend (`backend/src/`)
- `server.js` — Entry point; starts express + schedules daily auto-promotion `WAITING_STOCK → TODO`
- `app.js` — Express setup: CORS, rate limits (200 req/15min general, 20 req/15min auth), route mounting
- `routes/` — Express routers: auth, tasks, users, dashboard, workspaces, stock-import, notifications
- `controllers/` — Business logic layer, one file per domain
- `models/` — Direct PostgreSQL queries (no ORM), one file per domain
- `middleware/auth.js` — JWT verification + role-based access via `requireRoles()`
- `services/stockAllocationService.js` — FIFO stock allocation algorithm
- `services/emailService.js` — Nodemailer for password reset
- `constants/task.js` — Single source of truth for statuses, priorities, tracked fields
- `utils/` — Task validation, scope helpers (`taskScope.js`), article codes (`articleCode.js`), HTTP error factories

### Frontend (`frontend/src/`)
- `App.js` — Root router with protected routes
- `context/AuthContext.js` — Global user/auth state; `context/WorkspaceContext.js` — active workspace
- `services/api.js` — Axios instance with JWT interceptors; all API calls centralized here
- `pages/` — Full-page views (Dashboard, Kanban, Users, Stock, Auth)
- `components/` — Reusable UI: KanbanBoard, TaskCard, TaskDetailsPanel, modals
- `constants/task.js` — Mirrors backend constants (keep in sync manually)
- `utils/formatters.js` — Date formatting (`DD/MM/YYYY`), relative dates, number formatting, `getInitials()`

### Data Model
- **Task statuses:** `WAITING_STOCK` → `TODO` → `IN_PROGRESS` → `DONE` (+ `BLOCKED`)
- **User roles:** `super_admin` > `planner` > `commercial` > `user`
  - `super_admin`: full access, user CRUD, all task management
  - `planner`: status updates, task modifications, Kanban drag & drop, date negotiation
  - `commercial`: task creation, sees all tasks on Kanban, receives notifications
  - `user`: read-only
- Tables: `users`, `workspaces`, `tasks`, `task_comments`, `task_history`, `notifications`, `password_reset_tokens`, `stock_imports`

### Environment Variables
Copy `backend/.env.example` to `backend/.env`. Key vars:
- `BOOTSTRAP_ADMIN_*` — Seeds the first `super_admin` on migration
- `JWT_SECRET` — Must be set in production (32+ chars)
- `DATABASE_URL` — PostgreSQL connection string
- `SMTP_*` — Email service for password reset
- `REACT_APP_API_URL` — Frontend → backend (default `http://localhost:5000`)

## Key Systems

### Stock Allocation (FIFO)
Automatic allocation by delivery date priority:
1. `recalculateStockAllocation(itemReference)` runs on task create/update/delete/status-change
2. Tasks sorted by `planned_date`, then `due_date`, then `id` (deterministic FIFO)
3. Stock allocated sequentially; deficit > 0 → auto-transition to `WAITING_STOCK`
4. Bidirectional: `TODO → WAITING_STOCK` if stock becomes insufficient, `WAITING_STOCK → TODO` if stock becomes available
5. Daily midnight job also promotes eligible tasks

Key files: `stockAllocationService.js`, `StockAllocationBadge.js`, `taskController.js`

### Notification System
Bidirectional notifications between planner and commercial:
- **Commercial → Planner**: task creation notifications to all planners/super_admins
- **Planner → All Commercials**: status changes, date modifications, date negotiation (PROPOSE/ACCEPT/REJECT)
- All commercials receive notifications (not just the task creator)
- Polling every 30s in `Header.js`; notification dropdown with mark-as-read

Key files: `notificationModel.js`, `notificationController.js`, `Header.js`

### Date Negotiation
Commercial and planner can negotiate delivery dates on tasks:
- Actions: `PROPOSE`, `ACCEPT`, `REJECT` via `PUT /api/tasks/:id/date-negotiation`
- Status flow: `PENDING_PLANNER_REVIEW` ↔ `PENDING_COMMERCIAL_REVIEW` → `ACCEPTED`
- Full history tracked in `task_history` with actor name and role

### Task Visibility
- `utils/taskScope.js` controls visibility via `applyTaskVisibility()`
- `PRIVILEGED_TASK_ROLES = ['super_admin', 'planner', 'commercial']` — see all tasks
- Regular `user` role only sees tasks they created

### Article Code Validation
- Allowed prefixes: `CI`, `CV`, `DI`, `DV`, `FC`, `FD`, `PL`
- Regex: `/^(CI|CV|DI|DV|FC|FD|PL)[A-Z0-9-]+$/`
- Defined in `backend/src/utils/articleCode.js`

### Excel Import
- **Task import** (`importOrders`): forward-fills Date, Pièce no, Nom, Délai demandé across multi-line order groups
- **Stock import**: two-phase deduplication (exact row dedup → aggregate by article)
- Uses ExcelJS for parsing

## CSS Conventions
- BEM naming: `.task-card__title`, `.task-card__priority--high`
- CSS variables defined in `index.css` `:root` (e.g. `--color-primary`, `--radius-md`)
- Date format standard: `DD/MM/YYYY` via `formatters.js` — never use `toLocaleDateString()` inline
