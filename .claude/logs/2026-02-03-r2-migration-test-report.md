# R2移行 ローカルテスト報告書

**実施日**: 2026-02-03
**テスター**: Claude Code (AgentBrowser)
**テスト環境**: localhost:3000 + 本番CDN (cdn.dreamcore.gg)

---

## テスト結果サマリー

| テスト項目 | 結果 | 備考 |
|------------|------|------|
| /api/config の publicGameBaseUrl | ✅ 成功 | `https://cdn.dreamcore.gg` が正しく返される |
| /g/:gameId/* → R2リダイレクト | ✅ 成功 | 302 → cdn.dreamcore.gg |
| CDN直接アクセス | ✅ 成功 | ゲームが正常に表示される |
| サムネイルR2アップロード | ⚠️ 未完了 | Modal Volumeにサムネイルファイルなし |
| play.dreamcore.gg 直接アクセス | ✅ 正常 | セキュリティブロックが動作 |
| mypage サムネイル表示 | ⚠️ 課題あり | サムネイル未表示（元データ不足） |

---

## 詳細結果

### 1. /api/config エンドポイント ✅

**スクリーンショット**: `r2-test-01-api-config.png`

**レスポンス**:
```json
{
  "supabaseUrl": "https://tcynrijrovktirsvwiqb.supabase.co",
  "supabaseAnonKey": "...",
  "playDomain": "https://play.dreamcore.gg",
  "publicGameBaseUrl": "https://cdn.dreamcore.gg"
}
```

**判定**: `publicGameBaseUrl` が正しく `https://cdn.dreamcore.gg` を返している。

---

### 2. /g/:gameId/* リダイレクト ✅

**テストコマンド**:
```bash
curl -H "Host: play.dreamcore.gg" -I "http://localhost:3000/g/g_Hzk8XETcS3/index.html"
```

**結果**:
```
HTTP/1.1 302 Found
Location: https://cdn.dreamcore.gg/g/g_Hzk8XETcS3/index.html
```

**判定**: R2/CDNへの302リダイレクトが正常に動作。

**注意**: ローカルテストでは `Host: play.dreamcore.gg` ヘッダが必要（`isPlayDomain` チェックのため）。

---

### 3. CDN直接アクセス ✅

**スクリーンショット**: `r2-test-02-cdn-game.png`

**URL**: `https://cdn.dreamcore.gg/g/g_Hzk8XETcS3/index.html`

**結果**: 「Neon Striker」ゲームが正常に表示される。
- タイトル表示: ✅
- UI要素（ジョイスティック、FIREボタン）: ✅
- スコア表示: ✅

---

### 4. サムネイルR2アップロード ⚠️

**状況**: R2上にサムネイルファイル（thumbnail.webp/png）が存在しない

**確認結果**:
```bash
curl -I "https://cdn.dreamcore.gg/g/g_Hzk8XETcS3/thumbnail.webp"
# HTTP/2 404
```

**原因**:
- バックフィルスクリプト実行時、Modal Volumeからの同期（syncFromModal）後もサムネイルファイルがローカルに存在しなかった
- published_games.thumbnail_url は古いローカルパス形式のまま: `/api/projects/.../thumbnail?t=...`

**対応が必要**:
1. Modal Volumeにサムネイルが保存されているか確認
2. サムネイルがない場合、自動生成ロジックの追加を検討

---

### 5. play.dreamcore.gg 直接ブラウザアクセス ✅

**スクリーンショット**: `r2-test-04-play-domain.png`

**URL**: `https://play.dreamcore.gg/g/g_Hzk8XETcS3`

**結果**: 「This game can only be played within DreamCore」

**判定**: セキュリティ機能が正常に動作。直接ブラウザアクセス（sec-fetch-dest: document）をブロックし、iframe埋め込みのみ許可する仕様が機能している。

---

### 6. mypage サムネイル表示 ⚠️

**スクリーンショット**: `r2-test-03-mypage-thumbnails.png`

**状況**: サムネイルが表示されていない（グレーのプレースホルダー）

**原因**:
- 上記テスト4と同様、サムネイルデータがR2/Modal Volume上に存在しない
- mypage.js は `game.thumbnailUrl`（R2 URL）を優先するが、DBに旧形式URLしか保存されていない

---

## R2上のファイル一覧（確認済み）

```
dreamcore-public/
├── test.txt (テストファイル)
└── g/
    ├── g_Hzk8XETcS3/
    │   ├── index.html ✅
    │   └── STYLE.md ✅
    ├── g_xaA17rdmn3/
    │   ├── index.html ✅
    │   └── STYLE.md ✅
    └── ... (12ゲーム分)
```

**注意**: thumbnailファイルがどのゲームにも存在しない

---

## 結論

### 成功した項目
1. R2クライアント（S3互換API）の接続・操作
2. /api/config での publicGameBaseUrl 提供
3. /g/:gameId/* のR2リダイレクト
4. CDN経由でのゲーム配信
5. play domainのセキュリティブロック

### 本番デプロイ前に対応が必要な項目
1. **サムネイル問題**: Modal Volumeにサムネイルが存在しない。以下のいずれかの対応が必要:
   - 新規パブリッシュ時にサムネイルを自動生成してR2にアップロード
   - 既存ゲームのサムネイルを手動で生成してバックフィル

### 推奨事項
1. サムネイル問題の解決後、本番デプロイを実施
2. デプロイ後、play.dreamcore.gg 経由での埋め込み再生をテスト
3. パフォーマンス計測（CDN配信によるレイテンシ改善の確認）

---

## 添付スクリーンショット

| ファイル名 | 内容 |
|------------|------|
| r2-test-01-api-config.png | /api/config レスポンス |
| r2-test-02-cdn-game.png | CDN経由ゲーム表示 |
| r2-test-03-mypage-thumbnails.png | mypage サムネイル状況 |
| r2-test-04-play-domain.png | play domain 直接アクセスブロック |
