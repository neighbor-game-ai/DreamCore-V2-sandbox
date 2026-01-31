# ID 規格戦略の実装

**日付:** 2026-01-31
**タスク:** 100万ユーザー規模対応 - UUID v7 + public_id 導入

---

## 実施内容

### 1. UUID v7 導入

Supabase に `pg_uuidv7` 拡張がないため、PL/pgSQL で代替関数を作成。

**作成した関数:**
```sql
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
```

**変更したテーブル（10テーブル）:**
- projects, games, assets, jobs, chat_history
- activity_log, published_games, project_assets
- usage_quotas, subscriptions

**注意:** `users.id` は Supabase Auth の FK のため UUID v4 固定（変更不可）

### 2. public_id 導入

公開 URL 用の短縮 ID を追加。

**対象テーブルと prefix:**

| テーブル | prefix | 例 |
|----------|--------|-----|
| published_games | `g_` | `g_I1ALNnr9bw` |
| users | `u_` | `u_Efm0EOGgxT` |
| projects | `p_` | `p_TvVuCNzM2k` |

**生成関数:**
```sql
CREATE OR REPLACE FUNCTION generate_public_id(prefix text) RETURNS text
```

**バックフィル:** 既存データ 100件（games: 5, users: 20, projects: 75）

### 3. API ルーティング更新

UUID と public_id の両方をサポート:

| エンドポイント | 対応 |
|---------------|------|
| `/g/:id/*` | ✅ UUID / public_id |
| `/api/published-games/:id` | ✅ UUID / public_id |
| `/api/published-games/:id/play` | ✅ UUID / public_id |

### 4. 公開 URL ルート追加

| ルート | 機能 |
|--------|------|
| `/u/:id` | ユーザープロフィール |
| `/p/:id` | プロジェクト共有（→ゲームにリダイレクト）|
| `/zap/:id` | ゲーム発見ページ（direct access）|
| `/api/users/:id/public` | 公開プロフィール API |

### 5. フロントエンド更新

`app.js` で共有 URL を `public_id` で生成するよう変更:

```javascript
// Before
const shareUrl = `${origin}/zap/${game.id}`;

// After
const gameId = game.public_id || game.id;
const shareUrl = `${origin}/zap/${gameId}`;
```

**変更箇所:**
- `shareCurrentGame()` - 共有 URL 生成
- `handleZappingRoute()` - URL からゲーム検索
- `enterZappingMode()` - URL 更新
- `updateZappingUrl()` - URL 更新

### 6. user.html 新規作成

公開ユーザープロフィールページ:
- アバター表示
- 表示名
- public_id 表示
- 参加日

---

## アクセス制御

| コンテキスト | visibility |
|-------------|-----------|
| discover / zap 一覧 | `public` のみ |
| direct URL | `public` + `unlisted` |
| API 個別取得 | `public` + `unlisted` |

---

## 変更ファイル一覧

### サーバー

| ファイル | 変更内容 |
|----------|----------|
| `server/database-supabase.js` | `getPublishedGameByPublicId`, `getUserByPublicId`, `getProjectByPublicId` 追加 |
| `server/index.js` | `/u/:id`, `/p/:id`, `/zap/:id`, `/api/users/:id/public` ルート追加 |

### フロントエンド

| ファイル | 変更内容 |
|----------|----------|
| `public/app.js` | 共有 URL を public_id で生成 |
| `public/user.html` | 新規作成（ユーザープロフィール）|

### マイグレーション

| ファイル | 内容 |
|----------|------|
| `supabase/migrations/012_uuid_v7_function_and_defaults.sql` | UUID v7 関数 + デフォルト変更 |
| `supabase/migrations/013_public_id.sql` | public_id カラム + バックフィル |

### ドキュメント

| ファイル | 変更内容 |
|----------|----------|
| `CLAUDE.md` | ID 規格セクション追加 |
| `.claude/plans/id-format-strategy.md` | 計画→完了に更新 |

---

## 技術的な学び

### 1. Supabase で pg_uuidv7 が使えない

代替として PL/pgSQL 関数を作成。PostgreSQL 18 リリース後は `uuidv7()` ネイティブ関数に移行可能。

### 2. UUID v7 の効果

| 指標 | UUID v4 | UUID v7 |
|------|---------|---------|
| INSERT | ページ分割頻発 | 末尾追記で高速 |
| インデックス | 断片化で肥大 | コンパクト |
| 範囲クエリ | 時間順不可 | 時間順で効率的 |

### 3. public_id の設計

- 内部 ID（UUID）と公開 ID（public_id）を分離
- URL は短く読みやすく、内部は効率的に
- prefix で種別を即座に識別（`g_`, `u_`, `p_`）

### 4. 既存データの扱い

- 既存 UUID v4 は変換せず維持
- public_id はバックフィルで全件付与
- 新規データから UUID v7 + public_id 自動生成

---

## 最終状態

| 項目 | 状態 |
|------|------|
| UUID v7 関数 | ✅ 作成済み |
| 10テーブルのデフォルト | ✅ UUID v7 に変更 |
| public_id カラム | ✅ 3テーブルに追加 |
| バックフィル | ✅ 100件完了 |
| API ルーティング | ✅ UUID / public_id 両対応 |
| 公開 URL ルート | ✅ `/u/`, `/p/`, `/zap/` |
| フロントエンド | ✅ 共有 URL を public_id で生成 |
| アクセス制御 | ✅ public / unlisted 適切に制御 |

---

## 今後の拡張案

1. **ユーザープロフィールページの充実** - 作成したゲーム一覧、いいね数など
2. **OGP 対応** - 共有時のサムネイル・説明文
3. **短縮 URL サービス** - `dreamcore.gg/g/xxx` のような更に短い URL
