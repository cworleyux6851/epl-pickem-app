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
