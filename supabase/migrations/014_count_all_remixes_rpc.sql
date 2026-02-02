-- 014_count_all_remixes_rpc.sql
-- Remix 系譜機能用: プロジェクトの全子孫数を再帰CTEでカウント

-- count_all_remixes: 再帰CTEで全子孫をカウント
CREATE OR REPLACE FUNCTION count_all_remixes(root_project_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE descendants AS (
    -- 直接の子
    SELECT id FROM projects WHERE remixed_from = root_project_id
    UNION ALL
    -- 再帰的に子孫を取得
    SELECT p.id FROM projects p
    INNER JOIN descendants d ON p.remixed_from = d.id
  )
  SELECT COUNT(*)::INTEGER FROM descendants;
$$;

-- サーバー専用（supabaseAdmin経由でのみ呼び出し）
-- クライアントからの直接呼び出しは不可
REVOKE EXECUTE ON FUNCTION count_all_remixes(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION count_all_remixes(UUID) FROM authenticated;
