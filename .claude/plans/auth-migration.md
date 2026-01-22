# DreamCore V2 認証移行ドキュメント

**作成日:** 2026-01-22
**更新日:** 2026-01-22
**目的:** visitorId → Supabase Auth (user.id) への完全移行

---

## 1. 移行方針

### 1.1 基本原則

| 項目 | 方針 |
|------|------|
| 認証方式 | Supabase Auth 一本化（visitorIdフォールバック廃止） |
| 起動時チェック | SUPABASE_URL/SUPABASE_ANON_KEY 未設定で即エラー終了（**config.jsに集約**） |
| 所有者チェック | `project.user_id === req.user.id` / `asset.owner_id === req.user.id` |
| パストラバーサル | `/game` エンドポイントで必須（UUID検証 + path.resolve + startsWith） |
| UUID検証 | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`（全箇所で統一） |

### 1.2 Phase 1 スコープ

- Creator機能のみ（ゲーム作成・プレビュー・保存）
- **公開機能なし**
- アセットは**所有者のみ**アクセス可能（publicアセットも返さない）

### 1.3 Phase 1 で削除/無効化する既存API

**重要:** 現行コードには公開系ルートが既に存在する。Phase 1では削除または無効化が必須。

| パス | 行番号 | 対応 | 理由 |
|------|--------|------|------|
| `GET /api/public-games` | index.js:689 | **削除** | Phase 1では公開機能なし |
| `GET /api/public/games/random` | index.js:2154 | **削除** | Phase 1では公開機能なし |
| `GET /api/public/games/:projectId` | index.js:2176 | **削除** | Phase 1では公開機能なし |
| `POST /api/auth/login` | index.js:73 | **削除** | Supabase Authで代替 |
| `POST /api/auth/logout` | index.js:108 | **削除** | supabase.auth.signOut()で代替 |
| `GET /api/auth/me` | index.js:119 | **削除** | JWTから取得 or supabase.auth.getUser() |

**理由:** 移行後に「意図せず公開」の事故を防ぐため、認証の二重管理を避けるため

---

## 2. API認可マップ

### 2.1 公開エンドポイント（認証不要）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック |
| GET | `/` | ランディングページ |
| GET | `/create` | 作成ページ（UI側で未ログインならリダイレクト） |
| GET | `/project/:id` | プロジェクトページ（UI側で認証チェック） |
| GET | `/mypage` | マイページ（UI側で認証チェック） |

### 2.1.1 既存だがPhase 1で制限するエンドポイント

| メソッド | パス | Phase 1 | Phase 2 |
|---------|------|---------|---------|
| GET | `/play/:projectId` | **owner-only**（プレビュー用途として継続） | 公開ゲームは誰でもアクセス可 |
| GET | `/discover` | **静的ページ配信**（フロントで空状態表示） | 公開ゲーム一覧を表示 |

**Phase 1の実装:**

`/play/:projectId` - サーバー側で認証・所有者チェック:
```javascript
app.get('/play/:projectId', authenticate, async (req, res) => {
  const project = await db.getProjectById(req.params.projectId);
  if (!project || project.user_id !== req.user.id) return res.status(403).send('Forbidden');
  // 静的ファイル配信
  res.sendFile(path.join(__dirname, '../public/play.html'));
});
```

`/discover` - 静的ページ配信（フロント側で空状態表示）:
```javascript
// サーバー側は静的ファイルをそのまま配信（変更なし）
app.get('/discover', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/discover.html'));
});
```

**UI側の責務:** `public/discover.html` の静的HTMLで空状態を表示（JSでの動的差し込み不要）
```html
<!-- public/discover.html -->
<!-- Phase 1: ゲームリスト部分を静的に「準備中」表示に置換 -->
<div id="game-list">
  <div class="empty-state">
    <p>公開ゲーム機能はPhase 2で提供予定です</p>
  </div>
