-- Fix analytics_day_retention RPC
-- Cannot use CREATE TEMP TABLE in a STABLE function
-- Rewritten to use CTEs instead

CREATE OR REPLACE FUNCTION analytics_day_retention(
  p_days INTEGER[] DEFAULT ARRAY[1, 3, 7, 14, 30]
)
RETURNS TABLE(day_n INTEGER, retention_rate NUMERIC)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH user_sessions_agg AS (
    SELECT
      user_id,
      MIN(started_at::DATE) as first_date,
      ARRAY_AGG(DISTINCT started_at::DATE) as session_dates
    FROM user_sessions
    WHERE user_id IS NOT NULL
      AND started_at >= NOW() - INTERVAL '60 days'
    GROUP BY user_id
  ),
  days_to_check AS (
    SELECT unnest(p_days) as day_val
  ),
  retention_calc AS (
    SELECT
      d.day_val,
      COUNT(*) FILTER (WHERE u.first_date <= (NOW() - (d.day_val || ' days')::INTERVAL)::DATE) as eligible,
      COUNT(*) FILTER (
        WHERE u.first_date <= (NOW() - (d.day_val || ' days')::INTERVAL)::DATE
          AND (u.first_date + d.day_val) = ANY(u.session_dates)
      ) as retained
    FROM days_to_check d
    CROSS JOIN user_sessions_agg u
    GROUP BY d.day_val
  )
  SELECT
    day_val::INTEGER as day_n,
    CASE WHEN eligible > 0
      THEN ROUND((retained::NUMERIC / eligible) * 100, 2)
      ELSE 0
    END as retention_rate
  FROM retention_calc
  ORDER BY day_val;
$$;
