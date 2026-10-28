# VPS Deployment Guide for humsafar.piyushassudani.in

## Your Architecture
- **API Domain**: `humsafar.piyushassudani.in` → VPS IP
- **VPS**: Self-hosted (you control it)
- **MongoDB**: Atlas (external)
- **Redis**: Install on same VPS (recommended) or separate VPS

---

## 1. Install Redis on Your VPS

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf

# Change these settings:
# bind 127.0.0.1 ::1          # Only localhost (secure)
# port 6379
# maxmemory 512mb             # Adjust based on RAM
# maxmemory-policy allkeys-lru
# save 900 1                  # Persistence
# save 300 10
# save 60 10000

sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Test
redis-cli ping
# Should return: PONG
```

---

## 2. Update .env for Your VPS

```bash
# In your backend folder
nano .env

# REQUIRED VALUES:
PORT=3000
NODE_ENV=production

# MongoDB Atlas (your existing)
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/perfectbandhan?retryWrites=true&w=majority&maxPoolSize=50&minPoolSize=10

# Redis on SAME VPS (localhost)
REDIS_URL=redis://127.0.0.1:6379
USE_REDIS_CACHE=true

# JWT - Generate once: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-64-char-hex-string-here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-name
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret

# Gemini AI
GEMINI_API_KEY=your-key

# Google OAuth
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret

# Admin
ADMIN_PHONE=9413879444
ADMIN_PASSWORD=your-secure-password

# Firebase - Option 1: File (place in backend root)
# FIREBASE_CREDENTIALS_PATH=./firebase-key.json

# Firebase - Option 2: Env vars (no file needed)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Feature flags
CHAT_COMING_SOON=false
MAINTENANCE_MODE=false
LOG_LEVEL=info
```

---

## 3. Nginx Config for humsafar.piyushassudani.in

```bash
sudo nano /etc/nginx/sites-available/humsafar
```

```nginx
server {
    listen 80;
    server_name humsafar.piyushassudani.in;

    # Redirect HTTP to HTTPS (after SSL)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name humsafar.piyushassudani.in;

    # SSL (Certbot will fill these)
    ssl_certificate /etc/letsencrypt/live/humsafar.piyushassudani.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/humsafar.piyushassudani.in/privkey.pem;
    
    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # API Proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 86400s;  # WebSocket needs long timeout
    }

    # Static files (if any)
    location /public/ {
        alias /path/to/perfectbandhan_backend/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/humsafar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL with Certbot
sudo certbot --nginx -d humsafar.piyushassudani.in
```

---

## 4. PM2 Process Manager

```bash
# In backend folder
npm install -g pm2
pm2 start src/server.js --name perfectbandhan -i max

# Save for auto-restart on reboot
pm2 save
pm2 startup systemd -u $USER --hp $HOME
# Run the sudo command it outputs

# Check status
pm2 status
pm2 logs perfectbandhan
```

---

## 5. Firewall (UFW)

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
# Redis port 6379 - DO NOT EXPOSE to internet!
sudo ufw enable
sudo ufw status
```

---

## 6. Verify Everything Works

```bash
# Health check
curl https://humsafar.piyushassudani.in/health

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "database": "connected",
#     "redis": "connected",
#     "circuitBreaker": "CLOSED"
#   },
#   "pool": {...}
# }

# Test API
curl https://humsafar.piyushassudani.in/api/v1/auth/firebase-config
```

---

## 7. Monitoring Commands

```bash
# Real-time logs
pm2 logs perfectbandhan --lines 200

# Metrics dashboard
pm2 monit

# Redis stats
redis-cli info memory
redis-cli info stats

# MongoDB pool (from health endpoint)
curl -s https://humsafar.piyushassudani.in/health | jq .pool
```

---

## 8. Backup Strategy

```bash
# Redis backup (daily cron)
# /etc/cron.daily/redis-backup
#!/bin/bash
redis-cli --rdb /var/backups/redis/dump-$(date +%F).rdb
find /var/backups/redis -name "dump-*.rdb" -mtime +7 -delete

chmod +x /etc/cron.daily/redis-backup

# MongoDB: Atlas handles backups automatically
```

---

## 9. Scaling Later (When Needed)

| Component | Current | Scale To |
|-----------|---------|----------|
| Redis | Single VPS | Redis Cluster (3+ nodes) or Upstash |
| PM2 | `-i max` (all cores) | Multiple VPS behind load balancer |
| MongoDB | Atlas M10+ | Atlas M30+ / Sharded |
| Nginx | Single | Multiple + HAProxy |

---

## 10. Quick Commands Reference

```bash
# Deploy updates
cd /path/to/perfectbandhan_backend
git pull
npm install --production
pm2 reload perfectbandhan

# Restart everything
pm2 restart perfectbandhan
sudo systemctl reload nginx

# Check Redis memory
redis-cli INFO memory | grep used_memory_human

# Clear Redis cache (if needed)
redis-cli FLUSHDB

# View PM2 processes
pm2 list
pm2 show perfectbandhan
```

---

## ✅ Checklist Before Going Live

- [ ] MongoDB Atlas: Network Access → `0.0.0.0/0` or VPS IP only
- [ ] Redis: Binding to `127.0.0.1` only (not exposed)
- [ ] Nginx: SSL certificate valid, auto-renewal works
- [ ] PM2: Auto-start on reboot configured
- [ ] Firewall: Only 22, 80, 443 open
- [ ] `.env`: All values filled, no placeholders
- [ ] Health endpoint returns `healthy`
- [ ] Test login, profile, chat flow end-to-end
