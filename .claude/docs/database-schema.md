# DreamCore V2 データベーススキーマ設計

**最終更新:** 2026-01-23

## 概要

DreamCore V2 は Supabase (PostgreSQL) をバックエンドに使用し、Row Level Security (RLS) によるマルチテナント分離を実現している。

## ER図（簡易版）

```
auth.users (Supabase管理)
    │
    ▼ (trigger: on_auth_user_created)
┌─────────┐
│  users  │ ←───────────────────────────────────────┐
└────┬────┘                                         │
     │ 1:N                                          │
     ├──────────────┬──────────────┬────────────────┤
     ▼              ▼              ▼                ▼
┌──────────┐   ┌────────┐    ┌───────┐    ┌─────────────┐
│ projects │   │ assets │    │ jobs  │    │activity_log │
└────┬─────┘   └───┬────┘    └───────┘    └─────────────┘
     │             │
     │ 1:N         │
     ├─────────────┼──────────────┐
     ▼             │              ▼
┌──────────────┐   │     ┌────────────────┐
│ chat_history │   │     │ publish_drafts │
└──────────────┘   │     └────────────────┘
                   │
     ┌─────────────┘
     ▼
┌────────────────┐ (junction)
│ project_assets │
└────────────────┘

┌───────┐
│ games │ ← Phase 2 用（公開済みゲーム）
└───────┘
```

---

## テーブル詳細

### 1. users

**目的:** Supabase Auth のユーザー情報をアプリ側で参照可能にする

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | `auth.users.id` と同一 |
| public_id | TEXT NOT NULL | 公開ページ用短縮ID (`u_xxxxxxxxxx`) |
| email | TEXT NOT NULL | Google OAuth から取得 |
| display_name | TEXT | 表示名（OAuth の `full_name` or `name`） |
| avatar_url | TEXT | プロフィール画像URL (R2 CDN) |
| bio | TEXT | 自己紹介（最大160文字、TikTok/X参考） |
| social_links | JSONB | SNSリンク（x, youtube, github, tiktok, instagram, custom） |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | 自動更新（トリガー） |

**social_links 構造:**
```json
{
  "x": "https://x.com/username",
  "youtube": "https://youtube.com/@channel",
  "github": "https://github.com/username",
  "tiktok": "https://tiktok.com/@username",
  "instagram": "https://instagram.com/username",
  "custom": [
    { "label": "Blog", "url": "https://example.com" }
  ]
}
```

**設計理由:**
- `auth.users` は Supabase 管理下で直接クエリしづらい
- `handle_new_user()` トリガーで自動作成されるため、アプリコードで INSERT 不要
- `email NOT NULL` は Google OAuth 必須のため保証される
- `bio` は 160 文字以内（TikTok/X 参考、モバイル2行に収まる）
- `social_links` は JSONB で object 型のみ許可（CHECK制約）

**RLS:** 自分のデータのみ SELECT/UPDATE 可能

---

### 2. projects

**目的:** ゲームプロジェクトのメタデータを管理

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| user_id | UUID (FK→users) | 所有者 |
| name | TEXT | プロジェクト名（デフォルト: "New Game"） |
| is_public | BOOLEAN NOT NULL | Phase 2 で使用予定（デフォルト: FALSE） |
| remixed_from | UUID (FK→projects) | リミックス元（Phase 2） |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | 自動更新（トリガー） |

**設計理由:**
- `is_public` は Phase 1 では未使用（全て owner-only）
- `remixed_from` は自己参照FK（リミックス機能の準備）
- 実際のゲームコード（HTML/CSS/JS）はファイルシステム（`/games/{projectId}/`）に保存

**RLS:** 自分のプロジェクトのみ CRUD 可能

**インデックス:**
- `idx_projects_user_id` - ユーザー別一覧取得
- `idx_projects_is_public` - Phase 2 公開ゲーム検索用
- `idx_projects_user_updated` - 更新日降順ソート
- `idx_projects_remixed_from` - リミックス元検索（FK参照）

---

### 3. assets

**目的:** ユーザーがアップロードしたファイル（画像・音声等）を管理

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| owner_id | UUID (FK→users) | 所有者 |
| filename | TEXT | 保存時ファイル名 |
| original_name | TEXT | アップロード時の元ファイル名 |
| storage_path | TEXT | ファイルシステム上のパス |
| mime_type | TEXT | Content-Type |
| size | BIGINT | ファイルサイズ (bytes)、2GB超対応 |
| is_public | BOOLEAN NOT NULL | Phase 2 で使用予定（デフォルト: FALSE） |
| is_deleted | BOOLEAN NOT NULL | ソフトデリートフラグ（デフォルト: FALSE） |
| available_from | TIMESTAMPTZ | 公開開始日（予約公開） |
| available_until | TIMESTAMPTZ | 公開終了日 |
| tags | TEXT | 検索用タグ（JSON or CSV） |
| description | TEXT | 説明 |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | 自動更新（トリガー） |

