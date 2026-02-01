# レビュー指摘への対応回答

対象: `REVIEW_FINDINGS_kinopiee.md`
回答日: 2026-02-01

---

## P0: CLI 実行が非サンドボックス + `--dangerously-skip-permissions`

### 指摘内容

> CLI が OS 権限で実行されるため、リモートコード実行 / 秘密情報読み出しのリスク。

### 現状の問題点

ご指摘の通り、以下の問題があります：

#### A. Modal 未対応エンドポイント（index.js 内で直接 spawn）

| 箇所 | エンドポイント | 状態 |
|------|----------------|------|
| `server/index.js:2412` | `POST /api/projects/:projectId/generate-publish-info` | ローカル直接実行 |
| `server/index.js:2841` | `POST /api/projects/:projectId/generate-movie` | ローカル直接実行 |

#### B. claudeRunner 内のフォールバック

| 箇所 | 関数 | 状態 |
|------|------|------|
| `claudeRunner.js:352-358` | `detectIntent()` | Modal 失敗時 → `_detectIntentLocal()` にフォールバック |
| `claudeRunner.js:686-692` | `detectSkillsWithAI()` | Modal 失敗時 → `_detectSkillsWithAILocal()` にフォールバック |
| `claudeRunner.js:165` | `spawnClaudeAsync()` | Sandbox 失敗時 → `spawn('claude', ...)` にフォールバック |
| `claudeRunner.js:178` | `spawnClaude()` | 常にローカル実行 |

当初「本番は Modal だから安全」と回答しましたが、これは**運用の宣言であり、コードで強制されていない**という監視役の指摘を受け、認識を改めました。

### 対応方針: 全 CLI 実行を Modal Sandbox 内に統一

**すべての Claude CLI 実行を Modal Sandbox 経由に移行し、ローカル実行へのフォールバックを禁止します。**

#### 1. Modal 未対応エンドポイントの移行

| エンドポイント | 現状 | 対応 |
|----------------|------|------|
| `POST /api/projects/:projectId/generate-publish-info` | `spawn('claude', ...)` 直接実行 | `modalClient.chatHaiku()` に移行 |
| `POST /api/projects/:projectId/generate-movie` | `spawn('claude', ...)` 直接実行 | `modalClient.chatSonnet()` に移行 |

#### 2. claudeRunner 内のフォールバック全面停止

```javascript
// detectIntent() - claudeRunner.js:352-358
// Before:
} catch (err) {
  console.error('[detectIntent] Modal error, falling back to local:', err.message);
}
return this._detectIntentLocal(userMessage);  // フォールバック

// After:
} catch (err) {
  console.error('[detectIntent] Modal error:', err.message);
  throw new Error('Modal execution failed: ' + err.message);  // フォールバックしない
}
```

```javascript
// detectSkillsWithAI() - claudeRunner.js:686-692
// Before:
} catch (err) {
  console.error('[detectSkillsWithAI] Modal error, falling back to local:', err.message);
}
return this._detectSkillsWithAILocal(...);  // フォールバック

// After:
} catch (err) {
  console.error('[detectSkillsWithAI] Modal error:', err.message);
  throw new Error('Modal execution failed: ' + err.message);  // フォールバックしない
}
```

```javascript
// spawnClaudeAsync() - claudeRunner.js:156-165
// Before:
} catch (e) {
  console.error('[sandbox-runtime] Wrap failed:', e.message);
  // Fall through to non-sandboxed execution
}
return spawn('claude', args, options);  // フォールバック

// After:
} catch (e) {
  console.error('[sandbox-runtime] Wrap failed:', e.message);
  throw new Error('Sandbox execution failed: ' + e.message);  // フォールバックしない
}
```

#### 3. 環境別の振る舞い

| 環境 | USE_MODAL | 振る舞い |
|------|-----------|----------|
| **本番** (`NODE_ENV=production`) | `true` 必須 | Modal 経由で実行。Modal 障害時はエラーを返す（フォールバックしない） |
| **本番** (`NODE_ENV=production`) | `false` | **起動拒否**（即座に exit） |
| **開発** (`NODE_ENV=development`) | `true` | Modal 経由で実行（本番と同じ動作を確認可能） |
| **開発** (`NODE_ENV=development`) | `false` | ローカル CLI 実行を**許可**（開発効率のため） |

