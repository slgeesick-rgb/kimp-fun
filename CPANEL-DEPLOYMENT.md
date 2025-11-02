# Deploying Kimp Fun to cPanel

This guide shows you how to deploy Kimp Fun on a cPanel hosting account with Node.js support.

## Prerequisites

- cPanel account with Node.js support (most shared hosting plans include this)
- Access to cPanel dashboard
- SSH access (optional but recommended)

---

## Step 1: Check Node.js Support

1. Log into your cPanel dashboard
2. Look for **"Setup Node.js App"** or **"Node.js Selector"** in the Software section
3. If you see it, you're good to go!
4. If not, contact your hosting provider to enable Node.js

---

## Step 2: Upload Your Files

### Method A: File Manager (Easiest)

1. In cPanel, open **File Manager**
2. Navigate to your domain's root (usually `public_html` or `www`)
3. Create a new folder called `kimpfun` (or use your domain root)
4. Upload these files from your local `d:\jsgame` folder:
   ```
   server.js
   package.json
   index.html
   README.md
   public/ (entire folder with app-static.js and styles.css)
   ```
5. Extract if uploaded as ZIP

### Method B: FTP/SFTP

1. Use FileZilla or any FTP client
2. Connect to your cPanel FTP (Host: your-domain.com, use cPanel credentials)
3. Upload all files to `public_html/kimpfun/` or your desired directory

### Method C: SSH/Terminal (Advanced)

```bash
# Connect via SSH
ssh your-username@your-domain.com

# Navigate to your directory
cd public_html

# Create app directory
mkdir kimpfun
cd kimpfun

# Upload files using SCP from your local machine:
# scp -r d:\jsgame\* your-username@your-domain.com:~/public_html/kimpfun/
```

---

## Step 3: Set Up Node.js Application

1. In cPanel, go to **"Setup Node.js App"** or **"Application Manager"**

2. Click **"Create Application"**

3. Fill in the details:
   - **Node.js version:** 18.x or higher (select latest available)
   - **Application mode:** Production
   - **Application root:** `kimpfun` (or path where you uploaded files)
   - **Application URL:** Your domain or subdomain (e.g., `game.yourdomain.com` or `yourdomain.com`)
   - **Application startup file:** `server.js`
   - **Port:** Usually auto-assigned (e.g., 3000) - note this number

4. Click **"Create"**

---

## Step 4: Install Dependencies

### Method A: cPanel Interface

1. In the Node.js App Manager, find your application
2. Click **"Run NPM Install"** button
3. Wait for dependencies to install

### Method B: SSH Terminal

```bash
# Navigate to your app directory
cd ~/public_html/kimpfun

# Install dependencies
npm install

# Or if you need to use a specific Node version
source /opt/alt/alt-nodejs18/enable  # Adjust version as needed
npm install
```

---

## Step 5: Configure Environment Variables

1. In Node.js App Manager, find your app
2. Click **"Edit"** or **"Environment Variables"**
3. Add:
   ```
   PORT=3000
   ```
   (Use the port assigned by cPanel)

---

## Step 6: Start the Application

### Method A: cPanel Interface

1. In Node.js App Manager
2. Find your app
3. Click **"Start"** or **"Restart"**
4. Status should show "Running"

### Method B: SSH

```bash
cd ~/public_html/kimpfun
npm start
```

---

## Step 7: Configure Domain/Subdomain

### Option A: Main Domain

If you want the game at `https://yourdomain.com`:

1. Make sure files are in `public_html/`
2. The Node.js app will handle requests automatically

### Option B: Subdomain

If you want `https://game.yourdomain.com`:

1. In cPanel, go to **"Subdomains"**
2. Create subdomain: `game`
3. Set document root to your app folder (e.g., `public_html/kimpfun`)
4. Update Node.js app settings to use this subdomain

---

## Step 8: Set Up .htaccess for Proxy (Important!)

Create or edit `.htaccess` in your application root:

```apache
RewriteEngine On

# Proxy WebSocket connections
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^(.*)$ ws://127.0.0.1:3000/$1 [P,L]

# Proxy HTTP connections
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

**Replace `3000` with your assigned port number!**

---

## Step 9: Update Application for cPanel

Since cPanel might serve the app from a subfolder, update your `index.html`:

### Option 1: Use Root Path (Recommended)

Make sure your app is configured to run at the domain root. The current setup should work as-is.

### Option 2: If Using Subfolder

If your game is at `https://yourdomain.com/kimpfun/`, you'll need to:

1. Update asset paths in `index.html`
2. Update WebSocket connection in `app-static.js`

But it's easier to use a subdomain or domain root.

---

## Step 10: Test Your Deployment

1. Open your browser
2. Go to `https://yourdomain.com` (or your subdomain)
3. You should see the Kimp Fun splash screen
4. Click **"Create Game"** or **"Join Game"**
5. When prompted for server URL, enter:
   - `wss://yourdomain.com` (if using HTTPS)
   - `ws://yourdomain.com` (if using HTTP - not recommended)

