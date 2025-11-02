# Quick Git Commands for Kimp Fun

## First Time Setup (Already Done! ✅)
```powershell
# Your repo is initialized and committed!
# Now just need to push to GitHub
```

---

## Push to GitHub (Do This Now!)

### Step 1: Create repository on GitHub
- Go to github.com
- Click "+" → "New repository"
- Name: `kimp-fun`
- Click "Create repository"

### Step 2: Copy these commands and run them

Replace `YOUR_USERNAME` with your GitHub username!

```powershell
# Add Git to PATH for this session
$env:Path += ";C:\Program Files\Git\bin"

# Add your GitHub repository
git remote add origin https://github.com/YOUR_USERNAME/kimp-fun.git

# Rename branch to main
git branch -M main

# Push to GitHub
git push -u origin main
```

**When prompted for password:** Use a Personal Access Token (see GITHUB-SETUP.md)

---

## Done! 🎉

Your code is now on GitHub at:
```
https://github.com/YOUR_USERNAME/kimp-fun
```

---

## Future Updates (Copy/Paste These)

When you make changes:

```powershell
# Always run this first
$env:Path += ";C:\Program Files\Git\bin"

# See what changed
git status

# Add all changes
git add .

# Commit with a message
git commit -m "Description of what you changed"

# Push to GitHub
git push
```

---

## Quick Deploy to Render.com

After pushing to GitHub:

1. Go to render.com
2. Sign in with GitHub
3. New → Web Service
4. Select your kimp-fun repository
5. Click "Create Web Service"
6. Done! Game is live 🚀

---

## Need the full guide?
See `GITHUB-SETUP.md` for detailed instructions and troubleshooting.