```javascript
// server/config.js に追加
if (process.env.NODE_ENV === 'production' && !USE_MODAL) {
  console.error('FATAL: USE_MODAL=true is required in production');
  process.exit(1);
}

// claudeRunner.js のフォールバック箇所
if (process.env.NODE_ENV === 'production') {
  throw new Error('Modal execution failed - no fallback in production');
}
// 開発環境のみフォールバックを許可
console.warn('[DEV] Falling back to local CLI execution');
return this._detectIntentLocal(userMessage);
```

#### 4. ローカル実行コードの扱い

| 関数 | 対応 |
|------|------|
| `_runClaudeLocal()` | 開発用として残す（本番では呼び出されない） |
| `_detectIntentLocal()` | 開発用として残す（本番では呼び出されない） |
| `_detectSkillsWithAILocal()` | 開発用として残す（本番では呼び出されない） |
| `spawnClaude()` | 廃止または開発専用としてマーク |

### 実装タスク

- [ ] `generate-publish-info` を `modalClient.chatHaiku()` に移行
- [ ] `generate-movie` を `modalClient.chatSonnet()` に移行
- [ ] `detectIntent()` のフォールバックを本番で禁止
- [ ] `detectSkillsWithAI()` のフォールバックを本番で禁止
- [ ] `spawnClaudeAsync()` のフォールバックを本番で禁止
- [ ] `spawnClaude()` を廃止または開発専用としてマーク
- [ ] 起動時に `USE_MODAL=true` を必須化（本番環境）
- [ ] テスト: Modal 障害時に適切なエラーが返ることを確認
- [ ] テスト: 開発環境でローカルフォールバックが動作することを確認

### 補足: `--dangerously-skip-permissions` について

このフラグは Modal Sandbox 内でも使用しています。これは Claude CLI がファイル操作を行うために必要です。

Modal Sandbox 環境では以下の多層防御により、リスクは大幅に緩和されています：

| 防御層 | 内容 |
|--------|------|
| コンテナ隔離 | `modal.Sandbox.create()` による隔離環境 |
| ネットワーク制限 | `cidr_allowlist` で GCE api-proxy のみ許可 |
| API キー隔離 | Sandbox 内に API キーなし（api-proxy 設計） |
| 非 root 実行 | `claude` ユーザーで実行 |
| ファイルシステム制限 | `/data` ボリュームのみマウント |

---

## P0: パストラバーサル

### 指摘内容

> `../` を含むファイル名でプロジェクト外の読み書きが可能。

### 現状の問題点

- `server/index.js:1063-1064` で `..` チェックを実施済み
- ただし `server/userManager.js` の `readProjectFile` / `writeProjectFile` 単体では検証なし
- 呼び出し元でチェックしているが、防御の深層化ができていない

### 対応方針: 対応する

`userManager.js` 内の関数でも `path.resolve` + ベースディレクトリ外チェックを追加します。

```javascript
// userManager.js に追加
const isPathSafe = (basePath, targetPath) => {
  const resolved = path.resolve(basePath, targetPath);
  return resolved.startsWith(path.resolve(basePath) + path.sep);
};

// readProjectFile / writeProjectFile で使用
if (!isPathSafe(projectDir, filename)) {
  throw new Error('Invalid file path');
}
```

### 実装タスク

- [ ] `userManager.js` にパス検証関数を追加
- [ ] `readProjectFile` / `writeProjectFile` で検証を実施
- [ ] テスト: `../` を含むパスが拒否されることを確認

---

## P0: レート制限未実装

### 指摘内容

> 認証/高コスト API へのブルートフォースや濫用が可能。

### 現状の問題点

- `server/config.js:256-274` に設定値のみ存在（`RATE_LIMIT.api.authenticated: 60` 等）
- **実際の制限機構が未実装**
- `express-rate-limit` は `deploy/api-proxy` にのみ導入済み

### 対応方針: 対応する

`express-rate-limit` を導入し、API/WebSocket 別にレート制限を実装します。

#### 高コスト API の特定

