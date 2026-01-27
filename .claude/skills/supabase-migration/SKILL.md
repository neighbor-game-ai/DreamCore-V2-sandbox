---
name: supabase-migration
description: Supabase マイグレーションの手順を案内するスキル。DreamCore-V2 と同一の Supabase プロジェクトを使用するため、マイグレーションは V2 で実行済みのものを参照します。
---

# Supabase Migration Skill

Supabase マイグレーションの手順を案内するスキル。

## トリガー

以下のような依頼で実行:
- 「マイグレーション作成して」
- 「DBスキーマ変更」
- 「テーブル追加して」
- 「Supabaseのスキーマを確認」

## 重要な前提

**DreamCore-V2-sandbox は DreamCore-V2 と同一の Supabase プロジェクトを使用します。**

- マイグレーションは DreamCore-V2 で管理
- DreamCore-V2-sandbox でマイグレーションを実行しない
- スキーマ変更が必要な場合は DreamCore-V2 で作業

## Supabase プロジェクト情報

| 項目 | 値 |
|------|-----|
| Project URL | `https://tcynrijrovktirsvwiqb.supabase.co` |
| Dashboard | Supabase Dashboard からアクセス |
| スキーマドキュメント | `.claude/docs/database-schema.md` |

## 現在のテーブル構成

### projects
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users)
- `name` (TEXT)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### assets
- `id` (UUID, PK)
- `owner_id` (UUID, FK → auth.users)
- `filename` (TEXT)
- `path` (TEXT)
- `is_deleted` (BOOLEAN, default false)
- `created_at` (TIMESTAMP)

### RLS ポリシー
- `projects`: owner のみ CRUD 可能
- `assets`: owner のみ CRUD 可能、`is_deleted = false` のみ SELECT 可能

## スキーマ変更が必要な場合

### 1. DreamCore-V2 で作業

```bash
cd /Users/admin/DreamCore-V2
```

### 2. マイグレーションファイル作成

```sql
-- migrations/YYYYMMDD_description.sql

-- Up
ALTER TABLE ... ;

-- Down (ロールバック用)
-- ALTER TABLE ... ;
```

### 3. Supabase Dashboard で実行

1. Supabase Dashboard にログイン
2. SQL Editor を開く
3. マイグレーション SQL を実行
4. 結果を確認

### 4. スキーマドキュメント更新

`.claude/docs/database-schema.md` を更新

## ローンチ前ポリシー

現在はローンチ前のため:

- **既存データは破棄可能**: マイグレーションで古いデータ・テーブルを削除してOK
- **互換性不要**: 過去のスキーマとの互換性は維持しない
- **技術的負債の除去**: 不要な構造は積極的に DROP

**ローンチ後は変更**: 本番データができたら安全版マイグレーションに切り替え

## RLS ポリシーの確認

```sql
-- ポリシー一覧
SELECT * FROM pg_policies WHERE tablename IN ('projects', 'assets');

-- テスト（特定ユーザーとして）
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO 'user-uuid-here';
SELECT * FROM projects;
```

## よくある操作

### カラム追加

```sql
ALTER TABLE projects ADD COLUMN description TEXT;
```

### インデックス追加

```sql
CREATE INDEX idx_projects_user_id ON projects(user_id);
```

### RLS ポリシー追加

```sql
CREATE POLICY "Users can view own projects"
ON projects FOR SELECT
USING (user_id = auth.uid());
```

## 注意事項

- マイグレーションは DreamCore-V2 リポジトリで管理
- DreamCore-V2-sandbox では Supabase への直接変更を行わない
- スキーマ変更後は両方のリポジトリでテストを実行
- RLS ポリシーの変更は特に慎重に（セキュリティに直結）
