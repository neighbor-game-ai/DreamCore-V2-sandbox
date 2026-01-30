# 技術負債・リファクタリング提案

専門家レビュー（2026-01-29）に基づく構造改善の提案と評価。

---

## 概要

### コード構造

| 対象ファイル | 行数 | 主な問題 | 推奨度 |
|-------------|------|---------|--------|
| server/index.js | 2,441 | 9機能ブロック混在、60+エンドポイント | 強く推奨 |
| server/claudeRunner.js | 3,219 | 5責務混在、processJob()が247行 | 強く推奨 |
| public/app.js | 5,677 | 221メソッド、handleMessage()が375行 | 強く推奨 |
| server/database-supabase.js | 1,445 | 43箇所の{data,error}重複 | 推奨 |
| server/userManager.js | 1,337 | 69行HTMLテンプレート埋め込み | 部分推奨 |
| getModalClient() | 3ファイル | 同一関数の独立実装 | 推奨 |
| フロントエンド共通化 | 3ファイル | 認証パターン重複 | 部分推奨 |
| errorResponse.js | 未使用 | 48箇所が直接形式 | 推奨 |

### セキュリティ

| 問題 | 関連ファイル | リスク | 推奨度 |
|------|-------------|--------|--------|
| URLクエリにaccess_token | app.js, mypage.js, play.js | 履歴・Referer漏洩 | 強く推奨 |
| authMiddlewareがquery受付 | authMiddleware.js | URL経由流出 | 強く推奨 |
| 公開エンドポイントにトークン | /api/.../thumbnail | 不要な露出 | 強く推奨 |
| ゲームiframeにトークン付きURL | play.js, play.html | ゲーム側読み取り | 強く推奨 |
| セッションのlocalStorage保存 | auth.js | コンソール参照可 | 推奨 |
| Supabase設定のHTML直書き | create/editor/play.html | ソース露出 | 部分推奨 |

---

## 1. server/index.js 分割

### 現状の問題

- **2,441行**に9つの機能ブロックが混在
- 60以上のエンドポイントが1ファイルに集中
- WebSocket処理が645行（16種類のメッセージタイプ）
- 最大のエンドポイント: `/generate-movie` が292行

### 機能ブロック内訳

| ブロック | 行範囲 | 行数 |
|---------|--------|------|
| Express初期化 | 1-133 | 133 |
| Asset API | 451-708 | 258 |
| Project API | 1652-1980 | 316 |
| 画像/動画生成 | 266-298, 1818-2351 | 511 |
| 静的配信 | 710-787, 892-1004 | 190 |
| WebSocket | 1006-1650 | 645 |
| ページルート | 2370-2428 | 58 |

### 推奨構造

```
server/
├── index.js (250行)           # Express初期化、ミドルウェア、router登録
├── routes/
│   ├── health.js              # /api/health, /api/config
│   ├── jobs.js                # /api/jobs/*
│   ├── projects.js            # /api/projects/*
│   ├── assets.js              # /api/assets/*
│   ├── generate.js            # /api/generate-*
│   ├── games.js               # /game/*, /user-assets/*, /global-assets/*
│   └── pages.js               # /, /create, /mypage 等
├── services/
│   ├── imageGenerationService.js
│   ├── thumbnailGenerationService.js
│   └── movieGenerationService.js
└── websocket/
    ├── wsHandler.js           # 接続管理
    └── messageHandlers.js     # case文ロジック
```

### 効果

- index.js: 2,441行 → 約250行（-90%）
- テスト可能性向上（サービス層の単体テスト）
- 保守性向上（責務の明確化）

### 優先度: 高

### 工数見積: 3-4日

---

## 2. server/claudeRunner.js 分割

### 現状の問題

- **3,219行**、30以上のメソッド
- `processJob()` が247行で8つの責務
- ストリーム処理とJob管理が強く結合
- エラーマッピングが2箇所で重複定義（行1945-1954, 2146-2155）
- Modal/ローカル分岐が5箇所に分散

### 責務の混在