| パス | 処理内容 | 制限理由 |
|------|----------|----------|
| `POST /api/projects/:projectId/generate-publish-info` | Claude CLI (Haiku) | LLM コスト |
| `POST /api/projects/:projectId/generate-thumbnail` | Claude CLI + 画像生成 | LLM + GPU コスト |
| `POST /api/projects/:projectId/generate-movie` | Claude CLI (Sonnet) | LLM コスト |
| `POST /api/generate-image` | 画像生成 API | GPU コスト |
| WebSocket `generate` | メインのゲーム生成 | LLM コスト（最大） |

#### 実装例

```javascript
// server/index.js に追加
const rateLimit = require('express-rate-limit');

// 一般 API 向け（認証済み）
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分
  max: config.RATE_LIMIT.api.authenticated,  // 60 requests/min
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many requests, please try again later' },
});

// 高コスト API 向け（CLI 実行・画像生成等）
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分
  max: 5,  // 5 requests/min per user
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Rate limit exceeded for expensive operations' },
});

// 適用
app.use('/api/', generalLimiter);

// 高コスト API に個別適用
app.use('/api/projects/:projectId/generate-publish-info', expensiveLimiter);
app.use('/api/projects/:projectId/generate-thumbnail', expensiveLimiter);
app.use('/api/projects/:projectId/generate-movie', expensiveLimiter);
app.use('/api/generate-image', expensiveLimiter);
```

### 実装タスク

- [ ] `express-rate-limit` を `package.json` に追加
- [ ] 一般 API 向けレート制限を実装（60 req/min）
- [ ] 高コスト API 向けレート制限を実装（5 req/min）
  - [ ] `/api/projects/:projectId/generate-publish-info`
  - [ ] `/api/projects/:projectId/generate-thumbnail`
  - [ ] `/api/projects/:projectId/generate-movie`
  - [ ] `/api/generate-image`
- [ ] WebSocket 接続数制限を実装（ユーザーあたり最大接続数）
- [ ] WebSocket メッセージレート制限を実装（generate メッセージ）

---

## P0: WebSocket 認証タイムアウトなし

### 指摘内容

> 未認証接続を無期限保持でき、DoS が可能。

### 現状の問題点

- `server/index.js:1577-1607` で接続後 `init` メッセージを待つが、タイムアウトなし
- 未認証のまま接続を維持し続けることが可能

### 対応方針: 対応する

接続後 10 秒以内に `init` が来なければ切断します。

```javascript
// server/index.js の wss.on('connection') 内
wss.on('connection', (ws) => {
  let userId = null;

  // 認証タイムアウト: 10秒以内に init が来なければ切断
  const authTimeout = setTimeout(() => {
    if (!userId) {
      ws.close(4008, 'Authentication timeout');
    }
  }, 10000);

  ws.on('message', async (message) => {
    // ...
    case 'init':
      clearTimeout(authTimeout);  // 認証成功時にタイムアウト解除
      // ...
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
  });
});
```

### 実装タスク

- [ ] 認証タイムアウト（10秒）を実装
- [ ] テスト: 未認証接続が10秒後に切断されることを確認

---

## P0: Referer 依存のゲーム資産アクセス

### 指摘内容

> Referer 偽装で非 HTML 資産が取得可能。

### 現状の設計

- HTML ファイル: 署名 URL またはトークン必須（`index.js:1053-1054`）
- 非 HTML サブリソース（JS/CSS/画像）: Referer で許可（`index.js:1048-1055`）

### 対応方針: 仕様として許容（リスク受容）

**理由:**

1. **HTML 取得に認証必須**: index.html へのアクセスには署名 URL かトークンが必要
2. **Referer 偽装しても意味がない**: 正規の index.html を取得できなければ、サブリソースだけ取得しても無意味
3. **署名 URL を全資産に適用するコスト**: iframe 内の相対パス解決が複雑になり、実装負荷が高い

**リスク緩和:**

- 非公開プロジェクトの HTML ファイルは認証必須
- サブリソースのみ取得しても完全なゲームは再現不可

**将来的な改善（P2）:**

- 署名 URL を全資産に適用する場合は、iframe 内で Service Worker を使った署名付与を検討

---

## P0: SVG アップロード + 公開デフォルト

### 指摘内容

> SVG による XSS/情報漏えいのリスク（公開配信）。

### 現状の問題点