---

## Troubleshooting

### Issue: "Application failed to start"

**Solution:**
1. Check Node.js version (use 18.x or higher)
2. SSH into your server:
   ```bash
   cd ~/public_html/kimpfun
   node server.js
   ```
3. Look at error messages
4. Common fix: Run `npm install` again

### Issue: "Cannot connect to WebSocket"

**Solution:**
1. Check if Node.js app is running in cPanel
2. Verify `.htaccess` proxy rules
3. Check firewall rules (contact hosting provider)
4. Verify port number matches

### Issue: "404 Not Found"

**Solution:**
1. Verify `.htaccess` is in the correct directory
2. Check file permissions (644 for files, 755 for directories)
3. Ensure `mod_proxy` is enabled (contact hosting provider)

### Issue: "Port already in use"

**Solution:**
1. Stop the existing app in Node.js App Manager
2. Or choose a different port
3. Update both `server.js` and `.htaccess`

### Issue: App stops running

**Solution:**
1. Set up a cron job to keep it running:
   - Go to cPanel → **Cron Jobs**
   - Add: `*/5 * * * * /usr/bin/curl http://127.0.0.1:3000/ > /dev/null 2>&1`
   - This pings your app every 5 minutes

---

## Making the App Auto-Start on Reboot

### Method 1: Using cPanel Passenger

If your cPanel uses Passenger (Phusion Passenger):
1. Passenger will auto-restart your app
2. No additional configuration needed

### Method 2: Using PM2 (Advanced)

```bash
# SSH into your server
ssh your-username@your-domain.com

# Install PM2 globally (if allowed)
npm install -g pm2

# Navigate to your app
cd ~/public_html/kimpfun

# Start with PM2
pm2 start server.js --name kimp-fun

# Save PM2 process list
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

---

## Performance Tips for cPanel

1. **Enable compression** in `.htaccess`:
   ```apache
   <IfModule mod_deflate.c>
     AddOutputFilterByType DEFLATE text/html text/css application/javascript
   </IfModule>
   ```

2. **Cache static assets**:
   ```apache
   <IfModule mod_expires.c>
     ExpiresActive On
     ExpiresByType text/css "access plus 1 year"
     ExpiresByType application/javascript "access plus 1 year"
   </IfModule>
   ```

3. **Use CloudFlare** (free) for:
   - WebSocket support
   - DDoS protection
   - SSL/TLS
   - CDN

---

## SSL/HTTPS Setup

Most cPanel hosting includes free SSL via Let's Encrypt:

1. In cPanel, go to **"SSL/TLS Status"**
2. Enable **AutoSSL** for your domain
3. Wait 5-10 minutes for certificate issuance
4. Your game will be available at `https://yourdomain.com`
5. WebSocket will use `wss://` automatically

---

## Quick Reference

**Files you need to upload:**
```
index.html
server.js
package.json
public/
  ├── app-static.js
  └── styles.css
```

**cPanel sections you'll use:**
1. File Manager (upload files)
2. Setup Node.js App (create app)
3. SSL/TLS Status (enable HTTPS)
4. Subdomains (optional)

**Important files to create:**
1. `.htaccess` (proxy configuration)
2. `package.json` (already have it)

---

## Cost Estimate

- **Shared cPanel hosting:** $3-10/month
- **VPS with cPanel:** $15-30/month (better performance)
- **Free alternatives:** Render.com, Railway.app (see DEPLOYMENT.md)

---

## Next Steps After Deployment

1. Test with multiple players from different devices
2. Monitor app in Node.js App Manager
3. Check error logs if issues occur
4. Set up regular backups in cPanel
5. Consider upgrading to VPS if you get 50+ concurrent players

---

## Support

If you encounter issues:

1. **Check cPanel error logs:**
   - Node.js App Manager → View logs
   - cPanel → Metrics → Errors

2. **Contact your hosting provider** if:
   - Node.js isn't available
   - WebSocket connections are blocked
   - Need help with `.htaccess` rules

3. **Test locally first:**
   ```bash
   cd d:\jsgame
   npm start
   # Open http://localhost:3000
   ```

---

## Alternative: Upload via Git (Advanced)

Some cPanel hosts support Git:

1. In cPanel, go to **"Git Version Control"**
2. Click **"Create"**
3. Clone your GitHub repository
4. Pull updates with one click in the future

This makes updates super easy!

---

## Summary

1. ✅ Upload files to cPanel
2. ✅ Create Node.js app in cPanel
3. ✅ Run `npm install`
4. ✅ Create `.htaccess` proxy rules
5. ✅ Start the app
6. ✅ Enable SSL
7. ✅ Test your game!

Your game will be live at `https://yourdomain.com`!
