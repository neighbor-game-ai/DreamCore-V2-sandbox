-- public_id: 公開 URL 用短縮 ID
-- 形式: {prefix}_{10文字base62} 例: g_7F2cK9wP1x

-- public_id 生成関数（nanoid 風）
CREATE OR REPLACE FUNCTION generate_public_id(prefix text)
RETURNS text AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, floor(random() * 62)::int + 1, 1);
  END LOOP;
  RETURN prefix || '_' || result;
END
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION generate_public_id(text) IS 'Generate nanoid-style public_id with prefix (e.g., g_Abc123XYZ0)';

-- published_games
ALTER TABLE published_games ADD COLUMN IF NOT EXISTS public_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_published_games_public_id ON published_games(public_id) WHERE public_id IS NOT NULL;
COMMENT ON COLUMN published_games.public_id IS '公開URL用短縮ID (g_xxxxxxxxxx)';

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id) WHERE public_id IS NOT NULL;
COMMENT ON COLUMN users.public_id IS 'ユーザー公開ページ用短縮ID (u_xxxxxxxxxx)';

-- projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS public_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_public_id ON projects(public_id) WHERE public_id IS NOT NULL;
COMMENT ON COLUMN projects.public_id IS 'プロジェクト共有用短縮ID (p_xxxxxxxxxx)';

-- 既存データをバックフィル
UPDATE published_games SET public_id = generate_public_id('g') WHERE public_id IS NULL;
UPDATE users SET public_id = generate_public_id('u') WHERE public_id IS NULL;
UPDATE projects SET public_id = generate_public_id('p') WHERE public_id IS NULL;

-- NOT NULL 制約追加
ALTER TABLE published_games ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN public_id SET NOT NULL;

-- 新規作成時のデフォルト値
ALTER TABLE published_games ALTER COLUMN public_id SET DEFAULT generate_public_id('g');
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT generate_public_id('u');
ALTER TABLE projects ALTER COLUMN public_id SET DEFAULT generate_public_id('p');
