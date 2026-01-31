# セキュリティ改善 Phase 0

**作成日:** 2026-02-01
**ステータス:** 計画中
**見積もり:** 2日（authMiddleware 1日 + サムネ 0.5日 + sessionStorage 0.5日）

---

## 概要

| 項目 | 問題 | リスク |
|------|------|--------|
| authMiddleware クエリ廃止 | URL に access_token が露出 | Referer ヘッダー、ブラウザ履歴、サーバーログから漏洩 |
| サムネ URL トークン削除 | 公開エンドポイントに不要なトークン | 上記と同様 |
| sessionStorage 移行 | localStorage はタブを閉じても残る | XSS時の長期セッション乗っ取り |

---

## 1. authMiddleware クエリ廃止

### 現状分析

**サーバー側:**
```javascript
// server/authMiddleware.js:29-31
if (req.query && req.query.access_token) {
  return req.query.access_token;
}
```

**クライアント側で access_token をクエリに含めている箇所:**

| ファイル | 行 | 用途 | 代替策 |
|----------|-----|------|--------|
| `public/app.js:3324` | iframe src（プレビュー） | 署名付きURL |
| `public/play.js:121` | iframe src（プレイ） | 署名付きURL |
| `public/mypage.js:145` | img src（サムネ） | 削除（認証不要） |
| `public/app.js:848` | img src（サムネ） | 削除（認証不要） |

### 問題点

**iframe/img src に Authorization ヘッダーは使えない。**

ブラウザの仕様上、`<iframe src="...">` や `<img src="...">` ではカスタムヘッダーを送信できない。現状はクエリパラメータで access_token を渡しているが、これは以下のリスクがある:

1. **Referer ヘッダー漏洩**: iframe 内から外部リンクをクリックすると URL 全体が Referer として送信される
2. **ブラウザ履歴**: URL が履歴に残る
3. **サーバーログ**: アクセスログに URL 全体が記録される

### 解決策: 署名付き URL（Signed URL）

**アーキテクチャ:**
```
1. クライアント: POST /api/signed-url { resource: "/game/.../index.html" }
2. サーバー: 短期トークン生成（5分有効）、署名付き URL を返す
3. クライアント: iframe.src = signedUrl
4. サーバー: 署名を検証してリソースを返す
```

**署名付き URL の形式:**
```
/game/{userId}/{projectId}/index.html?sig={signature}&exp={expiry}
```

- `sig`: HMAC-SHA256(secret, path + exp)
- `exp`: Unix timestamp（5分後）

**メリット:**
- access_token が URL に露出しない
- 署名は短期間で失効
- ユーザー識別情報を含まない（署名のみ）

### 実装計画

#### Step 1: 署名付き URL 生成 API

```javascript
// POST /api/signed-url
app.post('/api/signed-url', authenticate, (req, res) => {
  const { resource } = req.body;

  // リソースパスを検証（所有者チェック）
  const match = resource.match(/^\/game\/([^/]+)\/([^/]+)/);
  if (!match || match[1] !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const exp = Math.floor(Date.now() / 1000) + 300; // 5分
  const sig = createSignature(resource, exp);

  res.json({ url: `${resource}?sig=${sig}&exp=${exp}` });
});
```

#### Step 2: 署名検証ミドルウェア

```javascript
// /game/* へのリクエストで署名を検証
const verifySignedUrl = (req, res, next) => {
  const { sig, exp } = req.query;

  if (!sig || !exp) {
    return res.status(401).send('Unauthorized');
  }

  // 有効期限チェック
  if (Date.now() / 1000 > parseInt(exp)) {
    return res.status(401).send('URL expired');
  }

  // 署名検証
  const path = req.path;
  const expectedSig = createSignature(path, exp);
  if (sig !== expectedSig) {
    return res.status(401).send('Invalid signature');
  }

  next();
};
```

#### Step 3: クライアント側更新

```javascript
// app.js - プレビュー iframe
async loadPreview() {
  const response = await DreamCoreAuth.authFetch('/api/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource: `/game/${this.userId}/${this.currentProjectId}/index.html`
    })
  });
  const { url } = await response.json();
  this.gamePreview.src = url;
}
```

#### Step 4: authMiddleware からクエリ削除

```javascript
// 削除
// if (req.query && req.query.access_token) {
//   return req.query.access_token;
// }
```

### 移行計画

1. 署名付き URL API を追加（既存に影響なし）
2. 新しい署名検証ミドルウェアを `/game/*` に追加（sig パラメータがあれば検証）
3. クライアント側を署名付き URL に移行
4. 全ての access_token クエリ使用箇所を移行完了後、authMiddleware からクエリ対応を削除

---

## 2. サムネ URL トークン削除

### 現状分析

**サーバー側エンドポイント:**
```javascript
// server/index.js:2596 - 認証なし
app.get('/api/projects/:projectId/thumbnail', async (req, res) => {
  // service_role で project owner を取得
  // ファイルを返す
});
```

**クライアント側（不要なトークンを付与）:**
```javascript
// public/mypage.js:145
const thumbnailUrl = `/api/projects/${game.id}/thumbnail?access_token=${...}`;

// public/app.js:848
src="/api/projects/${project.id}/thumbnail?access_token=${...}"
```

