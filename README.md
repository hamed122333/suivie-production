# 🏭 Suivi Production - Factory Task Tracking System

A Jira-like task tracking system optimized for factory production management.

## ⭐ Features

- **Kanban Board** with 4 columns: TODO, IN_PROGRESS, DONE, BLOCKED
- **Drag & Drop** tasks between columns
- **Block Reason Modal** - mark tasks as blocked with specific reasons
- **Dashboard** with production statistics
- **JWT Authentication** with role-based access
- **User Filtering** on the Kanban board
- **Responsive Design** optimized for tablets and large screens
- **Production-Ready** with security best practices

## 🔒 Security Features

- ✅ JWT authentication with configurable secrets
- ✅ CORS protection with origin whitelisting
- ✅ Rate limiting on API endpoints
- ✅ Helmet security headers
- ✅ Input validation and sanitization
- ✅ Database connection pooling
- ✅ Environment variable validation
- ✅ Graceful shutdown handling
- ✅ Health check endpoints
- ✅ No hardcoded credentials

## Tech Stack

- **Frontend**: React 18 + React Router + Vanilla CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **Auth**: JWT tokens

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Docker & Docker Compose (recommended)

### Option 1: Docker Compose (Recommended)

1. **Set up environment variables**
   ```bash
   ./setup-production.sh
   ```
   Or manually:
   ```bash
   cp .env.example .env
   # Edit .env and set strong JWT_SECRET and POSTGRES_PASSWORD
   ```

2. **Start services**
   ```bash
   docker-compose up -d --build
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api
   - Health Check: http://localhost:5000/api/health

### Option 2: Manual Setup

#### 1. Database Setup
```bash
psql -U postgres -c "CREATE DATABASE suivi_production;"
psql -U postgres -d suivi_production -f database/schema.sql
psql -U postgres -d suivi_production -f database/add_indexes.sql
```

#### 2. Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials and JWT secret
npm install
npm start
```

#### 3. Frontend Setup
```bash
cd frontend
cp .env.example .env
# Edit .env with your API URL
npm install
npm start
```

## 📦 Production Deployment

For production deployment, please see:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete production deployment guide
- **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** - Pre-deployment checklist

**Quick Production Setup:**
```bash
./setup-production.sh
docker-compose up -d --build
```

⚠️ **CRITICAL**: Before production deployment:
1. Generate strong `JWT_SECRET` (32+ characters)
2. Generate strong `POSTGRES_PASSWORD`
3. Configure `ALLOWED_ORIGINS` with your domain
4. Enable HTTPS/SSL
5. Review and complete the production checklist

## 🔑 Default Credentials (Development Only)

**These credentials are for development/testing only. They should be changed or removed in production.**

| Role  | Email                   | Password  |
|-------|-------------------------|-----------|
| Admin | admin@factory.com       | admin123  |
| User  | worker1@factory.com     | admin123  |
| User  | worker2@factory.com     | admin123  |

## 📊 API Endpoints

| Method | Endpoint              | Description           | Auth Required |
|--------|-----------------------|-----------------------|---------------|
| GET    | /api/health           | Health check          | No            |
| POST   | /api/auth/login       | User login            | No            |
| GET    | /api/auth/me          | Get current user      | Yes           |
| GET    | /api/tasks            | Get all tasks         | Yes           |
| POST   | /api/tasks            | Create task           | Yes (Admin)   |
| PUT    | /api/tasks/:id        | Update task           | Yes (Admin)   |
| PUT    | /api/tasks/:id/status | Update task status    | Yes           |
| DELETE | /api/tasks/:id        | Delete task           | Yes (Admin)   |
| GET    | /api/users            | Get all users         | Yes           |
| POST   | /api/users            | Create user           | Yes (Admin)   |
| GET    | /api/dashboard        | Get dashboard stats   | Yes           |
| GET    | /api/workspaces       | Get workspaces        | Yes           |

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
│   ├── .dockerignore
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
│   ├── .dockerignore
│   ├── package.json
│   └── .env.example
├── database/
│   ├── schema.sql                # Database schema & seed data
│   └── add_indexes.sql           # Performance indexes
├── docker-compose.yml
├── .env.example                  # Environment variables template
├── setup-production.sh           # Production setup script
├── DEPLOYMENT.md                 # Production deployment guide
├── PRODUCTION_CHECKLIST.md       # Pre-deployment checklist
└── README.md
```

## 🛠️ Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Code Quality
```bash
# Lint backend
cd backend
npm run lint

# Lint frontend
cd frontend
npm run lint
```

### Database Migrations
```bash
# Apply performance indexes
psql -U postgres -d suivi_production -f database/add_indexes.sql
```

## 🔧 Environment Variables

### Backend (.env)
```bash
# Required
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=suivi_production
DB_USER=postgres
DB_PASSWORD=your_strong_password    # CHANGE IN PRODUCTION
JWT_SECRET=your_jwt_secret          # Min 32 chars, CHANGE IN PRODUCTION
ALLOWED_ORIGINS=http://localhost:3000

# Optional
NODE_ENV=production
```

### Frontend (.env)
```bash
REACT_APP_API_URL=http://localhost:5000/api
```

## 📈 Performance Optimizations

- ✅ Database indexes on frequently queried columns
- ✅ Connection pooling for database
- ✅ Response compression (gzip)
- ✅ Production build minification
- ✅ Multi-stage Docker builds
- ✅ Static asset optimization

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check environment variables
cat backend/.env

# Verify database connection
docker-compose logs postgres

# Check backend logs
docker-compose logs backend
```

### Frontend can't connect to backend
```bash
# Verify CORS settings in backend
# Check ALLOWED_ORIGINS in .env

# Verify API URL in frontend
cat frontend/.env
```

### Database issues
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

For more troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)

## 📝 License

This project is private and proprietary.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## 📞 Support

For issues or questions, please contact the development team or create an issue in the repository.
