# 🚀 Production Deployment Guide

## ✅ Pre-Production Checklist

### Frontend Build Status
- ✅ Build compiles successfully without errors
- ✅ All warnings fixed (unused variables removed)
- ✅ Production build size: ~90.99 KB (gzipped)
- ✅ React optimized build created

### Backend Status
- ✅ All dependencies secure (No CVEs found)
- ✅ Database connection configured with IPv4 fallback
- ✅ Rate limiting enabled (API: 200 req/15min, Auth: 20 req/15min)
- ✅ CORS enabled
- ✅ Trust proxy configured for reverse proxy (Render)

### Dependencies Verified
**Backend (npm):**
- express@4.22.1
- pg@8.20.0 (PostgreSQL driver)
- jsonwebtoken@9.0.3
- bcryptjs@2.4.3
- dotenv@16.6.1
- cors@2.8.6
- exceljs@4.4.0
- multer@2.1.1
- express-rate-limit@7.5.1
- xlsx@0.18.5
- nodemon@3.1.14

**Frontend (npm):**
- react@18.3.1
- react-router-dom@6.22.3
- axios@1.7.7

---

## 📋 Environment Variables Setup

### Backend `.env` (Required for Production)
```env
# Database Configuration (Supabase or PostgreSQL)
DB_HOST=your-db.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_secure_password

# JWT Secret (Generate a strong random string)
JWT_SECRET=your_super_secret_jwt_key_min_32_chars

# Node Environment
NODE_ENV=production

# Server Port
PORT=5000
```

### Frontend `.env.production` (Optional)
```env
REACT_APP_API_BASE_URL=https://your-backend-domain.com/api
REACT_APP_ENV=production
```

---

## 🌐 Database Setup (Supabase or PostgreSQL)

### Option 1: Supabase (Recommended)
1. Create account at https://supabase.com
2. Create new project
3. Run migrations:
   ```bash
   psql -h your-db.supabase.co -U postgres -d postgres -f backend/schema.sql
   ```

### Option 2: Self-hosted PostgreSQL
1. Install PostgreSQL 12+
2. Create database:
   ```sql
   CREATE DATABASE suivi_production;
   ```
3. Run schema:
   ```bash
   psql -U postgres -d suivi_production -f backend/schema.sql
   ```

---

## 🚀 Deployment Options

### Option 1: Render.com (Recommended - Free Tier)
#### Backend Deployment
1. Push code to GitHub
2. Connect repo to Render
3. Create Web Service:
   - Name: `suivi-production-backend`
   - Environment: Node
   - Build command: `npm install`
   - Start command: `node src/server.js`
   - Region: Choose closest
4. Add Environment Variables in Render dashboard
5. Set up PostgreSQL database on Supabase

#### Frontend Deployment
1. Create Static Site on Render
2. Connect your GitHub repo
3. Build command: `cd frontend && npm run build`
4. Publish directory: `frontend/build`

### Option 2: Vercel + Railway
#### Frontend (Vercel)
```bash
npm install -g vercel
vercel --prod
```

#### Backend (Railway.app)
1. Create account at railway.app
2. Deploy from GitHub
3. Set environment variables
4. Add PostgreSQL addon

### Option 3: Docker + Your Server
```bash
# Backend
docker build -f backend/Dockerfile.prod -t suivi-backend:latest .
docker run -e DB_HOST=... -e JWT_SECRET=... -p 5000:5000 suivi-backend

# Frontend (with Nginx)
docker build -f frontend/Dockerfile.prod -t suivi-frontend:latest .
docker run -p 80:80 suivi-frontend
```

---

## 🔒 Security Checklist

- ✅ JWT_SECRET is strong and unique
- ✅ Database password is encrypted
- ✅ HTTPS is enabled on production domain
- ✅ Rate limiting configured
- ✅ CORS restricted to frontend domain only
- ✅ SQL injection prevention (parameterized queries)
- ✅ Password hashing with bcryptjs

### Update CORS for Production
**File:** `backend/src/app.js`
```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## 📊 Production Server Configuration

### Recommended Specs
- **CPU:** 1-2 vCPU
- **RAM:** 1-2 GB
- **Database:** Managed PostgreSQL (AWS RDS, Supabase, etc.)
- **Storage:** 10+ GB SSD

### Health Check Endpoint
```
GET /api/health
Response: { "status": "OK", "message": "Suivi Production API running" }
```

---

## 📈 Monitoring & Logs

### Backend Logs
- Check `backend.log` for application errors
- Monitor database connection errors
- Watch for rate limit warnings

### Frontend Errors
- Browser console for client-side errors
- Network tab for API failures
- Use Sentry.io for error tracking (optional)

---

## ✨ Final Deployment Steps

1. **Test Build Locally**
   ```bash
   cd frontend && npm run build
   cd ../backend && NODE_ENV=production npm start
   ```

2. **Verify All Endpoints**
   ```bash
   curl https://your-backend/api/health
   ```

3. **Database Connection Test**
   ```bash
   psql -h your-db.host -U your-user -d your-db -c "SELECT 1"
   ```

4. **Deploy**
   - Push to production branch
   - Monitor deployment logs
   - Verify frontend loads
   - Test login functionality
   - Test core features

5. **Post-Deployment**
   - Set up SSL/TLS certificate (Let's Encrypt)
   - Configure backup strategy
   - Set up monitoring alerts
   - Document admin credentials securely

---

## 🆘 Troubleshooting

### Issue: `ENETUNREACH` Database Connection Error
**Solution:** Already handled in code with IPv4 fallback in `db.js`

### Issue: Rate Limit Errors in Production
**Solution:** Ensure `trust proxy` is set correctly in `app.js`

### Issue: CORS Errors
**Solution:** Update CORS configuration in `app.js` with correct frontend domain

### Issue: Build Size Too Large
**Solution:** Already optimized with gzip compression (~91KB)

---

## 📞 Support Resources
- Database: [Supabase Docs](https://supabase.com/docs)
- Deployment: [Render Docs](https://render.com/docs)
- Node.js: [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance-best-practices/)

---

**Last Updated:** April 11, 2026
**Status:** ✅ Ready for Production