### 問題点

エンドポイントは認証を要求していないが、クライアントが不要な access_token をクエリに含めている。

### 解決策

クライアント側から access_token パラメータを削除するだけ。

### 実装計画

#### Step 1: mypage.js 修正

```javascript
// Before
const thumbnailUrl = `/api/projects/${game.id}/thumbnail?access_token=${encodeURIComponent(this.accessToken)}`;

// After
const thumbnailUrl = `/api/projects/${game.id}/thumbnail`;
```

#### Step 2: app.js 修正

```javascript
// Before
src="/api/projects/${project.id}/thumbnail?access_token=${encodeURIComponent(this.accessToken)}"

// After
src="/api/projects/${project.id}/thumbnail"
```

### 所要時間: 0.5日

---

## 3. sessionStorage 移行

### 現状分析

**セッションキャッシュの保存先:**
```javascript
// public/auth.js
const SESSION_CACHE_KEY = 'dreamcore_session_cache';
localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ session, timestamp }));
```

**問題点:**
- localStorage はブラウザを閉じても残る
- XSS 攻撃時に攻撃者がセッションを永続的に取得可能
- 共有PCで他のユーザーにセッションが残る可能性

### 解決策

`localStorage` → `sessionStorage` に移行。

### 考慮事項

| 項目 | localStorage | sessionStorage |
|------|-------------|----------------|
| 有効範囲 | ブラウザ全体 | タブごと |
| 永続性 | 永続 | タブを閉じると消える |
| 複数タブ | 共有 | 独立 |

**影響:**
- タブを閉じるとログアウト扱い → ユーザーは再度ログイン必要
- 複数タブで独立したセッション → ただし Supabase SDK がセッションをリフレッシュするので大丈夫

**ただし Supabase SDK 自体の sessionStorage は変更できない:**
- Supabase SDK はデフォルトで localStorage を使用
- `persistSession: false` にすると SDK がセッションを保持しなくなる
- カスタム storage を渡すことも可能

### 実装計画

#### 方針 A: DreamCoreAuth のキャッシュのみ移行（推奨）

```javascript
// auth.js
const SESSION_CACHE_KEY = 'dreamcore_session_cache';

function getCachedSession() {
  try {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);  // ← 変更
    // ...
  }
}

function setCachedSession(session) {
  try {
    if (session) {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({  // ← 変更
        session,
        timestamp: Date.now()
      }));
    } else {
      sessionStorage.removeItem(SESSION_CACHE_KEY);  // ← 変更
    }
  }
}
```

**メリット:**
- Supabase SDK はそのまま（localStorage でリフレッシュトークン管理）
- DreamCore 独自キャッシュのみ sessionStorage
- タブを開き直しても Supabase SDK がセッションを復元

#### 方針 B: Supabase SDK もカスタム storage（オプション）

```javascript
supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true
  }
});
```

**デメリット:**
- タブを閉じると完全ログアウト（リフレッシュトークンも消える）
- ユーザー体験が悪化

### 推奨: 方針 A（DreamCoreAuth キャッシュのみ）

### 追加作業: sessionId も移行

```javascript
// public/app.js:13, 233
this.sessionId = sessionStorage.getItem('sessionId');  // ← 変更
```

### 所要時間: 0.5日

---

## 実装順序

| 順番 | タスク | 依存関係 | 所要時間 |
|------|--------|----------|----------|
| 1 | サムネ URL トークン削除 | なし | 0.5日 |
| 2 | sessionStorage 移行 | なし | 0.5日 |
| 3 | 署名付き URL（設計・実装） | なし | 0.5日 |
| 4 | クライアント移行 | 3 | 0.3日 |
| 5 | authMiddleware クエリ削除 | 4 | 0.2日 |

**合計: 2日**

---

## ファイル変更一覧

### サーバー

| ファイル | 変更内容 |
|----------|----------|
| `server/index.js` | 署名付き URL API 追加、署名検証ミドルウェア追加 |
| `server/authMiddleware.js` | クエリ対応削除（最後） |
| `server/signedUrl.js` | 新規作成（署名生成・検証ユーティリティ） |

### フロントエンド

| ファイル | 変更内容 |
|----------|----------|
| `public/auth.js` | localStorage → sessionStorage |
| `public/app.js` | サムネ URL トークン削除、署名付き URL 使用、sessionId を sessionStorage に |
| `public/mypage.js` | サムネ URL トークン削除 |
| `public/play.js` | 署名付き URL 使用 |
| `public/editor.html` | sessionStorage に変更 |
| `public/discover.html` | sessionStorage に変更 |
| `public/create.html` | sessionStorage に変更 |
| `public/mypage.html` | sessionStorage に変更 |
| `public/notifications.html` | sessionStorage に変更 |

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| 署名シークレット漏洩 | 環境変数で管理、定期ローテーション |
| 署名 URL の使い回し | 5分で失効、リソースパス固定 |
| sessionStorage でタブ間共有不可 | Supabase SDK がリフレッシュトークンで補完 |

---

## 次のステップ

1. このプランをレビュー
2. 承認後、タスク 1（サムネ URL トークン削除）から着手