- `server/index.js:107`: SVG アップロードを許可
- SVG は埋め込みスクリプトを含むことができ、XSS リスクがある

### 対応方針: 対応する（Option B: サニタイズ）

DOMPurify を使用して SVG をサニタイズします。

```javascript
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// SVG アップロード時
if (file.mimetype === 'image/svg+xml') {
  const svgContent = fs.readFileSync(file.path, 'utf-8');
  const cleanSvg = DOMPurify.sanitize(svgContent, {
    USE_PROFILES: { svg: true, svgFilters: true }
  });
  fs.writeFileSync(file.path, cleanSvg);
}
```

加えて、配信時に以下のヘッダーを設定:

```javascript
res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
res.set('X-Content-Type-Options', 'nosniff');
```

### 実装タスク

- [ ] `dompurify` / `jsdom` を `package.json` に追加
- [ ] SVG アップロード時のサニタイズを実装
- [ ] 配信時の CSP ヘッダーを設定

---

## P0: MIME 判定が緩い（ext OR mime）

### 指摘内容

> 拡張子偽装の不正ファイル混入が可能。

### 現状の問題点

```javascript
// server/index.js:110
if (ext || mime) {  // OR 条件
  cb(null, true);
}
```

拡張子か MIME タイプのどちらかが一致すれば通過してしまう。

### 対応方針: 対応する

`ext && mime` に変更し、両方の一致を必須とします。

```javascript
// server/index.js:110
if (ext && mime) {  // AND 条件
  cb(null, true);
} else {
  cb(new Error('Invalid file type: extension and MIME type must match'));
}
```

### 実装タスク

- [ ] `ext || mime` を `ext && mime` に変更
- [ ] テスト: 拡張子偽装ファイルが拒否されることを確認

---

## P0: SUPABASE_URL 末尾スラッシュで JWT issuer 不一致

### 指摘内容

> JWT 検証失敗で認証不可（環境差分でサービス停止級になり得る）。

### 現状の問題点

- `server/config.js:141`: `SUPABASE_URL` をそのまま使用
- 末尾スラッシュがあると JWT の `iss` と不一致になる可能性

### 対応方針: 対応する

`config.js` で正規化を追加します。

```javascript
// server/config.js:141
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
```

### 実装タスク

- [ ] `config.js` で `SUPABASE_URL` の末尾スラッシュを削除
- [ ] テスト: 末尾スラッシュありの URL でも認証が通ることを確認

---

## P0: 公開範囲の仕様確認

### 指摘内容

> サムネイル、ユーザー情報、アセットの公開範囲が意図通りか確認が必要。

### 回答: 意図した仕様（一部検討）

| 項目 | 現状 | 判断 | 理由 |
|------|------|------|------|
| サムネイル公開取得 | 認証なしで取得可能 | **意図的** | SNS シェア時の OGP 表示に必要 |
| `/api/users/:id/public` の UUID 対応 | UUID でも取得可能 | **意図的** | 内部 API からの参照に使用 |
| アセット public デフォルト | `is_public: true` | **要検討** | 下記参照 |

### アセット公開デフォルトについて

現在の設計意図:
- ゲーム公開時にアセットも公開される前提
- ユーザーがアップロードしたアセットはゲームに使用される目的

**検討事項:**
- UI 上で公開/非公開の切り替えを提供するか？
- デフォルトを非公開にして、公開時に明示的に公開するか？

**結論:** 現状維持（リリース後に UI 改善として対応可能）

理由:
- アセットは基本的にゲーム用であり、公開を前提としている
- 非公開アセットの需要が明確になってから対応しても遅くない

---

## P1: Modal healthCheck が 401 以外を健康扱い

### 指摘内容

> 500/503 でも healthy 判定 → 障害ルーティング。

### 対応方針: 対応する

`response.ok` を条件に変更します。

```javascript
// server/modalClient.js:664
return response.ok || response.status === 404;  // 404 は正常（プロジェクト未存在）
```

---

## P1: サムネ生成で Modal 未初期化参照

### 指摘内容

> `modalClient` null で例外。

### 対応方針: 対応する

`getModalClient()` 経由に変更し、null チェックを追加します。

---

## P1: サムネアップロードが非 WebP でも .webp 保存

### 指摘内容

> PNG/JPEG を WebP として配信し表示崩れ。

