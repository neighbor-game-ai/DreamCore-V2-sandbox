# セキュリティレビュー対応

**日付:** 2026-02-01
**ブランチ:** `feature/security-review-response`
**レビュー実施者:** kinopiee氏

---

## 概要

外部セキュリティ専門家（kinopiee氏）によるコードレビューで指摘された P0/P1 項目を実装。リリースブロッカー9件中、対応必要な11項目（P0: 6件、P1: 5件）を完了。

---

## 実施内容

### Phase 1: リリースブロッカー（P0）

#### 1.1 CLI サンドボックス必須化

**問題:** ローカルCLI実行へのフォールバックが本番でも実行される可能性

**修正ファイル:**
- `server/config.js` - 本番起動ガード追加（末尾）
- `server/claudeRunner.js` - フォールバック禁止（3箇所）
- `server/index.js` - `generate-publish-info`, `generate-movie` を Modal 経由に

**実装:**
```javascript
// config.js 末尾
if (IS_PRODUCTION && !USE_MODAL) {
  console.error('FATAL: USE_MODAL=true is required in production');
  process.exit(1);
}

// claudeRunner.js 各フォールバック箇所
if (config.IS_PRODUCTION) {
  throw new Error('Local CLI execution is not allowed in production');
}
```

**検証:** `NODE_ENV=production USE_MODAL=false npm start` → exit 1 確認

---

#### 1.2 パストラバーサル対策

**問題:** `readProjectFile` / `writeProjectFile` でパス検証なし

**修正ファイル:**
- `server/userManager.js` - `readProjectFileLocal()`, `writeProjectFileLocal()`

**実装:**
```javascript
const projectDir = getProjectDir(userId, projectId);
const targetPath = path.join(projectDir, filename);
if (!config.isPathSafe(projectDir, targetPath)) {
  console.error('[readProjectFile] Path traversal attempt:', filename);
  return null;
}
```

**注意:** `path.join()` で絶対パス化してから `isPathSafe()` に渡すこと

---

#### 1.3 レート制限

**問題:** `express-rate-limit` 未導入

**修正ファイル:**
- `package.json` - `express-rate-limit` 追加
- `server/index.js` - レート制限ミドルウェア追加

**設定:**
| エンドポイント | 制限 |
|---------------|------|
| AI系（generate-*） | 5 req/min |
| 一般API | 60 req/min |

---

#### 1.4 WebSocket 認証タイムアウト

**問題:** 未認証接続を無期限保持可能（DoS攻撃リスク）

**修正ファイル:**
- `server/index.js` - WebSocket接続ハンドラ

**実装:**
```javascript
const authTimeout = setTimeout(() => {
  if (!userId) {
    ws.close(4008, 'Authentication timeout');
  }
}, 10000);
```

---

#### 1.5 MIME 判定厳格化

**問題:** `ext || mime` で緩い判定（拡張子偽装可能）

**修正ファイル:**
- `server/index.js:110`

**変更:** `ext || mime` → `ext && mime`

---

#### 1.6 SUPABASE_URL 正規化

**問題:** 末尾スラッシュで JWT issuer 不一致の可能性

**修正ファイル:**
- `server/config.js:142`

**変更:**
```javascript
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
```

---

### Phase 2: リリース前対応（P1）

#### 2.1 SVG サニタイズ

**問題:** SVG内のJavaScriptでXSS攻撃可能

**修正ファイル:**
- `package.json` - `dompurify`, `jsdom` 追加
- `server/index.js` - SVGアップロード時にサニタイズ

**実装:**
```javascript
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const SVG_WINDOW = new JSDOM('').window;
const SVG_PURIFY = createDOMPurify(SVG_WINDOW);

// アップロード時
if (uploadExt === '.svg') {
  const sanitized = SVG_PURIFY.sanitize(content, { USE_PROFILES: { svg: true } });
  // sanitizedを保存
}
```

---

#### 2.2 helmet 導入

**問題:** セキュリティヘッダー未設定

**修正ファイル:**
- `package.json` - `helmet` 追加
- `server/index.js` - helmet ミドルウェア追加

**設定:**
```javascript
app.use(helmet({
  contentSecurityPolicy: false,  // Phase 2b で Report-Only 導入予定
  frameguard: false,  // ゲームページは iframe 埋め込み必要
}));
```

**段階導入計画:**
- Phase 2a: デフォルト設定（X-Frame-Options, X-Content-Type-Options 等）✅ 完了
- Phase 2b: CSP Report-Only で違反ログ収集
- Phase 2c: CSP 強制モード（`default-src 'none'` + wss限定）

