import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ============= UTILITY FUNCTIONS =============
const convertToCST = (isoString) => {
  const date = new Date(isoString);
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
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

const getMinutesUntilLockout = (firstGameTime) => {
  const cstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const cstGameTime = convertToCST(firstGameTime);
  const lockoutTime = new Date(cstGameTime.getTime() - 60 * 60 * 1000);
  return Math.floor((lockoutTime - cstNow) / 1000 / 60);
};

const isPicksLocked = (firstGameTime) => {
  return getMinutesUntilLockout(firstGameTime) <= 0;
};

// ============= MAIN APP =============
export default function EPLPickemApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [leaguePassword, setLeaguePassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loginTeamName, setLoginTeamName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [currentPicks, setCurrentPicks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minutesUntilLockout, setMinutesUntilLockout] = useState(null);

  // Initialize app on mount
  useEffect(() => {
    initializeApp();
  }, []);

  // Update lockout timer
  useEffect(() => {
    if (!fixtures.length || !currentUser) return;
    
    const firstGame = fixtures[0];
    if (!firstGame) return;

    const interval = setInterval(() => {
      const minutes = getMinutesUntilLockout(firstGame.utcDate);
      setMinutesUntilLockout(minutes);
    }, 60000);

    const minutes = getMinutesUntilLockout(firstGame.utcDate);
    setMinutesUntilLockout(minutes);

    return () => clearInterval(interval);
  }, [fixtures, currentUser]);

  // Subscribe to leaderboard updates
  useEffect(() => {
    if (!currentUser) return;

    const subscription = supabase
      .channel('picks-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks' },
        () => {
          refreshLeaderboard();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUser]);

  const initializeApp = async () => {
    try {
      const { data: config } = await supabase
        .from('league_config')
        .select('*')
        .single();
      
      if (config) {
        setLeaguePassword(config.password);
      }
    } catch (err) {
      console.log('First time setup');
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check if league exists
      const { data: existing } = await supabase
        .from('league_config')
        .select('*');

      if (existing && existing.length > 0) {
        setError('League already exists. Please login instead.');
        setLoading(false);
        return;
      }

      // Create league config
      await supabase.from('league_config').insert({
        password: leaguePassword,
        created_at: new Date(),
      });

      // Create first team
      await supabase.from('teams').insert({
        name: teamName,
        created_at: new Date(),
      });

      setCurrentUser({
        team_name: teamName,
        team_id: null,
      });
      setIsLoggingIn(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Verify league password
      const { data: config } = await supabase
        .from('league_config')
        .select('password')
        .single();

      if (!config || config.password !== loginPassword) {
        setError('Invalid league password');
        setLoading(false);
        return;
      }

      // Get or create team
      let { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('name', loginTeamName)
        .single();

      if (!team) {
        const { data: newTeam } = await supabase
          .from('teams')
          .insert({ name: loginTeamName })
          .select()
          .single();
        team = newTeam;
      }

      setCurrentUser({
        team_name: loginTeamName,
        team_id: team.id,
      });

      // Fetch this week's fixtures
      await fetchThisWeekFixtures(team.id);
      await refreshLeaderboard();

      setIsLoggingIn(false);
      setLoginTeamName('');
      setLoginPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchThisWeekFixtures = async (teamId) => {
    try {
      const response = await fetch('/api/fetch-epl-data');
      const data = await response.json();

      if (data.fixtures) {
        const sorted = data.fixtures.sort((a, b) => 
          new Date(a.utcDate) - new Date(b.utcDate)
        );
        setFixtures(sorted);
        setCurrentWeek(data.currentMatchday);

        // Fetch user's picks for this week
        const { data: picks } = await supabase
          .from('picks')
          .select('*')
          .eq('team_id', teamId)
          .eq('matchday', data.currentMatchday);

        if (picks) {
          setCurrentPicks(picks.map(p => p.fixture_id));
        }
      }
    } catch (err) {
      setError('Failed to fetch fixtures: ' + err.message);
    }
  };

  const refreshLeaderboard = async () => {
    try {
      const { data: standings } = await supabase
        .from('team_standings')
        .select('*')
        .order('points', { ascending: false });

      setLeaderboard(standings || []);
    } catch (err) {
      console.error('Failed to refresh leaderboard:', err);
    }
  };

  const handlePickToggle = (fixtureId) => {
    if (isPicksLocked(fixtures[0]?.utcDate)) {
      setError('Picks are locked!');
      return;
    }

    setCurrentPicks(prev => {
      if (prev.includes(fixtureId)) {
        return prev.filter(id => id !== fixtureId);
      } else if (prev.length < 5) {
        return [...prev, fixtureId];
      } else {
        setError('You can only pick 5 games');
        return prev;
      }
    });
  };

  const handleSavePicks = async () => {
    if (currentPicks.length !== 5) {
      setError('You must pick exactly 5 games');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Delete existing picks for this matchday
      await supabase
        .from('picks')
        .delete()
        .eq('team_id', currentUser.team_id)
        .eq('matchday', currentWeek);

      // Insert new picks
      const picksToInsert = currentPicks.map(fixtureId => ({
        team_id: currentUser.team_id,
        fixture_id: fixtureId,
        matchday: currentWeek,
        created_at: new Date(),
      }));

      await supabase.from('picks').insert(picksToInsert);
      setError('Picks saved successfully!');
      setTimeout(() => setError(''), 3000);
      await refreshLeaderboard();
    } catch (err) {
      setError('Failed to save picks: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggingIn(true);
    setFixtures([]);
    setCurrentPicks([]);
    setLeaderboard([]);
    setLoginTeamName('');
    setLoginPassword('');
  };

  // ============= RENDER LOGIN SCREEN =============
  if (!currentUser) {
    return (
      <div style={styles.container}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>⚽ EPL Pick'em League</h1>

          {isLoggingIn ? (
            <>
              <h2 style={styles.subtitle}>Login</h2>
              <form onSubmit={handleLogin} style={styles.form}>
                <div style={styles.formGroup}>
                  <label>Team Name:</label>
                  <input
                    type="text"
                    value={loginTeamName}
                    onChange={(e) => setLoginTeamName(e.target.value)}
                    placeholder="Your team name"
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>League Password:</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="League password"
                    style={styles.input}
                    required
                  />
                </div>
                <button type="submit" disabled={loading} style={styles.button}>
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
              <button
                onClick={() => setIsLoggingIn(false)}
                style={{ ...styles.button, background: '#666' }}
              >
                Create New League
              </button>
            </>
          ) : (
            <>
              <h2 style={styles.subtitle}>Create League</h2>
              <form onSubmit={handleCreateLeague} style={styles.form}>
                <div style={styles.formGroup}>
                  <label>Team Name:</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Your team name"
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label>League Password:</label>
                  <input
                    type="password"
                    value={leaguePassword}
                    onChange={(e) => setLeaguePassword(e.target.value)}
                    placeholder="Create a league password"
                    style={styles.input}
                    required
                  />
                </div>
                <button type="submit" disabled={loading} style={styles.button}>
                  {loading ? 'Creating...' : 'Create League'}
                </button>
              </form>
              <button
                onClick={() => setIsLoggingIn(true)}
                style={{ ...styles.button, background: '#666' }}
              >
                Back to Login
              </button>
            </>
          )}

          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  // ============= RENDER MAIN APP =============
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>⚽ EPL Pick'em League</h1>
        <div style={styles.userInfo}>
          <span>{currentUser.team_name}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {/* PICKS SECTION */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Matchday {currentWeek} - Make Your Picks</h2>

          {fixtures.length > 0 && (
            <div style={styles.lockoutInfo}>
              <p>
                <strong>First Game:</strong> {formatGameTime(fixtures[0].utcDate)}
              </p>
              <p>
                <strong>Picks Lock In:</strong> {minutesUntilLockout !== null ? (
                  minutesUntilLockout > 0 ? (
                    `${minutesUntilLockout} minutes`
                  ) : (
                    '🔒 LOCKED'
                  )
                ) : 'Loading...'}
              </p>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.fixturesList}>
            {fixtures.map(fixture => (
              <div
                key={fixture.id}
                style={{
                  ...styles.fixture,
                  background: currentPicks.includes(fixture.id) ? '#d4edda' : '#fff',
                  borderLeft: currentPicks.includes(fixture.id) ? '4px solid #28a745' : '4px solid #ddd',
                }}
                onClick={() => handlePickToggle(fixture.id)}
              >
                <div style={styles.fixtureTime}>
                  {formatGameTime(fixture.utcDate)}
                </div>
                <div style={styles.fixtureMatch}>
                  <span style={styles.team}>{fixture.homeTeam.name}</span>
                  <span style={styles.vs}>vs</span>
                  <span style={styles.team}>{fixture.awayTeam.name}</span>
                </div>
                <div style={styles.fixtureStatus}>
                  {fixture.status === 'FINISHED' ? (
                    <>
                      <strong>
                        {fixture.score.fullTime.home} - {fixture.score.fullTime.away}
                      </strong>
                    </>
                  ) : (
                    <span style={{ color: '#999' }}>Not started</span>
                  )}
                </div>
                {currentPicks.includes(fixture.id) && (
                  <div style={styles.pickIcon}>✓ PICKED</div>
                )}
              </div>
            ))}
          </div>

          <div style={styles.pickInfo}>
            <p>Picks selected: <strong>{currentPicks.length}/5</strong></p>
            {currentPicks.length === 5 && !isPicksLocked(fixtures[0]?.utcDate) && (
              <button
                onClick={handleSavePicks}
                disabled={loading}
                style={styles.savePicks}
              >
                {loading ? 'Saving...' : 'Save My Picks'}
              </button>
            )}
          </div>
        </section>

        {/* LEADERBOARD SECTION */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Leaderboard</h2>
          <table style={styles.leaderboardTable}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={{ ...styles.tableCell, textAlign: 'left' }}>Rank</th>
                <th style={{ ...styles.tableCell, textAlign: 'left' }}>Team</th>
                <th style={styles.tableCell}>Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((team, idx) => (
                <tr
                  key={team.team_id}
                  style={{
                    ...styles.tableRow,
                    background: currentUser.team_id === team.team_id ? '#e7f3ff' : '#fff',
                  }}
                >
                  <td style={styles.tableCell}>{idx + 1}</td>
                  <td style={{ ...styles.tableCell, textAlign: 'left' }}>
                    {team.team_name}
                    {currentUser.team_id === team.team_id && ' (You)'}
                  </td>
                  <td style={styles.tableCell}>
                    <strong>{team.points || 0}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

// ============= STYLES =============
const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#f5f5f5',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    color: '#333',
  },
  subtitle: {
    fontSize: '18px',
    marginBottom: '20px',
    color: '#333',
  },
  userInfo: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '20px',
  },
  section: {
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: '15px',
    color: '#333',
    borderBottom: '2px solid #007bff',
    paddingBottom: '10px',
  },
  lockoutInfo: {
    background: '#fff3cd',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '15px',
    border: '1px solid #ffc107',
  },
  fixturesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '15px',
  },
  fixture: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'grid',
    gridTemplateColumns: '120px 1fr 100px 60px',
    gap: '10px',
    alignItems: 'center',
  },
  fixtureTime: {
    fontSize: '12px',
    color: '#666',
    whiteSpace: 'nowrap',
  },
  fixtureMatch: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  team: {
    fontWeight: '500',
    fontSize: '13px',
  },
  vs: {
    color: '#999',
    fontSize: '11px',
  },
  fixtureStatus: {
    textAlign: 'center',
    fontSize: '12px',
  },
  pickIcon: {
    background: '#28a745',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pickInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#f8f9fa',
    borderRadius: '4px',
  },
  savePicks: {
    padding: '10px 20px',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  leaderboardTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    background: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
  },
  tableRow: {
    borderBottom: '1px solid #dee2e6',
  },
  tableCell: {
    padding: '12px',
    textAlign: 'center',
  },
  loginCard: {
    maxWidth: '400px',
    margin: '50px auto',
    background: '#fff',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  },
  form: {
    marginBottom: '15px',
  },
  formGroup: {
    marginBottom: '15px',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
    marginTop: '5px',
  },
  button: {
    width: '100%',
    padding: '10px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  error: {
    color: '#dc3545',
    padding: '10px',
    background: '#f8d7da',
    borderRadius: '4px',
    marginTop: '10px',
  },
};
