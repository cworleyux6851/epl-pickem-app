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
  const [leaguePassword, setLeaguePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [allFixtures, setAllFixtures] = useState([]);
  const [currentPicks, setCurrentPicks] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [fixturesLoading, setFixturesLoading] = useState(true);

  // Auto-save picks when they change
  useEffect(() => {
    if (!user || Object.keys(currentPicks).length === 0 || selectedWeek !== currentWeek) return;

    const savePicks = async () => {
      try {
        const picks = Object.entries(currentPicks)
          .filter(([, team]) => team)
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

  // Load fixtures on mount
  useEffect(() => {
    loadFixtures();
  }, []);

  // Load user's picks when logged in
  useEffect(() => {
    if (!user || !currentWeek) return;

    const loadUserPicks = async () => {
      try {
        const { data: picks } = await supabase
          .from('picks')
          .select('*')
          .eq('team_id', user.id)
          .eq('matchday', currentWeek);
        
        if (picks && picks.length > 0) {
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

  // Load leaderboard
  useEffect(() => {
    if (user) {
      loadLeaderboard();
      const timer = setInterval(() => loadLeaderboard(), 30000);
      return () => clearInterval(timer);
    }
  }, [user]);

  const loadFixtures = async () => {
    try {
      setFixturesLoading(true);
      const res = await fetch('/api/fetch-epl-data');
      const data = await res.json();
      
      if (data.fixtures && data.fixtures.length > 0) {
        setAllFixtures(data.fixtures);
        setCurrentWeek(data.currentMatchday);
        setSelectedWeek(data.currentMatchday);
      }
      setFixturesLoading(false);
    } catch (e) {
      console.error('Error loading fixtures:', e);
      setFixturesLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const { data: standings, error: standingsError } = await supabase
        .from('team_standings')
        .select('*')
        .order('points', { ascending: false });

      if (standingsError) {
        console.error('Standings error:', standingsError);
        return;
      }

      if (!standings || standings.length === 0) {
        setLeaderboard([]);
        return;
      }

      const leaderboardData = standings.map(s => ({
        team_id: s.team_id,
        name: s.team_name,
        points: s.points || 0
      }));

      setLeaderboard(leaderboardData);
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('=== LOGIN START ===');
      console.log('Team name:', teamName);

      // Step 1: Check league password
      console.log('Step 1: Checking league password...');
      const { data: league, error: leagueError } = await supabase
        .from('league_config')
        .select('password')
        .single();

      if (leagueError) {
        console.error('League fetch error:', leagueError);
        setError('League not found. Create a league first.');
        setLoading(false);
        return;
      }

      if (!league) {
        console.error('No league data returned');
        setError('League not configured.');
        setLoading(false);
        return;
      }

      console.log('League password on file:', league.password);

      if (league.password !== leaguePassword) {
        console.error('Password mismatch. Got:', leaguePassword, 'Expected:', league.password);
        setError('Incorrect league password');
        setLoading(false);
        return;
      }

      console.log('✓ Password correct');

      // Step 2: Check if team exists
      console.log('Step 2: Checking if team exists...');
      const { data: existingTeams, error: teamCheckError } = await supabase
        .from('teams')
        .select('id')
        .eq('name', teamName);

      if (teamCheckError) {
        console.error('Team check error:', teamCheckError);
        throw new Error('Failed to check team: ' + teamCheckError.message);
      }

      console.log('Existing teams found:', existingTeams?.length || 0);

      if (existingTeams && existingTeams.length > 0) {
        console.log('✓ Team exists, logging in');
        setUser({ id: existingTeams[0].id, name: teamName });
        setLoading(false);
        return;
      }

      // Step 3: Create new team
      console.log('Step 3: Creating new team...');
      const { data: newTeam, error: createError } = await supabase
        .from('teams')
        .insert([{ name: teamName }])
        .select();

      if (createError) {
        console.error('Team creation error:', createError);
        throw new Error('Failed to create team: ' + createError.message);
      }

      if (!newTeam || newTeam.length === 0) {
        console.error('Team insert returned no data');
        throw new Error('Team creation returned no data');
      }

      const createdTeamId = newTeam[0].id;
      console.log('✓ Team created with ID:', createdTeamId);

      // Step 4: Create standings entry
      console.log('Step 4: Creating standings entry...');
      const { error: standingsError } = await supabase
        .from('team_standings')
        .insert([{ team_id: createdTeamId, team_name: teamName, points: 0 }]);

      if (standingsError) {
        console.error('Standings creation error:', standingsError);
        throw new Error('Failed to create standings: ' + standingsError.message);
      }

      console.log('✓ Standings created');

      console.log('=== LOGIN SUCCESS ===');
      setUser({ id: createdTeamId, name: teamName });
    } catch (e) {
      console.error('=== LOGIN FAILED ===');
      console.error('Error:', e.message);
      setError('Login failed: ' + e.message);
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
        .select('id')
        .single();

      if (existingLeague) {
        setError('League already exists. Use Login tab.');
        setLoading(false);
        return;
      }

      // Create league
      await supabase
        .from('league_config')
        .insert([{ password: leaguePassword }]);

      // Create first team
      const { data: newTeam } = await supabase
        .from('teams')
        .insert([{ name: teamName }])
        .select()
        .single();

      // Create standings
      await supabase
        .from('team_standings')
        .insert([{ team_id: newTeam.id, points: 0 }]);

      setUser({ id: newTeam.id, name: teamName });
      setIsCreating(false);
    } catch (e) {
      console.error('Create league error:', e);
      setError('Failed to create league');
    }

    setLoading(false);
  };

  const togglePick = (fixtureId, teamName) => {
    if (selectedWeek !== currentWeek) {
      setError('You can only pick for the current week');
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

  const getFixturesForWeek = (week) => {
    if (!week) return [];
    return allFixtures
      .filter(f => f.matchday === week && isWeekend(f.utc_date))
      .sort((a, b) => new Date(a.utc_date) - new Date(b.utc_date));
  };

  const fixtures = getFixturesForWeek(selectedWeek || currentWeek);
  const pickCount = Object.keys(currentPicks).filter(k => currentPicks[k]).length;
  const isCurrentWeek = selectedWeek === currentWeek;

  // LOGIN PAGE
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', padding: '20px' }}>
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

  // MAIN APP PAGE
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', fontFamily: 'system-ui' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color: 'white', padding: '16px 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '28px' }}>⚽ EPL Pick'em</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '16px' }}>{user.name}</span>
            <button 
              onClick={() => setUser(null)}
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        <div style={{ gridColumn: 'span 2' }}>
          {/* Week Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <button 
              onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))} 
              disabled={selectedWeek <= 1}
              style={{ padding: '8px 12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: selectedWeek <= 1 ? 0.5 : 1 }}
            >
              ← Prev
            </button>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#1e3c72' }}>
              Matchday {selectedWeek} {isCurrentWeek ? <span style={{ fontSize: '14px', color: '#666' }}>(Current)</span> : <span style={{ fontSize: '14px', color: '#999' }}>(View)</span>}
            </h2>
            <button 
              onClick={() => setSelectedWeek(Math.min(38, selectedWeek + 1))} 
              disabled={selectedWeek >= 38}
              style={{ padding: '8px 12px', background: '#2a5298', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: selectedWeek >= 38 ? 0.5 : 1 }}
            >
              Next →
            </button>
          </div>

          {isCurrentWeek && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#e7f3ff', borderLeft: '4px solid #2a5298', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <strong>🔒 Making picks for this week</strong>
              {saveStatus && <div style={{ color: '#28a745', fontWeight: 'bold' }}>{saveStatus}</div>}
            </div>
          )}

          {!isCurrentWeek && <div style={{ marginBottom: '16px', padding: '12px', background: '#e9ecef', borderRadius: '8px', color: '#666' }}>View only - edit picks in current week</div>}

          {isCurrentWeek && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: pickCount === 5 ? '#28a745' : '#1e3c72', marginBottom: '8px' }}>
                Picks: {pickCount}/5
              </div>
              <div style={{ height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: pickCount === 5 ? '#28a745' : '#2a5298', width: `${(pickCount / 5) * 100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {error && <div style={{ marginBottom: '16px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '8px', color: '#c00' }}>{error}</div>}

          {/* Fixtures */}
          {fixturesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading matches...</div>
          ) : fixtures.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No weekend matches</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {fixtures.map(f => {
                const isFinished = f.status === 'FINISHED';
                return (
                  <div 
                    key={f.id}
                    style={{ 
                      background: isFinished ? '#f5f5f5' : '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      overflow: 'hidden',
                      border: `1px solid ${isFinished ? '#d0d0d0' : '#e0e0e0'}`,
                      opacity: isFinished ? 0.85 : 1
                    }}
                  >
                    <div style={{ padding: '12px', borderBottom: `1px solid ${isFinished ? '#d0d0d0' : '#e0e0e0'}` }}>
                      <div style={{ fontSize: '12px', color: '#999', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>📅 {formatGameTime(f.utc_date)}</span>
                        <span style={{ background: isFinished ? '#999' : '#2a5298', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                          {isFinished ? '✓ FINISHED' : '⚪ UPCOMING'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center' }}>
                        <div 
                          onClick={() => isCurrentWeek && !isFinished && togglePick(f.id, f.home_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.home_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.home_team_name ? '2px solid #28a745' : '2px solid #ddd',
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: currentPicks[f.id] === f.home_team_name ? '#28a745' : '#1e3c72',
                            opacity: isFinished ? 0.7 : 1
                          }}
                        >
                          {f.home_team_name}
                        </div>
                        
                        <div style={{ textAlign: 'center', fontSize: '12px', color: '#999', minWidth: '40px' }}>
                          {isFinished ? `${f.home_score}-${f.away_score}` : 'vs'}
                        </div>
                        
                        <div 
                          onClick={() => isCurrentWeek && !isFinished && togglePick(f.id, f.away_team_name)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            background: currentPicks[f.id] === f.away_team_name ? '#d4edda' : isFinished ? '#f0f0f0' : '#f8f9fa',
                            border: currentPicks[f.id] === f.away_team_name ? '2px solid #28a745' : '2px solid #ddd',
                            cursor: isCurrentWeek && !isFinished ? 'pointer' : 'default',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: currentPicks[f.id] === f.away_team_name ? '#28a745' : '#1e3c72',
                            opacity: isFinished ? 0.7 : 1
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

        {/* Leaderboard */}
        <div>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', position: 'sticky', top: '20px' }}>
            <div style={{ background: '#1e3c72', color: 'white', padding: '16px', fontSize: '18px', fontWeight: 'bold' }}>
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
                        fontSize: '14px',
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
