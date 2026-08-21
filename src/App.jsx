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

  if (user) {
    return (
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>⚽ EPL Pick'em League</h1>
        <p>Welcome, {user.name}!</p>
        <button onClick={() => setUser(null)}>Logout</button>
        <p style={{ color: '#666' }}>Loading fixtures...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto' }}>
      <h1>⚽ EPL Pick'em League</h1>
      
      {!isCreating ? (
        <>
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '15px' }}>
              <label>Team Name:</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                required
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label>Password:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                required
              />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
          <button onClick={() => setIsCreating(true)} style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Create New League
          </button>
        </>
      ) : (
        <>
          <h2>Create League</h2>
          <form onSubmit={handleCreateLeague}>
            <div style={{ marginBottom: '15px' }}>
              <label>Team Name:</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                required
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label>League Password:</label>
              <input
                type="password"
                value={leaguePassword}
                onChange={(e) => setLeaguePassword(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                required
              />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {loading ? 'Creating...' : 'Create League'}
            </button>
          </form>
          <button onClick={() => setIsCreating(false)} style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Back to Login
          </button>
        </>
      )}
      
      {error && <div style={{ color: '#dc3545', padding: '10px', background: '#f8d7da', marginTop: '15px', borderRadius: '4px' }}>{error}</div>}
    </div>
  );
}
