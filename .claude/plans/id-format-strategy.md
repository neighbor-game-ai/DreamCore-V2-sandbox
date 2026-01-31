# ID 規格戦略

**作成日:** 2026-01-31
**ステータス:** ✅ 完了
**目標規模:** 100万ユーザー以上

## 方針

**既存テーブルを含め、可能な限り UUID v7 に統一する。**

users.id のみ Supabase Auth の制約で UUID v4 固定。それ以外はすべて UUID v7 に移行。

## 変更対象

| テーブル | 現在 | 変更後 | 備考 |
|----------|------|--------|------|
| users.id | UUID v4 | **UUID v4（変更不可）** | auth.users への FK |
| projects.id | UUID v4 | **UUID v7** | 移行対象 |
| games.id | UUID v4 | **UUID v7** | 移行対象 |
| assets.id | UUID v4 | **UUID v7** | 移行対象 |
| jobs.id | UUID v4 | **UUID v7** | 移行対象 |
| chat_history.id | UUID v4 | **UUID v7** | 移行対象 |
| activity_log.id | UUID v4 | **UUID v7** | 移行対象 |
| published_games.id | UUID v4 | **UUID v7** | 移行対象 |
| project_assets.id | UUID v4 | **UUID v7** | 移行対象 |
| usage_quotas.id | UUID v4 | **UUID v7** | 移行対象 |
| subscriptions.id | UUID v4 | **UUID v7** | 移行対象 |

## 移行手順

### Step 1: pg_uuidv7 拡張を有効化

```sql
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
```

### Step 2: デフォルト値を UUID v7 に変更

各テーブルの `id` カラムのデフォルト値を変更:

```sql
-- projects
ALTER TABLE projects
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- games
ALTER TABLE games
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- assets
ALTER TABLE assets
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- jobs
ALTER TABLE jobs
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- chat_history
ALTER TABLE chat_history
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- activity_log
ALTER TABLE activity_log
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- published_games
ALTER TABLE published_games
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- project_assets
ALTER TABLE project_assets
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- usage_quotas
ALTER TABLE usage_quotas
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- subscriptions
ALTER TABLE subscriptions
ALTER COLUMN id SET DEFAULT uuid_generate_v7();
```

### Step 3: 既存データの ID 更新（オプション）

既存データを UUID v7 に変換するかどうか:

| 選択肢 | メリット | デメリット |
|--------|----------|------------|
| **A: 変換しない** | 作業簡単、リスクなし | 古いデータは UUID v4 のまま |
| **B: 変換する** | 完全な一貫性 | FK 更新が複雑、リスクあり |

**推奨: A（変換しない）**

理由:
- 既存データは少量（数百件）
- FK の連鎖更新が複雑
- 古い UUID v4 が混在しても実害なし
- 新規データから UUID v7 になれば十分

### Step 4: 新規テーブル設計

今後作成するテーブルはすべて UUID v7:

```sql
-- 例: comments テーブル
CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  published_game_id uuid NOT NULL REFERENCES published_games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 例: reactions テーブル
CREATE TABLE reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  published_game_id uuid NOT NULL REFERENCES published_games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(published_game_id, user_id, emoji)
);

-- 例: footprints テーブル
CREATE TABLE footprints (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  published_game_id uuid NOT NULL REFERENCES published_games(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),  -- NULL = 匿名訪問
  session_id text,  -- 匿名ユーザー識別用
  created_at timestamptz DEFAULT now()
);

-- 例: notifications テーブル
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

## マイグレーションファイル

### 012_uuid_v7_migration.sql

```sql
-- UUID v7 拡張を有効化
CREATE EXTENSION IF NOT EXISTS pg_uuidv7;

-- 既存テーブルのデフォルト値を UUID v7 に変更
-- 注: 既存データの ID は変更しない（新規挿入から UUID v7）

ALTER TABLE projects
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE games
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE assets
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE jobs
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE chat_history
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE activity_log
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE published_games
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE project_assets
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE usage_quotas
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE subscriptions
ALTER COLUMN id SET DEFAULT uuid_generate_v7();

