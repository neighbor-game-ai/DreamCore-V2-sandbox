# セッション再接続時のトークン更新修正

**日付:** 2026-01-31

## 問題

セッションが切れた後、再接続ボタンを押すとGoogleログイン画面に飛ばされてしまう。
本来はRefresh Tokenを使って自動的にAccess Tokenを更新し、再ログイン不要で再接続できるべき。

## 原因

- `forceReconnect()` が古いトークン（`this.accessToken`）をそのまま使って `connectWebSocket()` を呼んでいた
- `onclose` の自動再接続も同様に古いトークンで再接続していた
- トークンが期限切れ（1時間）の場合、サーバーが認証失敗 → WebSocket切断 → ログイン画面へリダイレクト

## 修正内容

### 1. public/auth.js

**新規追加:**

- `isSessionExpired(session)` - JWTの有効期限を確認（60秒のバッファ付き）
- `getFreshSession()` - 必ず新しいセッションを取得
  - 現在のセッションが有効ならそのまま返す
  - 期限切れなら `refreshSession()` でリフレッシュ
  - 失敗したら `getSession()` にフォールバック
  - 取得できなければ null を返す

**エクスポート追加:**
- `window.DreamCoreAuth.getFreshSession`

### 2. public/app.js

**forceReconnect() を async に変更:**
- 再接続前に `DreamCoreAuth.getFreshSession()` を呼ぶ
- 取得できたら `this.accessToken` を更新して `connectWebSocket()`
- 取れなければ `/` にリダイレクト

**reconnectWithFreshToken() を新規追加:**
- 自動再接続用（`reconnectAttempts` を保持してバックオフを維持）
- `getFreshSession()` でトークン更新後に再接続

**onclose イベントの修正:**
- `setTimeout(() => this.connectWebSocket(), delay)`
- ↓
- `setTimeout(() => this.reconnectWithFreshToken(), delay)`

## 動作フロー（修正後）

```
WebSocket切断
   ↓
onclose イベント発火
   ↓
reconnectWithFreshToken() / forceReconnect()
   ↓
getFreshSession() でトークン更新
   ├── セッション有効 → そのまま使用
   └── 期限切れ → refreshSession() でリフレッシュ
   ↓
新しいトークンで再接続 ✅
```

## テスト結果

```
localStorage.removeItem('dreamcore_session_cache');
localStorage.removeItem('sb-tcynrijrovktirsvwiqb-auth-token');
if (window.app && window.app.ws) window.app.ws.close();
```

コンソール出力:
```
[Reconnect] Attempting in 1000ms (attempt 1)
[Auth] Current session is valid
[reconnectWithFreshToken] Got fresh session, reconnecting...
WebSocket connected
```

Googleログイン画面に飛ばされず、正常に再接続できることを確認。

## Supabase Auth の仕組み

| トークン | 有効期限 | 役割 |
|---------|---------|------|
| Access Token | 1時間 | API認証に使う短命トークン |
| Refresh Token | 数週間 | Access Token を更新するための長命トークン |

ユーザーは毎日使っても、Refresh Token が有効な限り再ログイン不要。

## 変更ファイル

- `public/auth.js` - `isSessionExpired()`, `getFreshSession()` 追加
- `public/app.js` - `forceReconnect()` 修正, `reconnectWithFreshToken()` 追加

## 関連作業（同日）

- Supabase カスタムドメイン `auth.dreamcore.gg` 設定
- Google OAuth リダイレクトURL追加
- Supabase Pro Organization に移行
- Micro Compute アップグレード
