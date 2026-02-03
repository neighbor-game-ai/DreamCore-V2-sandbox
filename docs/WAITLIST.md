# ウェイトリスト/アクセス管理

V2 初期リリース用のアクセス制御機能。承認されたユーザーのみがアプリを利用可能。

---

## 概要

- **目的**: 初期リリース時に利用者を限定
- **認証**: Google OAuth（Supabase Auth）
- **承認**: Supabase Dashboard から手動で行う

---

## ユーザーフロー

```
1. ユーザーが / にアクセス
2. Google Sign-In でログイン
3. OAuth コールバック → create.html?code=xxx
4. auth.js が code を session に交換
5. app.js が /api/check-access を呼び出し
   - user_access テーブルをチェック
   - approved → ページを表示
   - pending または未登録 → /waitlist.html へリダイレクト
6. waitlist.html で /api/waitlist/register を呼び出し
   - user_access に pending として登録
7. 管理者が Supabase Dashboard で status を approved に変更
8. 次回ログイン時にアプリ利用可能
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         フロントエンド                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  index.html                create.html                          │
│  ┌──────────┐              ┌──────────────────────────────┐     │
│  │ Google   │──────────────│ 早期チェック (inline script) │     │
│  │ Sign-In  │   OAuth      │ - セッションキャッシュ確認     │     │
│  └──────────┘   callback   │ - OAuth callback は除外      │     │
│                            └──────────────────────────────┘     │
│                                        │                        │
│                                        ▼                        │
│                            ┌──────────────────────────────┐     │
│                            │ auth.js (DreamCoreAuth)      │     │
│                            │ - initAuth()                 │     │
│                            │ - exchangeCodeForSession()   │     │
│                            │ - checkAccess()              │     │
│                            └──────────────────────────────┘     │
│                                        │                        │
│                                        ▼                        │
│                            ┌──────────────────────────────┐     │
│                            │ app.js (GameCreator)         │     │
│                            │ - checkAuthAndConnect()      │     │
│                            │ - revealPage()               │     │
│                            └──────────────────────────────┘     │
│                                        │                        │
│                            ┌───────────┴───────────┐            │
│                            ▼                       ▼            │
│                     allowed=true            allowed=false       │
│                     revealPage()            redirect to         │
│                                             waitlist.html       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         バックエンド                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  server/waitlist.js                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ GET /api/check-access                                    │   │
│  │ - トークンからユーザー取得                                  │   │
│  │ - user_access テーブルで status 確認                       │   │
│  │ - { allowed: boolean, status: string } を返す             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ POST /api/waitlist/register                              │   │
│  │ - トークンからユーザー情報取得                              │   │
│  │ - user_access に upsert (status: pending)                │   │
│  │ - 既存ユーザーは更新しない (ignoreDuplicates)              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                │
├─────────────────────────────────────────────────────────────────┤
│  user_access テーブル                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ email (PK) │ status   │ display_name │ requested_at │ ...│   │
│  │ user@...   │ pending  │ John Doe     │ 2026-01-30   │    │   │
│  │ admin@...  │ approved │ Admin        │ 2026-01-28   │    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  RLS: service_role のみアクセス可（フロントエンド直接アクセス不可）  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## テーブル構造

**テーブル名**: `user_access`

| カラム | 型 | 説明 |
|--------|-----|------|
| email | TEXT (PK) | ユーザーのメールアドレス |
| status | TEXT | `pending` または `approved` |
| display_name | TEXT | Google アカウントの表示名 |
| avatar_url | TEXT | Google アカウントのアバター URL |
| requested_at | TIMESTAMPTZ | 登録日時 |
| approved_at | TIMESTAMPTZ | 承認日時（手動更新） |
| invitation_code | TEXT | 使用した招待コード（あれば） |
| note | TEXT | 管理者メモ |

**マイグレーション**: `supabase/migrations/009_user_access.sql`

---

## API エンドポイント

### GET /api/check-access

ユーザーのアクセス権を確認。

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "allowed": true,
  "status": "approved"
}
```

| status | allowed | 意味 |
|--------|---------|------|
| `approved` | `true` | 承認済み、アプリ利用可 |
| `pending` | `false` | 承認待ち |
| `null` | `false` | 未登録 |

### POST /api/waitlist/register