```
processJob() (247行)
├── ユーザーメッセージ検証
├── Intent検出（Restore/Chat判定）
├── Chat処理（Haiku呼び出し）
├── Gemini実行（新規/既存判定、SPEC読込、スキル検出）
├── 結果ハンドリング（Chat/Restore/Create/Edit）
├── 画像生成
├── Claude CLI実行（Modal/ローカル分岐）
└── 非同期後処理（Spec更新、プロジェクト改名）
```

### 推奨構造

```
server/
├── claudeRunner.js (800行)    # インテグレーション層
├── claude/
│   ├── streamParser.js        # ストリーム解析、イベント変換
│   ├── executor.js            # Modal/ローカル実行エンジン
│   ├── jobAdapter.js          # ストリーム→Job更新マッピング
│   ├── sandboxRuntime.js      # Sandbox初期化、ラッパー
│   └── errorFormatter.js      # エラーマッピング統一
```

### 効果

- ストリーム処理の独立テスト可能
- Modal/ローカル実行の統一インターフェース
- エラーハンドリングの一元化

### 優先度: 高

### 工数見積: 3-4日

---

## 3. public/app.js 分割

### 現状の問題

- **5,677行**、221メソッド
- `handleMessage()` が375行で60以上のcaseを処理
- UI状態・通信・描画・イベント処理が完全に混在
- Asset関連だけで769行（13.5%）

### 責務の混在

```
GameCreatorApp (5,677行)
├── 認証状態管理
├── WebSocket通信（200行）
├── メッセージ処理（375行）
├── UI描画（複数メソッド）
├── イベントリスナー（30+メソッド）
├── Asset操作（769行）
├── 画像エディタ
├── 画像生成
├── ナビゲーション
└── 通知
```

### 推奨構造

```
public/
├── app.js (500行)             # コア状態、初期化
├── modules/
│   ├── WsClient.js            # WebSocket通信、再接続
│   ├── EditorUI.js            # 描画、DOM操作
│   ├── AssetsUI.js            # アセット管理UI
│   ├── ImageEditorUI.js       # 画像編集UI
│   └── NotificationManager.js # 通知管理
```

### 効果

- テスト可能性5倍向上
- 保守性3倍向上
- リグレッション70%削減見込み

### 優先度: 高

### 工数見積: 4-5日

---

## 4. server/database-supabase.js ヘルパー化

### 現状の問題

- **1,445行**、約60関数
- `{ data, error }` パターンが43箇所
- エラーハンドリングが4-5種類に集約可能
- コード重複率: 約35-40%

### 重複パターン

| パターン | 出現回数 | 処理内容 |
|---------|---------|---------|
| 単一行取得（PGRST116処理） | 7 | null返却 |
| リスト取得（エラーで[]） | 11 | 空配列返却 |
| 作成/更新（データ返却） | 8 | null返却 |
| 削除操作（ブール値） | 5 | false返却 |
| admin専用操作 | 10 | supabaseAdmin使用 |

### 推奨: 共通ヘルパー導入

```javascript
// server/db-helpers.js
function handleSingleRowError(error, functionName) {
  if (error.code === 'PGRST116') return null;
  console.error(`[DB] ${functionName} error:`, error.message);
  return null;
}

function handleListError(error, functionName) {
  console.error(`[DB] ${functionName} error:`, error.message);
  return [];
}
```

### 効果

- 現在: 1,445行 → 改善後: 約1,200行（17%削減）
- エラーハンドリング統一
- ドメイン分割への足がかり

### 優先度: 中

### 工数見積: 1日

---

## 5. server/userManager.js テンプレート外部化

### 現状の問題

- **1,337行**
- `ensureProjectDir()` 内に69行のHTML埋め込み（行89-157）
- デザイン変更にコード修正が必要

### 問題のコード

