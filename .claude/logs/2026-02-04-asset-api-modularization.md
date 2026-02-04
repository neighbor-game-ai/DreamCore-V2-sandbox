# 2026-02-04 Asset API モジュール化 (Phase 1)

## 概要

server/index.js (3,451行) からアセット関連のルートを抽出し、モジュール化した。
約540行を削除し、4つの新規ファイルに分割。

## 実施内容

### 1. 新規ファイル作成

| ファイル | 行数 | 内容 |
|----------|------|------|
| `server/middleware/uploads.js` | 72 | Multer アップロード設定（共有） |
| `server/middleware/assetChecks.js` | 59 | checkAssetOwnership, checkAssetAccess ミドルウェア |
| `server/routes/assetsApi.js` | 383 | `/api/assets/*` エンドポイント |
| `server/routes/assetsPublic.js` | 121 | `/user-assets/*`, `/global-assets/*` |

### 2. index.js の変更

- **削除**: 約 540 行
  - 重複した Multer 設定
  - checkAssetOwnership, checkAssetAccess 関数
  - /api/assets/* 全エンドポイント
  - /user-assets/*, /global-assets/* ルート
  - JSDOM/DOMPurify 初期化（routes/assetsApi.js に移動）
  - sanitizeSVG 関数
  - 未使用インポート (getUserAssetsPath, getGlobalAssetsPath)

- **追加**: 約 10 行
  - ルーターインポート
  - `app.use('/api/assets', assetsApiRouter)`
  - `app.use('/', assetsPublicRouter)`

- **更新**: thumbnail アップロードで `upload.thumbnail` を使用

### 3. 新しいファイル構成

```
server/
├── index.js              (約 540 行削減)
├── middleware/
│   ├── uploads.js        ← Multer 設定
│   └── assetChecks.js    ← アクセス制御
└── routes/
    ├── assetsApi.js      ← /api/assets/*
    └── assetsPublic.js   ← /user-assets/*, /global-assets/*
```

## テスト結果

### Unit Tests (test-assets-api.js)

```
SUMMARY: 5 passed, 0 failed, 0 skipped
OVERALL: ALL TESTS PASSED
```

### Production E2E Tests

| テスト | 結果 |
|--------|------|
| `/user-assets/*` → CDN redirect | ✅ 302 → cdn.dreamcore.gg |
| 404 for nonexistent assets | ✅ 404 |
| `/api/assets` without auth | ✅ 401 |
| `/api/assets/search` without auth | ✅ 401 |
| Health check `/api/config` | ✅ 200 |

### E2E レポート

- `screenshots/e2e-test/report.html` (ローカル)
- `screenshots/e2e-test-prod/report.html` (本番)

## コミット履歴

```
c9ddc95 refactor(server): cleanup unused imports after asset modularization
63f1423 fix: add missing middleware and fix remaining rate limiters
4bc76f7 fix(cli-deploy): add validate:false to rate limiters
174b1b4 fix: add missing routes directory (assetsApi, assetsPublic)
```

## デプロイ

- **デプロイ先**: GCE dreamcore-v2 (asia-northeast1-a)
- **PM2 プロセス**: dreamcore-sandbox (online)
- **本番 URL**: https://v2.dreamcore.gg
- **ヘルスチェック**: HTTP 200 ✅

## 技術的な注意点

### MIME タイプ判定の既知の問題

`server/middleware/uploads.js` の `file.mimetype.split('/')[1]` 判定は以下のケースで問題がある可能性:
- `image/svg+xml` → `svg+xml` (not matching `/svg/`)
- `audio/mpeg` → `mpeg` (not matching `/mp3/`)

**対応**: 後続フェーズで修正検討（既存仕様との互換性維持のため今回は変更なし）

### SVG サニタイズ

JSDOM + DOMPurify による SVG サニタイズは `routes/assetsApi.js` のモジュールスコープで初期化。
XSS 攻撃防止のため、以下を除去:
- `<script>`, `<foreignObject>` タグ
- `onload`, `onerror`, `onclick`, `onmouseover`, `xlink:href` 属性

## 次のステップ

Phase 2 以降で他のルートもモジュール化を検討:
- Project API (`/api/projects/*`)
- Job API (`/api/jobs/*`)
- Publishing API (`/api/publish/*`)
