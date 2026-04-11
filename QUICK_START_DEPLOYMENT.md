# ⚡ Quick Start - Deploy to Production

## 🚀 5-Minute Setup for Render.com

### Step 1: Prepare GitHub
```bash
git add .
git commit -m "Production deployment"
git push origin main
```

### Step 2: Deploy Backend on Render

1. Go to https://render.com
2. Create Web Service
3. Connect GitHub repo
4. Fill settings:
   - **Name:** suivi-production-backend
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Root Directory:** `backend`

5. Add Environment Variables (in Render Dashboard):
```
DB_HOST=your-db.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=generate_a_strong_random_string_here
NODE_ENV=production
PORT=5000
```

6. Click **Deploy** ✅

### Step 3: Deploy Frontend on Render

1. Create Static Site on Render
2. Connect GitHub repo
3. Fill settings:
   - **Build Command:** `cd frontend && npm run build`
   - **Publish Directory:** `frontend/build`

4. Click **Deploy** ✅

### Step 4: Setup Database (Supabase)

1. Go to https://supabase.com
2. Create new project
3. Copy connection string
4. In Supabase SQL Editor, run:
```sql
-- Copy content from backend/schema.sql here
```

5. Test connection:
```bash
psql -h <your-db-host> -U postgres -d postgres -c "SELECT 1"
```

---

## 🎯 Deployment Results

After 10-15 minutes, you should have:
- ✅ Backend running at: `https://suivi-production-backend.onrender.com`
- ✅ Frontend running at: `https://your-frontend-name.onrender.com`
- ✅ Database connected and ready
- ✅ Full application deployed to production

---

## ✨ Verify Deployment

### Test Backend Health
```bash
curl https://suivi-production-backend.onrender.com/api/health
# Expected response: {"status":"OK","message":"Suivi Production API running"}
```

### Test Frontend
Open in browser:
```
https://your-frontend-name.onrender.com
```

### Test Login
1. Use default credentials from database
2. Verify dashboard loads
3. Create a test task
4. Test stock import

---

## 📱 Custom Domain Setup

### Update DNS Records
1. Point your domain to Render (they provide CNAME)
2. Wait for DNS propagation (5-30 minutes)
3. Enable HTTPS (automatic with Let's Encrypt)

### Example:
```
app.yourcompany.com → DNS CNAME → suivi-production-frontend.onrender.com
api.yourcompany.com → DNS CNAME → suivi-production-backend.onrender.com
```

---

## 🔧 Troubleshooting

### Issue: Build fails
- Check build logs in Render dashboard
- Verify Node version compatibility
- Check for missing dependencies

### Issue: Database connection error
- Verify DB_HOST, DB_PORT, DB_USER in .env
- Check database is running
- Verify IP whitelist on database

### Issue: Frontend shows blank page
- Check browser console for errors
- Verify API_BASE_URL is correct
- Check CORS settings in backend

### Issue: Login not working
- Verify database schema is loaded
- Check JWT_SECRET is set
- Look at backend logs

---

## 📊 Production Monitoring

### Backend Logs
In Render dashboard → Logs → Backend service

### Frontend Errors
Browser Developer Tools → Console

### Database
In Supabase dashboard → Database → Logs

---

## 🔒 Security Reminders

✅ Change default database password
✅ Use strong JWT_SECRET
✅ Enable HTTPS
✅ Configure CORS for your domain
✅ Backup database regularly
✅ Monitor error logs daily

---

## 📞 Quick Support

**Common Issues:**
- ENETUNREACH → ✅ Already fixed in code
- Rate limit errors → ✅ Already configured
- CORS errors → ✅ Already enabled
- Build warnings → ✅ Already fixed

---

## ✅ Checklist Before Going Live

- [ ] Backend deployed and running
- [ ] Frontend deployed and running
- [ ] Database connected successfully
- [ ] Login works with test account
- [ ] Tasks can be created/edited
- [ ] Stock import works
- [ ] Domain configured (optional)
- [ ] HTTPS enabled
- [ ] Backups configured
- [ ] Error monitoring setup

---

**Estimated Deployment Time:** 15-30 minutes
**Difficulty Level:** Easy ⭐⭐
**Status:** ✅ Ready to Deploy

---

For detailed information, see `PRODUCTION_DEPLOYMENT.md`