</div>
<!-- Phase 2: JSでAPIから取得したゲーム一覧を動的に表示 -->
```

**Phase 2で追加予定:**
- `GET /api/public-games` - 公開ゲーム一覧
- `GET /api/public/games/:gameId` - 公開ゲーム詳細

### 2.2 認証必須 + 所有者チェック

#### /game（ファイル配信）

| メソッド | パス | 認可 | 備考 |
|---------|------|------|------|
| GET | `/game/:userId/:projectId/*` | authenticate + 所有者 | パストラバーサル対策必須 |

**認可ロジック:**
```javascript
// 統一UUID正規表現
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. 認証
if (!req.user) return 401;

// 2. UUID形式検証
if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(projectId)) return 400;

// 3. 所有者チェック
if (req.params.userId !== req.user.id) return 403;

// 4. パストラバーサル対策
const baseDir = `/data/projects/${userId}/${projectId}`;
const resolved = path.resolve(baseDir, filePath);
if (!resolved.startsWith(baseDir + '/') && resolved !== baseDir) return 403;
```

#### /api/projects（REST API）

| メソッド | パス | 認可 | 備考 |
|---------|------|------|------|
| GET | `/api/projects` | authenticate | 自分のプロジェクト一覧のみ |
| GET | `/api/projects/:id` | authenticate + 所有者 | |
| GET | `/api/projects/:id/code` | authenticate + 所有者 | |
| GET | `/api/projects/:id/preview` | authenticate + 所有者 | **Phase 1/2共通でowner-only** |
| GET | `/api/projects/:id/download` | authenticate + 所有者 | |
| GET | `/api/projects/:id/ai-context` | authenticate + 所有者 | |
| GET | `/api/projects/:id/active-job` | authenticate + 所有者 | |
| GET | `/api/projects/:id/jobs` | authenticate + 所有者 | |
| GET | `/api/projects/:id/publish-draft` | authenticate + 所有者 | |
| PUT | `/api/projects/:id/publish-draft` | authenticate + 所有者 | |
| POST | `/api/projects/:id/generate-publish-info` | authenticate + 所有者 | |
| POST | `/api/projects/:id/generate-thumbnail` | authenticate + 所有者 | |
| POST | `/api/projects/:id/upload-thumbnail` | authenticate + 所有者 | |
| GET | `/api/projects/:id/thumbnail` | authenticate + 所有者 | |
| POST | `/api/projects/:id/generate-movie` | authenticate + 所有者 | |
| GET | `/api/projects/:id/movie` | authenticate + 所有者 | |

---

#### /api/projects - WebSocket経由の操作

以下の操作はREST APIではなく、WebSocket経由で実行:

| 操作 | メッセージタイプ | 認可 |
|------|------------------|------|
| プロジェクト作成 | `createProject` | authenticate |
| プロジェクト削除 | `deleteProject` | authenticate + 所有者 |
| プロジェクト名変更 | `renameProject` | authenticate + 所有者 |

**理由:** 既存実装がWebSocket経由で動作しており、REST API追加は複雑さを増すため

#### /api/assets

| メソッド | パス | 認可 | Phase 1 | Phase 2 |
|---------|------|------|---------|---------|
| POST | `/api/assets/upload` | authenticate | 所有者のみ | 所有者のみ |
| GET | `/api/assets` | authenticate | 所有者のみ | 所有者のみ |
| GET | `/api/assets/search` | authenticate | **所有者のみ（publicも返さない）** | 所有者 + public |
| GET | `/api/assets/:id` | authenticate | **所有者のみ** | 所有者 or is_public |
| GET | `/api/assets/:id/meta` | authenticate | **所有者のみ** | 所有者 or is_public |
| PUT | `/api/assets/:id` | authenticate + 所有者 | | |
| PUT | `/api/assets/:id/publish` | authenticate + 所有者 | | |
| DELETE | `/api/assets/:id` | authenticate + 所有者 | | |

**Phase 1 重要事項:**
- `/api/assets/search` は公開アセットも**返さない**
- 検索APIは公開対象を返しやすいため、Phase 1では完全にowner-onlyとする

#### /api/jobs

| メソッド | パス | 認可 | 備考 |
|---------|------|------|------|
| GET | `/api/jobs/:id` | authenticate + 所有者 | job.user_id === req.user.id |
| POST | `/api/jobs/:id/cancel` | authenticate + 所有者 | |

#### コスト系API

| メソッド | パス | 認可 | 備考 |
|---------|------|------|------|
| POST | `/api/generate-image` | authenticate | レート制限対象 |
| POST | `/api/assets/remove-background` | authenticate | レート制限対象 |

### 2.3 WebSocket

| 項目 | 変更内容 |
|------|----------|
| 接続認証 | `access_token` 必須、`verifyWebSocketAuth()` で検証 |
| initメッセージ | `visitorId` 削除、トークンから `user.id` を取得 |
| 接続管理 | `wsConnections` のキーを `userId` に変更 |
| メッセージ処理 | 全処理で `project.user_id === ws.userId` を確認 |

**接続フロー:**
```
1. Client: WebSocket接続時に ?access_token=xxx を付与
2. Server: verifyWebSocketAuth(token) で userId 確定
3. Server: ws.userId = user.id をセット
4. Server: 以降の全メッセージで ws.userId を使用
```

---

## 3. ファイル修正マップ

### 3.1 サーバー側

| ファイル | 参照数 | 修正内容 |
|---------|--------|----------|
| `server/config.js` | 3 | legacyAuth削除、**起動時チェックを集約** |
| `server/supabaseClient.js` | - | エラーハンドリング強化 |
| `server/authMiddleware.js` | 5 | visitorIdフォールバック削除 |
| `server/index.js` | 123 | 全API/WSでreq.user.id使用、ミドルウェア適用、**public-games系削除** |
| `server/userManager.js` | 50 | 関数シグネチャ visitorId→userId |
| `server/claudeRunner.js` | 50 | 関数シグネチャ visitorId→userId |
| `server/database.js` | 10 | legacy関数削除、スキーマ整理 |

### 3.2 フロントエンド

| ファイル | 参照数 | 修正内容 |
|---------|--------|----------|
| `public/app.js` | 40+ | Supabase Auth SDK、API共通関数 |
| `public/mypage.js` | 5 | 認証フロー変更 |
| `public/notifications.js` | 5 | 認証フロー変更 |
| `public/index.html` | 3 | 認証チェック変更 |

### 3.3 削除対象

| ファイル/コード | 理由 |
|----------------|------|
| `scripts/migrate-assets.js` | V1移行用、V2では不要 |
| `GET /api/public-games` | Phase 1では公開機能なし |
| `GET /api/public/games/random` | Phase 1では公開機能なし |
| `GET /api/public/games/:projectId` | Phase 1では公開機能なし |
| `POST /api/auth/login` | Supabase Authで代替 |
| `POST /api/auth/logout` | supabase.auth.signOut()で代替 |
| `GET /api/auth/me` | JWTから取得 or supabase.auth.getUser() |

### 3.4 ドキュメント更新（最後に実施）

- `README.md`
- `ARCHITECTURE.md`
- `SPECIFICATION.md`

---

## 4. 実装フェーズ

### Phase A: 認証基盤

**目的:** Supabase Auth必須化、フォールバック完全削除
**責務:** 起動時チェックは **config.js に集約**（重複回避）

| ID | タスク | ファイル | 備考 |
|----|--------|----------|------|
| A-1 | 起動時ガードレール追加 | `config.js` | **全チェックをここに集約** |
| A-2 | legacyAuth削除 | `config.js` | |
| A-3 | visitorIdフォールバック削除 | `authMiddleware.js` | |
| A-4 | エラーハンドリング強化 | `supabaseClient.js` | |
| A-5 | 起動時チェック呼び出し | `index.js` | config.jsのチェックを呼ぶだけ |
| A-6 | cookie-parser追加 | `index.js` | |

**検証:** ✅完了
- [x] Supabase未設定で起動 → エラー終了
- [x] Supabase設定済みで起動 → 正常起動

### Phase B: ルーティング認可

**目的:** 全エンドポイントに認証・認可を適用

| ID | タスク | ファイル | 備考 |
|----|--------|----------|------|
| B-1 | /game 認証+所有者+パストラバーサル | `index.js` | UUID検証統一 |
| B-2 | /api/projects/* 認証+所有者 | `index.js` | preview含む全てowner-only |
| B-3 | /api/assets/* 認証+所有者 | `index.js` | **searchもowner-onlyに** |
| B-4 | /api/jobs/* 認証+所有者 | `index.js` | |
| B-5 | WebSocket認証 | `index.js` | |
| B-6 | visitorIdクエリパラメータ削除 | `index.js` | |
| B-7 | **public-games系API削除** | `index.js` | Phase 1では不要 |
| B-8 | **/api/auth/* 削除** | `index.js` | Supabase Authで代替 |
| B-9 | /play/:projectId を owner-only に変更 | `index.js` | プレビュー用途として継続 |
| B-10 | /discover を静的ページ配信に維持 | `index.js`, `public/discover.html` | フロントで空状態表示 |

**検証:** ✅完了
- [x] 未認証でAPI呼び出し → 401
- [x] 他ユーザーのリソースアクセス → 403
- [x] パストラバーサル攻撃 → 403
- [x] public-games系APIが404
- [x] /api/auth/* が404
- [x] /play/:projectId が他ユーザーのプロジェクトで403
- [x] /discover が静的ページを返し、フロントで空状態表示

### Phase C: 関数シグネチャ統一

**目的:** サーバー内部のvisitorId参照を完全排除

| ID | タスク | ファイル |
|----|--------|----------|
| C-1 | 関数引数 visitorId→userId | `userManager.js` |
| C-2 | 関数引数 visitorId→userId | `claudeRunner.js` |
| C-3 | legacy関数削除 | `database.js` |
| C-4 | visitor_id列の扱い決定 | `database.js` |

**置換ルール:**
```
visitorId → userId
getOrCreateUser(visitorId) → getUserById(userId)
getUserByVisitorId(x) → getUserById(x)
db.getUserByVisitorId → db.getUserById
```

**検証:** ✅完了
- [x] grep "visitorId" server/ → 0件
- [x] 全機能の動作確認

### Phase D: フロントエンド

**目的:** クライアント側のSupabase Auth対応

| ID | タスク | ファイル |
|----|--------|----------|
| D-1 | Supabase Auth SDK導入 | `public/` |
| D-2 | API共通関数（token付与） | `public/app.js` |
| D-3 | visitorId参照削除 | `public/app.js` |
| D-4 | WebSocket接続時token付与 | `public/app.js` |
| D-5 | 各ページ更新 | `public/*.js` |

**API共通関数:**
```javascript
async function apiCall(path, options = {}) {
  const session = await supabase.auth.getSession();
  const token = session?.data?.session?.access_token;

  return fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : undefined
    }
  });
}
```

**検証:** ✅完了
- [x] Googleログイン → 成功
- [x] プロジェクト作成 → 成功
- [x] プレビュー表示 → 成功
- [x] アセットアップロード → 成功

### Phase E: クリーンアップ ✅完了

| ID | タスク |
|----|--------|
| E-1 | 不要ファイル削除 |
| E-2 | コメント・JSDoc更新 |
| E-3 | README.md更新 |
| E-4 | ARCHITECTURE.md更新 |
| E-5 | SPECIFICATION.md更新 |

---

## 5. データベーススキーマ

### 5.1 usersテーブル

**現行（server/database.js:49-56）:**
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  visitor_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**変更:** スキーマ変更なし（既にV2対応済み）
- `visitor_id` は NULL許可のまま残す（将来削除予定）

### 5.2 削除対象テーブル

| テーブル | 行番号 | 理由 |
|---------|--------|------|
| `login_users` | database.js:58-68 | Supabase Authで代替 |
| `sessions` | database.js:70-77 | Supabase Authで代替 |

### 5.3 既存データの扱い

**方針:** V2は新規構築のため、既存ローカルデータは破棄

- `/Users/admin/DreamCore-V2/users/` 配下は削除
- `/Users/admin/DreamCore-V2/data/` 配下は削除
- Supabaseにマイグレーションスクリプトで初期スキーマ作成

---

## 6. セキュリティチェックリスト

### 認証

- [ ] 全保護エンドポイントで `authenticate` ミドルウェア適用
- [ ] JWT検証エラー時は 401 を返す
- [ ] トークン期限切れ時は 401 を返す

### 認可

- [ ] 所有者チェックで `===` 厳密比較
- [ ] プロジェクト取得時に `user_id` 条件を必ず含める
- [ ] アセット取得時に `owner_id` 条件を必ず含める

### パストラバーサル

- [ ] UUID形式検証: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- [ ] `path.resolve()` で正規化
- [ ] `startsWith(baseDir + '/')` でディレクトリ外アクセス防止

### WebSocket

- [ ] 接続時にトークン必須
- [ ] 無効トークンで接続拒否
- [ ] 全メッセージで所有者チェック

### Phase 1 固有

- [ ] public-games系API削除済み
- [ ] /api/auth/* 削除済み
- [ ] `/api/assets/search` がpublicアセットを返さない
- [ ] `/play/:projectId` がowner-onlyになっている
- [ ] `/discover` が静的ページを返し、フロントで空状態表示

---

## 7. 検証シナリオ

### 正常系

1. Googleログイン → ダッシュボード表示
2. プロジェクト作成 → 成功
3. チャットでゲーム生成 → プレビュー表示
4. アセットアップロード → 成功
5. バージョン履歴 → 表示・復元成功
6. ログアウト → セッションクリア

### 異常系

1. 未認証でAPI呼び出し → 401
2. 他ユーザーのプロジェクトアクセス → 403
3. 他ユーザーのアセットアクセス → 403
4. パストラバーサル（`../`） → 403
5. 無効トークンでWebSocket接続 → 拒否
6. Supabase未設定で起動 → エラー終了
7. public-games系APIアクセス → 404
8. /api/auth/* アクセス → 404
9. 他ユーザーの /play/:projectId → 403
10. /discover アクセス → 静的ページ（フロントで「Phase 2準備中」表示）

---

## 8. 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-01-22 | 初版作成 |
| 2026-01-22 | 専門家レビュー反映: public-games削除方針追加、UUID正規表現統一、assets/searchのPhase1動作明確化、現行スキーマ修正、起動チェック集約明記 |
| 2026-01-22 | 専門家レビュー2反映: /api/auth/*削除追加、REST APIとWebSocket操作の区別明確化、/play(owner-only)と/discover(空リスト)のPhase1動作追加 |
| 2026-01-22 | 専門家レビュー3反映: res.render→静的ページ+フロント空状態表示、/api/projects表構造修正、db.getProject→db.getProjectById |
| 2026-01-22 | 専門家レビュー4反映: /discover UI責務明確化、WebSocket操作を独立見出し+表形式に変更 |
| 2026-01-22 | **Phase 1 完了**: 全フェーズ(A-E)実装・検証完了。全テスト(RLS, WebSocket, Assets, Project CRUD)成功。 |
