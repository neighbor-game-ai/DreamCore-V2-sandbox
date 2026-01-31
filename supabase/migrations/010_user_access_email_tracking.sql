-- メール送信追跡カラム追加
-- ウェイトリストメール通知プラグイン用
--
-- 二重送信防止のため、各メール送信後にタイムスタンプを記録

ALTER TABLE user_access
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN user_access.welcome_email_sent_at IS 'ウェルカムメール送信日時（二重送信防止）';
COMMENT ON COLUMN user_access.approved_email_sent_at IS '承認メール送信日時（二重送信防止）';