```javascript
// ensureProjectDir() 内
const initialHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <!-- ... 69行のHTML ... -->
</html>`;
fs.writeFileSync(path.join(projectDir, 'index.html'), initialHtml);
```

### 推奨: 外部ファイル化

```
server/
├── templates/
│   └── initial-index.html     # 初期HTMLテンプレート
├── userManager.js
    // テンプレート読み込み
    const templatePath = path.join(__dirname, 'templates', 'initial-index.html');
    const initialHtml = fs.readFileSync(templatePath, 'utf-8');
```

### 効果

- デザイン変更が容易（HTMLファイル修正のみ）
- バージョン管理の明確化
- 将来の多言語対応への拡張性

### 優先度: 中

### 工数見積: 0.5日

---

## 6. getModalClient() シングルトン化

### 現状の問題

3ファイルで同一関数を独立実装:

| ファイル | 実装 | 条件チェック |
|---------|------|-------------|
| userManager.js (行23-28) | 遅延ロード | `config.USE_MODAL` あり |
| claudeRunner.js (行12-19) | 遅延ロード | `config.USE_MODAL` あり |
| index.js (行30-37) | 遅延ロード | なし |

### 推奨: 共通モジュール化

```javascript
// server/modalClientSingleton.js
const config = require('./config');
let clientInstance = null;

function getModalClient() {
  if (!clientInstance && config.USE_MODAL) {
    clientInstance = require('./modalClient');
  }
  return clientInstance;
}

