export default async function handler(req, res) {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  
  if (!API_KEY) {
    return res.status(500).json({ error: 'API_KEY not configured' });
  }

  try {
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED,LIVE,FINISHED',
      { headers: { 'X-Auth-Token': API_KEY } }
    );
    
    if (!response.ok) throw new Error('API error: ' + response.statusText);
    
    const { matches } = await response.json();
    
    const fixtures = (matches || []).map(m => ({
      id: m.id,
      homeTeam: { name: m.homeTeam.name },
      awayTeam: { name: m.awayTeam.name },
      utcDate: m.utcDate,
      status: m.status,
      score: { fullTime: { home: m.score.fullTime.home, away: m.score.fullTime.away } }
    }));

    res.json({ currentMatchday: 1, fixtures });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
