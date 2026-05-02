# Production Deployment Guide

## System Architecture

**Suivi Production** is a factory task tracking system with:
- **Frontend**: React 18, Vanilla CSS (port 3000)
- **Backend**: Node.js/Express (port 5000)
- **Database**: PostgreSQL 15+
- **Auth**: JWT (24h tokens)

## Pre-Deployment Checklist

### Security
- [ ] Update `JWT_SECRET` in `.env` (use strong random string: 32+ chars)
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS in production (enable SSL/TLS)
- [ ] Configure CORS origins for frontend URL
- [ ] Verify rate limiting is active (200 req/15min general, 20 req/15min auth)
- [ ] Review and restrict file upload sizes (10MB limit)

### Database
- [ ] PostgreSQL 15+ installed and running
- [ ] Run migrations: `npm run migrate`
- [ ] Verify database connection with production credentials
- [ ] Set up database backups (daily recommended)

### Environment Variables
Create `.env` file from `.env.example` with production values:
```
JWT_SECRET=<use-strong-random-32-char-string>
NODE_ENV=production
DB_HOST=<your-production-host>
DB_PASSWORD=<strong-password>
FRONTEND_APP_URL=https://yourdomain.com
SMTP_*=<email-provider-credentials>
```

### Frontend Build
- [ ] `npm run build` compiles without errors
- [ ] Build folder ready for deployment (98 KB main.js gzipped)

## Stock Allocation Logic (Core Feature)

The system uses **automatic FIFO allocation by delivery date**:

1. When a task is created/updated, `recalculateStockAllocation()` runs automatically
2. All tasks for the same article are sorted by `planned_date` (earliest first)
3. Stock is allocated sequentially - earlier dates get stock first
4. If a task has a deficit → automatically moves to WAITING_STOCK
5. Only the compact **StockAllocationBadge** shows allocation details (no conflict badges)
6. Auto-promotion job runs daily at midnight to move WAITING_STOCK → TODO if stock is now available

## Deployment Steps

### Docker (Recommended)
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Manual
```bash
cd backend && npm install && npm run migrate && npm start
cd frontend && npm install && npm run build && serve -s build
```

## Post-Deployment Verification

### Critical Tests
1. **Stock Allocation**: Create 2 tasks for same article, different dates → earlier date gets stock
2. **FIFO Allocation**: Later date task shows deficit in compact badge (NO conflict badges)
3. **Auto-Status Transition**: Task with deficit automatically becomes WAITING_STOCK
4. **JWT Auth**: Login returns valid 24h token
5. **API Endpoints**: GET/POST/PUT/DELETE tasks work with proper role checks

### Health Checks
```bash
curl http://localhost:5000/  # Should return 404 or API info
npm run migrate             # Should succeed with no changes
```

## Monitoring

### Daily
- Check logs for errors
- Verify auto-promotion job runs (console shows "Auto promotion moved X tasks")

### Features Disabled in Production
- Manual conflict resolution (resolveConflict endpoint removed)
- Conflict detection (has_stock_conflict no longer computed)
- Conflict filter in Kanban UI (removed)

All stock management is now automatic FIFO by date.

---

**Last Updated**: 2026-05-02
**Version**: 1.0 (Production Ready)
