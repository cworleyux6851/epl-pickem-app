# EPL Pick'em App - Deployment Checklist

Copy this to a notes app and check off each step as you complete it.

## Phase 1: Create Accounts (5 min)

- [ ] Supabase account created
  - Project name: `epl-pickem`
  - Region: `us-east-1`
  - Project URL: `_______________`
  
- [ ] football-data.org account created
  - API Key: `_______________`

- [ ] GitHub account created (if needed)
  - Username: `_______________`

- [ ] Vercel account created (linked to GitHub)

## Phase 2: Database Setup (5 min)

- [ ] Logged into Supabase dashboard
- [ ] Went to SQL Editor
- [ ] Copied entire `supabase-setup.sql` file
- [ ] Pasted into SQL editor
- [ ] Clicked "Run"
- [ ] Saw "Finished" message ✓

## Phase 3: Get API Keys (2 min)

- [ ] Supabase Project URL copied
  - `_______________`

- [ ] Supabase Anon Key (public) copied
  - `_______________`

- [ ] Supabase Service Role Key (secret) copied
  - `_______________`

- [ ] football-data.org API Key copied
  - `_______________`

## Phase 4: GitHub Repository (5 min)

- [ ] Created new repository: `epl-pickem-app`
- [ ] Repository is Public
- [ ] Uploaded these files:
  - [ ] `epl-pickem-app.jsx` → `src/App.jsx`
  - [ ] `api-fetch-epl-data.js` → `api/fetch-epl-data.js`
  - [ ] `package.json`
  - [ ] `vite.config.js`
  - [ ] `index.html`
  - [ ] `src/main.jsx` (from src-main.jsx)
  - [ ] `.env.example`
  - [ ] `.gitignore`
  - [ ] `vercel.json`
  - [ ] `README.md`

- [ ] Created `.env.local` file with actual keys (DO NOT COMMIT)

- [ ] Initial commit made with message: "Initial commit"

## Phase 5: Deploy to Vercel (10 min)

- [ ] Went to vercel.com/new
- [ ] Clicked "Import Git Repository"
- [ ] Selected `epl-pickem-app` repository
- [ ] Clicked "Import"
- [ ] Added environment variables:
  - [ ] `REACT_APP_SUPABASE_URL` = `_______________`
  - [ ] `REACT_APP_SUPABASE_ANON_KEY` = `_______________`
  - [ ] `SUPABASE_URL` = `_______________`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` = `_______________`
  - [ ] `FOOTBALL_DATA_API_KEY` = `_______________`

- [ ] Clicked "Deploy"
- [ ] Deployment completed successfully
- [ ] Live URL: `_______________`

## Phase 6: Test Your App (5 min)

- [ ] Opened live Vercel URL in browser
- [ ] Clicked "Create New League"
- [ ] Created league with:
  - Team Name: `_______________`
  - Password: `_______________`

- [ ] Successfully logged in
- [ ] Saw this week's EPL fixtures
- [ ] Fixtures show Central Time
- [ ] Can select games and save picks

## Phase 7: Share with Friends

- [ ] Share with friends:
  - Vercel URL: `_______________`
  - League Password: `_______________`

- [ ] Friends can log in with their team names
- [ ] Friends can pick 5 games
- [ ] Leaderboard shows standings

## Phase 8: Monitor (Ongoing)

- [ ] Check leaderboard each week
- [ ] Fixtures auto-update (no manual action needed)
- [ ] Picks auto-lock 1 hour before first game
- [ ] Points auto-calculate when games finish

---

## HELP: If Something's Stuck

**Can't see fixtures?**
- Check `FOOTBALL_DATA_API_KEY` in Vercel environment variables
- Verify API key at football-data.org

**Login not working?**
- Make sure your Supabase keys are in Vercel env vars
- Check that `SUPABASE_URL` is exactly right (with .supabase.co)

**Leaderboard not updating?**
- Refresh the page
- Wait 5 seconds (it uses real-time, might be slight delay)
- Make sure picks are saved (green highlight)

**Need to reset everything?**
- Go to Supabase SQL Editor
- Run: `DELETE FROM picks; DELETE FROM teams; DELETE FROM league_config;`
- Refresh the app

---

## 🎉 You're Done!

Your EPL Pick'em league is live!

Now just send friends the link and password and they can join.

Everything else is automatic. 🚀
