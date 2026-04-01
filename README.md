# 🏭 Suivi Production - Factory Task Tracking System

A Jira-like task tracking system optimized for factory production management.

## Features

- **Kanban Board** with 4 columns: TODO, IN_PROGRESS, DONE, BLOCKED
- **Drag & Drop** tasks between columns
- **Block Reason Modal** - mark tasks as blocked with specific reasons
- **Dashboard** with production statistics
- **JWT Authentication** with role-based access (Admin/User)
- **User Filtering** on the Kanban board
- **Responsive Design** optimized for tablets and large screens

## Tech Stack

- **Frontend**: React 18 + React Router + Vanilla CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **Auth**: JWT tokens

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Docker (optional)

### Option 1: Docker Compose (Recommended)

#### Development (hot reload + seed data)

```bash
docker compose -f docker-compose.dev.yml up --build
```

Visit http://localhost:3000

#### Production-like (optimized images)

```bash
docker compose up -d --build
```

Visit http://localhost:3000

#### Production Compose (recommended for deployment)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Visit http://localhost

> Tip: copy `.env.example` to `.env` to override database credentials, JWT secret, and the frontend API URL.  
> The React build reads `REACT_APP_API_URL` at build time, so rebuild after changing it.

#### First Admin (production)
Set these in `.env` before the first run to create an initial super admin:
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` (optional), `BOOTSTRAP_ADMIN_ROLE` (optional).
The user is created only if the email does not already exist.

#### Frontend → Backend (production)
The production container serves the React app via Nginx and proxies `/api/*` to the backend container.
That means you can keep `REACT_APP_API_URL=/api` (default in Docker) and avoid CORS issues.

#### Create Users (after first login)
Log in as a `super_admin`, go to the Users page, and create additional accounts there.

### Option 2: Manual Setup

#### 1. Database Setup
```bash
psql -U postgres -c "CREATE DATABASE suivi_production;"
psql -U postgres -d suivi_production -f database/schema.sql
```

#### 2. Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
npm install
npm start
```

#### 3. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Visit http://localhost:3000

## Demo Credentials

Demo data is loaded when `RUN_SEED=true` (the dev Docker Compose file enables this).

| Role  | Email                   | Password  |
|-------|-------------------------|-----------|
| Admin | admin@factory.com       | admin123  |
| User  | worker1@factory.com     | admin123  |
| User  | worker2@factory.com     | admin123  |

## Roles & Permissions

| Role | Ce qu'il peut faire |
|------|----------------------|
| super_admin | Acces complet, creation des utilisateurs, gestion de toutes les taches |
| planner | Mise a jour des statuts, modification des fiches, gestion du kanban |
| commercial | Creation des taches (uniquement dans "A faire") |
| user | Consultation uniquement |

## API Endpoints

| Method | Endpoint              | Description           |
|--------|-----------------------|-----------------------|
| POST   | /api/auth/login       | User login            |
| GET    | /api/auth/me          | Get current user      |
| GET    | /api/tasks            | Get all tasks         |
| POST   | /api/tasks            | Create task (admin)   |
| PUT    | /api/tasks/:id        | Update task (admin)   |
| PUT    | /api/tasks/:id/status | Update task status    |
| DELETE | /api/tasks/:id        | Delete task (admin)   |
| GET    | /api/users            | Get all users         |
| POST   | /api/users            | Create user (admin)   |
| GET    | /api/dashboard        | Get dashboard stats   |

## Project Structure

```
Suivi-Production/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # PostgreSQL connection
│   │   ├── controllers/          # Business logic
│   │   ├── models/               # Database queries
│   │   ├── routes/               # API routes
│   │   ├── middleware/auth.js    # JWT authentication
│   │   └── server.js             # Express server
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/           # Reusable components
│   │   ├── context/              # React Context
│   │   ├── pages/                # Page components
│   │   ├── services/api.js       # API client
│   │   └── App.js                # Main app
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── package.json
│   └── .env.example
├── database/
│   └── schema.sql                # Database schema
├── docker-compose.dev.yml
├── docker-compose.yml
└── README.md
```
> Dev compose uses `AUTO_SEED_IF_EMPTY=true` to load demo users only when the database is empty.
