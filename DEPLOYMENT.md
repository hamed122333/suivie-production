# 🚀 Production Deployment Guide

This guide contains everything you need to deploy Suivi Production to a production environment safely and securely.

## ⚠️ CRITICAL: Pre-Deployment Checklist

Before deploying to production, you **MUST** complete these steps:

### 1. Generate Strong Secrets

```bash
# Generate a strong JWT secret (at least 32 characters)
openssl rand -base64 48

# Generate a strong database password
openssl rand -base64 32
```

### 2. Create Production Environment File

Copy the example environment file and fill in the values:

```bash
cp .env.example .env
```

Edit `.env` and set the following **REQUIRED** variables:

```bash
# CRITICAL: Replace these with strong, unique values
POSTGRES_PASSWORD=<your_strong_database_password_here>
JWT_SECRET=<your_strong_jwt_secret_at_least_32_chars>

# Set your production domain
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
REACT_APP_API_URL=https://yourdomain.com/api
```

### 3. Security Verification

- [ ] `JWT_SECRET` is at least 32 characters long
- [ ] `POSTGRES_PASSWORD` is strong and unique
- [ ] `ALLOWED_ORIGINS` contains only your production domains
- [ ] No demo credentials are in the codebase
- [ ] All `.env` files are in `.gitignore`

---

## 🐳 Docker Deployment (Recommended)

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- At least 2GB RAM
- At least 10GB disk space

### Steps

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd suivie-production
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   nano .env
   ```

3. **Build and start services**
   ```bash
   docker-compose up -d --build
   ```

4. **Verify deployment**
   ```bash
   # Check all services are running
   docker-compose ps

   # Check backend health
   curl http://localhost:5000/api/health

   # View logs
   docker-compose logs -f backend
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api

### Stopping Services

```bash
docker-compose down
```

### Updating the Application

```bash
git pull
docker-compose down
docker-compose up -d --build
```

---

## 🔧 Manual Deployment (Without Docker)

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Nginx (for production)
- PM2 (for process management)

### Database Setup

1. **Create database**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE suivi_production;
   CREATE USER suivi_user WITH ENCRYPTED PASSWORD 'your_strong_password';
   GRANT ALL PRIVILEGES ON DATABASE suivi_production TO suivi_user;
   \q
   ```

2. **Run schema and indexes**
   ```bash
   psql -U suivi_user -d suivi_production -f database/schema.sql
   psql -U suivi_user -d suivi_production -f database/add_indexes.sql
   ```

### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   npm ci --only=production
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   nano .env
   ```

3. **Start with PM2**
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name suivi-backend
   pm2 save
   pm2 startup
   ```

### Frontend Setup

1. **Build the frontend**
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. **Serve with Nginx**

   Create `/etc/nginx/sites-available/suivi-production`:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       # Frontend
       location / {
           root /path/to/suivie-production/frontend/build;
           try_files $uri /index.html;
       }

       # Backend API
       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;
   }
   ```

3. **Enable site and restart Nginx**
   ```bash
   sudo ln -s /etc/nginx/sites-available/suivi-production /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

## 🔒 SSL/TLS Setup (HTTPS)

### Using Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

## 📊 Monitoring and Maintenance

### Health Checks

The application provides a health endpoint:

```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "Suivi Production API running",
  "database": "connected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Logs

**Docker:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

**PM2:**
```bash
pm2 logs suivi-backend
pm2 monit
```

### Database Backups

**Automated backup script:**

```bash
#!/bin/bash
# /usr/local/bin/backup-suivi-db.sh

BACKUP_DIR="/var/backups/suivi-production"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="suivi_production"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U postgres $DB_NAME | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: backup_$TIMESTAMP.sql.gz"
```

**Set up daily cron job:**
```bash
sudo crontab -e
# Add this line:
0 2 * * * /usr/local/bin/backup-suivi-db.sh
```

---

## 🔐 Security Best Practices

### Implemented Security Features

