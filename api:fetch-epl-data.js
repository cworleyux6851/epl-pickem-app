import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const EPL_COMPETITION_CODE = 'PL'; // Premier League

export default async function handler(req, res) {
  // Disable caching to always get fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    // Fetch current EPL data
    const competitionResponse = await fetch(
      `https://api.football-data.org/v4/competitions/${EPL_COMPETITION_CODE}`,
      {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
      }
    );

    if (!competitionResponse.ok) {
      throw new Error(`Football-data.org API error: ${competitionResponse.statusText}`);
    }

    const competitionData = await competitionResponse.json();
    const currentMatchday = competitionData.season.currentMatchday;

    // Fetch all fixtures for the current matchday
    const fixturesResponse = await fetch(
      `https://api.football-data.org/v4/competitions/${EPL_COMPETITION_CODE}/matches?status=SCHEDULED,LIVE,FINISHED&matchday=${currentMatchday}`,
      {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
      }
    );

    if (!fixturesResponse.ok) {
      throw new Error(`Fixtures fetch error: ${fixturesResponse.statusText}`);
    }

    const fixturesData = await fixturesResponse.json();
    let fixtures = fixturesData.matches || [];

    // Sync fixtures to Supabase
    for (const fixture of fixtures) {
      const { error } = await supabase
        .from('fixtures')
        .upsert(
          {
            id: fixture.id,
            home_team_id: fixture.homeTeam.id,
            home_team_name: fixture.homeTeam.name,
            away_team_id: fixture.awayTeam.id,
            away_team_name: fixture.awayTeam.name,
            utc_date: fixture.utcDate,
            status: fixture.status,
            home_score: fixture.score.fullTime.home,
            away_score: fixture.score.fullTime.away,
            matchday: fixture.season.currentMatchday,
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error('Supabase sync error:', error);
      }
    }

    // Return fixtures in frontend-friendly format
    const formattedFixtures = fixtures.map(f => ({
      id: f.id,
      homeTeam: { name: f.homeTeam.name, id: f.homeTeam.id },
      awayTeam: { name: f.awayTeam.name, id: f.awayTeam.id },
      utcDate: f.utcDate,
      status: f.status,
      score: {
        fullTime: {
          home: f.score.fullTime.home,
          away: f.score.fullTime.away,
        },
      },
    }));

    res.status(200).json({
      currentMatchday,
      fixtures: formattedFixtures,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Failed to fetch EPL data',
      details: error.message,
    });
  }
}