module.exports = { getModalClient };
```

### 効果

- コード重複削減
- 条件チェックの統一
- 将来の拡張（接続プーリング等）が容易

### 優先度: 低

### 工数見積: 0.5日

---

## 7. フロントエンド共通ユーティリティ

### 現状の問題

`publish.js`, `mypage.js`, `notifications.js` で認証パターンが重複:

```javascript
// 3ファイルで同一
async init() {
  const session = await DreamCoreAuth.getSession();
  if (!session) {
    window.location.href = '/';
    return;
  }
  this.userId = session.user.id;
  // ...
}
```

### 推奨: 基底クラス導入

```javascript
// public/PageBase.js
class PageBase {
  async ensureAuthenticated() {
    const session = await DreamCoreAuth.getSession();
    if (!session) {
      window.location.href = '/';
      return null;
    }
    this.userId = session.user.id;
    this.accessToken = session.access_token;
    return session;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
```

### 共通化可能な項目

| 項目 | 削減行数 | 推奨度 |
|------|---------|--------|
| 認証ラッパー | 45行 | 強く推奨 |
| HTML Escape | 15行 | 推奨 |
| イベントバインディング | - | 不向き（各ファイル特有） |

### 優先度: 低

### 工数見積: 1日

---

## 8. errorResponse.js 一本化

### 現状の問題

`errorResponse.js` は完全実装済み（24種類のエラーコード）だが、ほぼ未使用:

| 場所 | 直接使用 | 標準化使用 |
|------|---------|-----------|
| HTTP API (index.js) | 48箇所 | 0箇所 |
| WebSocket (index.js) | 32箇所 | 2箇所 |
| authMiddleware.js | 6箇所 | 0箇所 |

### 現在の形式 vs 標準化形式

```javascript
// 現在（直接使用）
res.status(400).json({ error: 'Invalid job ID' })

// 標準化
sendHttpError(res, ErrorCodes.INVALID_ID_FORMAT, 'Invalid job ID')
// → { status: "error", error: { code: "INVALID_ID_FORMAT", message: "Invalid job ID" } }
```

### 注意事項

フロントエンドが新形式 `{ error: { code, message } }` に対応必要

### 優先度: 低（フロントエンド対応後）

### 工数見積: 2日（フロントエンド含む）

---

## 9. セキュリティ改善: URLクエリからのトークン排除

### 背景

アクセストークンがURLクエリパラメータに含まれる箇所が複数存在。
URLはブラウザ履歴、Refererヘッダー、サーバーログに残るため、トークン漏洩リスクがある。

### 問題箇所一覧

| 問題 | 関連ファイル | リスク |
|------|-------------|--------|
| URLクエリに`access_token` | public/app.js, mypage.js, play.js | 履歴・Referer漏洩 |
| authMiddlewareがquery param受付 | server/authMiddleware.js | URL経由の流出経路 |
| 公開エンドポイントにトークン付与 | /api/projects/:id/thumbnail | 不要なトークン露出 |
| ゲームiframeにトークン付きURL | public/play.js, play.html | ゲーム側に読み取られる |
| Supabaseセッションのローカル保存 | public/auth.js | コンソールから参照可能 |
| Supabase URL/anon keyをHTML直書き | create.html, editor.html, play.html | ソースに露出 |

---

### 9.1 URLクエリのアクセストークン排除

**対象:** public/app.js, public/mypage.js, public/play.js

#### 代替案A: Authorizationヘッダー + Blob/srcdoc（推奨）

サムネやゲームHTMLを`fetch`で取得し、`Authorization: Bearer`ヘッダーを使用。
取得後はBlob URL（画像）や`iframe.srcdoc`（HTML）で表示。

```javascript
// 現在
iframe.src = `/game/${userId}/${projectId}/?access_token=${token}`;

// 改善後
const response = await fetch(`/game/${userId}/${projectId}/`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const html = await response.text();
iframe.srcdoc = html;
```

**効果:** URLにトークンが残らない

#### 代替案B: 署名付き短命チケット

URLに載せるならアクセストークンではなく、プロジェクト単位・短TTL（数分）・読み取り専用のチケットを使用。

```javascript
// サーバー側でチケット発行
const ticket = generateTicket({ projectId, userId, ttl: 300, scope: 'read' });
// クライアント
iframe.src = `/game/${userId}/${projectId}/?ticket=${ticket}`;
```

**効果:** 漏れても影響が限定的

#### 代替案C: POSTでiframeへ渡す

`<form target="iframe">`でPOST送信し、トークンをボディに載せる。

**効果:** URL・履歴・Refererに残らない

---

### 9.2 authMiddlewareのクエリパラメータ受付廃止

**対象:** server/authMiddleware.js

#### 代替案A: Authorizationヘッダーのみ許可（推奨）

```javascript
// 現在
const token = req.headers.authorization?.replace('Bearer ', '')
           || req.query.access_token;  // ← これを削除

// 改善後
const token = req.headers.authorization?.replace('Bearer ', '');
```

**効果:** URL経由の流出経路を根本的に遮断

**注意:** WebSocketは「初回メッセージでトークン送信」方式に固定

#### 代替案B: 短命チケットのみ許可

クエリパラメータは`access_token`ではなく、サーバー発行の短命チケットのみ許容。

**効果:** 既存URL運用を崩しにくい

---

### 9.3 公開エンドポイントからトークン削除

**対象:** /api/projects/:projectId/thumbnail（公開サムネイル）

#### 代替案A: トークン付与を止める（推奨）

```javascript
// 現在（public/app.js, mypage.js）
const thumbnailUrl = `/api/projects/${projectId}/thumbnail?access_token=${token}`;

// 改善後
const thumbnailUrl = `/api/projects/${projectId}/thumbnail`;
```

**効果:** 公開エンドポイントなのでトークン不要、最小リスク

#### 代替案B: 非公開サムネは別エンドポイント

```
/api/projects/:id/thumbnail        # 公開（認証不要）
/api/projects/:id/thumbnail-private # 非公開（ヘッダー認証+Blob取得）
```

---

### 9.4 ゲームiframeのトークン排除

**対象:** public/play.js, public/play.html

#### 代替案A: 別オリジン分離 + トークン不使用（推奨）

ゲームは別ドメイン（例: `play.dreamcore.gg`）で実行し、親ページの認証情報にアクセス不能にする。

```
親ページ (dreamcore.gg)
  ├── 認証情報を保持
  └── iframe (play.dreamcore.gg)
        ├── 認証情報にアクセス不能
        └── 必要なリソースはサーバー経由 or 署名付きURL
```

**効果:** ゲームコードからトークン読み取り不可

**関連:** CLAUDE.md「iframe sandbox属性のセキュリティ対策（Phase 2でサブドメイン方式で対応）」

#### 代替案B: sandbox強化 + トークン非URL化

iframeを`sandbox`属性で制限し、URLにトークンを載せない（9.1-Aと併用）。

**注意:** sandboxだけではURLからの読み取りは防げないのでトークン削除が前提

---

### 9.5 Supabaseセッションの保存方法

**対象:** public/auth.js

#### 代替案A: メモリ保持のみ

セッションはページ存続中のみ保持。localStorageを使わない。

**効果:** コンソールからの常時参照を減らす
**トレードオフ:** UX低下（再読み込みで再認証）

#### 代替案B: sessionStorageに限定（推奨）

```javascript
// 現在（Supabase SDK デフォルト）
localStorage.setItem('supabase.auth.token', ...);

// 改善後
sessionStorage.setItem('supabase.auth.token', ...);
```

**効果:** 永続性を減らして露出面を縮小（タブ閉じで消える）

#### 代替案C: HttpOnlyクッキー

本来の定石。現行方針では禁止なので、要ポリシー再検討。

---

### 9.6 Supabase URL/anon keyの直書き排除

**対象:** public/create.html, editor.html, play.html

#### 代替案A: /api/config から取得（推奨）

```javascript
// 現在（HTML内）
const supabaseUrl = 'https://xxx.supabase.co';
const supabaseAnonKey = 'eyJ...';

// 改善後
const config = await fetch('/api/config').then(r => r.json());
const supabaseUrl = config.supabaseUrl;
const supabaseAnonKey = config.supabaseAnonKey;
```

**効果:** 直書きを避けられる（秘匿にはならないが、管理が一元化）

**注意:** /api/config は既に実装済み

#### 代替案B: サーバー経由のみの認証

クライアントが直接Supabaseを叩かない構成。大改修が必要。

---

### セキュリティ改善の優先度

| 優先度 | 項目 | 理由 | 工数 |
|--------|------|------|------|
| 1 | サムネURLからトークン削除 | 公開エンドポイントなのですぐに外せる | 0.5日 |
| 2 | authMiddlewareのクエリ受付廃止 | URL漏洩経路を止める | 1日 |
| 3 | ゲームiframeのトークン排除 | 最重要：ゲーム側に読み取られる | 2-3日 |
| 4 | sessionStorage移行 | 露出面縮小 | 0.5日 |
| 5 | /api/config活用 | 直書き排除 | 0.5日 |

---

## 実装優先度まとめ

### Phase 0: セキュリティ改善（優先）

| 項目 | 工数 | 効果 |
|------|------|------|
| サムネURLからトークン削除 | 0.5日 | 公開エンドポイントの即時修正 |
| authMiddlewareのクエリ受付廃止 | 1日 | URL漏洩経路の遮断 |
| ゲームiframeのトークン排除 | 2-3日 | ゲーム側読み取り防止 |
| sessionStorage移行 | 0.5日 | 露出面縮小 |

### Phase 1: 高優先度（コア改善）

| 項目 | 工数 | 効果 |
|------|------|------|
| index.js 分割 | 3-4日 | 保守性大幅向上 |
| claudeRunner.js 分割 | 3-4日 | テスト可能性向上 |
| app.js 分割 | 4-5日 | リグレッション削減 |

### Phase 2: 中優先度（品質改善）

| 項目 | 工数 | 効果 |
|------|------|------|
| database-supabase.js ヘルパー化 | 1日 | コード重複17%削減 |
| userManager.js テンプレート外部化 | 0.5日 | デザイン変更容易化 |

### Phase 3: 低優先度（長期改善）

| 項目 | 工数 | 効果 |
|------|------|------|
| getModalClient シングルトン化 | 0.5日 | コード統一 |
| フロントエンド共通化 | 1日 | 認証重複削減 |
| errorResponse 一本化 | 2日 | エラー形式統一 |

---

## 検証日

2026-01-29

## 参照

- 専門家レビュー結果（2026-01-29 チャットログ）
- DreamCore-V2 オリジナル: `/Users/admin/DreamCore-V2/`
