# 503 Error Troubleshooting Guide

## What Does 503 Mean?

**503 Service Unavailable** means:
- Your Node.js app is NOT running, OR
- The proxy in `.htaccess` can't connect to your Node.js app, OR
- The port configuration is wrong

---

## Quick Fix Steps

### Step 1: Check if Node.js App is Running

1. Log into **cPanel**
2. Go to **"Setup Node.js App"** (or "Application Manager")
3. Find your Kimp Fun application
4. Check the **Status**:
   - ❌ **Stopped** → Click "Start" or "Restart"
   - ✅ **Running** → Proceed to Step 2
   - ⚠️ **Error** → Check error logs (click "View Logs")

### Step 2: Verify the Port Number

Your `.htaccess` must use the EXACT port cPanel assigned:

1. In **Node.js App Manager**, find your app
2. Look for the port number (usually displayed near the app details)
3. **Common ports:** 3000, 3500, 8080, 8443, 3306

4. Edit `.htaccess` in File Manager:
   ```apache
   # Line 4 and Line 9 must match your port!
   
   # If cPanel shows port 3500, change:
   RewriteRule ^(.*)$ ws://127.0.0.1:3500/$1 [P,L]
   RewriteRule ^(.*)$ http://127.0.0.1:3500/$1 [P,L]
   ```

### Step 3: Check Application Logs

1. In **Node.js App Manager**, click your app name
2. Click **"View Logs"** or **"Error Log"**
3. Look for error messages like:
   - `Error: listen EADDRINUSE` → Port conflict
   - `Cannot find module` → Dependencies not installed
   - `SyntaxError` → File corruption during upload

### Step 4: Reinstall Dependencies

Sometimes npm install fails silently:

1. In **Node.js App Manager**, find your app
2. Click **"Stop"** (if running)
3. Click **"Run NPM Install"** 
4. Wait for completion (may take 1-2 minutes)
5. Click **"Start"**

### Step 5: Test via SSH (Advanced)

If you have SSH access:

```bash
# Connect to your server
ssh your-username@your-domain.com

# Navigate to your app directory
cd ~/public_html

# Check if Node.js is available
node --version
npm --version

# Install dependencies manually
npm install

# Try running the app manually
node server.js
```

If you see `Kimp Fun listening on http://localhost:3000`, the app works!

Press `Ctrl+C` to stop, then start it via cPanel instead.

---

## Common Causes & Solutions

### Cause 1: Dependencies Not Installed

**Symptom:** App shows "Running" but 503 error persists

**Solution:**
```bash
# Via SSH:
cd ~/public_html
rm -rf node_modules
npm install
```

Or in cPanel:
- Stop app
- Delete `node_modules` folder (if exists)
- Run NPM Install
- Start app

### Cause 2: Wrong Port in .htaccess

**Symptom:** App runs but browser can't connect

**Solution:**
1. Check port in Node.js App Manager (e.g., 3500)
2. Edit `.htaccess`:
   ```apache
   # Change BOTH lines:
   ws://127.0.0.1:YOUR_PORT_HERE/$1
   http://127.0.0.1:YOUR_PORT_HERE/$1
   ```

### Cause 3: Proxy Module Not Enabled

**Symptom:** 503 even when app is running and port is correct

**Solution:**
Contact your hosting provider and ask them to enable:
- `mod_proxy`
- `mod_proxy_http`
- `mod_proxy_wstunnel`

Most cPanel hosts have these enabled by default.

### Cause 4: Application Crashed

**Symptom:** Status shows "Stopped" repeatedly after starting

**Solution:**
1. Check error logs in Node.js App Manager
2. Common issues:
   - **Missing `ws` package:** Run `npm install`
   - **Port already in use:** Change port in cPanel settings
   - **File permission errors:** Set files to 644, folders to 755

Fix permissions via SSH:
```bash
cd ~/public_html
find . -type f -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;
chmod 644 .htaccess
```

### Cause 5: File Upload Corruption

**Symptom:** App won't start, syntax errors in logs

