-- UUID v7 生成関数（pg_uuidv7 拡張の代替）
-- タイムスタンプベースで時間順ソート可能な UUID を生成
-- RFC 9562 準拠

CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  -- 現在時刻をミリ秒で取得（48ビット）
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);

  -- タイムスタンプ + ランダム 10 バイト
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);

  -- バージョン 7 を設定（バイト 6 の上位 4 ビット = 0111）
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);

  -- バリアント RFC 4122 を設定（バイト 8 の上位 2 ビット = 10）
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);

  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION uuid_generate_v7() IS 'RFC 9562 UUID v7 generator - time-ordered UUIDs for better index performance';

-- 既存テーブルのデフォルト値を UUID v7 に変更
-- 注: 既存データの ID は変更しない（新規挿入から UUID v7）
-- 注: users.id は auth.users への FK なので変更不可

ALTER TABLE projects ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE games ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE assets ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE jobs ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE chat_history ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE activity_log ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE published_games ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE project_assets ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE usage_quotas ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE subscriptions ALTER COLUMN id SET DEFAULT uuid_generate_v7();