✅ **Environment variable validation** - Server won't start without required vars
✅ **JWT secret enforcement** - Minimum 32 characters required
✅ **CORS restrictions** - Only allowed origins can access API
✅ **Helmet security headers** - Protection against common web vulnerabilities
✅ **Rate limiting** - Protection against brute force attacks
✅ **Response compression** - Reduced bandwidth usage
✅ **Database connection pooling** - Optimized database performance
✅ **Graceful shutdown** - Proper cleanup on server restart
✅ **Health checks** - Database connectivity verification
✅ **Demo credentials removed** - No hardcoded credentials in code
✅ **Multi-stage Docker builds** - Smaller, more secure images
✅ **Non-root Docker users** - Containers run with limited privileges
✅ **Database indexes** - Optimized query performance

### Additional Recommendations

1. **Enable HTTPS** - Always use SSL/TLS in production
2. **Firewall** - Only expose necessary ports (80, 443)
3. **Regular updates** - Keep dependencies up to date
4. **Database encryption** - Enable PostgreSQL encryption at rest
5. **Monitoring** - Set up logging and alerting (e.g., Sentry, LogRocket)
6. **Backups** - Automated daily database backups
7. **Secrets management** - Use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)

---

## 🐛 Troubleshooting

### Backend won't start

**Error: "Missing required environment variables"**
```bash
# Solution: Ensure all required variables are set in .env
cat .env
# Verify JWT_SECRET, DB_PASSWORD, etc. are set
```

**Error: "JWT_SECRET must be at least 32 characters"**
```bash
# Solution: Generate a longer secret
openssl rand -base64 48
```

**Error: "Database connection failed"**
```bash
# Solution: Check database is running and credentials are correct
docker-compose ps
docker-compose logs postgres
```

### Frontend can't connect to backend

**Error: "CORS policy"**
```bash
# Solution: Add your frontend URL to ALLOWED_ORIGINS
# In .env:
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Performance Issues

**Slow queries**
```bash
# Solution: Ensure database indexes are created
psql -U postgres -d suivi_production -f database/add_indexes.sql
```

**High memory usage**
```bash
# Solution: Adjust PostgreSQL connection pool settings
# In backend/src/config/db.js, modify max: 20 to a lower value
```

---

## 📈 Scaling Considerations

### Horizontal Scaling

For high-traffic deployments:

1. **Load Balancer** - Use Nginx or a cloud load balancer
2. **Multiple Backend Instances** - Run multiple backend containers
3. **Database Replication** - Set up PostgreSQL read replicas
4. **Redis Caching** - Add Redis for session storage and caching
5. **CDN** - Serve static frontend files from a CDN

### Example Multi-Instance Setup

```yaml
# docker-compose.prod.yml
services:
  backend:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 512M
```

---

## 📝 Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password (strong!) | `kJ8#mP2$xQ9@wL5` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | `your-super-secret-jwt-key-minimum-32-chars` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | `suivi_production` |
| `POSTGRES_USER` | Database user | `postgres` |
| `POSTGRES_PORT` | Database port | `5432` |
| `NODE_ENV` | Environment | `production` |
| `BACKEND_PORT` | Backend port | `5000` |
| `FRONTEND_PORT` | Frontend port | `3000` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` |
| `REACT_APP_API_URL` | Frontend API URL | `http://localhost:5000/api` |

---

## 🆘 Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review application logs
3. Check GitHub Issues
4. Contact the development team

---

## ✅ Post-Deployment Verification

After deployment, verify:

- [ ] Application accessible at production URL
- [ ] Health endpoint returns `200 OK`
- [ ] Login functionality works
- [ ] Can create and manage tasks
- [ ] Database queries are fast (< 100ms)
- [ ] SSL certificate is valid
- [ ] CORS is properly restricted
- [ ] Backups are running
- [ ] Monitoring is active
- [ ] Logs are being collected

---

**Deployment Date**: ____________
**Deployed By**: ____________
**Version**: ____________

---

**🎉 Congratulations on your deployment!**