**Solution:**
1. Delete all uploaded files
2. Re-upload the ZIP file
3. Extract again
4. Run NPM Install
5. Start app

### Cause 6: Node.js Version Too Old

**Symptom:** App crashes immediately on start

**Solution:**
1. In Node.js App Manager, check version
2. **Required:** Node.js 18.x or higher
3. Change to latest available version
4. Run NPM Install again
5. Restart app

---

## Step-by-Step Diagnostic

Follow these steps in order:

```
1. [ ] Is Node.js App status "Running"?
   NO → Start the app
   YES → Continue

2. [ ] Can you see the port number in cPanel?
   NO → Look in app details/settings
   YES → Note the port ___________

3. [ ] Does .htaccess use the correct port?
   NO → Edit .htaccess, update port
   YES → Continue

4. [ ] Are there errors in application logs?
   YES → Read error, search Google for solution
   NO → Continue

5. [ ] Did NPM Install complete successfully?
   NO → Run it again, watch for errors
   YES → Continue

6. [ ] Can you SSH and run "node server.js"?
   NO → Check file permissions
   YES → App works! Issue is with .htaccess

7. [ ] Are proxy modules enabled?
   NO → Contact hosting provider
   YES → Continue

8. [ ] Is mod_rewrite enabled in .htaccess?
   NO → Check for .htaccess syntax errors
   YES → Continue
```

---

## Alternative: Direct Port Access (Testing)

To test if your Node.js app works without .htaccess:

1. Find your app's port (e.g., 3500)
2. Try accessing: `http://your-domain.com:3500`
3. If it works → `.htaccess` is the problem
4. If it doesn't → Node.js app is the problem

**Note:** Some hosts block direct port access for security.

---

## Still Not Working?

### Try Simpler .htaccess

Replace your `.htaccess` with this minimal version:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

Change `3000` to your port. This skips WebSocket-specific rules to isolate the issue.

### Contact Your Hosting Provider

If nothing works, contact support with:

**Subject:** "Need help with Node.js app returning 503"

**Message:**
```
I'm trying to run a Node.js application on my cPanel hosting.

- Node.js app status: Running (port XXXX)
- Application: Kimp Fun multiplayer game
- Error: 503 Service Unavailable

I need help with:
1. Confirming mod_proxy is enabled
2. Verifying WebSocket support is available
3. Checking if my .htaccess proxy configuration is correct

Can you help me troubleshoot this?
```

---

## Working Configuration Example

Here's a confirmed working setup:

**cPanel Node.js App Settings:**
- Node.js version: 18.20.0
- Application root: public_html
- Application startup file: server.js
- Status: Running
- Port: 3500

**.htaccess:**
```apache
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^(.*)$ ws://127.0.0.1:3500/$1 [P,L]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3500/$1 [P,L]
```

**Result:** Game accessible at https://yourdomain.com

---

## Quick Debug Checklist

Print this and check off each item:

- [ ] Node.js app status is "Running" in cPanel
- [ ] Port number noted from cPanel: __________
- [ ] .htaccess has correct port (2 places)
- [ ] `npm install` completed without errors
- [ ] No errors in application logs
- [ ] Node.js version is 18.x or higher
- [ ] All files uploaded correctly
- [ ] .htaccess file is in the correct directory
- [ ] File permissions are correct (644/755)
- [ ] Tried restarting the app
- [ ] Cleared browser cache
- [ ] Tested in incognito/private window

---

## Success Indicators

You'll know it's working when:

✅ Node.js App Manager shows "Running" with green indicator
✅ Visiting your domain shows Kimp Fun splash screen (not 503)
✅ Can create a game room
✅ No console errors in browser
✅ WebSocket connects (check browser dev tools → Network → WS)

---

## Next Steps After Fix

Once your app is running:

1. Test game functionality
2. Enable SSL/HTTPS in cPanel
3. Set up monitoring/uptime checks
4. Create a backup of working configuration

---

Need more help? Check `CPANEL-DEPLOYMENT.md` for detailed setup instructions.
