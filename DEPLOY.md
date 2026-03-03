# AttendPro — Deployment Guide

## Option 1: Deploy on Render (Recommended — Free Tier)

### Setup MongoDB Atlas (Cloud Database)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) and sign up (free)
2. Create a **Free Shared Cluster** (M0)
3. Set Database User: create a username and password
4. Network Access: click **Allow Access from Anywhere** (0.0.0.0/0)
5. Click **Connect** → **Connect your application**
6. Copy the connection string, it looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/attendance_db?retryWrites=true&w=majority
   ```

### Deploy on Render

1. Push your code to **GitHub**
2. Go to [Render](https://render.com) and sign up
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name**: attendpro
   - **Root Directory**: (leave blank)
   - **Build Command**: `cd client && npm install && npm run build && cd ../server && npm install`
   - **Start Command**: `cd server && node server.js`
6. Add **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` |
   | `MONGO_URI` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | A long random secret key |
   | `ADMIN_EMAIL` | `admin@attendance.com` |
   | `ADMIN_PASSWORD` | `Admin@123` |
7. Click **Deploy**

### Seed Admin User After Deploy
Open the Render **Shell** tab and run:
```bash
cd server && node seed.js
```

---

## Option 2: Deploy on Railway

1. Go to [Railway](https://railway.app) and sign up
2. Click **New Project → Deploy from GitHub Repo**
3. Add same environment variables as above
4. Set **Start Command**: `cd client && npm install && npm run build && cd ../server && npm install && node server.js`

---

## Option 3: VPS / DigitalOcean

```bash
# Clone repo
git clone <your-repo-url>
cd Attendance

# Install dependencies
cd client && npm install && npm run build
cd ../server && npm install

# Set environment variables
export NODE_ENV=production
export MONGO_URI="mongodb+srv://..."
export JWT_SECRET="your-secret-key"
export PORT=5000

# Seed admin
node seed.js

# Run with PM2 (process manager)
npm install -g pm2
pm2 start server.js --name attendpro
```
