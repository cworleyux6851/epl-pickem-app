# ⚽ EPL Pick'em League

A fantasy football league where you and your friends pick 5 EPL winners each week and earn points.

**Live in 30 minutes. Zero setup headaches.**

## Features

✅ Simple login (no passwords stored, just league password)  
✅ Auto-fetches EPL fixtures weekly  
✅ Automatic 1-hour lockout before first game  
✅ Real-time leaderboard  
✅ Auto-calculates points (3 for win, 1 for draw, 0 for loss)  
✅ Central Time display for all games  
✅ Admin override capability for results  

## Quick Start

1. **Create accounts**: Supabase, football-data.org
2. **Set up database**: Run SQL script in Supabase
3. **Push code**: Upload files to GitHub
4. **Deploy**: Connect Vercel to your GitHub repo
5. **Share link**: Send friends your Vercel URL + league password

**[See SETUP_GUIDE.md for detailed instructions](./SETUP_GUIDE.md)**

## Tech Stack

- **Frontend**: React 18
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Hosting**: Vercel
- **Data**: football-data.org API

## Environment Variables

```
REACT_APP_SUPABASE_URL=your_url
REACT_APP_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key
FOOTBALL_DATA_API_KEY=your_key
```

## Project Structure

```
.
├── src/App.jsx                 - Main React component
├── api/fetch-epl-data.js      - Vercel function for EPL sync
├── supabase-setup.sql         - Database schema
├── package.json               - Dependencies
├── vite.config.js            - Build config
└── SETUP_GUIDE.md            - Detailed setup steps
```

## Deployment

Push to GitHub → Vercel auto-deploys → Done

## Support

- Database issues? Check Supabase docs
- Deployment issues? Check Vercel docs
- API issues? Check football-data.org docs

---

**Made for pick'em leagues. Zero nonsense. Maximum football.**
