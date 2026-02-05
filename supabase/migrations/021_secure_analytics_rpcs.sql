-- Secure analytics RPCs with fixed search_path
-- SECURITY DEFINER functions need search_path to prevent injection

-- Set search_path for all analytics functions
ALTER FUNCTION analytics_active_users(TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION analytics_dau_array(DATE, DATE) SET search_path = public;
ALTER FUNCTION analytics_event_counts(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) SET search_path = public;
ALTER FUNCTION analytics_funnel(TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION analytics_by_country(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) SET search_path = public;
ALTER FUNCTION analytics_by_device(TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION analytics_top_pages(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) SET search_path = public;
ALTER FUNCTION analytics_top_games(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) SET search_path = public;
ALTER FUNCTION analytics_new_vs_returning(TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION analytics_session_stats(TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION analytics_day_retention(INTEGER[]) SET search_path = public;
ALTER FUNCTION analytics_lifecycle() SET search_path = public;

-- Revoke EXECUTE from public, grant only to service_role
REVOKE EXECUTE ON FUNCTION analytics_active_users(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_dau_array(DATE, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_event_counts(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_funnel(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_by_country(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_by_device(TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_pages(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_games(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_new_vs_returning(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_session_stats(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_day_retention(INTEGER[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_lifecycle() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION analytics_active_users(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_dau_array(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_event_counts(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_by_country(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_by_device(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_pages(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_games(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_new_vs_returning(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_session_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_day_retention(INTEGER[]) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_lifecycle() TO service_role;
