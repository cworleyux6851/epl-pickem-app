# EPL Pick'em League - Complete Setup Guide

This is a **production-ready** app. Follow these steps and you'll be live in 30 minutes.

---

## STEP 1: Create Your Free Accounts (5 minutes)

### Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Sign up with email
3. Create a new project:
   - Name: `epl-pickem`
   - Password: anything (save it)
   - Region: us-east-1 (closest to you)
4. Wait for it to initialize (takes ~2 min)

### Football-Data.org API Key
1. Go to [football-data.org](https://www.football-data.org)
2. Click "Register" → sign up
3. Go to your account profile
4. Copy your API token (you'll see it on the profile page)

### GitHub Account (if you don't have one)
1. Go to [github.com](https://github.com/signup)
2. Create account

### Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

---

## STEP 2: Set Up Your Database (5 minutes)

1. In Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the entire contents of `supabase-setup.sql` (the SQL file provided)
4. Paste into the SQL editor
5. Click **Run**
6. Wait for it to complete (should see "Finished" at bottom)

✅ **Done!** Your database is now configured.

---

## STEP 3: Get Your API Keys from Supabase

1. Click **Settings** (bottom left) → **API**
2. You'll see two keys:
   - **`anon public`** (Copy this)eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZ2h5bXVvc2duYWRneGVhcmt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNzUyNDIsImV4cCI6MjEwMjg1MTI0Mn0.RDebfMXchq_gFBMbVgwoOUG0yFohbp7KWUzFc6D3tEw
   - **`service_role secret`** (Click eye icon, copy this)eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZ2h5bXVvc2duYWRneGVhcmt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzI3NTI0MiwiZXhwIjoyMTAyODUxMjQyfQ.ttp5EC12zQGbtdb6xGeuubLMXDoo1zcpUZTl13kn2iY
3. Also note your **Project URL** at the top    https://epl-pickem.supabase.co

Keep these handy - you'll need them in a few steps.

---

## STEP 4: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `epl-pickem-app`
3. Description: "EPL Pick'em League"
4. Choose **Public**
5. Click **Create repository**

---

## STEP 5: Upload Code to GitHub

1. On your new GitHub repo page, click **uploading an existing file** (you'll see this text)
2. Upload these files:
   - `epl-pickem-app.jsx` → rename to `src/App.jsx`
   - `api-fetch-epl-data.js` → rename to `api/fetch-epl-data.js`
   - `package.json`
   - `.env.example`

3. Create a `vercel.json` file (new file):

```json
{
  "functions": {
    "api/fetch-epl-data.js": {
      "runtime": "nodejs18.x"
    }
  },
  "env": [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "FOOTBALL_DATA_API_KEY",
    "REACT_APP_SUPABASE_URL",
    "REACT_APP_SUPABASE_ANON_KEY"
  ]
}
```

4. Create a `.env.local` file (copy from `.env.example`) and fill in your actual keys
5. Commit all files with message: "Initial commit"

---

## STEP 6: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your `epl-pickem-app` repo
4. Click **Import**
5. In the environment variables section, add:
   - `REACT_APP_SUPABASE_URL` = (your Supabase URL from Step 3)
   - `REACT_APP_SUPABASE_ANON_KEY` = (your anon key from Step 3)
   - `SUPABASE_URL` = (your Supabase URL)
   - `SUPABASE_SERVICE_ROLE_KEY` = (your service role key from Step 3)
   - `FOOTBALL_DATA_API_KEY` = (your football-data.org key from Step 1)

6. Click **Deploy**
7. Wait for deployment to complete (usually 2-3 minutes)
8. You'll see your live URL!

---

## STEP 7: Test Your App

1. Copy the Vercel URL from the deployment screen
2. Open it in your browser
3. Click **Create New League**
4. Enter:
   - Team Name: Your name
   - League Password: Something simple (like `test` or `epl2024`)
5. Click **Create League**
6. You should see the fixtures for this week!

---

## STEP 8: Share with Friends

Send your friends:
- Your Vercel URL (e.g., `https://epl-pickem-app.vercel.app`)
- The league password you created
- Instructions: "Log in with your team name and the password"

---

## WHAT HAPPENS NEXT

**Every week:**
- Your app will automatically fetch the new EPL fixtures
- Friends log in, see the games, pick 5 winners
- Picks auto-lock 1 hour before the first game
- As games finish, the app automatically calculates points:
  - Correct pick: **3 points**
  - Draw: **1 point**
  - Wrong pick: **0 points**
- Leaderboard updates in real-time

**If Something Goes Wrong:**
- Results got a score wrong? You have admin access to Supabase. Go to **SQL Editor** → run:
  ```sql
  UPDATE fixtures SET home_score = X, away_score = Y WHERE id = FIXTURE_ID;
  ```
  The standings will recalculate automatically.

---

## PROJECT STRUCTURE

```
epl-pickem-app/
├── src/
│   └── App.jsx                 (Main React app)
├── api/
│   └── fetch-epl-data.js       (Vercel function for EPL data)
├── package.json                (Dependencies)
├── vercel.json                 (Deployment config)
├── .env.local                  (Your secret keys - never commit!)
└── .env.example                (Template)
```

---

## TROUBLESHOOTING

**"Invalid league password"**
- Make sure you're using the same password you created the league with

**"Picks are locked"**
- Picks lock 1 hour before the first game of the week
- Check the time displayed on the app

**"Failed to fetch fixtures"**
- Your `FOOTBALL_DATA_API_KEY` might be wrong
- Go to football-data.org, verify your token
- Update it in Vercel settings → Environment Variables

**Leaderboard not updating**
- Wait a few seconds (it updates in real-time)
- Refresh the page
- Check that all friends have saved their picks

**Need to reset the app?**
- In Supabase, go to **SQL Editor** and run:
  ```sql
  DELETE FROM picks;
  DELETE FROM teams;
  DELETE FROM league_config;
  ```

---

## NEXT STEPS (OPTIONAL)

Want to customize further?

1. **Change the league password**: Update in Supabase → `league_config` table
2. **Add custom rules**: Edit the scoring logic in `supabase-setup.sql`
3. **Change colors/branding**: Edit the `styles` object in `App.jsx`

---

## SUPPORT

- **Supabase issues**: Check [supabase.com/docs](https://supabase.com/docs)
- **Vercel issues**: Check [vercel.com/docs](https://vercel.com/docs)
- **Football-data.org issues**: Check their API docs at [football-data.org/docs](https://www.football-data.org/documentation/quickstart)

---

**You're all set! 🎉 Your EPL Pick'em league is live.**
