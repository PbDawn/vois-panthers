# VOIS Panthers IPL 2026 — Public Tracker (React)

A React + Vite app that reads live match data from JSONBin.io and displays it publicly.  
Source code is compiled and minified on build — View Page Source shows nothing readable.

---

## 🚀 One-Time Setup (15 minutes)

### Step 1 — Install Node.js
Download from https://nodejs.org → LTS version → Install it.

### Step 2 — Create a GitHub Repository
1. Go to https://github.com → Sign in
2. Click **New repository**
3. Name it exactly: `vois-panthers`  ← must match vite.config.js base path
4. Set to **Private** ✅
5. Click **Create repository**

### Step 3 — Upload these files to the repo
Upload ALL files from this folder maintaining the exact folder structure:
```
vois-panthers/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
└── vite.config.js
```

### Step 4 — Enable GitHub Pages
1. In your repo → **Settings** → **Pages**
2. Under **Source** → select **GitHub Actions**
3. Click Save

### Step 5 — Trigger the first deploy
Push any change (or go to **Actions** tab → select the workflow → **Run workflow**).
Wait ~2 minutes. Your site will be live at:

```
https://YOUR-USERNAME.github.io/vois-panthers/
```

---

## 🔁 After First Deploy
Every time you push any change to `main`, GitHub automatically rebuilds and deploys.  
You never need to run `npm run build` manually — the GitHub Action does it.

---

## 🔧 If you rename the repo
Open `vite.config.js` and change:
```js
base: '/vois-panthers/',
```
to match your new repo name.

---

## 📦 Local Development (optional)
```bash
npm install
npm run dev
# Open http://localhost:5173/vois-panthers/
```
