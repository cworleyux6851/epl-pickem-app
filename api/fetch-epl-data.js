import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'FOOTBALL_DATA_API_KEY not set' });
    }

    // Fetch from football-data.org
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED,LIVE,FINISHED',
      { headers: { 'X-Auth-Token': API_KEY } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Football API error: ' + response.statusText });
    }

    const data = await response.json();
    const matches = data.matches || [];
    const currentMatchday = data.season?.currentMatchday || 1;

    // Save each fixture to Supabase
    for (const match of matches) {
      await supabase.from('fixtures').upsert({
        id: match.id,
        home_team_name: match.homeTeam.name,
        away_team_name: match.awayTeam.name,
        home_team_id: match.homeTeam.id,
        away_team_id: match.awayTeam.id,
        utc_date: match.utcDate,
        status: match.status,
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        matchday: match.season?.currentMatchday || match.utcDate ? 1 : 0
      }, { onConflict: 'id' });
    }

    // Return formatted fixtures for the app
    const fixtures = matches.map(m => ({
      id: m.id,
      homeTeam: { name: m.homeTeam.name },
      awayTeam: { name: m.awayTeam.name },
      utcDate: m.utcDate,
      status: m.status,
      score: { fullTime: { home: m.score.fullTime.home, away: m.score.fullTime.away } },
      season: { currentMatchday: m.season?.currentMatchday || currentMatchday }
    }));

    res.json({ 
      currentMatchday: currentMatchday,
      fixtures: fixtures,
      count: fixtures.length
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
