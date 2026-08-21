import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const convertToCST = (isoString) => {
  const date = new Date(isoString);
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
};

const isWeekend = (isoString) => {
  const cstDate = convertToCST(isoString);
  const day = cstDate.getDay();
  return day === 0 || day === 6;
};

const formatGameTime = (isoString) => {
  const cstDate = convertToCST(isoString);
  return cstDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago'
  }) + ' CST';
};

export default function App() {
  const [user, setUser] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [leaguePassword, setLeaguePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [allFixtures, setAllFixtures] = useState([]);
  const [currentPicks, setCurrentPicks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
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
    const weekFixtures = getFixturesForWeek(selectedWeek || currentWeek);
    if (weekFixtures.length === 0 || selectedWeek !== currentWeek) return;
    
    const firstGame = new Date(weekFixtures[0].utcDate);
    const lockTime = new Date(firstGame.getTime() - 60 * 60 * 1000);
    const interval = setInterval(() => {
      const now = new Date();
      const minutes = Math.floor((lockTime - now) / 1000 / 60);
      setMinutesUntilLock(minutes > 0 ? minutes : 0);
    }, 60000);
    
    const minutes = Math.floor((lockTime - new Date()) / 1000 / 60);
    setMinutesUntilLock(minutes > 0 ? minutes : 0);
    
    return () => clearInterval(interval);
  }, [allFixtures, selectedWeek, currentWeek]);

  const getFixturesForWeek = (week) => {
    if (!week) return [];
    return allFixtures.filter(f => f.season.currentMatchday === week && isWeekend(f.utcDate))
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  };

  const loadFixtures = async () => {
    try {
      const res = await fetch('/api/fetch-epl-data');
      const data = await res.json();
      if (data.fixtures) {
        setAllFixtures(data.fixtures);
        setCurrentWeek(data.currentMatchday);
        setSelectedWeek(data.currentMatchday);
        
        if (user) {
          const { data: picks } = await supabase.from('picks').select('fixture_id').eq('team_id', user.id).eq('matchday', data.currentMatchday);
          if (picks) setCurrentPicks(picks.map(p => p.fixture_id));
        }
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
    setError('');
    try {
      const { data: existing } = await supabase.from('league_config').select('*');
      if (existing && existing.length > 0) {
        setError('League already exists. Use the login to join.');
        setLoading(false);
        return;
      }
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
    setError('');
    try {
      const { data: config } = await supabase.from('league_config').select('password').single();
      if (!config) {
        setError('No league found. Create one first.');
        setLoading(false);
        return;
      }
      if ((config.password || '').trim() !== password.trim()) {
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
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const togglePick = (fixtureId) => {
    if (selectedWeek !== currentWeek) {
      setError('You can only pick for the current week');
      return;
    }
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
    setError('');
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

  const fixtures = getFixturesForWeek(selectedWeek || currentWeek);
  const isCurrentWeek = selectedWeek === currentWeek;

  if (!user) {
    return (
      <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', fontFamily: 'system-ui' }}>
        <h1>⚽ EPL Pick'em</h1>
        {!isCreating ? (
          <>
            <h2>Login</h2>
            <form onSubmit={handleLogin}>
              <input type="text" placeholder="Your team name" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <input type="password" placeholder="League password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Logging in...' : 'Login'}</button>
            </form>
            {error && <div style={{ color: '#dc3545', marginTop: '10px', padding: '10px', background: '#f8d7da', borderRadius: '4px' }}>{error}</div>}
            <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
              First time? <button onClick={() => { setIsCreating(true); setError(''); }} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}>Create league</button>
            </p>
          </>
        ) : (
          <>
            <h2>Create League</h2>
            <form onSubmit={handleCreateLeague}>
              <input type="text" placeholder="Your team name" value={teamName} onChange={e => setTeamName(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <input type="password" placeholder="League password (share with friends)" value={leaguePassword} onChange={e => setLeaguePassword(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', boxSizing: 'border-box' }} required />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{loading ? 'Creating...' : 'Create League'}</button>
            </form>
            {error && <div style={{ color: '#dc3545', marginTop: '10px', padding: '10px', background: '#f8d7da', borderRadius: '4px' }}>{error}</div>}
            <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
              <button onClick={() => { setIsCreating(false); setError(''); }} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}>Back to login</button>
            </p>
          </>
        )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <button onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))} disabled={selectedWeek <= 1} style={{ padding: '8px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Prev</button>
            <h2 style={{ margin: 0 }}>Matchday {selectedWeek} {isCurrentWeek ? '(Current)' : '(View Only)'}</h2>
            <button onClick={() => setSelectedWeek(Math.min(38, selectedWeek + 1))} disabled={selectedWeek >= 38} style={{ padding: '8px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Next →</button>
          </div>

          {isCurrentWeek && fixtures.length > 0 && (
            <p style={{ background: '#fff3cd', padding: '10px', borderRadius: '4px', margin: '0 0 15px 0' }}>Locks in: {minutesUntilLock > 0 ? minutesUntilLock + ' min' : '🔒 LOCKED'}</p>
          )}
          
          {!isCurrentWeek && <p style={{ background: '#e2e3e5', padding: '10px', borderRadius: '4px', margin: '0 0 15px 0', color: '#666' }}>You can only edit picks for the current week</p>}
          
          {error && <div style={{ color: '#dc3545', padding: '10px', background: '#f8d7da', borderRadius: '4px', marginBottom: '10px' }}>{error}</div>}
          
          <div>
            {fixtures.length === 0 ? (
              <p style={{ color: '#666' }}>No weekend matches this matchday</p>
            ) : (
              fixtures.map(f => (
                <div 
                  key={f.id} 
                  onClick={() => isCurrentWeek && togglePick(f.id)} 
                  style={{ 
                    padding: '12px', 
                    margin: '8px 0', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px', 
                    cursor: isCurrentWeek ? 'pointer' : 'default',
                    background: isCurrentWeek && currentPicks.includes(f.id) ? '#d4edda' : '#fff', 
                    borderLeft: isCurrentWeek && currentPicks.includes(f.id) ? '4px solid #28a745' : '4px solid #ddd',
                    opacity: !isCurrentWeek ? 0.7 : 1
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#666' }}>{formatGameTime(f.utcDate)}</div>
                  <div style={{ fontWeight: 'bold', marginTop: '5px' }}>{f.homeTeam.name} vs {f.awayTeam.name}</div>
                  <div style={{ fontSize: '12px', marginTop: '5px', color: '#999' }}>
                    {f.status === 'FINISHED' ? `${f.score.fullTime.home} - ${f.score.fullTime.away}` : 'Not started'}
                  </div>
                  {isCurrentWeek && currentPicks.includes(f.id) && <div style={{ fontSize: '11px', color: '#28a745', fontWeight: 'bold', marginTop: '5px' }}>✓ PICKED</div>}
                </div>
              ))
            )}
          </div>
          
          {isCurrentWeek && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              <p>Picks: {currentPicks.length}/5</p>
              {currentPicks.length === 5 && minutesUntilLock > 0 && <button onClick={savePicks} disabled={loading} style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{loading ? 'Saving...' : 'Save Picks'}</button>}
            </div>
          )}
        </div>

        <div>
          <h2>Leaderboard</h2>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Week {currentWeek} Standings</p>
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
                  <td style={{ padding: '8px', fontSize: '14px' }}>{t.team_name}</td>
                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{t.points || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