**設計理由:**
- **ソフトデリート (`is_deleted`)**: 復元可能性、監査対応、参照整合性維持のため
- `storage_path` は Supabase Storage ではなくローカルFS（Phase 1）
- `available_from/until` は将来の予約公開機能用

**RLS:**
- SELECT: `owner_id = auth.uid() AND is_deleted = FALSE`
- その他: `owner_id = auth.uid()`

**重要:** ソフトデリート後はRLSにより見えなくなる（これは仕様）

**インデックス:**
- `idx_assets_owner_id` - 所有者別一覧
- `idx_assets_is_public` - Phase 2 公開アセット検索
- `idx_assets_is_deleted` - 削除フラグフィルタ
- `idx_assets_owner_active` - 部分インデックス（アクティブなアセットのみ）

---

### 4. project_assets（ジャンクションテーブル）

**目的:** プロジェクトとアセットの多対多関係を管理

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| project_id | UUID (FK→projects) | |
| asset_id | UUID (FK→assets) | |
| usage_type | TEXT | 用途（image, sound 等） |
| added_at | TIMESTAMPTZ | |

**設計理由:**
- 1つのアセットを複数プロジェクトで使い回し可能
- `usage_type` で画像/音声などの用途を区別
- `UNIQUE(project_id, asset_id)` で重複登録を防止

**RLS:** プロジェクト所有者のみ操作可能（サブクエリで確認）

---

### 5. chat_history

**目的:** AI とのチャット履歴を保存

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| project_id | UUID (FK→projects) | |
| role | TEXT | 'user', 'assistant', 'system' |
| message | TEXT | メッセージ本文 |
| created_at | TIMESTAMPTZ | |

**設計理由:**
- プロジェクト単位で履歴を保持
- `role` は OpenAI API 互換フォーマット
- プロジェクト削除時に CASCADE で自動削除

**RLS:** プロジェクト所有者のみ SELECT/INSERT/DELETE 可能

---

### 6. jobs

**目的:** 非同期ジョブ（AI生成等）のキューと進捗管理

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| user_id | UUID (FK→users) | ジョブ所有者 |
| project_id | UUID (FK→projects) | 対象プロジェクト |
| status | TEXT | pending/processing/completed/failed/cancelled |
| progress | INTEGER | 進捗率（0-100） |
| progress_message | TEXT | 進捗メッセージ（UI表示用） |
| result | TEXT | 完了時の結果（JSON等） |
| error | TEXT | 失敗時のエラー内容 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**設計理由:**
- `user_id` と `project_id` の両方を持つ
  - `user_id`: ジョブの所有権（RLS用）
  - `project_id`: 対象プロジェクト（参照用）
- `progress_message` でリアルタイム進捗をユーザーに表示

**RLS:** 自分のジョブのみ CRUD 可能

**インデックス:**
- `idx_jobs_user_id` - ユーザー別一覧
- `idx_jobs_project_id` - プロジェクト別一覧（FK参照）
- `idx_jobs_status` - ステータス別絞り込み
- `idx_jobs_user_status` - 複合（自分の pending ジョブ等）

---

### 7. publish_drafts

**目的:** 公開設定の下書きを保存（Phase 2 準備）

| カラム | 型 | 説明 |
|--------|-----|------|
| project_id | UUID (PK, FK→projects) | 1:1 関係 |
| title | TEXT | 公開時タイトル |
| description | TEXT | 説明文 |
| how_to_play | TEXT | 遊び方 |
| tags | TEXT | タグ |
| visibility | TEXT | public/unlisted/private |
| remix | TEXT | allowed/disallow |
| thumbnail_url | TEXT | サムネイルURL |
| updated_at | TIMESTAMPTZ | |

**設計理由:**
- `projects` と 1:1 関係（`project_id` が PK かつ FK）
- 公開前に下書き保存し、公開時に `games` テーブルへ反映予定
- Phase 1 では UI 非表示だがスキーマは用意

**RLS:** プロジェクト所有者のみ CRUD 可能

---

### 8. activity_log

**目的:** ユーザーアクションの監査ログ

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| user_id | UUID (FK→users, SET NULL) | |
| action | TEXT | アクション種別 |
| target_type | TEXT | 対象の種類（project, asset 等） |
| target_id | TEXT | 対象のID |
| details | TEXT | 詳細情報（JSON） |
| created_at | TIMESTAMPTZ | |