-- 確認用コメント
COMMENT ON EXTENSION pg_uuidv7 IS 'UUID v7 generator for time-ordered UUIDs (100万ユーザー規模対応)';
```

## 確認事項

### Supabase で pg_uuidv7 が使えるか

確認方法:
```sql
SELECT * FROM pg_available_extensions WHERE name = 'pg_uuidv7';
```

もし利用不可の場合の代替:
```sql
-- PL/pgSQL で UUID v7 を生成する関数を作成
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;
```

## スケジュール

| Step | 作業 | 所要時間 |
|------|------|----------|
| 1 | pg_uuidv7 拡張確認・有効化 | 5分 |
| 2 | マイグレーション実行 | 5分 |
| 3 | 動作確認（INSERT テスト） | 10分 |
| 4 | ドキュメント更新 | 10分 |

**合計: 約30分**

## 期待効果

### 100万ユーザー規模での効果

| 指標 | UUID v4 | UUID v7 |
|------|---------|---------|
| INSERT 性能 | ページ分割頻発 | 末尾追記で高速 |
| インデックスサイズ | 断片化で肥大 | コンパクト |
| 範囲クエリ | 時間順不可 | 時間順で効率的 |

### 特に効果が大きいテーブル

1. **footprints**: 1ユーザー × 10ゲーム × 10回 = 1億行/100万ユーザー
2. **notifications**: 1ユーザー × 100通知 = 1億行/100万ユーザー
3. **reactions**: 1ゲーム × 1000リアクション × 10万ゲーム = 1億行

## 次のアクション

1. [ ] Supabase で pg_uuidv7 拡張が使えるか確認
2. [ ] マイグレーション 012_uuid_v7_migration.sql を実行
3. [ ] INSERT テストで UUID v7 生成を確認
4. [ ] CLAUDE.md にID規格ルールを追記

## 注意事項

- **users.id は変更不可**（Supabase Auth 管理）
- 既存データの ID は変換しない（新規挿入から UUID v7）
- PostgreSQL 18 リリース後は `uuidv7()` ネイティブ関数に移行可能

---

# Part 2: 公開 URL 用 public_id

## 概要

内部 ID は UUID（v7/v4）のまま、公開 URL 用に短い `public_id` を追加する。

### 使い分け

| 用途 | ID |
|------|-----|
| 内部（DB、FK、API内部） | UUID |
| 外部 URL | public_id |

### URL 例

```
play.dreamcore.gg/g/7F2cK9wP      ← 公開ゲーム
v2.dreamcore.gg/u/Lk29Bv3Q        ← ユーザープロフィール
v2.dreamcore.gg/p/X3m9aQ1Z        ← プロジェクト共有
```

## 対象テーブル

| テーブル | 用途 | prefix |
|----------|------|--------|
| published_games | 公開ゲーム URL | `g_` |
| users | ユーザー公開ページ | `u_` |
| projects | 共有・公開用 | `p_` |

※ `profiles` テーブルは削除済みのため、`users` テーブルに追加

## 仕様

### public_id 形式

```
{prefix}_{shortId}

例: g_7F2cK9wP
    u_Lk29Bv3Q
    p_X3m9aQ1Z
```

### 生成方法

- **nanoid** または **base62** エンコード
- 長さ: **10文字**（prefix 除く）
- 文字セット: `A-Za-z0-9`（URL セーフ）

### prefix ルール

| prefix | 対象 | 理由 |
|--------|------|------|
| `g_` | published_games | **g**ame |
| `u_` | users | **u**ser |
| `p_` | projects | **p**roject |

## マイグレーション

### 013_add_public_id.sql

```sql
-- published_games
ALTER TABLE published_games
ADD COLUMN IF NOT EXISTS public_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_published_games_public_id
ON published_games(public_id);

-- users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS public_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id
ON users(public_id);

-- projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS public_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_public_id
ON projects(public_id);

-- コメント
COMMENT ON COLUMN published_games.public_id IS '公開URL用短縮ID (g_xxxxxxxxxx)';
COMMENT ON COLUMN users.public_id IS 'ユーザー公開ページ用短縮ID (u_xxxxxxxxxx)';
COMMENT ON COLUMN projects.public_id IS 'プロジェクト共有用短縮ID (p_xxxxxxxxxx)';
```

## Backfill スクリプト

### scripts/backfill-public-ids.js

```javascript
const { createClient } = require('@supabase/supabase-js');
const { nanoid } = require('nanoid');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// カスタム文字セット（URL セーフ）
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateId = () => nanoid(10, alphabet);

async function backfillTable(tableName, prefix) {
  console.log(`[Backfill] Starting ${tableName}...`);

  // NULL の行を取得
  const { data: rows, error } = await supabase
    .from(tableName)
    .select('id')
    .is('public_id', null);

  if (error) {
    console.error(`[Backfill] Error fetching ${tableName}:`, error);
    return;
  }

  console.log(`[Backfill] Found ${rows.length} rows to update`);

  for (const row of rows) {
    let attempts = 0;
    let success = false;

    while (!success && attempts < 5) {
      const publicId = `${prefix}_${generateId()}`;

      const { error: updateError } = await supabase
        .from(tableName)
        .update({ public_id: publicId })
        .eq('id', row.id);

      if (!updateError) {
        success = true;
        console.log(`[Backfill] ${tableName} ${row.id} → ${publicId}`);
      } else if (updateError.code === '23505') {
        // 重複エラー、再試行
        attempts++;
        console.log(`[Backfill] Collision, retrying...`);
      } else {
        console.error(`[Backfill] Error:`, updateError);
        break;
      }
    }
  }

  console.log(`[Backfill] Completed ${tableName}`);
}

