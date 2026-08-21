import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [user, setUser] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [leaguePassword, setLeaguePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [fixtures, setFixtures] = useState([]);
  const [currentPicks, setCurrentPicks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [minutesUntilLock, setMinutesUntilLock] = useState(null);

  useEffect(() => {
    if (user) {
      loadFixtures();
      loadLeaderboard();
      const timer = setInterval(() => loadLeaderboard(), 30000);
      return () => clearInterval(timer);
    }
  }, [user]);

  useEffect(() => {
    if (fixtures.length === 0) return;
    const firstGame = new Date(fixtures[0].utcDate);
    const lockTime = new Date(firstGame.getTime() - 60 * 60 * 1000);
    const interval = setInterval(() => {
      const now = new Date();
      const minutes = Math.floor((lockTime - now) / 1000 / 60);
      setMinutesUntilLock(minutes > 0 ? minutes : 0);
    }, 60000);
    return () => clearInterval(interval);
  }, [fixtures]);

  const loadFixtures = async () => {
    try {
      const res = await fetch('/api/fetch-epl-data');
      const data = await res.json();
      if (data.fixtures) {
        setFixtures(data.fixtures.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)));
        setCurrentWeek(data.currentMatchday);
        const { data: picks } = await supabase.from('picks').select('fixture_id').eq('team_id', user.id).eq('matchday', data.currentMatchday);
        if (picks) setCurrentPicks(picks.map(p => p.fixture_id));
      }
    } catch (e) {
      setError('Failed to load fixtures: ' + e.message);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const { data } = await supabase.from('team_standings').select('*').order('points', { ascending: false });
      setLeaderboard(data || []);
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.from('league_config').insert({ password: leaguePassword });
      await supabase.from('teams').insert({ name: teamName });
      setUser({ name: teamName });
      setError('');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: config } = await supabase.from('league_config').select('password').single();
      if (!config || config.password !== password) {
        setError('Invalid password');
        setLoading(false);
        return;
      }
      let { data: team } = await supabase.from('teams').select('id').eq('name', teamName).single();
      if (!team) {
        const { data: newTeam } = await supabase.from('teams').insert({ name: teamName }).select().single();
        team = newTeam;
      }
      setUser({ name: teamName, id: team.id });
      setError('');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const togglePick = (fixtureId) => {
    if (minutesUntilLock <= 0) {
      setError('Picks are locked!');
      return;
    }
    setCurrentPicks(prev => 
      prev.includes(fixtureId) 
        ? prev.filter(id => id !== fixtureId)
        : prev.length < 5 ? [...prev, fixtureId] : prev
    );
  };

  const savePicks = async () => {
    if (currentPicks.length !== 5) {
      setError('Pick exactly 5 games');
      return;
    }
    setLoading(true);
    try {
      await supabase.from('picks').delete().eq('team_id', user.id).eq('matchday', currentWeek);
      await supabase.from('picks').insert(
        currentPicks.map(fid => ({ team_id: user.id, fixture_id: fid, matchday: currentWeek }))
      );
      setError('Picks saved!');
      setTimeout(() => setError(''), 2000);
      await loadLeaderboard();
    } catch (e) {
      setError('Save failed: ' + e.message);
    }
    setLoading(false);
  };

  if (!user) {
    return (
      <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', fontFamily: 'system-ui' }}>
        <h1>⚽ EPL Pick'em</h1>
        {!isCreating ? (
          <>
            <h2>Login</h2>
            <form onSubmit={handleLogin}>
              <input type="text" placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Logging in...' : 'Login'}</button>
            </form>
            <button onClick={() => setIsCreating(true)} style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create League</button>
          </>
        ) : (
          <>
            <h2>Create League</h2>
            <form onSubmit={handleCreateLeague}>
              <input type="text" placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <input type="password" placeholder="League password" value={leaguePassword} onChange={e => setLeaguePassword(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Creating...' : 'Create'}</button>
            </form>
            <button onClick={() => setIsCreating(false)} style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Back</button>
          </>
        )}
        {error && <div style={{ color: '#dc3545', marginTop: '10px', padding: '10px', background: '#f8d7da', borderRadius: '4px' }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>⚽ EPL Pick'em</h1>
        <div>
          <span style={{ marginRight: '15px' }}>{user.name}</span>
          <button onClick={() => setUser(null)} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div>
          <h2>Matchday {currentWeek}</h2>
          {fixtures.length > 0 && <p style={{ background: '#fff3cd', padding: '10px', borderRadius: '4px' }}>Locks in: {minutesUntilLock > 0 ? minutesUntilLock + ' min' : '🔒 LOCKED'}</p>}
          {error && <div style={{ color: '#dc3545', padding: '10px', background: '#f8d7da', borderRadius: '4px', marginBottom: '10px' }}>{error}</div>}
          <div>
            {fixtures.map(f => (
              <div key={f.id} onClick={() => togglePick(f.id)} style={{ padding: '12px', margin: '8px 0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: currentPicks.includes(f.id) ? '#d4edda' : '#fff', borderLeft: currentPicks.includes(f.id) ? '4px solid #28a745' : '4px solid #ddd' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>{new Date(f.utcDate).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</div>
                <div style={{ fontWeight: 'bold', marginTop: '5px' }}>{f.homeTeam.name} vs {f.awayTeam.name}</div>
                <div style={{ fontSize: '12px', marginTop: '5px', color: '#999' }}>
                  {f.status === 'FINISHED' ? `${f.score.fullTime.home} - ${f.score.fullTime.away}` : 'Not started'}
                </div>
                {currentPicks.includes(f.id) && <div style={{ fontSize: '11px', color: '#28a745', fontWeight: 'bold', marginTop: '5px' }}>✓ PICKED</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
            <p>Picks: {currentPicks.length}/5</p>
            {currentPicks.length === 5 && minutesUntilLock > 0 && <button onClick={savePicks} disabled={loading} style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{loading ? 'Saving...' : 'Save Picks'}</button>}
          </div>
        </div>

        <div>
          <h2>Leaderboard</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Team</th>
                <th style={{ padding: '8px' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((t, i) => (
                <tr key={t.team_id} style={{ borderBottom: '1px solid #dee2e6', background: t.team_id === user.id ? '#e7f3ff' : '#fff' }}>
                  <td style={{ padding: '8px' }}>{t.team_name}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{t.points || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
