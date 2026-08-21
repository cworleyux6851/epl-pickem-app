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
  const lockTime = new Date(cstDate.getTime() - 60 * 60 * 1000);
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
  const [fixturesError, setFixturesError] = useState(null);

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

  // Load fixtures
  useEffect(() => {
    loadFixturesWithCache();
  }, []);

  // Load user picks when logged in
  useEffect(() => {
    if (!user || !currentWeek) return;

    const loadUserPicks = async () => {
      try {
        const { data: picks } = await supabase
          .from('picks')
          .select('*')
          .eq('team_id', user.id)
          .eq('matchday', currentWeek);
        
        if (picks) {
          const picksMap = {};
          picks.forEach(p => {
            picksMap[p.fixture_id] = p.picked_team;
          });
          setCurrentPicks(picksMap);
        }
      } catch (e) {
        console.error('Error loading user picks:', e);
      }
    };

    loadUserPicks();
  }, [user, currentWeek]);

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
      setFixturesError(null);
      
      const cachedData = localStorage.getItem('epl_fixtures_cache');
      const cacheTimestamp = localStorage.getItem('epl_fixtures_cache_time');
      const now = Date.now();
      const cacheAge = cacheTimestamp ? now - parseInt(cacheTimestamp) : null;
      const ONE_DAY = 24 * 60 * 60 * 1000;
      
      let usedCache = false;
      let data = null;

      if (cachedData && cacheAge && cacheAge < ONE_DAY) {
        const cached = JSON.parse(cachedData);
        const hasLiveOrFinished = cached.fixtures.some(f => 
          f.status === 'LIVE' || f.status === 'FINISHED'
        );
        
        if (!hasLiveOrFinished) {
          data = cached;
          usedCache = true;
          console.log('✅ Using cached fixtures');
        }
      }

      if (!usedCache) {
        console.log('📡 Fetching fresh EPL data...');
        const res = await fetch('/api/fetch-epl-data');
        
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        
        const freshData = await res.json();
        
        if (freshData.fixtures && freshData.fixtures.length > 0) {
          localStorage.setItem('epl_fixtures_cache', JSON.stringify(freshData));
          localStorage.setItem('epl_fixtures_cache_time', now.toString());
          data = freshData;
          console.log('✅ Fetched fresh data');
        } else {
          throw new Error('No fixtures returned from API');
        }
      }

      if (data && data.fixtures && data.fixtures.length > 0) {
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
      } else {
        throw new Error('Failed to load any fixture data');
      }
      setFixturesLoading(false);
    } catch (e) {
      console.error('❌ Failed to load fixtures:', e);
      setFixturesError(e.message);
      setFixturesLoading(false);
    }
  };

  const getFixturesForWeek = (week) => {
    if (!week) return [];
    return allFixtures.filter(f => f.matchday === week && isWeekend(f.utc_date));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Get league password to verify
      const { data: league } = await supabase
        .from('league_config')
        .select('password')
        .single();

      if (!league) {
        setError('League not found - create league first');
        setLoading(false);
        return;
      }

      // Check league password
      if (league.password !== leaguePassword) {
        setError('Incorrect league password');
        setLoading(false);
        return;
      }

      // Check if team exists
      const { data: existingTeam } = await supabase
        .from('teams')
        .select('*')
        .eq('name', teamName)
        .single();

      if (existingTeam) {
        // Team exists, log them in
        setUser({ id: existingTeam.id, name: teamName });
      } else {
        // Team doesn't exist - auto-create it
        const { data: newTeam, error: teamError } = await supabase
          .from('teams')
          .insert([{ name: teamName, password: '' }])
          .select()
          .single();

        if (teamError) throw teamError;

        // Create standings entry
        await supabase
          .from('team_standings')
          .insert([{ team_id: newTeam.id, points: 0 }]);

        setUser({ id: newTeam.id, name: teamName });
      }
    } catch (e) {
      console.error('Login error:', e);
      setError('Login failed');
    }

    setLoading(false);
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: existingLeague } = await supabase
        .from('league_config')
        .select('*')
        .single();

      if (existingLeague) {
        setError('League already exists');
        setLoading(false);
        return;
      }

      // Create league config first
      const { error: leagueError } = await supabase
        .from('league_config')
        .insert([{ password: leaguePassword }]);

      if (leagueError) throw leagueError;

      // Create team (no individual password needed)
      const { data: newTeam, error: teamError } = await supabase
        .from('teams')
        .insert([{ name: teamName, password: '' }])
        .select()
        .single();

      if (teamError) throw teamError;

      // Create standings
      const { error: standingsError } = await supabase
        .from('team_standings')
        .insert([{ team_id: newTeam.id, points: 0 }]);

      if (standingsError) throw standingsError;

      setUser({ id: newTeam.id, name: teamName });
      setIsCreating(false);
    } catch (e) {
      console.error('Create league error:', e);
      setError('Failed to create league');
    }

    setLoading(false);
  };

  const loadLeaderboard = async () => {
    try {
      const { data: standings } = await supabase
        .from('team_standings')
        .select('team_id, points, teams(name)')
        .order('points', { ascending: false });

      if (standings) {
        const leaderboardData = standings.map(s => ({
          team_id: s.team_id,
          name: s.teams?.name || 'Unknown',
          points: s.points || 0
        }));
        setLeaderboard(leaderboardData);
      }
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  };

  const togglePick = (fixtureId, teamName) => {
    if (selectedWeek !== currentWeek) return;

    if (prevWeekPicks[teamName]) {
      setError(`Can't pick ${teamName} two weeks in a row`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setCurrentPicks(prev => {
      const updated = { ...prev };
      if (updated[fixtureId] === teamName) {
        delete updated[fixtureId];
      } else {
        updated[fixtureId] = teamName;
      }
      return updated;
    });
  };

  const fixtures = getFixturesForWeek(selectedWeek || currentWeek);
  const pickCount = Object.keys(currentPicks).filter(k => currentPicks[k]).length;
  const isCurrentWeek = selectedWeek === currentWeek;

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <h1 style={{ textAlign: 'center', color: '#1e3c72', marginTop: 0, marginBottom: '30px', fontSize: '32px' }}>⚽ EPL Pick'em</h1>

          {!isCreating ? (
            <>
              <h2 style={{ fontSize: '20px', color: '#333', marginBottom: '20px' }}>Login</h2>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                  placeholder="League password" 
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
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
              {error && <div style={{ marginTop: '15px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c00', fontSize: '14px' }}>{error}</div>}
              <p style={{ marginTop: '25px', textAlign: 'center', fontSize: '14px' }}>
                <button onClick={() => { setIsCreating(true); setError(''); }} style={{ background: 'none', border: 'none', color: '#2a5298', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}>Create new league</button>
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '20px', color: '#333', marginBottom: '20px' }}>Create League</h2>
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
        <div style={{ gridColumn: 'span 2' }}>
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

          {isCurrentWeek && lockDateTime && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#e7f3ff', borderLeft: '4px solid #2a5298', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: 'clamp(12px, 3vw, 14px)' }}>
              <div>
                <strong>🔒 Picks lock: {lockDateTime}</strong>
              </div>
              {saveStatus && <div style={{ color: '#28a745', fontWeight: 'bold' }}>{saveStatus}</div>}
            </div>
          )}

          {!isCurrentWeek && <div style={{ marginBottom: '16px', padding: '12px', background: '#e9ecef', borderRadius: '8px', color: '#666', fontSize: 'clamp(12px, 3vw, 14px)' }}>View only - edit picks in current week</div>}

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

          {fixturesError && (
            <div style={{ marginBottom: '16px', padding: '16px', background: '#fee', border: '2px solid #fcc', borderRadius: '8px', color: '#c00' }}>
              <div style={{ fontSize: 'clamp(14px, 4vw, 16px)', fontWeight: 'bold', marginBottom: '8px' }}>❌ Error loading matches</div>
              <div style={{ fontSize: 'clamp(12px, 3vw, 14px)', marginBottom: '12px' }}>{fixturesError}</div>
              <button 
                onClick={() => loadFixturesWithCache()}
                style={{ padding: '8px 16px', background: '#c00', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: 'clamp(12px, 3vw, 14px)' }}
              >
                🔄 Retry
              </button>
            </div>
          )}
          
          {fixturesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
              <div style={{ fontSize: 'clamp(14px, 4vw, 16px)', marginBottom: '8px' }}>Loading matches...</div>
              <div style={{ fontSize: 'clamp(12px, 3vw, 14px)', color: '#bbb' }}>Fetching latest EPL fixtures...</div>
            </div>
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
                        <div 
                          onClick={() => isCurrentWeek && togglePick(f.id, f.home_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.home_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.home_team_name ? '2px solid #28a745' : `2px solid ${isFinished ? '#ddd' : '#ddd'}`,
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            textAlign: 'center',
                            fontSize: 'clamp(12px, 2vw, 14px)',
                            fontWeight: 'bold',
                            color: currentPicks[f.id] === f.home_team_name ? '#28a745' : '#1e3c72',
                            transition: 'all 0.2s',
                            opacity: isFinished ? 0.7 : 1
                          }}
                          onMouseEnter={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = '#e8f5e9';
                            }
                          }}
                          onMouseLeave={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = currentPicks[f.id] === f.home_team_name ? '#d4edda' : '#f8f9fa';
                            }
                          }}
                        >
                          {f.home_team_name}
                        </div>
                        
                        <div style={{ textAlign: 'center', fontSize: 'clamp(10px, 2vw, 12px)', color: '#999', minWidth: '40px' }}>
                          {isFinished ? `${f.home_score}-${f.away_score}` : 'vs'}
                        </div>
                        
                        <div 
                          onClick={() => isCurrentWeek && togglePick(f.id, f.away_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.away_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.away_team_name ? '2px solid #28a745' : `2px solid ${isFinished ? '#ddd' : '#ddd'}`,
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            textAlign: 'center',
                            fontSize: 'clamp(12px, 2vw, 14px)',
                            fontWeight: 'bold',
                            color: currentPicks[f.id] === f.away_team_name ? '#28a745' : '#1e3c72',
                            transition: 'all 0.2s',
                            opacity: isFinished ? 0.7 : 1
                          }}
                          onMouseEnter={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = '#e8f5e9';
                            }
                          }}
                          onMouseLeave={e => {
                            if (isCurrentWeek && !isFinished) {
                              e.currentTarget.style.background = currentPicks[f.id] === f.away_team_name ? '#d4edda' : '#f8f9fa';
                            }
                          }}
                        >
                          {f.away_team_name}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ gridColumn: 'auto' }}>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', position: 'sticky', top: '20px' }}>
            <div style={{ background: '#1e3c72', color: 'white', padding: '16px', fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 'bold' }}>
              🏆 Leaderboard
            </div>
            <div style={{ padding: '12px', maxHeight: '600px', overflowY: 'auto' }}>
              {leaderboard.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#999' }}>No teams yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leaderboard.map((team, idx) => (
                    <div 
                      key={team.team_id} 
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: team.team_id === user?.id ? '#e7f3ff' : '#f8f9fa',
                        border: team.team_id === user?.id ? '2px solid #2a5298' : '1px solid #e0e0e0',
                        fontSize: 'clamp(12px, 3vw, 14px)',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#2a5298', minWidth: '20px' }}>{idx + 1}</div>
                      <div style={{ fontWeight: 'bold', color: team.team_id === user?.id ? '#2a5298' : '#333' }}>{team.name}</div>
                      <div style={{ fontWeight: 'bold', color: '#28a745' }}>{team.points}pts</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
