# R2/CDN 完全移行

**日付:** 2026-02-03
**ステータス:** ✅ 完了

## 概要

公開ゲーム・サムネイルの配信を Cloudflare R2 + CDN に移行し、「表示されたりされなかったり」問題を解消した。

## 背景・問題

- 公開ゲームのファイルが Modal Volume に保存されているが、Modal の cold start やネットワーク遅延により表示が不安定
- サムネイルが `/api/projects/:id/thumbnail` 経由で配信されており、認証・同期の問題で表示されないことがある
- CDN 配信により安定性・速度を向上させる必要があった

## 実装内容

### Phase 1: 基盤構築

| ファイル | 内容 |
|----------|------|
| `server/r2Client.js` | S3互換 R2 クライアント（PutObject, HeadObject, GetObject, ListObjects） |
| `server/r2Publisher.js` | ゲーム・サムネイルの R2 アップロード処理 |
| `server/gameHtmlUtils.js` | HTML/CSS/JS の CDN URL 書き換え処理 |

### Phase 2: 配信切替

| 機能 | 実装 |
|------|------|
| `/g/:gameId/*` | R2 CDN への 302 リダイレクト |
| `/api/projects/:id/thumbnail` | オンデマンド R2 アップロード + 302 リダイレクト |
| `/api/config` | `publicGameBaseUrl` を返すよう拡張 |

### Phase 3: サムネイル自動生成

| ファイル | 内容 |
|----------|------|
| `server/thumbnailGenerator.js` | NanoBanana（Gemini）による自動サムネイル生成 |
| `server/index.js` | 新規公開時に `setImmediate` で fire-and-forget 生成 |

### Phase 4: バックフィル

| ファイル | 内容 |
|----------|------|
| `scripts/backfill-r2-published.js` | 公開ゲームファイルの R2 一括アップロード |
| `scripts/backfill-thumbnails.js` | レガシーサムネイル URL のバックフィル |

## 技術詳細

### R2 クライアント

```javascript
// server/r2Client.js
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// オブジェクト存在確認
const objectExists = async (key) => {
  try {
    await headObject({ key });
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
};
```

### オンデマンドサムネイル処理

```javascript
// server/index.js - サムネイルエンドポイント
if (r2Client.isR2Enabled()) {
  const r2Url = await r2Publisher.ensureThumbnailOnR2({
    projectId,
    publicId: published.public_id,
    userId: project.user_id
  });

  if (r2Url) {
    // DB 更新（URL が変わった場合のみ）
    if (r2Url !== published.thumbnail_url) {
      await supabaseAdmin
        .from('published_games')
        .update({ thumbnail_url: r2Url, updated_at: new Date().toISOString() })
        .eq('id', published.id);
    }
    return res.redirect(302, r2Url);
  }
}
```

### サムネイル自動生成（新規公開時）

```javascript
// server/index.js - 公開エンドポイント
if (r2Client.isR2Enabled() && !game.thumbnail_url?.startsWith('https://')) {
  setImmediate(async () => {
    try {
      await thumbnailGenerator.generateThumbnailAsync({
        projectId,
        publicId: game.public_id,
        userId,
        title: game.title,
        specContent
      });
    } catch (err) {
      console.error('[publish] Async thumbnail generation failed:', err.message);
    }
  });
}
```

### バックフィルスクリプト

```bash
# サムネイルバックフィル
node scripts/backfill-thumbnails.js              # dry-run
node scripts/backfill-thumbnails.js --execute    # 実行
node scripts/backfill-thumbnails.js --execute --limit=5  # 5件のみ
```

設定:
- `--execute`: 実行モード（デフォルトは dry-run）
- `--limit=N`: 処理件数制限
- `--offset=N`: 開始位置
- リトライ: 2回
- インターバル: 3000ms
- 同時実行: 1（シーケンシャル）

## バックフィル結果

| カテゴリ | 件数 | 状態 |
|----------|------|------|
| レガシー URL (`/api/projects/%`) | 9件 | ✅ 処理完了 |
| null サムネイル | 3件 | ✅ 処理完了 |
| **合計** | **12件** | **100% 成功** |

## R2 キー構造

```
{bucket}/g/{public_id}/
├── index.html
├── style.css
├── game.js
├── assets/
│   └── ...
└── thumbnail.webp
```

## 環境変数

```bash
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=dreamcore-games
R2_PUBLIC_BASE_URL=https://cdn.dreamcore.gg
```

## 検証結果