ウェイトリストに登録。既存ユーザーは更新しない（ignoreDuplicates）。

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "success": true
}
```

---

## 実装詳細

### 1. 早期認証チェック（create.html:35-70）

ページ読み込み時に即座にセッションをチェックし、未認証ならリダイレクト。

```javascript
(function() {
  // OAuth callback は除外（code= パラメータがある場合）
  var search = window.location.search;
  if (search && search.includes('code=')) {
    return; // auth.js で処理
  }

  // セッションキャッシュ確認
  var cached = localStorage.getItem('dreamcore_session_cache');
  if (!cached) {
    window.location.href = '/';
    return;
  }

  // キャッシュ有効期限チェック（5分）
  var data = JSON.parse(cached);
  if (Date.now() - data.timestamp > 300000) {
    window.location.href = '/';
  }
})();
```

**重要**: OAuth コールバック時（`?code=xxx`）はこのチェックをスキップする。
スキップしないと、セッション交換前にリダイレクトされてしまう。

### 2. ページフラッシュ防止（create.html:30-32）

アクセスチェック完了前にページ内容が見えないよう、CSS で非表示にする。

```html
<style id="access-check-style">
  body { visibility: hidden; }
</style>
```

アクセス許可後に `revealPage()` でこのスタイルを削除。

### 3. OAuth コード交換（auth.js:116-145）

Google OAuth 後、URL に `?code=xxx` が付与される。
これを Supabase セッションに交換する。

```javascript
// Handle OAuth callback: exchange code for session
const url = new URL(window.location.href);
if (url.searchParams.has('code')) {
  const { data, error } = await supabaseClient.auth.exchangeCodeForSession(url.toString());
  if (data.session) {
    currentSession = data.session;
    setCachedSession(data.session);
  }
  // URL から code パラメータを削除
  url.searchParams.delete('code');
  window.history.replaceState({}, '', url.pathname + url.search);
}
```

### 4. アクセスチェック（app.js:289-327）

認証後、`/api/check-access` でアクセス権を確認。

```javascript
// V2 Waitlist: Check access permission
const { allowed } = await DreamCoreAuth.checkAccess();
if (!allowed) {
  window.location.href = '/waitlist.html';
  return;
}

// Access granted - reveal page
this.revealPage();
```

### 5. ページ表示（app.js:366-372）

アクセス許可後、非表示スタイルを削除してページを表示。

```javascript
revealPage() {
  const style = document.getElementById('access-check-style');
  if (style) {
    style.remove();
  }
}
```

### 6. ウェイトリスト登録（waitlist.html:200-210）

waitlist.html 表示時に自動でウェイトリストに登録。

```javascript
// DreamCoreAuth を使用してセッション取得
await DreamCoreAuth.initAuth();
const session = await DreamCoreAuth.getSession();

