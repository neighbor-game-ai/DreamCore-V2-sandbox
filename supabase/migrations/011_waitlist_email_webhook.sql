-- ウェイトリストメール通知用 Database Webhook
-- user_access テーブルの INSERT/UPDATE 時に Edge Function を呼び出す
--
-- 方式: supabase_functions.http_request（Supabase標準のDatabase Webhook関数）

-- 既存のトリガーを削除（存在する場合）
DROP TRIGGER IF EXISTS waitlist_email_insert_trigger ON public.user_access;
DROP TRIGGER IF EXISTS waitlist_email_update_trigger ON public.user_access;

-- 古いトリガー関数を削除（pg_net ベースの実装から移行）
DROP FUNCTION IF EXISTS public.trigger_waitlist_email_insert();
DROP FUNCTION IF EXISTS public.trigger_waitlist_email_update();

-- INSERT 用 Database Webhook トリガー
-- supabase_functions.http_request は自動的にペイロードを生成:
-- { type: 'INSERT', table: 'user_access', schema: 'public', record: {...}, old_record: null }
CREATE TRIGGER waitlist_email_insert_trigger
  AFTER INSERT ON public.user_access
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://tcynrijrovktirsvwiqb.supabase.co/functions/v1/waitlist-email',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTAyNjk5MCwiZXhwIjoyMDg0NjAyOTkwfQ.ayxOHlTtxqAsYAiMXR7BTPyY4e_nP2G8aLWL1cnKkV4"}',
    '{}',
    '5000'
  );

-- UPDATE 用 Database Webhook トリガー
-- ペイロード: { type: 'UPDATE', table: 'user_access', schema: 'public', record: {...}, old_record: {...} }
CREATE TRIGGER waitlist_email_update_trigger
  AFTER UPDATE ON public.user_access
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://tcynrijrovktirsvwiqb.supabase.co/functions/v1/waitlist-email',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTAyNjk5MCwiZXhwIjoyMDg0NjAyOTkwfQ.ayxOHlTtxqAsYAiMXR7BTPyY4e_nP2G8aLWL1cnKkV4"}',
    '{}',
    '5000'
  );

COMMENT ON TRIGGER waitlist_email_insert_trigger ON public.user_access IS 'ウェイトリスト登録時にウェルカムメールを送信';
COMMENT ON TRIGGER waitlist_email_update_trigger ON public.user_access IS 'ウェイトリスト承認時に承認メールを送信';
