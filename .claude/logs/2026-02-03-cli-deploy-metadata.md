# CLI Deploy メタデータ拡張

**日付:** 2026-02-03
**作業者:** Claude

## 実施内容

CLI Deploy の公開機能を Web 公開と同等に拡張。

### 追加フィールド

| フィールド | 型 | 制約 |
|-----------|-----|------|
| `howToPlay` | string | 1000字以内 |
| `tags` | string[] | 最大5個、各20字以内 |
| `visibility` | string | `"public"` or `"unlisted"` |
| `allowRemix` | boolean | strict boolean (undefined のみ default) |
| `thumbnail_url` | string | WebP変換後のURL |

### 変更ファイル一覧

| ファイル | 変更内容 |
|---------|----------|
| `cli-deploy/server/upload.js` | parseDreamcoreJson v2、extractThumbnail 追加 |
| `cli-deploy/server/routes.js` | サムネイル処理、新フィールド保存 |
| `.claude/skills/dreamcore-deploy/SKILL.md` | デプロイスキル新規作成 |
| `docs/CLI-ARCHITECTURE.md` | v2 仕様ドキュメント |

### DB マイグレーション（Supabase B）

```sql
ALTER TABLE cli_published_games
ADD COLUMN IF NOT EXISTS how_to_play TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public',
ADD COLUMN IF NOT EXISTS allow_remix BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
```

## 技術的判断

### allowRemix バリデーション

- 問題: `"false"` 文字列が truthy になる
- 対応: strict boolean 検証、`undefined` のみ `true` にデフォルト
- 文字列 `"false"` はエラーを返す

### サムネイル処理

- ZIP から抽出時にパス正規化（Zip Slip 対策）
- 1MB サイズ上限
- sharp で WebP 変換、失敗時は元形式を使用

### visibility フィルター

- CLI ゲームは Discover 一覧に含まれない
- `unlisted` は URL 直接アクセスのみ可能
- 既存の動作で問題なし

## デプロイ

- コミット: `a987170`
- GCE デプロイ: 完了
- PM2 ステータス: online