// ウェイトリストに登録
await fetch('/api/waitlist/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});
```

### 7. バックエンド処理（server/waitlist.js）

#### checkUserAccess (19-39)
```javascript
async function checkUserAccess(email) {
  const { data, error } = await supabaseAdmin
    .from('user_access')
    .select('status')
    .eq('email', email.toLowerCase())
    .single();

  return {
    allowed: data?.status === 'approved',
    status: data?.status || null
  };
}
```

#### registerToWaitlist (49-75)
```javascript
async function registerToWaitlist(userInfo) {
  const { error } = await supabaseAdmin
    .from('user_access')
    .upsert({
      email: email.toLowerCase(),
      display_name: displayName,
      avatar_url: avatarUrl,
      status: 'pending',
      requested_at: new Date().toISOString()
    }, {
      onConflict: 'email',
      ignoreDuplicates: true  // 既存ユーザーは更新しない
    });
}
```

---

## 招待コード

招待コードを持つユーザーは、手動承認を待たずに即座にアクセスが承認される。

### 仕組み

```
1. ユーザーがウェイトリストページで招待コードを入力
2. POST /api/invitation/redeem を呼び出し
3. コードが有効なら user_access を approved に更新
4. 使用履歴を invitation_code_uses に記録
5. create.html へリダイレクト
```

### テーブル構造

**invitation_codes** - 招待コード管理

| カラム | 型 | 説明 |
|--------|-----|------|
| code | TEXT (PK) | 招待コード（大文字） |
| description | TEXT | 管理用の説明 |
| expires_at | TIMESTAMPTZ | 有効期限（null=無期限） |
| is_active | BOOLEAN | 有効/無効フラグ |
| created_at | TIMESTAMPTZ | 作成日時 |

**invitation_code_uses** - 使用履歴

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID (PK) | レコードID |
| code | TEXT (FK) | 使用されたコード |
| user_id | UUID (FK) | 使用したユーザー |
| used_at | TIMESTAMPTZ | 使用日時 |

※ 同一ユーザーが同一コードを複数回使用することはできない（UNIQUE制約）

### API エンドポイント

#### POST /api/invitation/redeem

招待コードを適用してアクセスを承認。

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Body**:
```json
{
  "code": "WFMY7CHS"
}
```

**Response (成功)**:
```json
{
  "success": true
}
```

**Response (エラー)**:
```json
{
  "success": false,
  "error": "無効な招待コードです"
}
```

| エラー | 意味 |
|--------|------|
| `招待コードを入力してください` | コードが空 |
| `無効な招待コードです` | コードが存在しない or 無効 |
| `この招待コードは期限切れです` | expires_at を過ぎている |
| `このコードは既に使用済みです` | 同一ユーザーが使用済み |
| `承認処理に失敗しました` | DB更新エラー |

### 現在の招待コード

| コード | 用途 | 作成日 |
|--------|------|--------|
| `BETATESTER` | βテスター用 | 2026-02-03 |
| `WFMY7CHS` | コアユーザー向け | 2026-02-03 |
| `K60ZYE2U` | X告知用 | 2026-02-03 |

### 招待コードの管理

#### コードを追加

```sql
INSERT INTO invitation_codes (code, description)
VALUES ('NEWCODE', '説明');
```

#### 有効期限付きで追加

```sql
INSERT INTO invitation_codes (code, description, expires_at)
VALUES ('LIMITED', '期間限定', '2026-03-01');
```

#### コードを無効化

```sql
UPDATE invitation_codes SET is_active = false WHERE code = 'OLDCODE';
```

#### 使用状況を確認

```sql
SELECT
  c.code,
  c.description,
  c.is_active,
  COUNT(u.id) as use_count
FROM invitation_codes c
LEFT JOIN invitation_code_uses u ON c.code = u.code
GROUP BY c.code, c.description, c.is_active
ORDER BY c.created_at DESC;
```

#### ランダムコードを生成（シェル）

```bash
cat /dev/urandom | LC_ALL=C tr -dc 'A-Z0-9' | head -c 8
```

---

## 管理方法

### ユーザーを承認する

1. Supabase Dashboard → Table Editor → `user_access`
2. 承認したいユーザーの行を選択
3. `status` を `pending` から `approved` に変更
4. （任意）`approved_at` に現在時刻を設定
5. （任意）`note` にメモを追加
6. Save

### SQL で承認

```sql
UPDATE user_access
SET status = 'approved', approved_at = now()
WHERE email = 'user@example.com';
```

### pending ユーザーを確認

```sql
SELECT * FROM user_access WHERE status = 'pending' ORDER BY requested_at DESC;
```

### 一括承認

```sql
UPDATE user_access
SET status = 'approved', approved_at = now()
WHERE email IN ('user1@example.com', 'user2@example.com');
```

---

## 無効化方法

ウェイトリスト機能を完全に無効化するには:

### 方法1: ルートを無効化（推奨）

`server/index.js` の以下の行をコメントアウト:

```javascript
// waitlist.setupRoutes(app);
```

→ API は 404 を返す。フロントエンドのチェックは失敗し、全員アクセス可能になる。

### 方法2: 全員を承認

```sql
UPDATE user_access SET status = 'approved' WHERE status = 'pending';
```

### 方法3: フロントエンドのチェックを削除

`app.js`, `mypage.js`, `discover.html` から `checkAccess()` 呼び出しを削除。

---

## 完全削除方法

1. `server/index.js` から `require('./waitlist')` と `setupRoutes` を削除
2. `server/waitlist.js` を削除
3. `public/waitlist.html` を削除
4. `public/create.html` から `access-check-style` を削除
5. `auth.js` から `checkAccess`, `requireAuthAndAccess` を削除
6. `app.js` から `revealPage()` と `checkAccess()` 呼び出しを削除
7. 各ページから `checkAccess()` 呼び出しを削除
8. Supabase: `DROP TABLE user_access;`

---

## セキュリティ

- `user_access` テーブルは RLS で保護（service_role のみアクセス可）
- フロントエンドから直接テーブルにアクセスできない
- API は `supabaseAdmin`（service_role）経由でアクセス
- トークン検証は `supabaseAdmin.auth.getUser()` で実施

---

## トラブルシューティング

### ログイン後にログインページに戻される（無限リダイレクト）

**原因**: 複数の原因が考えられる

#### パターン1: OAuth コード交換の失敗

**確認方法**:
1. ブラウザのコンソールで `[Auth]` ログを確認
2. URL に `?code=xxx` が付いているか確認
3. サーバーログで `/api/check-access` が呼ばれているか確認

**解決策**:
- `create.html` の早期チェックで `code=` パラメータを除外しているか確認
- `auth.js` の `exchangeCodeForSession()` が呼ばれているか確認

#### パターン2: トークン期限切れによる無限ループ

**症状**:
- コンソールに `[Auth] Current session is valid` と出るが、`/api/check-access` が 401 を返す
- index.html ↔ create.html 間でリダイレクトがループする

**原因**:
- クライアントのセッションキャッシュでは「有効」と判断されるが、実際のトークンは期限切れ
- サーバーが 401 を返すと即座にリダイレクトしていた（リフレッシュを試みない）

**解決策**（実装済み 2026-02-01）:
- `checkAccess()` で 401 を受けた時、キャッシュをクリアして `getFreshSession()` で強制リフレッシュ
- リフレッシュ成功後に再試行、それでも 401 ならログインページへリダイレクト

**関連コード** (`auth.js:407-423`):
```javascript
// Token expired - clear cache and force refresh before giving up
if (response.status === 401) {
  console.log('[Auth] Token expired (server 401), forcing refresh...');

  // Clear cached session to force actual refresh
  currentSession = null;
  setCachedSession(null);

  const freshSession = await getFreshSession();
  if (!freshSession) {
    return { allowed: false, status: null, authError: true };
  }

  // Retry with fresh token
  token = freshSession.access_token;
  response = await fetch('/api/check-access', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}
```

### user_access にユーザーが登録されない

**原因**: waitlist.html で登録 API が呼ばれていない

**確認方法**:
1. ブラウザのコンソールで `[Waitlist] Registration response:` を確認
2. サーバーログで `/api/waitlist/register` が呼ばれているか確認

**解決策**:
- `waitlist.html` が `DreamCoreAuth` を使用しているか確認
- セッションが正しく取得できているか確認

#### パターン3: 別タブでの無限ループ

**症状**:
- 別タブでページを開くと無限リダイレクト
- 同じタブでは正常に動作する

**原因**:
- sessionStorage はタブ間で共有されない
- 早期チェックで sessionStorage のみを確認していた
- Supabase は localStorage にセッションを保存するが、それを見ていなかった

**解決策**（実装済み 2026-02-01）:
- 早期チェックで localStorage の Supabase セッションもフォールバックとして確認
- sessionStorage がなくても localStorage があればリダイレクトせず auth.js に任せる

**関連コード**（各 HTML の早期チェック）:
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

### ページが一瞬見えてからリダイレクトされる

**原因**: `visibility: hidden` スタイルがない

**解決策**:
- `create.html` に `<style id="access-check-style">body { visibility: hidden; }</style>` を追加
- `app.js` で `revealPage()` が呼ばれているか確認

---

## ファイル一覧

| ファイル | 役割 | 関連行 |
|----------|------|--------|
| `server/waitlist.js` | バックエンド API | 全体 |
| `server/index.js` | ルート登録 | `waitlist.setupRoutes(app)` |
| `public/waitlist.html` | ウェイトリストページ UI | 全体 |
| `public/create.html` | 早期チェック、visibility hidden | 30-70 |
| `public/auth.js` | `checkAccess()`, `exchangeCodeForSession()` | 116-145, 308-330 |
| `public/app.js` | `revealPage()`, アクセスチェック | 289-327, 366-372 |
| `public/mypage.js` | mypage のアクセスチェック | init() 内 |
| `public/discover.html` | discover のアクセスチェック | script 内 |
| `supabase/migrations/009_user_access.sql` | user_access テーブル定義 | 全体 |
| Supabase migration `add_invitation_codes` | 招待コードテーブル定義 | 全体 |
| `docs/WAITLIST.md` | このドキュメント | - |

---

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-01-30 | 初期実装完了 |
| 2026-01-30 | ページフラッシュ防止（visibility hidden + revealPage）追加 |
| 2026-01-30 | OAuth code exchange 対応追加 |
| 2026-01-30 | waitlist.html を DreamCoreAuth 使用に修正 |
| 2026-02-01 | トークン期限切れ時の自動リフレッシュ機能追加（無限リダイレクト修正） |
| 2026-02-01 | 別タブ問題修正（localStorage フォールバック追加） |
| 2026-02-01 | notifications.js に checkAccess 追加 |
| 2026-02-03 | 招待コード機能追加（invitation_codes, invitation_code_uses テーブル） |
