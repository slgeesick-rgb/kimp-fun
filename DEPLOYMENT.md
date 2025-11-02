# Deploying Kimp Fun to Cloud

Kimp Fun requires a **Node.js backend server** to run. Free static hosts like InfinityFree/42web.io **will NOT work** because they only serve static files and cannot run Node.js applications.

## The Problem with Static Hosting

Your error shows that the static host is returning a 404 page when your app tries to call `/api/create-room`. This is because:

1. Static hosts only serve HTML/CSS/JS files
2. They cannot run `server.js` (the Node.js WebSocket server)
3. The game requires real-time WebSocket connections

## ✅ Recommended Free Hosting Options

### Option 1: Render.com (Recommended)

**Free tier includes:**
- Node.js hosting
- WebSocket support
- Automatic HTTPS
- No credit card required

**Steps:**

1. Push your code to GitHub:
   ```bash
   cd d:\jsgame
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on GitHub and push
   git remote add origin https://github.com/YOUR_USERNAME/kimp-fun.git
   git push -u origin main
   ```

2. Go to [render.com](https://render.com) and sign up

3. Click **"New +"** → **"Web Service"**

4. Connect your GitHub repository

5. Configure:
   - **Name:** kimp-fun
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

6. Click **"Create Web Service"**

7. After deployment, your URL will be: `https://kimp-fun-XXXX.onrender.com`

8. Update `app-static.js` default server URL or configure it when creating/joining games

**Note:** Free tier sleeps after inactivity. First request takes ~30 seconds to wake up.

---

### Option 2: Railway.app

**Free tier includes:**
- $5 free credit/month
- Node.js + WebSocket support
- Custom domains

**Steps:**

1. Push code to GitHub (see Option 1, step 1)

2. Go to [railway.app](https://railway.app) and sign up

3. Click **"New Project"** → **"Deploy from GitHub repo"**

4. Select your repository

5. Railway auto-detects Node.js and deploys

6. Click **"Generate Domain"** to get your URL

7. Use the generated URL as your WebSocket server

---

### Option 3: Glitch.com

**Free tier includes:**
- Node.js hosting
- Live code editing
- Automatic HTTPS

**Steps:**

1. Go to [glitch.com](https://glitch.com)

2. Click **"New Project"** → **"Import from GitHub"**

3. Enter your GitHub repo URL

4. Glitch automatically deploys

5. Your URL: `https://your-project-name.glitch.me`

**Note:** Free projects sleep after 5 minutes of inactivity.

---

### Option 4: Heroku (Requires Credit Card)

Heroku still works but requires credit card verification even for free tier.

---

## 🔧 Using Your Current Static Host

If you must use your current static host (42web.io), you'll need to:

1. Deploy the **backend** (`server.js`) to a Node.js host (Render/Railway/Glitch)
2. Keep the **frontend** (HTML/CSS/JS) on 42web.io
3. Update the frontend to point to your backend server

**Modified setup:**

1. Deploy `server.js`, `package.json` to Render (backend only)

2. Upload `index.html`, `public/` folder to 42web.io (frontend only)

3. Users will need to enter your backend URL when playing:
   - Frontend on: `https://gamekimp.42web.io`
   - Backend on: `wss://kimp-fun.onrender.com`

The `app-static.js` file I created will prompt users for the server URL automatically.

---

## 🚀 Quick Deploy Script for Render

Create a `render.yaml` in your project root:

```yaml
services:
  - type: web
    name: kimp-fun
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: PORT
        value: 3000
```

Then commit and push to GitHub. Render will auto-deploy.

---

## 🧪 Testing Your Deployment

1. Deploy backend to Render/Railway/Glitch
2. Get your URL (e.g., `https://kimp-fun.onrender.com`)
3. Open the frontend
4. When prompted for server URL, enter: `wss://kimp-fun.onrender.com`
5. Create a room and test

---

## 💡 Best Setup for Production

1. **Backend:** Render.com (free, reliable, always-on with paid plan)
2. **Frontend:** Same Render deployment (serves both static + WebSocket)
3. **Domain:** Point your custom domain to Render

This way everything is in one place and just works!

---

## 📝 Current Status

Your static host at `gamekimp.42web.io` cannot run the Node.js server. You have two options:

**Option A (Simplest):** Deploy everything to Render.com
- Upload your entire project to Render
- Access at `https://your-app.onrender.com`
- Works immediately, no configuration needed

**Option B (Split):** Keep frontend on 42web.io, backend on Render
- More complex setup
- Users must configure server URL
- Use `app-static.js` instead of `app.js`

I've already updated your code to support Option B with the new `app-static.js` file.

---

## Need Help?

1. Check if your host supports Node.js: Look for "Node.js hosting" in their features
2. If not, use one of the free options above
3. Render.com is the easiest and most reliable for beginners