async function main() {
  await backfillTable('published_games', 'g');
  await backfillTable('users', 'u');
  await backfillTable('projects', 'p');

  console.log('[Backfill] All done!');
}

main().catch(console.error);
```

### Backfill 後の NOT NULL 追加

```sql
-- 全データに public_id が入った後に実行
ALTER TABLE published_games ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN public_id SET NOT NULL;
```

## API / ルーティング変更

### 後方互換を維持

UUID と public_id の両方をサポート:

```javascript
// server/index.js - /g/:id ルート
app.get('/g/:id/*', async (req, res) => {
  const { id } = req.params;

  let game;

  // UUID 形式かどうか判定
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (isUUID) {
    // UUID で検索
    game = await db.getPublishedGameById(id);
  } else {
    // public_id で検索
    game = await db.getPublishedGameByPublicId(id);
  }

  if (!game) {
    return res.status(404).send('Game not found');
  }

  // ... 以降の処理
});
```

### database-supabase.js に追加

```javascript
async getPublishedGameByPublicId(publicId) {
  const { data, error } = await supabaseAdmin
    .from('published_games')
    .select('*')
    .eq('public_id', publicId)
    .single();

  if (error) return null;
  return data;
}

async getUserByPublicId(publicId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('public_id', publicId)
    .single();

  if (error) return null;
  return data;
}

async getProjectByPublicId(publicId) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('public_id', publicId)
    .single();

  if (error) return null;
  return data;
}
```

## 新規作成時の public_id 生成

### server/publicIdGenerator.js

```javascript
const { nanoid, customAlphabet } = require('nanoid');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(alphabet, 10);

function generatePublicId(prefix) {
  return `${prefix}_${generate()}`;
}

module.exports = {
  generateGamePublicId: () => generatePublicId('g'),
  generateUserPublicId: () => generatePublicId('u'),
  generateProjectPublicId: () => generatePublicId('p'),
};
```

### 使用例（プロジェクト作成時）

```javascript
const { generateProjectPublicId } = require('./publicIdGenerator');

async function createProject(userId, name, gameType) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      name,
      game_type: gameType,
      public_id: generateProjectPublicId(),  // p_xxxxxxxxxx
    })
    .select()
    .single();

  return data;
}
```

## 全体スケジュール

| Step | 作業 | 所要時間 |
|------|------|----------|
| 1 | pg_uuidv7 拡張確認・有効化 | 5分 |
| 2 | UUID v7 マイグレーション実行 | 5分 |
| 3 | public_id カラム追加マイグレーション | 5分 |
| 4 | Backfill スクリプト実行 | 10分 |
| 5 | NOT NULL 制約追加 | 5分 |
| 6 | API ルーティング更新 | 30分 |
| 7 | 動作確認 | 15分 |
| 8 | ドキュメント更新 | 10分 |

**合計: 約1.5時間**

## 完了項目

1. [x] Supabase で pg_uuidv7 拡張が使えるか確認 → 使えない、代替関数を作成
2. [x] uuid_generate_v7() 関数を作成・デプロイ
3. [x] 全テーブルのデフォルトを UUID v7 に変更
4. [x] public_id カラム追加（published_games, users, projects）
5. [x] generate_public_id() 関数を作成
6. [x] 既存データをバックフィル（100件完了）
7. [x] NOT NULL 制約追加
8. [x] デフォルト値設定（新規作成時に自動生成）
9. [x] API ルーティング更新（UUID / public_id 両対応）
10. [x] CLAUDE.md に ID 規格ルールを追記
11. [x] マイグレーションファイル作成（012, 013）

## 追加実装（2026-01-31）

| 項目 | 状態 |
|------|------|
| `/u/:id` ルーティング | ✅ UUID / public_id 両対応 |
| `/p/:id` ルーティング | ✅ UUID / public_id 両対応 |
| `/zap/:id` ルーティング | ✅ UUID / public_id 両対応 |
| `/api/users/:id/public` API | ✅ 公開プロフィール取得 |
| `user.html` ページ | ✅ 新規作成 |
| フロントで共有 URL を public_id に切り替え | ✅ app.js 更新 |
| UI に public_id 表示 | ✅ user.html で表示 |

### 追加した DB 関数

- `getUserByPublicId(publicId)` - ユーザーを public_id で取得
- `getProjectByPublicId(publicId)` - プロジェクトを public_id で取得（公開ゲームのみ）

## 設計メモ

- `auth.users.id` は Supabase 仕様で UUID v4 固定（変更不可、問題なし）
- `public_id` は**公開 URL 専用**に徹する（内部処理は常に UUID）
