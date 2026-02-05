-- Analytics Aggregation RPCs
-- Replaces client-side aggregation to avoid PostgREST 1000-row limit

-- ============================================================
-- 1. DAU/WAU/MAU - Distinct user counts by period
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_active_users(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(DISTINCT user_id)::INTEGER
  FROM user_events
  WHERE event_ts >= p_start_ts
    AND (p_end_ts IS NULL OR event_ts <= p_end_ts)
    AND user_id IS NOT NULL;
$$;

-- ============================================================
-- 2. DAU array - Daily unique users for a period
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_dau_array(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, count INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    d::DATE as date,
    COUNT(DISTINCT user_id)::INTEGER as count
  FROM generate_series(p_start_date, p_end_date, '1 day'::INTERVAL) d
  LEFT JOIN user_events e ON
    e.event_ts >= d
    AND e.event_ts < d + INTERVAL '1 day'
    AND e.user_id IS NOT NULL
  GROUP BY d::DATE
  ORDER BY d::DATE;
$$;

-- ============================================================
-- 3. Event counts by type
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_event_counts(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_event_types TEXT[] DEFAULT NULL
)
RETURNS TABLE(event_type TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    e.event_type,
    COUNT(*)::BIGINT as count
  FROM user_events e
  WHERE e.event_ts >= p_start_ts
    AND e.event_ts <= p_end_ts
    AND (p_event_types IS NULL OR e.event_type = ANY(p_event_types))
  GROUP BY e.event_type;
$$;

-- ============================================================
-- 4. Funnel - Distinct users per event type
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_funnel(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ
)
RETURNS TABLE(
  visited INTEGER,
  created INTEGER,
  published INTEGER,
  played INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    (SELECT COUNT(DISTINCT user_id)::INTEGER
     FROM user_sessions
     WHERE started_at >= p_start_ts AND started_at <= p_end_ts AND user_id IS NOT NULL) as visited,
    (SELECT COUNT(DISTINCT user_id)::INTEGER
     FROM user_events
     WHERE event_type = 'game_create' AND event_ts >= p_start_ts AND event_ts <= p_end_ts AND user_id IS NOT NULL) as created,
    (SELECT COUNT(DISTINCT user_id)::INTEGER
     FROM user_events
     WHERE event_type = 'game_publish' AND event_ts >= p_start_ts AND event_ts <= p_end_ts AND user_id IS NOT NULL) as published,
    (SELECT COUNT(DISTINCT user_id)::INTEGER
     FROM user_events
     WHERE event_type = 'game_play' AND event_ts >= p_start_ts AND event_ts <= p_end_ts AND user_id IS NOT NULL) as played;
$$;

-- ============================================================
-- 5. Country breakdown - Distinct users per country
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_by_country(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(country TEXT, user_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(s.country, 'Unknown') as country,
    COUNT(DISTINCT s.user_id)::INTEGER as user_count
  FROM user_sessions s
  WHERE s.started_at >= p_start_ts
    AND s.started_at <= p_end_ts
    AND s.user_id IS NOT NULL
  GROUP BY COALESCE(s.country, 'Unknown')
  ORDER BY user_count DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 6. Device OS breakdown - Distinct users per OS
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_by_device(
  p_since_ts TIMESTAMPTZ
)
RETURNS TABLE(os TEXT, user_count INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(d.os, 'Unknown') as os,
    COUNT(DISTINCT d.user_id)::INTEGER as user_count
  FROM user_devices d
  WHERE d.last_seen_at >= p_since_ts
    AND d.user_id IS NOT NULL
  GROUP BY COALESCE(d.os, 'Unknown')
  ORDER BY user_count DESC;
$$;

-- ============================================================
-- 7. Top pages by view count
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_top_pages(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(path TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    e.path,
    COUNT(*)::BIGINT as count
  FROM user_events e
  WHERE e.event_type = 'page_view'
    AND e.event_ts >= p_start_ts
    AND e.event_ts <= p_end_ts
    AND e.path IS NOT NULL
  GROUP BY e.path
  ORDER BY count DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 8. Top games by play count
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_top_games(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(game_id TEXT, play_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(e.properties->>'game_id', e.properties->>'gameId') as game_id,
    COUNT(*)::BIGINT as play_count
  FROM user_events e
  WHERE e.event_type = 'game_play'
    AND e.event_ts >= p_start_ts
    AND e.event_ts <= p_end_ts
    AND (e.properties->>'game_id' IS NOT NULL OR e.properties->>'gameId' IS NOT NULL)
  GROUP BY COALESCE(e.properties->>'game_id', e.properties->>'gameId')
  ORDER BY play_count DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 9. New vs Returning users
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_new_vs_returning(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ
)
RETURNS TABLE(new_users INTEGER, returning_users INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH users_in_period AS (
    SELECT DISTINCT user_id
    FROM user_sessions
    WHERE started_at >= p_start_ts
      AND started_at <= p_end_ts
      AND user_id IS NOT NULL
  ),
  user_first_sessions AS (
    SELECT user_id, MIN(started_at) as first_session
    FROM user_sessions
    WHERE user_id IN (SELECT user_id FROM users_in_period)
    GROUP BY user_id
  )
  SELECT
    COUNT(CASE WHEN first_session >= p_start_ts AND first_session <= p_end_ts THEN 1 END)::INTEGER as new_users,
    COUNT(CASE WHEN first_session < p_start_ts THEN 1 END)::INTEGER as returning_users
  FROM user_first_sessions;
$$;

-- ============================================================
-- 10. Session stats (count and avg duration)
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_session_stats(
  p_start_ts TIMESTAMPTZ,
  p_end_ts TIMESTAMPTZ
)
RETURNS TABLE(total_sessions BIGINT, avg_duration_sec INTEGER)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT as total_sessions,
    COALESCE(AVG(NULLIF(duration_sec, 0))::INTEGER, 0) as avg_duration_sec
  FROM user_sessions
  WHERE started_at >= p_start_ts
    AND started_at <= p_end_ts;
$$;

-- ============================================================
-- 11. Retention: Day N retention rates
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_day_retention(
  p_days INTEGER[] DEFAULT ARRAY[1, 3, 7, 14, 30]
)
RETURNS TABLE(day_n INTEGER, retention_rate NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_day INTEGER;
  v_cutoff TIMESTAMPTZ;
  v_eligible INTEGER;
  v_retained INTEGER;
BEGIN
  -- Get user first sessions and session days
  CREATE TEMP TABLE IF NOT EXISTS _user_sessions_tmp AS
  SELECT
    user_id,
    MIN(started_at::DATE) as first_date,
    ARRAY_AGG(DISTINCT started_at::DATE) as session_dates
  FROM user_sessions
  WHERE user_id IS NOT NULL
    AND started_at >= NOW() - INTERVAL '60 days'
  GROUP BY user_id;

  FOREACH v_day IN ARRAY p_days
  LOOP
    v_cutoff := NOW() - (v_day || ' days')::INTERVAL;

    SELECT
      COUNT(*) FILTER (WHERE first_date <= v_cutoff::DATE),
      COUNT(*) FILTER (WHERE first_date <= v_cutoff::DATE
        AND (first_date + v_day) = ANY(session_dates))
    INTO v_eligible, v_retained
    FROM _user_sessions_tmp;

    day_n := v_day;
    retention_rate := CASE WHEN v_eligible > 0
      THEN ROUND((v_retained::NUMERIC / v_eligible) * 100, 2)
      ELSE 0
    END;
    RETURN NEXT;
  END LOOP;

  DROP TABLE IF EXISTS _user_sessions_tmp;
END;
$$;

-- ============================================================
-- 12. Lifecycle segments
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_lifecycle()
RETURNS TABLE(
  new_users INTEGER,
  active_users INTEGER,
  at_risk_users INTEGER,
  dormant_users INTEGER,
  resurrected_users INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  week_bounds AS (
    SELECT
      DATE_TRUNC('week', NOW())::DATE as this_week_start,
      (DATE_TRUNC('week', NOW()) - INTERVAL '7 days')::DATE as last_week_start
  ),
  user_activity AS (
    SELECT DISTINCT
      e.user_id,
      MIN(s.started_at)::DATE as first_session,
      BOOL_OR(e.event_ts >= wb.this_week_start) as active_this_week,
      BOOL_OR(e.event_ts >= wb.last_week_start AND e.event_ts < wb.this_week_start) as active_last_week
    FROM user_events e
    CROSS JOIN week_bounds wb
    LEFT JOIN user_sessions s ON s.user_id = e.user_id
    WHERE e.user_id IS NOT NULL
      AND e.event_ts >= wb.last_week_start - INTERVAL '7 days'
    GROUP BY e.user_id
  )
  SELECT
    COUNT(*) FILTER (WHERE first_session >= (SELECT this_week_start FROM week_bounds))::INTEGER as new_users,
    COUNT(*) FILTER (WHERE active_this_week AND active_last_week AND first_session < (SELECT this_week_start FROM week_bounds))::INTEGER as active_users,
    COUNT(*) FILTER (WHERE NOT active_this_week AND active_last_week)::INTEGER as at_risk_users,
    COUNT(*) FILTER (WHERE NOT active_this_week AND NOT active_last_week AND first_session < (SELECT last_week_start FROM week_bounds))::INTEGER as dormant_users,
    COUNT(*) FILTER (WHERE active_this_week AND NOT active_last_week AND first_session < (SELECT last_week_start FROM week_bounds))::INTEGER as resurrected_users
  FROM user_activity;
$$;
