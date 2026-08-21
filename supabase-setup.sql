-- ============= TABLES =============

-- League configuration (password, settings)
CREATE TABLE IF NOT EXISTS league_config (
  id BIGSERIAL PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams in the league
CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EPL fixtures (synced from football-data.org)
CREATE TABLE IF NOT EXISTS fixtures (
  id BIGINT PRIMARY KEY,
  home_team_name VARCHAR(255) NOT NULL,
  away_team_name VARCHAR(255) NOT NULL,
  home_team_id BIGINT,
  away_team_id BIGINT,
  utc_date TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL,
  home_score INT,
  away_score INT,
  matchday INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User picks (which games they picked to win each matchday)
CREATE TABLE IF NOT EXISTS picks (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id),
  matchday INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, fixture_id, matchday)
);

-- Team standings (calculated view)
CREATE TABLE IF NOT EXISTS team_standings (
  team_id BIGINT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  team_name VARCHAR(255) NOT NULL,
  points INT DEFAULT 0,
  matches_played INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============= INDEXES =============

CREATE INDEX IF NOT EXISTS idx_picks_team_id ON picks(team_id);
CREATE INDEX IF NOT EXISTS idx_picks_fixture_id ON picks(fixture_id);
CREATE INDEX IF NOT EXISTS idx_picks_matchday ON picks(matchday);
CREATE INDEX IF NOT EXISTS idx_fixtures_matchday ON fixtures(matchday);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);

-- ============= FUNCTION TO CALCULATE STANDINGS =============

CREATE OR REPLACE FUNCTION calculate_team_standings()
RETURNS VOID AS $$
BEGIN
  -- Delete existing standings
  DELETE FROM team_standings;

  -- Recalculate standings
  INSERT INTO team_standings (team_id, team_name, points, matches_played, updated_at)
  SELECT 
    t.id,
    t.name,
    COALESCE(SUM(
      CASE 
        -- User picked home team and home team won
        WHEN p.fixture_id IS NOT NULL 
          AND f.home_score > f.away_score 
          THEN 3
        -- User picked away team and away team won
        WHEN p.fixture_id IS NOT NULL 
          AND f.away_score > f.home_score 
          THEN 3
        -- User picked and it was a draw
        WHEN p.fixture_id IS NOT NULL 
          AND f.home_score = f.away_score 
          THEN 1
        ELSE 0
      END
    ), 0) as points,
    COUNT(DISTINCT p.matchday) as matches_played
  FROM teams t
  LEFT JOIN picks p ON t.id = p.team_id
  LEFT JOIN fixtures f ON p.fixture_id = f.id 
    AND f.status = 'FINISHED'
  GROUP BY t.id, t.name
  ON CONFLICT (team_id) DO UPDATE SET 
    points = EXCLUDED.points,
    matches_played = EXCLUDED.matches_played,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============= TRIGGERS TO AUTO-UPDATE STANDINGS =============

CREATE OR REPLACE FUNCTION update_standings_on_pick_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_team_standings();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_picks_changed ON picks;
CREATE TRIGGER trigger_picks_changed
AFTER INSERT OR UPDATE OR DELETE ON picks
FOR EACH ROW
EXECUTE FUNCTION update_standings_on_pick_change();

CREATE OR REPLACE FUNCTION update_standings_on_fixture_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_team_standings();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fixtures_changed ON fixtures;
CREATE TRIGGER trigger_fixtures_changed
AFTER UPDATE ON fixtures
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR 
      OLD.home_score IS DISTINCT FROM NEW.home_score OR
      OLD.away_score IS DISTINCT FROM NEW.away_score)
EXECUTE FUNCTION update_standings_on_fixture_change();

-- ============= INITIAL CALCULATION =============

SELECT calculate_team_standings();

-- ============= REALTIME SUBSCRIPTIONS =============

ALTER TABLE team_standings REPLICA IDENTITY FULL;
ALTER TABLE picks REPLICA IDENTITY FULL;
ALTER TABLE fixtures REPLICA IDENTITY FULL;
