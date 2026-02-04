-- Analytics DAU History RPC
-- Returns daily unique user counts for a date range

CREATE OR REPLACE FUNCTION get_dau_history(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  date DATE,
  unique_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(event_ts AT TIME ZONE 'UTC') AS date,
    COUNT(DISTINCT user_id) AS unique_users
  FROM user_events
  WHERE event_ts >= p_start_date
    AND event_ts < p_end_date
    AND user_id IS NOT NULL
  GROUP BY DATE(event_ts AT TIME ZONE 'UTC')
  ORDER BY date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_dau_history IS 'Returns daily active users count for analytics dashboard';
