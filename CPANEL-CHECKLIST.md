# cPanel Deployment Checklist

Follow these steps to deploy Kimp Fun to your cPanel hosting.

## ✅ Pre-Deployment Checklist

- [ ] I have cPanel access
- [ ] My hosting supports Node.js (check cPanel for "Setup Node.js App")
- [ ] I have FTP/SSH credentials
- [ ] My domain is pointed to this hosting

## 📤 Step 1: Upload Files

- [ ] Upload all files to `public_html/` or your domain folder
- [ ] Verify `.htaccess` file uploaded (it's hidden - enable "Show Hidden Files")
- [ ] All files from `public/` folder uploaded correctly
- [ ] `server.js` and `package.json` are in the root

**Files to upload:**
```
.htaccess
server.js
package.json
README.md
public/index.html
public/app.js
public/styles.css
```

## ⚙️ Step 2: Configure Node.js App

- [ ] Open cPanel → "Setup Node.js App"
- [ ] Click "Create Application"
- [ ] Set Application root to your folder path
- [ ] Set Application startup file: `server.js`
- [ ] Select Node.js version: 18.x or higher
- [ ] Application mode: Production
- [ ] Note the PORT number assigned (e.g., 3000)

## 🔧 Step 3: Install Dependencies

- [ ] Click "Run NPM Install" in Node.js App Manager
- [ ] Wait for installation to complete (may take 1-2 minutes)
- [ ] Check for any error messages

## 🚀 Step 4: Start Application

- [ ] Click "Start" or "Restart" in Node.js App Manager
- [ ] Status shows "Running" (green)
- [ ] Note the URL where app is running

## 🔗 Step 5: Update .htaccess

- [ ] Edit `.htaccess` file
- [ ] Change port `3000` to the port cPanel assigned
- [ ] Save changes

**If cPanel assigned port 3500, change:**
```apache
# From:
ws://127.0.0.1:3000/$1

# To:
ws://127.0.0.1:3500/$1
```

## 🔒 Step 6: Enable SSL (HTTPS)

- [ ] Open cPanel → "SSL/TLS Status"
- [ ] Enable AutoSSL for your domain
- [ ] Wait 5-10 minutes for certificate
- [ ] Verify HTTPS works: `https://yourdomain.com`

## 🧪 Step 7: Test Your Game

- [ ] Open `https://yourdomain.com` in browser
- [ ] Kimp Fun splash screen loads
- [ ] Click "Create Game"
- [ ] Enter a display name and create room
- [ ] Room created successfully
- [ ] Copy room link
- [ ] Open link in incognito/private window
- [ ] Join as second player
- [ ] Both players see each other in lobby
- [ ] Host starts game
- [ ] Game loads and runs smoothly
- [ ] Players can move and collect items
- [ ] Scores update in real-time

## 🐛 Troubleshooting

### 503 Service Unavailable Error?
- [ ] **STOP!** Read `503-ERROR-FIX.md` for complete solutions
- [ ] Check Node.js app status in cPanel (must be "Running")
- [ ] Verify port in `.htaccess` matches cPanel port
- [ ] Run "NPM Install" again in Node.js App Manager
- [ ] Check error logs in Node.js App Manager

### App won't start?
- [ ] Check Node.js version (must be 18.x+)
- [ ] SSH in and run: `cd ~/public_html && npm install && node server.js`
- [ ] Check error logs in Node.js App Manager
- [ ] Run diagnostic: `bash diagnose.sh`

### Can't connect to WebSocket?
- [ ] Verify `.htaccess` proxy rules are correct
- [ ] Check port number matches in `.htaccess`
- [ ] Ensure app is running in Node.js App Manager
- [ ] Contact hosting provider about WebSocket support

### 404 errors?
- [ ] Verify `.htaccess` file exists and is readable
- [ ] Check file permissions (644 for files, 755 for folders)
- [ ] Clear browser cache

### App keeps stopping?
- [ ] Set up cron job to ping app every 5 minutes
- [ ] Use PM2 process manager (if available)
- [ ] Contact hosting provider about Node.js app stability

## 📊 Performance Check

After successful deployment:

- [ ] Test from mobile device
- [ ] Test with 3+ players simultaneously
- [ ] Check response time is under 100ms
- [ ] Verify WebSocket connection is stable
- [ ] Monitor CPU/memory usage in cPanel

## 🎉 Success!

Your game is live at: `https://yourdomain.com`

Share the link with friends and start playing!

## 📝 Notes

**Write down important info:**

- cPanel URL: ___________________________
- Domain: ___________________________
- Node.js Port: ___________________________
- App Status Page: ___________________________
- Last Deployment Date: ___________________________

## 🔄 Future Updates

To update your game:

1. [ ] Stop app in Node.js App Manager
2. [ ] Upload new files (overwrite old ones)
3. [ ] Run NPM Install (if package.json changed)
4. [ ] Restart app
5. [ ] Test functionality

## 📞 Support

Need help? Check:
- `CPANEL-DEPLOYMENT.md` - Full deployment guide
- `README.md` - Game documentation  
- Your hosting provider's support
- cPanel error logs

---

**Remember:** Keep your cPanel credentials secure and backed up!
