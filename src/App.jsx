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

const formatLockDateTime = (isoString) => {
  const cstDate = convertToCST(isoString);
  const lockTime = new Date(cstDate.getTime() - 60 * 60 * 1000); // 1 hour before
  return lockTime.toLocaleString('en-US', {
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
  const [currentPicks, setCurrentPicks] = useState({});
  const [prevWeekPicks, setPrevWeekPicks] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [lockDateTime, setLockDateTime] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [fixturesLoading, setFixturesLoading] = useState(true);

  // Auto-save picks
  useEffect(() => {
    if (!user || Object.keys(currentPicks).length === 0 || selectedWeek !== currentWeek) return;

    const savePicks = async () => {
      try {
        const picks = Object.entries(currentPicks)
          .filter(([fixtureId, team]) => team)
          .map(([fixtureId, team]) => ({
            team_id: user.id,
            fixture_id: parseInt(fixtureId),
            matchday: currentWeek,
            picked_team: team
          }));

        await supabase.from('picks').delete().eq('team_id', user.id).eq('matchday', currentWeek);
        if (picks.length > 0) {
          await supabase.from('picks').insert(picks);
        }
        
        setSaveStatus('✓ Saved');
        setTimeout(() => setSaveStatus(''), 3000);
        await loadLeaderboard();
      } catch (e) {
        console.error('Save error:', e);
      }
    };

    const timer = setTimeout(savePicks, 500);
    return () => clearTimeout(timer);
  }, [currentPicks, user, currentWeek, selectedWeek]);

  // Load fixtures with caching (24 hour cache)
  useEffect(() => {
    loadFixturesWithCache();
  }, []);

  useEffect(() => {
    if (user) {
      loadLeaderboard();
      const timer = setInterval(() => loadLeaderboard(), 30000);
      return () => clearInterval(timer);
    }
  }, [user]);

  useEffect(() => {
    const weekFixtures = getFixturesForWeek(selectedWeek || currentWeek);
    if (weekFixtures.length === 0 || selectedWeek !== currentWeek) return;
    
    const firstGame = weekFixtures.find(f => f.status !== 'FINISHED');
    if (!firstGame) {
      setLockDateTime('All games finished');
      return;
    }

    setLockDateTime(formatLockDateTime(firstGame.utc_date));
  }, [allFixtures, selectedWeek, currentWeek]);

  // Load previous week's picks for duplicate checking
  useEffect(() => {
    if (!user || !currentWeek) return;

    const loadPrevWeekPicks = async () => {
      try {
        const { data: picks } = await supabase
          .from('picks')
          .select('picked_team')
          .eq('team_id', user.id)
          .eq('matchday', currentWeek - 1);
        
        if (picks) {
          const prevPicks = {};
          picks.forEach(p => {
            prevPicks[p.picked_team] = true;
          });
          setPrevWeekPicks(prevPicks);
        }
      } catch (e) {
        console.error('Error loading prev week picks:', e);
      }
    };

    loadPrevWeekPicks();
  }, [user, currentWeek]);

  const loadFixturesWithCache = async () => {
    try {
      setFixturesLoading(true);
      
      // Check if we have cached fixtures and they're less than 24 hours old
      const cachedData = localStorage.getItem('epl_fixtures_cache');
      const cacheTimestamp = localStorage.getItem('epl_fixtures_cache_time');
      const now = Date.now();
      const cacheAge = cacheTimestamp ? now - parseInt(cacheTimestamp) : null;
      const ONE_DAY = 24 * 60 * 60 * 1000; // 24 hours in ms
      
      if (cachedData && cacheAge && cacheAge < ONE_DAY) {
        // Use cached data
        const data = JSON.parse(cachedData);
        setAllFixtures(data.fixtures);
        setCurrentWeek(data.currentMatchday);
        setSelectedWeek(data.currentMatchday);
        
        if (user) {
          const { data: picks } = await supabase.from('picks').select('*').eq('team_id', user.id).eq('matchday', data.currentMatchday);
          if (picks) {
            const picksMap = {};
            picks.forEach(p => {
              picksMap[p.fixture_id] = p.picked_team;
            });
            setCurrentPicks(picksMap);
          }
        }
        setFixturesLoading(false);
        return;
      }
      
      // Fetch fresh data from API
      const res = await fetch('/api/fetch-epl-data');
      const data = await res.json();
      
      if (data.fixtures && data.fixtures.length > 0) {
        // Cache the data
        localStorage.setItem('epl_fixtures_cache', JSON.stringify(data));
        localStorage.setItem('epl_fixtures_cache_time', now.toString());
        
        setAllFixtures(data.fixtures);
        setCurrentWeek(data.currentMatchday);
        setSelectedWeek(data.currentMatchday);
        
        if (user) {
          const { data: picks } = await supabase.from('picks').select('*').eq('team_id', user.id).eq('matchday', data.currentMatchday);
          if (picks) {
            const picksMap = {};
            picks.forEach(p => {
              picksMap[p.fixture_id] = p.picked_team;
            });
            setCurrentPicks(picksMap);
          }
        }
      }
      setFixturesLoading(false);
    } catch (e) {
      console.error('Failed to load fixtures:', e);
      setFixturesLoading(false);
    }
  };

  const getFixturesForWeek = (week) => {
    if (!week) return [];
    return allFixtures
      .filter(f => f.matchday === week && isWeekend(f.utc_date))
      .sort((a, b) => new Date(a.utc_date) - new Date(b.utc_date));
  };

  const loadLeaderboard = async () => {
    try {
      // Get standings with points
      const { data: standings } = await supabase
        .from('team_standings')
        .select('*')
        .order('points', { ascending: false });
      
      // Get games picked count for each team
      if (standings) {
        const enriched = await Promise.all(standings.map(async (team) => {
          const { count } = await supabase
            .from('picks')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', team.team_id);
          return { ...team, games_picked: count || 0 };
        }));
        
        setLeaderboard(enriched);
      }
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data: existing, error: checkError } = await supabase.from('league_config').select('*');
      if (checkError) {
        setError('Database connection error: ' + checkError.message);
        setLoading(false);
        return;
      }
      if (existing && existing.length > 0) {
        setError('League already exists! Use login below with the existing password.');
        setLoading(false);
        return;
      }
      const { data: newLeague, error: createError } = await supabase.from('league_config').insert({ password: leaguePassword }).select();
      if (createError) {
        setError('Failed to create league: ' + createError.message);
        setLoading(false);
        return;
      }
      const { data: newTeam, error: teamError } = await supabase.from('teams').insert({ name: teamName }).select().single();
      if (teamError) {
        setError('Failed to create team: ' + teamError.message);
        setLoading(false);
        return;
      }
      setUser({ name: teamName, id: newTeam.id });
      setError('');
      loadFixturesWithCache();
    } catch (err) {
      setError('Unexpected error: ' + err.message);
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
      loadFixturesWithCache();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const togglePick = (fixtureId, team) => {
    if (selectedWeek !== currentWeek) {
      setError('You can only pick for the current week');
      return;
    }
    
    // Check if team was picked last week
    if (prevWeekPicks[team]) {
      setError(`Can't pick ${team} - already picked them last week!`);
      setTimeout(() => setError(''), 4000);
      return;
    }
    
    setCurrentPicks(prev => {
      const newPicks = { ...prev };
      const currentPick = newPicks[fixtureId];
      
      if (currentPick === team) {
        delete newPicks[fixtureId];
      } else {
        const pickCount = Object.values(newPicks).filter(p => p).length;
        if (pickCount >= 5 && !currentPick) {
          setError('Max 5 picks per week');
          setTimeout(() => setError(''), 3000);
          return prev;
        }
        newPicks[fixtureId] = team;
      }
      
      return newPicks;
    });
  };

  const fixtures = getFixturesForWeek(selectedWeek || currentWeek);
  const isCurrentWeek = selectedWeek === currentWeek;
  const pickCount = Object.values(currentPicks).filter(p => p).length;

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system' }}>
        <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '40px', maxWidth: '420px', width: '100%' }}>
          <h1 style={{ textAlign: 'center', color: '#1e3c72', marginBottom: '30px', fontSize: '32px' }}>⚽ EPL Pick'em</h1>
          
          {!isCreating ? (
            <>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input 
                  type="text" 
                  placeholder="Your team name" 
                  value={teamName} 
                  onChange={e => setTeamName(e.target.value)} 
                  style={{ padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '16px', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderColor = '#2a5298'}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  required 
                />
                <input 
                  type="password" 
                  placeholder="League password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  style={{ padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '16px', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderColor = '#2a5298'}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  required 
                />
                <button 
                  type="submit" 
                  disabled={loading}
                  style={{ padding: '12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => !loading && (e.target.style.background = '#1e3c72')}
                  onMouseLeave={e => e.target.style.background = '#2a5298'}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
              {error && <div style={{ marginTop: '15px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c00', fontSize: '14px' }}>{error}</div>}
              <p style={{ marginTop: '25px', textAlign: 'center', fontSize: '14px', color: '#666' }}>
                First time? <button onClick={() => { setIsCreating(true); setError(''); }} style={{ background: 'none', border: 'none', color: '#2a5298', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px', fontWeight: 'bold' }}>Create league</button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleCreateLeague} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input 
                  type="text" 
                  placeholder="Your team name" 
                  value={teamName} 
                  onChange={e => setTeamName(e.target.value)}
                  style={{ padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '16px' }}
                  required 
                />
                <input 
                  type="password" 
                  placeholder="League password (share with friends)" 
                  value={leaguePassword} 
                  onChange={e => setLeaguePassword(e.target.value)}
                  style={{ padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '16px' }}
                  required 
                />
                <button 
                  type="submit" 
                  disabled={loading}
                  style={{ padding: '12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {loading ? 'Creating...' : 'Create League'}
                </button>
              </form>
              {error && <div style={{ marginTop: '15px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c00', fontSize: '14px' }}>{error}</div>}
              <p style={{ marginTop: '25px', textAlign: 'center', fontSize: '14px' }}>
                <button onClick={() => { setIsCreating(false); setError(''); }} style={{ background: 'none', border: 'none', color: '#2a5298', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}>Back to login</button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', fontFamily: 'system-ui, -apple-system' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white', padding: '16px 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 28px)' }}>⚽ EPL Pick'em</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'clamp(14px, 4vw, 16px)' }}>
            <span>{user.name}</span>
            <button 
              onClick={() => setUser(null)}
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '6px', cursor: 'pointer', fontSize: 'clamp(12px, 3vw, 14px)', fontWeight: 'bold' }}
              onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {/* Main Content */}
        <div style={{ gridColumn: 'span 2' }}>
          {/* Week Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))} 
              disabled={selectedWeek <= 1}
              style={{ padding: '8px 12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'opacity 0.2s', opacity: selectedWeek <= 1 ? 0.5 : 1, fontSize: 'clamp(12px, 3vw, 14px)' }}
            >
              ← Prev
            </button>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 24px)', color: '#1e3c72' }}>
              Matchday {selectedWeek} {isCurrentWeek ? <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#666' }}>(Current)</span> : <span style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#999' }}>(View)</span>}
            </h2>
            <button 
              onClick={() => setSelectedWeek(Math.min(38, selectedWeek + 1))} 
              disabled={selectedWeek >= 38}
              style={{ padding: '8px 12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: selectedWeek >= 38 ? 0.5 : 1, fontSize: 'clamp(12px, 3vw, 14px)' }}
            >
              Next →
            </button>
          </div>

          {/* Status Bar */}
          {isCurrentWeek && lockDateTime && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#e7f3ff', borderLeft: '4px solid #2a5298', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: 'clamp(12px, 3vw, 14px)' }}>
              <div>
                <strong>🔒 Picks lock: {lockDateTime}</strong>
              </div>
              {saveStatus && <div style={{ color: '#28a745', fontWeight: 'bold' }}>{saveStatus}</div>}
            </div>
          )}

          {!isCurrentWeek && <div style={{ marginBottom: '16px', padding: '12px', background: '#e9ecef', borderRadius: '8px', color: '#666', fontSize: 'clamp(12px, 3vw, 14px)' }}>View only - edit picks in current week</div>}

          {/* Pick Counter */}
          {isCurrentWeek && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 'clamp(14px, 4vw, 18px)', fontWeight: 'bold', color: pickCount === 5 ? '#28a745' : '#1e3c72', marginBottom: '8px' }}>
                Picks: <span style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}>{pickCount}</span>/5
              </div>
              <div style={{ height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: pickCount === 5 ? '#28a745' : '#2a5298', width: `${(pickCount / 5) * 100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {error && <div style={{ marginBottom: '16px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c00', fontSize: 'clamp(12px, 3vw, 14px)' }}>{error}</div>}

          {/* Fixtures */}
          {fixturesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading matches...</div>
          ) : fixtures.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No weekend matches</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {fixtures.map(f => {
                const isFinished = f.status === 'FINISHED';
                const bgColor = isFinished ? '#f5f5f5' : '#ffffff';
                const borderColor = isFinished ? '#d0d0d0' : '#e0e0e0';
                
                return (
                  <div 
                    key={f.id}
                    style={{ 
                      background: bgColor,
                      borderRadius: '12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      border: `1px solid ${borderColor}`,
                      opacity: isFinished ? 0.85 : 1
                    }}
                    onMouseEnter={e => {
                      if (!isFinished) {
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ padding: '12px', borderBottom: `1px solid ${borderColor}` }}>
                      <div style={{ fontSize: 'clamp(11px, 2vw, 12px)', color: '#999', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span>📅 {formatGameTime(f.utc_date)}</span>
                        <span style={{ background: isFinished ? '#999' : '#2a5298', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: 'clamp(10px, 2vw, 11px)' }}>
                          {isFinished ? '✓ FINISHED' : '⚪ UPCOMING'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center' }}>
                        {/* Home Team */}
                        <div 
                          onClick={() => isCurrentWeek && togglePick(f.id, f.home_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.home_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.home_team_name ? '2px solid #28a745' : `2px solid ${isFinished ? '#ddd' : '#ddd'}`,
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            opacity: !isCurrentWeek || isFinished ? 0.6 : 1,
                            textAlign: 'center'
                          }}
                          onMouseEnter={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = currentPicks[f.id] === f.home_team_name ? '#d4edda' : '#e9ecef';
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = currentPicks[f.id] === f.home_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa';
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: '#1e3c72', marginBottom: '4px', fontSize: 'clamp(12px, 3vw, 14px)' }}>{f.home_team_name}</div>
                          {isFinished && <div style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#666', fontWeight: 'bold' }}>{f.home_score}</div>}
                          {currentPicks[f.id] === f.home_team_name && <div style={{ fontSize: 'clamp(11px, 2vw, 12px)', color: '#28a745', fontWeight: 'bold', marginTop: '4px' }}>✓ PICKED</div>}
                        </div>

                        {/* VS */}
                        <div style={{ fontSize: 'clamp(11px, 2vw, 12px)', color: '#999', fontWeight: 'bold' }}>VS</div>

                        {/* Away Team */}
                        <div 
                          onClick={() => isCurrentWeek && togglePick(f.id, f.away_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.away_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.away_team_name ? '2px solid #28a745' : `2px solid ${isFinished ? '#ddd' : '#ddd'}`,
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            transition: 'all 0.2s',
                            opacity: !isCurrentWeek || isFinished ? 0.6 : 1,
                            textAlign: 'center'
                          }}
                          onMouseEnter={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = currentPicks[f.id] === f.away_team_name ? '#d4edda' : '#e9ecef';
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = currentPicks[f.id] === f.away_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa';
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: '#1e3c72', marginBottom: '4px', fontSize: 'clamp(12px, 3vw, 14px)' }}>{f.away_team_name}</div>
                          {isFinished && <div style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#666', fontWeight: 'bold' }}>{f.away_score}</div>}
                          {currentPicks[f.id] === f.away_team_name && <div style={{ fontSize: 'clamp(11px, 2vw, 12px)', color: '#28a745', fontWeight: 'bold', marginTop: '4px' }}>✓ PICKED</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', position: 'sticky', top: '16px' }}>
            <div style={{ background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white', padding: '12px' }}>
              <h3 style={{ margin: 0, fontSize: 'clamp(14px, 4vw, 18px)' }}>🏆 Leaderboard</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 'clamp(11px, 2vw, 12px)', opacity: 0.8 }}>Week {currentWeek}</p>
            </div>
            <div style={{ padding: '0', maxHeight: '60vh', overflowY: 'auto' }}>
              {leaderboard.length === 0 ? (
                <div style={{ padding: '16px', color: '#999', textAlign: 'center', fontSize: 'clamp(12px, 3vw, 14px)' }}>No teams</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0', background: '#f8f9fa' }}>
                      <th style={{ padding: 'clamp(8px, 1vw, 10px)', fontSize: 'clamp(11px, 2vw, 12px)', fontWeight: 'bold', color: '#666', textAlign: 'left' }}>Team</th>
                      <th style={{ padding: 'clamp(8px, 1vw, 10px)', fontSize: 'clamp(11px, 2vw, 12px)', fontWeight: 'bold', color: '#666', textAlign: 'right' }}>Pts</th>
                      <th style={{ padding: 'clamp(8px, 1vw, 10px)', fontSize: 'clamp(11px, 2vw, 12px)', fontWeight: 'bold', color: '#666', textAlign: 'right' }}>Picks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((t, i) => (
                      <tr key={t.team_id} style={{ borderBottom: i < leaderboard.length - 1 ? '1px solid #f0f0f0' : 'none', background: t.team_id === user.id ? '#f0f7ff' : '#fff' }}>
                        <td style={{ padding: 'clamp(10px, 2vw, 12px)', fontSize: 'clamp(12px, 3vw, 14px)' }}>
                          <span style={{ marginRight: '6px', fontWeight: 'bold', color: '#999' }}>{i + 1}.</span>
                          <strong style={{ color: t.team_id === user.id ? '#2a5298' : '#1e3c72' }}>{t.team_name}</strong>
                        </td>
                        <td style={{ padding: 'clamp(10px, 2vw, 12px)', textAlign: 'right', fontWeight: 'bold', color: '#2a5298', fontSize: 'clamp(14px, 4vw, 16px)' }}>{t.points || 0}</td>
                        <td style={{ padding: 'clamp(10px, 2vw, 12px)', textAlign: 'right', fontWeight: 'bold', color: '#666', fontSize: 'clamp(12px, 3vw, 14px)' }}>{t.games_picked || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
