# Kimp Fun - cPanel Deployment Files

This is the complete file list you need to upload to your cPanel hosting.

## Files to Upload

Upload these files to your cPanel file manager or via FTP:

```
kimp-fun/
├── .htaccess                 # Apache proxy configuration (REQUIRED!)
├── server.js                 # Node.js WebSocket server
├── package.json              # Node.js dependencies
├── README.md                 # Documentation
├── CPANEL-DEPLOYMENT.md      # cPanel setup guide
└── public/                   # Static assets folder
    ├── index.html            # Main HTML file
    ├── app.js                # JavaScript client
    └── styles.css            # CSS styling
```

## Quick Upload Steps

### Option 1: ZIP Upload (Easiest)

1. **On your computer:**
   ```powershell
   # In PowerShell (Windows)
   cd d:\jsgame
   Compress-Archive -Path * -DestinationPath kimp-fun.zip
   ```

2. **In cPanel:**
   - Open **File Manager**
   - Navigate to `public_html/` (or your domain root)
   - Click **Upload**
   - Upload `kimp-fun.zip`
   - Right-click the ZIP → **Extract**
   - Delete the ZIP file after extraction

### Option 2: FTP Upload

1. Use FileZilla or any FTP client
2. Connect to: `ftp.yourdomain.com`
3. Username: Your cPanel username
4. Password: Your cPanel password
5. Upload all files to `public_html/`

### Option 3: Git (If Available)

If your cPanel has Git support:

1. Push your code to GitHub first
2. In cPanel → **Git Version Control**
3. Clone your repository
4. Done!

## After Upload

1. Go to cPanel → **Setup Node.js App**
2. Create new application:
   - Application root: `public_html` (or your folder)
   - Application URL: yourdomain.com
   - Application startup file: `server.js`
   - Node.js version: 18.x or higher
3. Click **Run NPM Install**
4. Click **Start**
5. Your game is live!

## Important Notes

- **Don't forget `.htaccess`** - This file is hidden by default. Make sure to upload it!
- In cPanel File Manager, click **Settings** → Check "Show Hidden Files" to see `.htaccess`
- Edit `.htaccess` and change port `3000` to whatever port cPanel assigns your Node.js app

## Testing Checklist

After deployment, verify:

- [ ] All files uploaded successfully
- [ ] `.htaccess` file is present and configured
- [ ] Node.js app is running in cPanel
- [ ] Can access homepage at your domain
- [ ] Can create a game room
- [ ] WebSocket connection works
- [ ] Multiple players can join

## Need Help?

See **CPANEL-DEPLOYMENT.md** for detailed instructions and troubleshooting.
