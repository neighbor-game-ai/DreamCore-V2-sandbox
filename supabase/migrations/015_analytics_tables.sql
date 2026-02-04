-- Analytics テーブル作成
-- Standard スコープの行動分析基盤

-- ============================================================
-- 1. user_sessions（セッション追跡）
-- ============================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- セッション情報
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER,

  -- 流入情報
  first_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- デバイス・地域
  device_id TEXT,
  country TEXT,
  timezone TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_started ON user_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started ON user_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device ON user_sessions(device_id);

COMMENT ON TABLE user_sessions IS 'ユーザーセッション追跡。保持期間365日。';

-- ============================================================
-- 2. user_events（イベント追跡）
-- ============================================================

CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,

  -- イベント情報
  event_type TEXT NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  path TEXT,
  properties JSONB,

  -- バリデーション（初期リリース + 将来拡張分を含む）
  CONSTRAINT valid_event_type CHECK (
    event_type IN (
      -- 初期リリース
      'page_view', 'login', 'logout',
      'game_play', 'game_create', 'game_publish',
      'error',
      -- 後日追加
      'button_click', 'form_submit', 'scroll_depth'
    )
  ),
  CONSTRAINT properties_size CHECK (
    properties IS NULL OR octet_length(properties::text) <= 4096
  )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_events_user_ts ON user_events(user_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type_ts ON user_events(event_type, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_session_ts ON user_events(session_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_ts ON user_events(event_ts DESC);

COMMENT ON TABLE user_events IS 'ユーザーイベント追跡。保持期間180日。';

-- ============================================================
-- 3. user_devices（デバイス識別）
-- ============================================================

CREATE TABLE IF NOT EXISTS user_devices (
  device_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- デバイス情報（UA解析後）
  os TEXT,
  browser TEXT,
  screen TEXT,

  -- タイムスタンプ
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_devices_user_lastseen ON user_devices(user_id, last_seen_at DESC);

COMMENT ON TABLE user_devices IS 'ユーザーデバイス識別。last_seen_at を毎セッション更新。';

-- ============================================================
-- 4. RLS ポリシー
-- ============================================================

-- user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
CREATE POLICY "Users can view own sessions" ON user_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role full access on sessions" ON user_sessions;
CREATE POLICY "Service role full access on sessions" ON user_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- user_events
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own events" ON user_events;
CREATE POLICY "Users can view own events" ON user_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role full access on events" ON user_events;
CREATE POLICY "Service role full access on events" ON user_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- user_devices
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON user_devices;
CREATE POLICY "Users can view own devices" ON user_devices
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role full access on devices" ON user_devices;
CREATE POLICY "Service role full access on devices" ON user_devices
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 5. ヘルパー関数
-- ============================================================

-- セッション開始時のデバイス登録/更新
CREATE OR REPLACE FUNCTION upsert_device(
  p_device_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_screen TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_devices (device_id, user_id, os, browser, screen, first_seen_at, last_seen_at)
  VALUES (p_device_id, p_user_id, p_os, p_browser, p_screen, NOW(), NOW())
  ON CONFLICT (device_id) DO UPDATE SET
    user_id = COALESCE(user_devices.user_id, EXCLUDED.user_id),
    os = COALESCE(EXCLUDED.os, user_devices.os),
    browser = COALESCE(EXCLUDED.browser, user_devices.browser),
    screen = COALESCE(EXCLUDED.screen, user_devices.screen),
    last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ログイン時の紐付け
CREATE OR REPLACE FUNCTION link_user_to_session(
  p_user_id UUID,
  p_session_id UUID,
  p_device_id TEXT
)
RETURNS void AS $$
BEGIN
  -- セッション内のイベントに user_id を紐付け
  UPDATE user_events
  SET user_id = p_user_id
  WHERE session_id = p_session_id
    AND user_id IS NULL;

  -- セッション自体に user_id を紐付け
  UPDATE user_sessions
  SET user_id = p_user_id
  WHERE id = p_session_id
    AND user_id IS NULL;

  -- デバイスに user_id を紐付け + last_seen_at 更新
  UPDATE user_devices
  SET
    user_id = COALESCE(user_id, p_user_id),
    last_seen_at = NOW()
  WHERE device_id = p_device_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- セッション終了
CREATE OR REPLACE FUNCTION end_session(
  p_session_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions
  SET
    ended_at = NOW(),
    duration_sec = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
  WHERE id = p_session_id
    AND ended_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
