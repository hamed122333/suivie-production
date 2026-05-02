# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Suivi Production** is a full-stack factory task tracking system (similar to Jira) for production management. It features Kanban boards, stock management, multi-workspace support, and role-based access control.

## Commands

### Docker (recommended)
```bash
# Development (hot reload, seed data)
docker compose -f docker-compose.dev.yml up --build

# Production (Nginx reverse proxy)
docker compose -f docker-compose.prod.yml up -d --build
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
npm run build      # Production build
npm test           # Run tests
```

## Architecture

### Stack
- **Frontend:** React 18, React Router, Axios, Vanilla CSS
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL 15+ (pool configured in `backend/src/config/db.js`, IPv4-optimized for Supabase)
- **Auth:** JWT (24h tokens), bcryptjs

### Backend (`backend/src/`)
- `server.js` — Entry point; starts express app + schedules auto-promotion of `WAITING_STOCK` → `TODO` tasks daily
- `app.js` — Express setup: CORS, rate limits (200 req/15min general, 20 req/15min auth), route mounting
- `routes/` — Express routers: auth, tasks, users, dashboard, workspaces, stock-import, notifications
- `controllers/` — Business logic layer, one file per domain
- `models/` — Direct PostgreSQL queries (no ORM), one file per domain
- `middleware/auth.js` — JWT verification + role-based access enforcement
- `services/emailService.js` — Nodemailer for password reset emails
- `constants/task.js` — Single source of truth for task statuses, priorities, and tracked fields
- `utils/` — Task validation, scope helpers, article codes, HTTP error factories

### Frontend (`frontend/src/`)
- `App.js` — Root router with protected routes
- `context/AuthContext.js` — Global user/auth state; `context/WorkspaceContext.js` — active workspace
- `services/api.js` — Axios instance with JWT interceptors; all API calls go through here
- `pages/` — Full-page views (Dashboard, Kanban, Users, Stock, Auth)
- `components/` — Reusable UI: KanbanBoard, TaskCard, modals
- `constants/task.js` — Mirrors backend constants (keep in sync manually)
- `utils/` — Formatters, localStorage auth helpers, article code utilities

### Data Model Key Points
- **Task statuses:** `WAITING_STOCK`, `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`
- **User roles:** `super_admin` > `planner` > `commercial` > `user`
  - `super_admin`: full access, user creation, all task management
  - `planner`: status updates, task modifications, Kanban management
  - `commercial`: task creation (TODO/WAITING_STOCK only)
  - `user`: read-only
- Tables: `users`, `workspaces`, `tasks`, `task_comments`, `task_history`, `notifications`, `password_reset_tokens`, `stock_imports`
- A default workspace is auto-created on first migration
- Password reset tokens expire after 30 minutes

### Environment Variables
Copy `backend/.env.example` to `backend/.env`. Key vars:
- `BOOTSTRAP_ADMIN_*` — Seeds the first `super_admin` on migration
- `JWT_SECRET` — Must be set in production
- `DATABASE_URL` — PostgreSQL connection string
- `SMTP_*` — Email service for password reset
- `REACT_APP_API_URL` — Frontend points to backend (default: `http://localhost:5000`)