---

#### 2.3 Modal healthCheck 修正

**問題:** 500/503 でも healthy 扱い

**修正ファイル:**
- `server/modalClient.js:664`

**変更:** `response.status !== 401` → `response.ok || response.status === 404`

**404 を healthy とする理由:** healthCheck は `/get_file` で実行され、ファイル不在の 404 は Modal 自体の正常動作を示す

---

#### 2.4 サムネイル関連

**問題:**
1. `modalClient` が null の場合にエラー
2. PNG を WebP として保存（形式不一致）

**修正ファイル:**
- `server/index.js:2524` - `getModalClient()` + null チェック
- `server/index.js:2637` - sharp で WebP 変換

---

#### 2.5 プロンプトインジェクション対策

**問題:** ユーザー入力とシステム指示の分離不足

**修正ファイル:**
- `server/claudeRunner.js` - 監査ログ関数 + 構造化マーカー

**実装:**
```javascript
const SUSPICIOUS_PATTERNS = [
  /ignore.*previous.*instructions?/i,
  /system.*prompt/i,
  /you.*are.*now/i,
  // ...
];

function auditUserInput(userId, projectId, userMessage) {
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(userMessage)) {
      console.warn('[AUDIT] Suspicious input detected:', { userId, projectId, pattern: pattern.toString() });
    }
  }
}

// プロンプト構造化
const prompt = `<system>
${systemInstructions}
</system>

<user>
${userMessage}
</user>`;
```

---

## 追加パッケージ

```bash
npm install express-rate-limit helmet dompurify jsdom
```

---

## コミット

| コミット | 内容 |
|----------|------|
| `7e6d489` | security: P0リリースブロッカー対応（6項目） |
| `ae070d2` | security: P1リリース前対応（5項目） |

---

## CSP 影響分析

### 確認した項目

| ディレクティブ | 使用状況 | 推奨値 |
|---------------|---------|--------|
| `script-src` | CDN (jsdelivr, unpkg, cdnjs), Google OAuth, Supabase, inline scripts | `'self' 'unsafe-inline'` + 各CDN |
| `style-src` | inline styles, Google Fonts | `'self' 'unsafe-inline' fonts.googleapis.com` |
| `img-src` | Supabase Storage, Google avatar, Canvas toDataURL | `'self' data: blob: *.supabase.co` |
| `media-src` | 音声ファイル (.mp3, .wav, .ogg), video要素 | `'self' blob:` |
| `connect-src` | WebSocket, Supabase, Google OAuth | `'self' wss://* *.supabase.co` |
| `font-src` | Google Fonts | `'self' fonts.gstatic.com` |

### 強制モード移行時の注意

| 項目 | Report-Only | 強制モード |
|------|-------------|-----------|
| `default-src` | `'self'` | `'none'`（明示許可のみ） |
| `connect-src` の wss | `wss://*` | `wss://v2.dreamcore.gg wss://play.dreamcore.gg` |

---

## 残タスク

### Phase 2b/2c（リリース後）

- CSP Report-Only 導入
- CSP 強制モード移行

### P2/P3（リリース後）

- 分析スクリプトのエラー対策
- 画像キャッシュの修正
- 検索機能の改善
- 認証方式の統一
- エラーメッセージの修正
- チャット表示のセキュリティ
- 削除機能の改善
- 不要な依存関係の削除
- 未実装機能の整理

---

## 関連ドキュメント

- 技術詳細: `docs/REVIEW_RESPONSE.md`
- PM向け説明: `docs/REVIEW_RESPONSE_hosoku.md`
- 実装計画: `.claude/plans/deep-jumping-lerdorf.md`
- 指摘元: `/Users/admin/Desktop/REVIEW_FINDINGS.md`

---

## 学び・注意点

1. **isPathSafe の使い方:** `path.join()` で絶対パス化してから渡す。相対パスのまま渡すと検証が効かない

2. **CSP 段階導入:** いきなり厳格な CSP を適用すると機能が壊れる。Report-Only → 強制モードの順で進める

3. **SUPABASE_URL 正規化:** 末尾スラッシュがあると JWT issuer 不一致で認証が壊れる可能性

4. **Modal healthCheck:** 404 は「ファイルなし」であり「Modal異常」ではない。200/404 を healthy とする

5. **SVG サニタイズ:** jsdom + DOMPurify の組み合わせでサーバーサイドでも動作する
