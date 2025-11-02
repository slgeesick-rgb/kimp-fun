# Cloud Deployment Not Working - Debug Guide

## What error are you seeing?

Check your browser console (F12) and note which error you're getting:

### Error Type 1: 503 Service Unavailable
**Meaning:** Node.js app is not running or can't be reached
➡️ **Go to:** `503-ERROR-FIX.md`

### Error Type 2: 404 Not Found
**Meaning:** Files not uploaded correctly or wrong path
➡️ **See below:** "404 Error Solutions"

### Error Type 3: ERR_CONNECTION_REFUSED
**Meaning:** App not started or wrong port
➡️ **See below:** "Connection Refused Solutions"

### Error Type 4: WebSocket Failed
**Meaning:** WebSocket proxy not working
➡️ **See below:** "WebSocket Solutions"

---

## 🔍 Step-by-Step Cloud Debugging

### Step 1: Verify Files Are Uploaded

In cPanel File Manager, check that these exist:

```
public_html/
├── .htaccess           ✓ Check this exists
├── server.js           ✓ Check this exists
├── package.json        ✓ Check this exists
└── public/             ✓ This folder must exist
    ├── index.html      ✓ Inside public folder
    ├── app.js          ✓ Inside public folder
    └── styles.css      ✓ Inside public folder
```

**Common mistake:** Extracting ZIP created a nested folder
- ❌ BAD: `public_html/kimp-fun/public/index.html`
- ✅ GOOD: `public_html/public/index.html`

**How to fix:**
1. If files are in `public_html/kimp-fun/`, move everything UP one level
2. Files should be directly in `public_html/`

---

### Step 2: Check Node.js App Status

1. Log into cPanel
2. Search for **"Setup Node.js App"** or **"Application Manager"**
3. Look at your app's **Status**:

#### Status: "Stopped" or "Not Running"
**Fix:**
1. Click **"Start"** or **"Restart"**
2. Wait 10 seconds
3. Refresh browser

#### Status: "Running" ✅
**Note the PORT number** (e.g., 3000, 3500, 8080)
➡️ Continue to Step 3

#### Status: "Error" or crashes immediately
**Fix:**
1. Click **"View Logs"** or **"Error Log"**
2. Read the error message
3. Common errors:

**Error: "Cannot find module 'ws'"**
```
Fix: Click "Run NPM Install", wait, then "Start"
```

**Error: "EADDRINUSE"**
```
Fix: Port already in use. Change port in Node.js App settings
```

**Error: "Cannot find module './public'"**
```
Fix: Verify the public/ folder exists and has the right files
```

---

### Step 3: Verify .htaccess Configuration

1. In cPanel File Manager, click **Settings** (top right)
2. Check **"Show Hidden Files"**
3. Find and edit `.htaccess`

**Your .htaccess should look like this:**
```apache
RewriteEngine On

# Proxy WebSocket connections
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^(.*)$ ws://127.0.0.1:YOUR_PORT/$1 [P,L]

# Proxy all HTTP requests to Node.js app
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:YOUR_PORT/$1 [P,L]
```

**IMPORTANT:** Replace `YOUR_PORT` with the port from Step 2!

**Example:** If cPanel shows port 3500:
```apache
RewriteRule ^(.*)$ ws://127.0.0.1:3500/$1 [P,L]
RewriteRule ^(.*)$ http://127.0.0.1:3500/$1 [P,L]
```

---

### Step 4: Test Direct Access

Try accessing your app directly with port number:

`http://your-domain.com:YOUR_PORT`

**If it works:**
✅ App is running fine
❌ Problem is with `.htaccess` proxy

**Fix:**
1. Verify `.htaccess` has correct port
2. Contact hosting provider to enable `mod_proxy`

**If it doesn't work:**
❌ App is not running or port is blocked
🔧 Go back to Step 2

**Note:** Many hosts block direct port access for security. This is normal.

---

## 404 Error Solutions

### Symptom: Page shows "404 Not Found"

**Cause 1: Files in wrong directory**

Check: `public_html/public/index.html` exists

If not:
```bash
# Via SSH:
cd ~/public_html
ls -la public/

# You should see:
# index.html
# app.js
# styles.css
```

**Cause 2: .htaccess not working**

Test by accessing: `http://your-domain.com/public/index.html`

If this works but `/` doesn't:
- `.htaccess` rules aren't being applied
- Contact hosting provider about `AllowOverride All`

**Cause 3: Node.js app not handling routes**

The app might not be running at all.
➡️ Go back to Step 2

---

## Connection Refused Solutions

### Symptom: "ERR_CONNECTION_REFUSED" or can't connect

**Cause 1: Wrong URL**

Make sure you're visiting:
- ✅ `https://your-domain.com`
- ❌ NOT `https://your-domain.com:3000`

**Cause 2: App not started**

➡️ Go to Step 2 and start the app

