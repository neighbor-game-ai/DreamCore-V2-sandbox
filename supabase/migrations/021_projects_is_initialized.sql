-- 021_projects_is_initialized.sql
-- 目的: 2D/3D 判定の高速化のため is_initialized フラグを追加
-- ヒューリスティック判定（ファイル内容チェック）を廃止し、DBの明示フラグを唯一の真実とする

-- 1. projects.is_initialized カラム追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_initialized BOOLEAN DEFAULT FALSE;

-- 2. 既存プロジェクトを全て true にバックフィル
-- 理由: ヒューリスティック判定を避け、既存は全て初期化済みとみなす
UPDATE projects SET is_initialized = TRUE WHERE is_initialized = FALSE OR is_initialized IS NULL;

-- 3. chat_history(project_id, created_at) 複合インデックス追加
-- 理由: WHERE project_id + ORDER BY created_at DESC の性能向上
CREATE INDEX IF NOT EXISTS idx_chat_history_project_created
ON chat_history(project_id, created_at DESC);

-- 4. 古い単一カラムインデックス idx_chat_history_project_id は残す
-- 他のクエリ（project_id のみでの検索）で使用される可能性があるため
