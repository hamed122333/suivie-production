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

```bash
docker-compose up -d
```

Visit http://localhost:3000

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

| Role  | Email                   | Password  |
|-------|-------------------------|-----------|
| Admin | admin@factory.com       | admin123  |
| User  | worker1@factory.com     | admin123  |
| User  | worker2@factory.com     | admin123  |

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
│   ├── package.json
│   └── .env.example
├── database/
│   └── schema.sql                # Database schema & seed data
├── docker-compose.yml
└── README.md
```