**Cause 3: Port blocked by firewall**

Contact hosting provider:
> "Please verify that internal port forwarding is allowed for Node.js applications"

---

## WebSocket Solutions

### Symptom: Game loads but rooms don't work

Open browser console (F12), look for:
- `WebSocket connection failed`
- `Error connecting to ws://`

**Cause 1: WebSocket proxy not configured**

Verify `.htaccess` has these lines:
```apache
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^(.*)$ ws://127.0.0.1:YOUR_PORT/$1 [P,L]
```

**Cause 2: mod_proxy_wstunnel not enabled**

Contact hosting provider:
> "Please enable mod_proxy_wstunnel for WebSocket support"

**Cause 3: Using HTTPS but WebSocket using WS**

This shouldn't happen, but check browser console. If you see `wss://` failing:

Edit `app.js` (line 57):
```javascript
// Change from:
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

// To (force wss):
const wsProtocol = 'wss:';
```

---

## Quick Diagnostic Commands (SSH)

If you have SSH access:

```bash
# Navigate to your app
cd ~/public_html

# Check files exist
ls -la
ls -la public/

# Check if app runs manually
node server.js
# If you see "Kimp Fun listening on http://localhost:3000" - it works!
# Press Ctrl+C to stop

# Check if dependencies installed
ls node_modules/ws/
# If error, run: npm install

# Check Node.js version
node --version
# Should be v18.x or higher

# Check running processes
ps aux | grep node

# Test localhost connection
curl http://127.0.0.1:3000
# Should return HTML
```

---

## Complete Upload & Setup Checklist

Use this to ensure everything is done correctly:

- [ ] **1. Files uploaded to correct location**
  - [ ] `.htaccess` in `public_html/`
  - [ ] `server.js` in `public_html/`
  - [ ] `package.json` in `public_html/`
  - [ ] `public/` folder exists in `public_html/`
  - [ ] `public/index.html` exists
  - [ ] `public/app.js` exists
  - [ ] `public/styles.css` exists

- [ ] **2. Node.js app created in cPanel**
  - [ ] Application root: `public_html`
  - [ ] Application startup file: `server.js`
  - [ ] Node.js version: 18.x or higher
  - [ ] Port number noted: _______

- [ ] **3. Dependencies installed**
  - [ ] Clicked "Run NPM Install"
  - [ ] No errors shown
  - [ ] `node_modules/` folder exists

- [ ] **4. .htaccess configured**
  - [ ] File exists and is readable
  - [ ] Port matches Node.js app port
  - [ ] Both `ws://` and `http://` rules present

- [ ] **5. App started**
  - [ ] Status shows "Running"
  - [ ] No errors in logs

- [ ] **6. Testing**
  - [ ] Can access homepage
  - [ ] No 404 errors
  - [ ] No 503 errors
  - [ ] Browser console shows no errors

---

## Still Not Working?

### Get Detailed Error Info

1. **Open browser console** (F12)
2. **Go to Console tab**
3. **Copy all red errors**
4. **Share with hosting support**

### Contact Your Hosting Provider

Send them this:

```
Subject: Node.js application not accessible through Apache proxy

Hi,

I've deployed a Node.js application but cannot access it through my domain.

App details:
- Node.js version: 18.x
- Application status: Running on port [YOUR_PORT]
- Directory: public_html/
- Startup file: server.js

Issue:
[Describe what you see: 503, 404, connection refused, etc.]

Can you please verify:
1. mod_proxy is enabled
2. mod_proxy_http is enabled
3. mod_proxy_wstunnel is enabled (for WebSocket)
4. AllowOverride All is set for my directory
5. Port forwarding from 80/443 to [YOUR_PORT] is working

My .htaccess configuration is attached.

Thank you!
```

---

## Alternative: Test Without .htaccess

To isolate the issue:

1. **Rename** `.htaccess` to `.htaccess.backup`
2. **Access app directly:** `http://your-domain.com:YOUR_PORT`
3. **If this works:**
   - Problem is with `.htaccess` proxy
   - Contact hosting provider
4. **If this doesn't work:**
   - Problem is with Node.js app itself
   - Check logs and Step 2

---

## Common Hosting Provider Issues

### InfinityFree / 42web.io
❌ **Does NOT support Node.js** - Use Render.com instead

### Namecheap Shared Hosting
⚠️ **Limited Node.js support** - May need to enable first

### Hostinger
✅ Usually works - Enable Node.js in cPanel first

### SiteGround
✅ Good Node.js support - Use Node.js App Manager

### Bluehost
⚠️ Node.js only on VPS plans, not shared hosting

---

## What's Your Exact Error?

Tell me:
1. What error message do you see?
2. Is the Node.js app showing "Running" in cPanel?
3. What's the port number assigned?
4. Did you update `.htaccess` with that port?

I can help you debug from there! 🔍
