# CSP Report-Only 導入 (Phase 2b)

**日付:** 2026-02-01
**作業内容:** Content-Security-Policy-Report-Only ヘッダーの導入

---

## 背景

セキュリティレビュー対応の一環として、CSP（Content Security Policy）を段階的に導入。
Phase 2b では Report-Only モードで違反をログに記録し、既存機能を壊さないことを確認する。

**段階:**
- Phase 2a: helmet 導入（CSP なし）✅ 完了
- Phase 2b: CSP Report-Only ✅ 本作業
- Phase 2c: CSP 強制モード（違反なし確認後）

---

## 調査した外部リソース

フロントエンドで使用している CDN・外部リソースを調査:

| カテゴリ | リソース |
|----------|----------|
| Script | `cdnjs.cloudflare.com` (cropper.js) |
| Style | `fonts.googleapis.com` |
| Font | `fonts.gstatic.com` |
| Image | `api.qrserver.com` (QRコード), `lh3.googleusercontent.com` (Google avatar), `*.supabase.co` |
| Connect | `*.supabase.co` (API), WebSocket (same host) |
| Frame | `play.dreamcore.gg` (ゲーム iframe) |

---

## 実装内容

### 1. CSP ディレクティブ設定

```javascript
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://lh3.googleusercontent.com", "https://api.qrserver.com"],
  mediaSrc: ["'self'", "blob:"],
  connectSrc: ["'self'", "wss:", "https://*.supabase.co"],
  frameSrc: ["'self'", "https://play.dreamcore.gg"],
  frameAncestors: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  upgradeInsecureRequests: [],
  reportUri: ["/api/csp-report"],
};
```

### 2. ゲームページ除外

AI 生成ゲームは各種 CDN（jsdelivr, unpkg, cdnjs 等）を使用するため予測不能。
ゲームは iframe sandbox で隔離されているため、CSP なしでも安全。

```javascript
app.use((req, res, next) => {
  if (req.path.startsWith('/g/') || req.path.startsWith('/game/')) {
    return helmetWithoutCSP(req, res, next);
  }
  return helmetWithCSP(req, res, next);
});
```

### 3. 違反レポートエンドポイント

```javascript
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  console.warn('[CSP Violation]', JSON.stringify(report, null, 2));
  res.status(204).end();
});
```

---

## 発見した問題と対応

### 問題: ゲームページで cdn.jsdelivr.net 違反

**ログ:**
```json
{
  "document-uri": "https://v2.dreamcore.gg/game/.../index.html",
  "violated-directive": "script-src-elem",
  "blocked-uri": "https://cdn.jsdelivr.net/npm/p5@1.11.0/lib/p5.min.js"
}
```

**原因:** AI 生成ゲームが p5.js を CDN から読み込んでいる

**対応:** ゲームページ (`/g/`, `/game/`) を CSP から除外

---

## 検証結果

```bash
# アプリページ: CSP ヘッダーあり
curl -sI "https://v2.dreamcore.gg/" | grep "content-security-policy"
Content-Security-Policy-Report-Only: default-src 'self'; ...

# ゲームページ: CSP ヘッダーなし
curl -sI "https://v2.dreamcore.gg/g/test/index.html" | grep "content-security-policy"
(なし)
```

---

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | helmet CSP 設定、ゲームページ除外、違反レポートエンドポイント |

---

## 次のステップ (Phase 2c)

1. **監視期間:** 数日間、`[CSP Violation]` ログを監視
2. **違反分析:** アプリページで違反があれば CSP ディレクティブを調整
3. **強制モード移行:** 違反がなければ `reportOnly: false` に変更

**移行時の変更点:**
```javascript
// Phase 2c での変更
contentSecurityPolicy: {
  reportOnly: false,  // ← true から変更
  directives: cspDirectives,
}
```

---

## コミット

```
242bcbf feat(security): add CSP Report-Only (Phase 2b)
a19a7cf fix(security): exclude game pages from CSP
```