**設計理由:**
- `ON DELETE SET NULL` でユーザー削除後もログは残す
- 将来の分析・トラブルシューティング用

**RLS:** 自分のログのみ参照可能

---

### 9. games（Phase 2 用）

**目的:** 公開済みゲームのメタデータ

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | |
| project_id | UUID (FK→projects, SET NULL) | 元プロジェクト |
| user_id | UUID (FK→users) | 公開者 |
| title | TEXT | 公開タイトル |
| description | TEXT | 説明 |
| game_url | TEXT | 公開URL |
| thumbnail_url | TEXT | サムネイル |
| play_count | BIGINT NOT NULL | プレイ数（デフォルト: 0） |
| like_count | BIGINT NOT NULL | いいね数（デフォルト: 0） |
| visibility | TEXT NOT NULL | public/unlisted/private |
| created_at | TIMESTAMPTZ NOT NULL | |

**インデックス:**
- `idx_games_user_id` - ユーザー別ゲーム一覧
- `idx_games_project_id` - プロジェクト参照（FK）
- `idx_games_visibility` - 公開ゲーム検索
- `idx_games_created_at` - 新着順ソート

**設計理由:**
- `project_id ON DELETE SET NULL`: プロジェクト削除後も公開ゲームは残す
- `play_count`, `like_count` は denormalize（パフォーマンス）
- Phase 1 では owner-only RLS、Phase 2 で公開ポリシー追加予定

---

## RLS 設計原則

### Phase 1 方針

1. **認証必須**: 全ポリシーに `TO authenticated`
2. **所有者限定**: 他ユーザーのリソースは一切見えない
3. **存在非公開**: 他ユーザーのリソースへのアクセスは 404（403 ではない）
4. **ソフトデリート非表示**: `is_deleted = TRUE` は SELECT で除外

### RLS 最適化

```sql
-- 悪い例（行ごとに関数呼び出し）
USING (user_id = auth.uid())

-- 良い例（一度だけ評価）
USING (user_id = (SELECT auth.uid()))
```

### WITH CHECK の明示

```sql
-- UPDATE ポリシー
CREATE POLICY "example_update" ON table
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));  -- 明示することで更新後の値も検証
```

---

## インデックス戦略

### FK インデックス

外部キーには必ずインデックスを作成：
- `ON DELETE CASCADE` のパフォーマンス向上
- JOIN クエリの高速化

```sql
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_jobs_project_id ON jobs(project_id);
```

### 部分インデックス

頻繁にフィルタされる条件には部分インデックス：

```sql
CREATE INDEX idx_assets_owner_active ON assets(owner_id, created_at DESC)
  WHERE is_deleted = FALSE;
```

### 複合インデックス

よく使われるクエリパターン用：

```sql
-- ユーザーのステータス別ジョブ一覧
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);
```

---

## トリガー

### updated_at 自動更新

```sql
CREATE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

適用対象: users, projects, assets, jobs, publish_drafts

### ユーザー自動作成

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## マイグレーション履歴

| ファイル | 内容 |
|----------|------|
| `001_initial_schema.sql` | 初期スキーマ |
| `002_assets_is_deleted_not_null.sql` | assets.is_deleted NOT NULL 化 |
| `003_sync_schema.sql` | RLS最適化、TO authenticated、WITH CHECK追加、FKインデックス |
| `004_schema_improvements.sql` | NOT NULL追加、INTEGER→BIGINT、users.updated_at、gamesインデックス |

---

## Phase 2 への拡張ポイント

1. **games テーブル RLS 変更**: `visibility = 'public'` で誰でも閲覧可能に
2. **projects.is_public 活用**: 公開プロジェクトの検索
3. **assets.is_public 活用**: 公開アセットの共有
4. **profiles テーブル削除**: レガシー、未使用

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト全体ルール |
| `supabase/schema.sql` | リファレンススキーマ |
| `supabase/migrations/` | マイグレーションファイル |
| `.claude/plans/auth-migration.md` | 認証移行詳細 |

---

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-01-23 | 初版作成（Phase 1完了時点のスキーマを文書化） |
| 2026-01-23 | 004_schema_improvements.sql追加（PostgreSQLベストプラクティス対応） |
| 2026-02-03 | users テーブルに bio, social_links, public_id 追加（プロフィール機能） |

<!--
更新時の記載ルール:
- 日付と変更概要を1行で追加
- 詳細な差分はGit履歴を参照
- マイグレーション適用時は対応するマイグレーション番号も記載
  例: 2026-02-01 | games テーブル公開ポリシー追加（005_games_public.sql）
-->
