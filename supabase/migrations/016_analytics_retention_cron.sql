-- Analytics Data Retention with pg_cron
-- Events: 180 days, Sessions: 365 days

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user (required for pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Function to clean up old analytics data
CREATE OR REPLACE FUNCTION cleanup_analytics_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_events integer;
  deleted_sessions integer;
BEGIN
  -- Delete events older than 180 days
  DELETE FROM user_events
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  -- Delete sessions older than 365 days
  DELETE FROM user_sessions
  WHERE created_at < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  -- Log the cleanup (optional: write to a log table if needed)
  RAISE NOTICE 'Analytics cleanup completed: % events, % sessions deleted', deleted_events, deleted_sessions;
END;
$$;

-- Schedule the cleanup job to run daily at 3:00 AM UTC
-- Note: pg_cron runs in UTC timezone
SELECT cron.schedule(
  'analytics-retention-cleanup',  -- job name
  '0 3 * * *',                    -- cron expression: daily at 03:00 UTC
  $$SELECT cleanup_analytics_data()$$
);

-- Add comment for documentation
COMMENT ON FUNCTION cleanup_analytics_data() IS 'Deletes analytics data older than retention period (events: 180 days, sessions: 365 days)';