| テスト項目 | 結果 |
|------------|------|
| `/api/config` で `publicGameBaseUrl` 返却 | ✅ |
| CDN 直接アクセス（200） | ✅ |
| ローカル 302 リダイレクト | ✅ |
| 本番 mypage サムネイル表示 | ✅ |

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/r2Client.js` | 新規作成 - S3互換クライアント |
| `server/r2Publisher.js` | 新規作成 - R2 アップロード処理 |
| `server/gameHtmlUtils.js` | 新規作成 - HTML/CSS/JS 書き換え |
| `server/thumbnailGenerator.js` | 新規作成 - NanoBanana サムネイル生成 |
| `server/config.js` | R2 環境変数追加 |
| `server/index.js` | 302 リダイレクト、オンデマンドアップロード、自動生成 |
| `scripts/backfill-r2-published.js` | 新規作成 - ゲームファイルバックフィル |
| `scripts/backfill-thumbnails.js` | 新規作成 - サムネイルバックフィル |
| `package.json` | `@aws-sdk/client-s3` 追加 |

## コミット

```
432df93 feat(r2): complete R2/CDN migration with thumbnail auto-generation
```

## 学び・注意点

1. **Modal Volume にサムネイルがない**: 過去の公開ゲームは Modal Volume にサムネイルファイルが存在しなかった。NanoBanana による自動生成で解決。

2. **Host ヘッダーでテスト**: ローカルテストで `play.dreamcore.gg` の動作を確認するには `Host` ヘッダーを指定する必要がある。

3. **fire-and-forget パターン**: サムネイル生成は `setImmediate` で非同期実行し、公開 API のレスポンスをブロックしない。

4. **フォールバック設計**: R2 が使えない場合や失敗した場合は、既存のローカル配信にフォールバックする。

---

## 追加対応: GCE 本番環境の R2 設定漏れ修正

### 発生した問題

本番デプロイ後、以下の症状が報告された:
- パブリッシュページでサムネイルが表示されない
- ゲームプレイページでゲームが表示されない

### 調査結果

| 項目 | 状態 |
|------|------|
| R2 CDN にファイル存在 | ✅ 200 OK |
| GCE ローカルにファイル存在 | ❌ Directory not found |
| GCE に R2 環境変数 | ❌ **設定漏れ** |

**根本原因**: GCE 本番環境の `.env` に R2 環境変数が設定されていなかった。

```bash
# GCE .env（修正前）
PLAY_DOMAIN=https://play.dreamcore.gg
USE_MODAL=true
# R2_* なし ← これが問題
```

`r2Client.isR2Enabled()` が `false` を返し、302 リダイレクトが発生せず、存在しないローカルファイルを探しに行っていた。

### 修正内容

GCE の `.env` に R2 環境変数を追加:

```bash
# R2 Settings (added 2026-02-03)
R2_ACCOUNT_ID=...
R2_ENDPOINT=https://....r2.cloudflarestorage.com
R2_BUCKET=dreamcore-public
R2_PUBLIC_BASE_URL=https://cdn.dreamcore.gg
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

PM2 再起動:
```bash
pm2 restart dreamcore-sandbox --update-env
```

### 修正後の確認

| エンドポイント | ステータス | リダイレクト先 |
|---------------|-----------|---------------|
| `/api/config` | `publicGameBaseUrl: "https://cdn.dreamcore.gg"` | ✅ |
| `/g/g_xaA17rdmn3/index.html` | **302** | `cdn.dreamcore.gg` ✅ |
| `/api/projects/.../thumbnail` | **302** | `cdn.dreamcore.gg` ✅ |

### 教訓

1. **デプロイ時のチェックリスト**: 新しい環境変数を追加した場合、GCE `.env` への反映を忘れずに行う
2. **環境差分の可視化**: ローカルと本番の `.env` の差分を定期的に確認する仕組みが必要
3. **起動時の警告**: `r2Client.isR2Enabled()` が `false` の場合に警告ログを出すとデバッグが容易

---

## user-assets / global-assets CDN 移行（追加対応）

### 実装内容

| ファイル | 内容 |
|----------|------|
| `server/assetPublisher.js` | 新規作成 - ユーザー/グローバルアセットの R2 アップロード |
| `server/index.js` | `/user-assets/*`, `/global-assets/*` の 302 リダイレクト追加 |
| `scripts/backfill-assets-r2.js` | 新規作成 - アセットバックフィルスクリプト |
| `scripts/reupload-games-r2.js` | 新規作成 - ゲーム再アップロードスクリプト |

### バックフィル結果

| 環境 | 成功 | 未発見 |
|------|------|--------|
| ローカル | 40 | 102 |
| GCE | 102 | 40 |
| **合計（重複除く）** | 142 | - |

### CSP 更新

`img-src` に `https://cdn.dreamcore.gg` を追加。

### 発生した問題

1. **Cloudflare 404 キャッシュ**: R2 アップロード前のリクエストで 404 がキャッシュされた（TTL: 4時間）
2. **CSP 違反**: `cdn.dreamcore.gg` が `img-src` に含まれていなかった

### 解決方法

- Cloudflare Dashboard から **Purge Everything** を実行
- CSP imgSrc に `https://cdn.dreamcore.gg` を追加

---

## 再発防止: 404 キャッシュ無効化

### 設定内容

Cloudflare Dashboard → Caching → Cache Rules で以下を設定:

| 項目 | 値 |
|------|-----|
| Rule name | `No cache for 404 on CDN` |
| Field | `Hostname` |
| Operator | `equals` |
| Value | `cdn.dreamcore.gg` |
| Cache eligibility | `Bypass cache` |

### 効果

- `cf-cache-status: DYNAMIC` (キャッシュされない)
- 「一度 404 を引いたらずっと見えない」問題を防止

### 今後の改善案（任意）

| 改善案 | 内容 | 優先度 |
|--------|------|--------|
| バージョン付き URL | `?v={updated_at}` をアセット URL に付与してキャッシュバスト | 低 |
| キャッシュパージ自動化 | Cloudflare API Token を設定し、デプロイ時に自動パージ | 低 |
| 200 のみキャッシュ | Transform Rules で 200 に長 TTL、404 に no-store を設定 | 低 |

---

## 次のステップ

なし - R2 完全移行は完了。ゲーム・サムネイル・ユーザーアセット・グローバルアセットすべて CDN 配信中。
