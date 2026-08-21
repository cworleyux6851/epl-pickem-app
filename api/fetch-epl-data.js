export default async function handler(req, res) {
  try {
    const key = process.env.FOOTBALL_DATA_API_KEY;
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED,LIVE,FINISHED',
      { headers: { 'X-Auth-Token': key } }
    );
    const data = await response.json();
    const matches = data.matches || [];
    const fixtures = matches.map(m => ({
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
