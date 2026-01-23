-- =============================================
-- Migration 004: Schema Improvements (Clean版)
-- =============================================
-- PostgreSQL Table Design ベストプラクティス対応
-- 前提: ローンチ前、既存データは破棄可能
-- =============================================

-- =============================================
-- 0. 不要テーブル削除（技術的負債の除去）
-- =============================================
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =============================================
-- 1. NOT NULL 制約追加
-- =============================================

-- projects
UPDATE public.projects SET is_public = FALSE WHERE is_public IS NULL;
UPDATE public.projects SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.projects SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.projects ALTER COLUMN is_public SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN updated_at SET NOT NULL;

-- assets
UPDATE public.assets SET is_public = FALSE WHERE is_public IS NULL;
UPDATE public.assets SET is_deleted = FALSE WHERE is_deleted IS NULL;
UPDATE public.assets SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.assets SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.assets ALTER COLUMN is_public SET NOT NULL;
ALTER TABLE public.assets ALTER COLUMN is_deleted SET NOT NULL;
ALTER TABLE public.assets ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.assets ALTER COLUMN updated_at SET NOT NULL;

-- games
UPDATE public.games SET play_count = 0 WHERE play_count IS NULL;
UPDATE public.games SET like_count = 0 WHERE like_count IS NULL;
UPDATE public.games SET visibility = 'public' WHERE visibility IS NULL;
UPDATE public.games SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE public.games ALTER COLUMN play_count SET NOT NULL;
ALTER TABLE public.games ALTER COLUMN like_count SET NOT NULL;
ALTER TABLE public.games ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE public.games ALTER COLUMN created_at SET NOT NULL;

-- users
UPDATE public.users SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE public.users ALTER COLUMN created_at SET NOT NULL;

-- =============================================
-- 2. INTEGER → BIGINT
-- =============================================
ALTER TABLE public.assets ALTER COLUMN size TYPE BIGINT;
ALTER TABLE public.games ALTER COLUMN play_count TYPE BIGINT;
ALTER TABLE public.games ALTER COLUMN like_count TYPE BIGINT;

-- =============================================
-- 3. users.updated_at 追加
-- =============================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.users SET updated_at = COALESCE(created_at, NOW())
  WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 4. games FK インデックス追加
-- =============================================
CREATE INDEX IF NOT EXISTS idx_games_user_id ON public.games(user_id);
CREATE INDEX IF NOT EXISTS idx_games_project_id ON public.games(project_id);

-- =============================================
-- END OF MIGRATION
-- =============================================