### 対応方針: 対応する

sharp で WebP 変換してから保存します。

```javascript
await sharp(buffer).webp({ quality: 85 }).toFile(thumbnailPath);
```

---

## P1: Remix で listProjectFiles を await していない → 対象外

### 指摘内容

> Modal 有効時に TypeError / Remix 失敗。

### 対応方針: Remix機能実装時に対応

Remix機能はまだ実装されていません（コードは存在するが未使用）。Remix機能を実装する際に一緒に対応します。

---

## P1: Remix でサブディレクトリ未作成 → 対象外

### 指摘内容

> nested path で ENOENT。

### 対応方針: Remix機能実装時に対応

同上。Remix機能を実装する際に一緒に対応します。

---

## P1: セキュリティヘッダー不足（helmet 未導入）

### 指摘内容

> クリックジャッキング/XSS/MIME スニッフィング等の防御不足。

### 対応方針: 対応する

`helmet` を導入し、CSP を全体に適用します。

```javascript
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
    }
  }
}));
```

---

## P1: プロンプトインジェクション対策不足

### 指摘内容

> 悪意のあるユーザー入力でシステムプロンプトを上書き可能。

### 現状のリスク緩和要因

- API キーは Sandbox 内に存在しない（api-proxy 設計）
- CLI 実行は Modal Sandbox 内に限定（対応後）

### 対応方針: 緩和策として対応

1. **プロンプト構造化**: マーカー分離

```javascript
const prompt = `<system>
${systemPrompt}
</system>

<user_input>
${userMessage}
</user_input>`;
```

2. **監査ログ**: 疑わしい入力パターンを記録

```javascript
const suspiciousPatterns = [
  /ignore.*previous.*instructions/i,
  /system.*prompt/i,
  /<\/system>/i,
];
if (suspiciousPatterns.some(p => p.test(userMessage))) {
  console.warn('[AUDIT] Suspicious input detected:', userId, userMessage.slice(0, 100));
}
```

---

## P2/P3: リリース後対応

以下は P2/P3 としてリリース後に対応します。

| 優先度 | 項目 | 対応方針 |
|--------|------|----------|
| P2 | 分類分析スクリプトの空配列対応 | 早期リターン追加 |
| P2 | styleImageCache の .webp 正規化 | strip 処理追加 |
| P2 | asset search の DB フィルタ | RPC または ILIKE 追加 |
| P2 | waitlist 認証方式統一 | `verifyToken()` に統一 |
| P2 | CLI タイムアウト文言不一致 | 動的生成に変更 |
| P3 | parseMarkdown の XSS リスク | DOMPurify 導入 |
| P3 | 削除済み alias 再利用 | `is_deleted=false` 許可 |
| P3 | cookie-parser 未使用 | 依存削除 |
| P3 | TODO 残存 | 仕様確定後に実装/削除 |

---

## 対応優先度まとめ

### リリースブロッカー（即時対応）

| 項目 | 対応 |
|------|------|
| CLI サンドボックス必須化 | 全 CLI を Modal 経由に移行 |
| パストラバーサル | userManager に検証追加 |
| レート制限 | express-rate-limit 導入 |
| WS 認証タイムアウト | 10秒タイムアウト追加 |
| MIME 判定 | ext && mime に変更 |
| SUPABASE_URL 正規化 | 末尾スラッシュ削除 |

### リリース前対応

| 項目 | 対応 |
|------|------|
| SVG サニタイズ | DOMPurify 導入 |
| helmet 導入 | CSP 全体適用 |
| Modal healthCheck | response.ok 条件 |
| サムネ関連 | WebP 変換、null チェック |

### Remix機能実装時に対応

| 項目 | 対応 |
|------|------|
| listProjectFiles の await | Remix実装時に対応 |
| サブディレクトリ作成 | Remix実装時に対応 |

### 仕様確認 OK

| 項目 | 判断 |
|------|------|
| Referer 依存 | リスク受容（HTML 認証必須で緩和） |
| サムネイル公開 | 意図的（OGP 用） |
| ユーザー情報 UUID 対応 | 意図的（内部 API 用） |
| アセット公開デフォルト | 現状維持（後日 UI 改善） |

---

*回答日: 2026-02-01*
