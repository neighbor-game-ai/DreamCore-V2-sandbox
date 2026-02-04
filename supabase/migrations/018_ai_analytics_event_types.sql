-- Add AI generation tracking event types
-- Expands the valid_event_type constraint to include new events

-- Drop and recreate the constraint with new event types
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS valid_event_type;

ALTER TABLE user_events ADD CONSTRAINT valid_event_type CHECK (
  event_type IN (
    -- 初期リリース
    'page_view', 'login', 'logout',
    'game_play', 'game_create', 'game_publish',
    'error',
    -- 一般的なインタラクション
    'button_click', 'form_submit', 'scroll_depth',
    -- AI生成メトリクス
    'ai_request', 'ai_response',
    'suggestion_shown', 'suggestion_click'
  )
);

COMMENT ON COLUMN user_events.event_type IS 'イベントタイプ。ai_request/ai_response は AI 生成リクエスト追跡、suggestion_shown/suggestion_click はオートフィルボタン追跡。';
