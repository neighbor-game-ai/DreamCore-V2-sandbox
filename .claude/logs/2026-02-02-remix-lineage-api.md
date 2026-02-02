# 2026-02-02: Remix機能 + 系譜API 実装

## 概要

公開ゲームをリミックス（コピー）する機能と、リミックスの系譜（先祖・子孫のツリー）を追跡するAPIを実装。

## 実装内容

### 新規エンドポイント

| エンドポイント | 認証 | 説明 |
|---------------|------|------|
| `POST /api/games/:gameId/remix` | 必須 | 公開ゲームをリミックス |
| `GET /api/games/:gameId/lineage` | 不要 | 系譜情報を取得 |

### 新規ファイル

| ファイル | 説明 |
|----------|------|
| `server/remixService.js` | Remix API + 系譜 API |
| `supabase/migrations/014_count_all_remixes_rpc.sql` | RPC 関数 |

### server/index.js の変更

1. `remixService` の require 追加
2. `ALLOWED_ORIGINS` 定義をレート制限より前に移動
3. Lineage CORS ミドルウェア追加（GET/OPTIONS対応）
4. `remixService.setupRoutes(app)` 追加

## 設計方針（itch.io/Roblox モデル）

| 項目 | 仕様 |
|------|------|
| 系譜に表示するゲーム | `visibility='public'` のみ |
| 非公開ノードの扱い | 伏せて繋げる（表示はスキップ） |
| 非公開ルート | UUID/名前を隠す（`projectId: null`） |
| 先祖の深さ | 無制限（1本線） |
| 子孫の深さ | maxDepth=10（分岐リスク対策） |
| CORS | ALLOWED_ORIGINS のみ（* 不使用） |
| Remix API | レート制限あり |

## セキュリティ考慮事項

| 項目 | 対策 |
|------|------|
| 非公開ルートのUUID | 隠す（`projectId: null`） |
| 非公開ルートの名前 | 隠す（`name: '(非公開)'`） |
| N+1クエリ | バッチ取得で最適化 |
| totalRemixes | RPC/CTE + `totalRemixesExact` フラグ |
| count_all_remixes RPC | サーバー専用（REVOKE anon/authenticated） |

## Supabase マイグレーション

```sql
CREATE OR REPLACE FUNCTION count_all_remixes(root_project_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE descendants AS (
    SELECT id FROM projects WHERE remixed_from = root_project_id
    UNION ALL
    SELECT p.id FROM projects p
    INNER JOIN descendants d ON p.remixed_from = d.id
  )
  SELECT COUNT(*)::INTEGER FROM descendants;
$$;

REVOKE EXECUTE ON FUNCTION count_all_remixes(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION count_all_remixes(UUID) FROM authenticated;
```

## レスポンス例

### Lineage API

```json
{
  "actualRoot": {
    "projectId": "uuid",
    "name": "Original Game",
    "isPublic": true,
    "publishedGame": { ... }
  },
  "visibleAncestors": [...],
  "current": { ... },
  "descendants": [...],
  "stats": {
    "actualDepth": 3,
    "visibleDepth": 2,
    "visibleRemixes": 5,
    "totalRemixes": 8,
    "totalRemixesExact": true,
    "maxDepth": 10,
    "depthCapped": false
  }
}
```

## デプロイ

- コミット: `18d6c9f`
- GCE: デプロイ完了（PM2 restart）
- Supabase: RPC 関数実行完了

## テスト結果

| テスト | 結果 |
|--------|------|
| Invalid game ID | 400 `Invalid game ID format` |
| Non-existent game | 404 `Game not found` |
| Remix without auth | 401 `No access token provided` |
| Server startup | OK |

## 既知の制限事項

- 先祖の探索: 1ホップ=1クエリのため、極端に長い系譜（100世代以上）では遅延の可能性

## 将来の拡張

- 先祖を再帰CTEで1クエリ取得（パフォーマンス改善）
- ノード数制限の追加（必要に応じて）

## 変更ファイル一覧

- `server/remixService.js` (新規)
- `server/index.js` (変更)
- `supabase/migrations/014_count_all_remixes_rpc.sql` (新規)
- `docs/API-REFERENCE.md` (更新)
