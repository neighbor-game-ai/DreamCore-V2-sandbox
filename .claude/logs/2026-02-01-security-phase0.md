# 2026-02-01 セキュリティ改善 Phase 0 実装

## 概要

技術的負債のセキュリティ改善（Phase 0）を実装。無限リダイレクト問題の根本解決も含む。

## 実施内容

### 1. サムネイル URL から access_token 削除

**問題:** 公開エンドポイントに不要な認証トークンが付与されていた

**修正:**
- `app.js`: サムネイル URL 生成時の `access_token` クエリパラメータを削除
- サムネイルは公開リソースなので認証不要

**ファイル:** `public/app.js`

### 2. セッションキャッシュを sessionStorage に移行

**問題:** localStorage のセッションが XSS 攻撃で露出するリスク

**修正:**
- 既存コードは sessionStorage を使用済み（変更なし）
- ただし別タブ問題があった（後述）

### 3. 別タブ問題の修正（無限リダイレクト解消）

**問題:** 別タブで開くと sessionStorage が空のため無限リダイレクト

**原因:**
- sessionStorage はタブ間で共有されない
- Supabase は localStorage にセッションを保存する
- 早期チェックで sessionStorage のみを確認していた

**修正:**
- 5つの HTML ファイルの早期チェックを更新
- sessionStorage がなくても localStorage の Supabase セッションがあればリダイレクトしない
- auth.js がセッション復元を担当

**修正ロジック:**
```javascript
var cached = sessionStorage.getItem('dreamcore_session_cache');
var supabaseSession = localStorage.getItem('sb-tcynrijrovktirsvwiqb-auth-token');
if (!cached && !supabaseSession) {
  window.location.href = '/';  // 両方ない → ログインページへ
  return;
}
if (!cached && supabaseSession) {
  return;  // Supabase セッションあり → auth.js に任せる
}
```

**ファイル:**
- `public/create.html`
- `public/editor.html`
- `public/mypage.html`
- `public/discover.html`
- `public/notifications.html`

### 4. notifications.js に checkAccess 追加

**問題:** notifications ページで checkAccess が呼ばれていなかった

**修正:**
- `notifications.js` に他ページと同じ checkAccess パターンを追加

**ファイル:** `public/notifications.js`

### 5. 署名付き URL でゲーム iframe を保護

**問題:** ゲーム iframe 内から access_token が読み取り可能だった

**修正:**
- `server/config.js`: IFRAME_SIGNATURE_SECRET 追加
- `server/index.js`: 署名付き URL の生成・検証を実装
- iframe 向け URL に有効期限付き署名を付与

**ファイル:** `server/config.js`, `server/index.js`

### 6. authMiddleware から query token サポート削除

**問題:** URL クエリで access_token を受け付けると漏洩リスク

**修正:**
- `authMiddleware.js`: クエリパラメータからのトークン取得を削除
- Authorization ヘッダーのみをサポート

**ファイル:** `server/authMiddleware.js`

### 7. Referer フォールバックを HTML 以外に制限

**問題:** HTML ファイルの Referer フォールバックがセキュリティリスク

**修正:**
- `server/index.js`: Referer フォールバックを静的アセット（CSS/JS/画像等）のみに制限
- HTML ファイルは署名必須

**ファイル:** `server/index.js`

### 8. play.js の認証強化

**修正:**
- checkAccess を追加
- authError の適切な処理

**ファイル:** `public/play.js`

## 変更ファイル一覧

- `public/app.js` - サムネイル URL から token 削除
- `public/create.html` - 早期チェックで localStorage も確認
- `public/editor.html` - 同上
- `public/mypage.html` - 同上
- `public/discover.html` - 同上
- `public/notifications.html` - 同上
- `public/notifications.js` - checkAccess 追加
- `public/mypage.js` - 認証処理の調整
- `public/play.js` - checkAccess 追加、認証強化
- `server/authMiddleware.js` - query token 削除
- `server/config.js` - IFRAME_SIGNATURE_SECRET 追加
- `server/index.js` - 署名付き URL、Referer 制限

## 関連コミット

- `321e654` security: セキュリティ改善 Phase 0 実装

## 学び・注意点

1. **sessionStorage vs localStorage のトレードオフ**
   - sessionStorage: XSS に強いが別タブで共有されない
   - localStorage: Supabase が使用、タブ間で共有される
   - 解決策: sessionStorage をキャッシュとして使い、なければ localStorage をフォールバック

2. **早期チェックと auth.js の役割分担**
   - 早期チェック: SDK 読み込み前の高速リダイレクト
   - auth.js: セッション復元、リフレッシュ、checkAccess

3. **無限リダイレクトの根本原因**
   - 複数の条件（sessionStorage/localStorage/expires_at/checkAccess）が絡み合う
   - すべての条件を整合性を持って処理する必要がある
