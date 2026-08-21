# EPL Pick'em App - Quick Reference Guide

Print this or keep it open. Everything you need in one place.

---

## 🚀 THE 30-MINUTE QUICKSTART

### 1️⃣ CREATE THREE ACCOUNTS (5 min)

| Account | Sign Up | What to Save |
|---------|---------|--------------|
| **Supabase** | supabase.com | Project URL + Anon Key + Service Role Key |
| **Football-Data** | football-data.org | API Key |
| **Vercel** | vercel.com (via GitHub) | (Nothing - syncs with GitHub) |

### 2️⃣ SET UP DATABASE (5 min)

1. In Supabase → SQL Editor → New Query
2. Copy-paste entire `supabase-setup.sql`
3. Click Run
4. Done!

### 3️⃣ UPLOAD CODE TO GITHUB (5 min)

New repo: `epl-pickem-app`

Upload these files:
```
epl-pickem-app.jsx        → src/App.jsx
api-fetch-epl-data.js     → api/fetch-epl-data.js
src-main.jsx              → src/main.jsx
index.html                → index.html
package.json              → package.json
vite.config.js            → vite.config.js
vercel.json               → vercel.json
.env.example              → .env.example
.gitignore                → .gitignore
```

Don't upload: `.env.local` (your secrets stay secret!)

### 4️⃣ DEPLOY TO VERCEL (10 min)

1. vercel.com/new
2. Import your GitHub repo
3. Add 5 environment variables:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FOOTBALL_DATA_API_KEY`
4. Click Deploy
5. Copy your live URL

### 5️⃣ TEST & SHARE (5 min)

- Open your Vercel URL
- Click "Create League"
- Log in and pick some games
- Share URL + password with friends

---

## 📋 ENVIRONMENT VARIABLES REFERENCE

Copy your actual values here:

```
REACT_APP_SUPABASE_URL=_________________________
REACT_APP_SUPABASE_ANON_KEY=_____________________
SUPABASE_URL=_________________________________
SUPABASE_SERVICE_ROLE_KEY=_____________________
FOOTBALL_DATA_API_KEY=_________________________
```

(Then paste into Vercel settings)

---

## 🔑 HOW TO GET EACH KEY

### Supabase Keys
1. Supabase dashboard
2. Click Settings (bottom left)
3. Click API
4. You'll see:
   - Project URL (top)
   - `anon` (public key) - copy this
   - `service_role` (secret) - click eye, copy this

### Football-Data API Key
1. football-data.org
2. Login
3. Go to your profile
4. Your token is right there

---

## 🎯 WHAT EACH FILE DOES

| File | Purpose |
|------|---------|
| `App.jsx` | Main React component (UI, login, picks) |
| `api/fetch-epl-data.js` | Fetches EPL fixtures weekly |
| `supabase-setup.sql` | Database schema & auto-calculations |
| `package.json` | Dependencies |
| `vercel.json` | Deployment config |
| `.env.example` | Template for env vars |

---

## 💻 HOW THE APP WORKS

### User Flow
```
Friend logs in with team name + league password
         ↓
Sees this week's EPL fixtures (in Central Time)
         ↓
Picks 5 games to win
         ↓
Saves picks (can't change after lockout)
         ↓
Games play (app auto-updates scores)
         ↓
Points auto-calculate:
  - Win: 3 pts
  - Draw: 1 pt
  - Loss: 0 pts
         ↓
Leaderboard updates in real-time
```

### Behind the Scenes
```
football-data.org API
         ↓
Vercel function syncs data weekly
         ↓
Supabase database stores fixtures
         ↓
App fetches and displays
         ↓
Supabase auto-calculates standings
         ↓
Real-time update to all browsers
```

---

## 🔒 SECURITY NOTES

✅ **Good:**
- League password is simple (no email/password auth needed)
- No personal data stored
- API keys only stored in Vercel (not in code)
- Friends can only see their team and leaderboard

⚠️ **Important:**
- Never commit `.env.local` to GitHub
- Service Role Key is secret - keep it safe
- Supabase has row-level security (optional upgrade)

---

## 🐛 TROUBLESHOOTING

### "Invalid league password"
→ Check you're using the password from when you created the league

### "Failed to fetch fixtures"
→ Check `FOOTBALL_DATA_API_KEY` in Vercel environment variables

### "Picks are locked"
→ Picks lock 1 hour before first game (check the timer on the app)

### Leaderboard not updating
→ Wait 5 seconds, refresh page, check picks are saved

### Need to reset?
Supabase → SQL Editor → Run:
```sql
DELETE FROM picks;
DELETE FROM teams;
DELETE FROM league_config;
```

---

## 📅 WEEKLY MAINTENANCE (Zero!)

The app is fully automatic:
- ✅ Fixtures fetch weekly
- ✅ Game times display in Central Time
- ✅ Lockout auto-triggers 1 hour before first game
- ✅ Results sync automatically
- ✅ Points calculate automatically
- ✅ Leaderboard updates in real-time

**You have nothing to do.**

---

## 🎮 LEAGUE SETTINGS

### Change league password?
Supabase → `league_config` table → edit `password` column

### Change scoring rules?
Edit the points logic in `supabase-setup.sql` in this section:
```sql
CASE 
  WHEN ... home team wins ... THEN 3
  WHEN ... away team wins ... THEN 3
  WHEN ... draw ... THEN 1
END
```

### Change colors/branding?
Edit the `styles` object at the bottom of `App.jsx`

---

## 📞 QUICK HELP

| Problem | Solution |
|---------|----------|
| Can't see fixtures | Check FOOTBALL_DATA_API_KEY in Vercel env |
| Login fails | Check SUPABASE keys in Vercel env |
| Picks won't save | Check SUPABASE_URL is exactly right |
| Leaderboard blank | Wait 5 sec, refresh, check picks saved |
| Need to fix a result | Go to Supabase → `fixtures` table → edit score |

---

## 🎉 YOU'RE LIVE!

Once deployed:
1. Send friends the Vercel URL
2. Give them the league password
3. They log in and start picking
4. Everything else is automatic

---

## 📚 FULL DOCS

- **Setup details**: SETUP_GUIDE.md
- **File organization**: FILE_STRUCTURE.md
- **Step-by-step tracking**: DEPLOYMENT_CHECKLIST.md
- **Project overview**: README.md

---

**That's it. You've got a complete, production-grade EPL pick'em app.** 🚀
