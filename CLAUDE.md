**🚨 絶対禁止: パスワード、APIキー、シークレット、認証情報をコードにハードコードしない。必ず環境変数を使用すること。**

---

# DreamCore V2 Sandbox

AI-powered browser game creation platform with Modal Sandbox integration.

**Repository**: https://github.com/neighbor-game-ai/DreamCore-V2-sandbox

---

## プロジェクト概要

AI でブラウザゲームを作成するプラットフォーム。Claude CLI の実行環境として Modal Sandbox を使用。

**本番URL**: https://v2.dreamcore.gg

### 品質基準

| 原則 | 説明 |
|------|------|
| **本番品質** | エラーハンドリング、ログ出力、セキュリティ対策を適切に実装 |
| **API 契約の維持** | 既存の WebSocket / REST API 形式は破壊的変更を避ける |

---

## Modal 統合の詳細

引き継ぎ文書を参照してください:
- `/Users/admin/DreamCore-V2-sandbox/docs/ENGINEER-HANDOFF.md`
- `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-MIGRATION-PLAN.md`
- `/Users/admin/DreamCore-V2-sandbox/docs/MODAL-DESIGN.md`

### API キーのセキュリティ（重要）

**Modal Sandbox 内に `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` を配置してはならない。**

| 原則 | 理由 |
|------|------|
| API キーは Sandbox 外で管理 | プロンプトインジェクションによる API キー漏洩を防止 |
| GCE の api-proxy 経由でキーを注入 | Sandbox はプロキシ URL のみを知る |
| URL パスシークレットで認証 | `/a/{secret}/` 形式でプロキシへの不正アクセスを防止 |

**アーキテクチャ:**
```
Modal Sandbox (API キーなし)
├── ANTHROPIC_BASE_URL=https://api-proxy.dreamcore.gg/a/{secret}
└── GEMINI_BASE_URL=https://api-proxy.dreamcore.gg/g/{secret}
        ↓
GCE api-proxy (API キーを注入)
        ↓
api.anthropic.com / generativelanguage.googleapis.com
```

**禁止事項:**
- Modal Secret に `ANTHROPIC_API_KEY` を追加しない
- Modal Secret に `GEMINI_API_KEY` を追加しない
- Sandbox 環境変数に API キーを渡さない

詳細な実装計画: `.claude/plans/api-key-proxy.md`

### Modal デプロイ（重要）

**⚠️ Modal のデプロイは必ず `DreamCore-V2-sandbox/modal` から実行すること。**

```bash
# 正しいデプロイ方法
cd /Users/admin/DreamCore-V2-sandbox/modal
modal deploy app.py

# ローカルテスト
cd /Users/admin/DreamCore-V2-sandbox/modal
modal serve app.py
```

| ❌ 禁止 | ✅ 正しい |
|--------|----------|
| `DreamCore-V2-modal/` からデプロイ | `DreamCore-V2-sandbox/modal/` からデプロイ |

**理由:**
- Modal コードは `DreamCore-V2-sandbox` に統合済み（2026-02-01）
- `DreamCore-V2-modal` は旧リポジトリで、更新されていない
- 間違ったリポジトリからデプロイすると修正が反映されない

### CLI Deploy（重要）

**⚠️ `dreamcore` という CLI ツールは存在しない。**

CLI Deploy は HTTP API ベースで動作します:

| 誤解 | 実際 |
|------|------|
| `npm install -g dreamcore` が必要 | **不要** - CLI ツールは存在しない |
| `dreamcore deploy` コマンドを使う | **使わない** - curl で API を直接呼ぶ |
| `dreamcore login` で認証する | **使わない** - デバイスフローで認証 |

**実際のフロー:**
1. Claude Code Skills が HTTP API を直接呼び出す
2. `zip` コマンドで ZIP 作成
3. `curl` で `/api/cli/deploy` にアップロード
4. トークンは `~/.dreamcore/token` に保存

**ドキュメント:**
- `docs/CLI-ARCHITECTURE.md`
- `cli-deploy/README.md`
- `.claude/skills/dreamcore-deploy/SKILL.md`

## 将来の機能拡張

計画書: `.claude/docs/session-persistence-plan.md`（セッション永続化、CIDR Allowlist 等）

## 公開ゲームのセキュリティ

iframe sandbox 設定: `docs/IFRAME-SECURITY.md`（sandbox 属性、Permissions Policy の詳細）

## CLI Deploy

CLI のアーキテクチャとアップデート方針: `docs/CLI-ARCHITECTURE.md`

## ウェイトリスト/アクセス管理

V2 初期リリース用。詳細: `docs/WAITLIST.md`

- 承認されたユーザーのみアプリ利用可能
- Google OAuth でログイン → `user_access` テーブルで管理
- 無効化: `server/index.js` で `waitlist.setupRoutes(app);` をコメントアウト

### メール通知

登録・承認時に自動メール送信。詳細: `docs/WAITLIST-EMAIL-SETUP.md`

| 項目 | 値 |
|------|-----|
| メールサービス | Brevo (旧Sendinblue) |
| APIキー保存場所 | Supabase Edge Function Secrets (`BREVO_API_KEY`) |
| Edge Function | `waitlist-email` |
| トリガー | Database Webhook (user_access INSERT/UPDATE) |

**キー管理コマンド:**
```bash
# 確認
npx supabase secrets list --project-ref tcynrijrovktirsvwiqb

# 更新
npx supabase secrets set BREVO_API_KEY=xkeysib-xxx --project-ref tcynrijrovktirsvwiqb
```

---

## Supabase 設定

| 項目 | 値 |
|------|-----|
| プロジェクトID | `tcynrijrovktirsvwiqb` |
| リージョン | Northeast Asia (Tokyo) |
| スキーマ定義 | `.claude/docs/database-schema.md` |

スキーマ変更は `mcp__supabase__apply_migration` で適用する。

## 必須環境変数

起動時に以下が未設定の場合、即エラー終了:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

設定例は `.env.example` を参照。

### Modal統合（`USE_MODAL=true` 時に必要）

- `USE_MODAL` - Modal使用フラグ（`true` / `false`）
- `MODAL_ENDPOINT` - Modal generate エンドポイント
- `MODAL_INTERNAL_SECRET` - Modal内部認証シークレット

## 禁止事項

- `/api/auth/*` は Supabase Auth 用（変更時は影響を確認）
- `visitorId` の新規利用禁止 - すべて `userId` (Supabase Auth) を使用
- `db.getProject()` は使用禁止 - `db.getProjectById()` を使用
- Cookie認証は使用しない - localStorage + Authorization ヘッダー方式を採用

### ハードコード禁止

**環境依存の値をコードに直接書くことは禁止。** 環境が変わると壊れる原因になる。

| ❌ 禁止 | ✅ 代替方法 |
|--------|------------|
| Supabase プロジェクト ID をコードに埋め込む | パターンマッチで検索（例: `sb-*-auth-token`） |
| Supabase URL/anonKey を HTML に直接記述 | `/api/config` から動的取得 |
| API エンドポイント URL を直接記述 | 環境変数 or `/api/config` から取得 |
| シークレットキーをコードに記述 | 環境変数で管理 |
| 特定ユーザー ID をコードに記述 | DB から動的に取得 |

**例（早期認証チェック）:**
```javascript
// ❌ ハードコード
var session = localStorage.getItem('sb-tcynrijrovktirsvwiqb-auth-token');

// ✅ パターンマッチ
for (var i = 0; i < localStorage.length; i++) {
  var key = localStorage.key(i);
  if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
    session = localStorage.getItem(key);
    break;
  }
}
```

## 認証ルール

- **認証方式**: Supabase Auth + Google OAuth
- 認証は `authenticate` ミドルウェア経由
- 所有者チェック: `project.user_id === req.user.id`
- WebSocket: `access_token` をinitメッセージで送信

### フロントエンド認証

- `public/auth.js` - Supabase Auth ユーティリティ（`DreamCoreAuth`グローバル）
- `public/index.html` - Google Sign-In ボタン
- `/api/config` - フロントエンド用Supabase設定を提供

### Supabase Dashboard設定（設定済み）

- **Authentication > Providers > Google**: 有効
- Google Cloud Console でOAuthクライアント設定済み
- リダイレクトURL: `https://tcynrijrovktirsvwiqb.supabase.co/auth/v1/callback`

## UUID検証

全箇所で統一:
```javascript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

## ID 規格

### 内部 ID: UUID v7

新規レコードは UUID v7 で生成（時間順ソート可能、インデックス効率向上）:

| テーブル | 形式 | 備考 |
|----------|------|------|
| users.id | UUID v4 | Supabase Auth 管理（変更不可） |
| その他すべて | **UUID v7** | `uuid_generate_v7()` で自動生成 |

### 公開 URL 用: public_id

URL 共有用の短縮 ID。内部では UUID を使用し、外部公開時のみ public_id を使用:

| テーブル | prefix | 例 |
|----------|--------|-----|
| published_games | `g_` | `g_7F2cK9wP1x` |
| users | `u_` | `u_Lk29Bv3Q2y` |
| projects | `p_` | `p_X3m9aQ1Z3w` |

**形式**: `{prefix}_{10文字base62}`（合計12文字）

### API ルーティング

UUID と public_id の両方をサポート:

```javascript
// 両方受け付ける
GET /g/550e8400-e29b-41d4-a716-446655440000/index.html  // UUID
GET /g/g_7F2cK9wP1x/index.html                          // public_id

// 内部処理で判定
const isUUID = isValidUUID(id);
const isPublicId = /^g_[A-Za-z0-9]{10}$/.test(id);
```

## 同時実行制御

Claude CLI の実行は以下の制限あり（`server/config.js` の `RATE_LIMIT.cli`）:

| 設定 | 値 | 説明 |
|------|-----|------|
| `maxConcurrentPerUser` | 1 | ユーザーあたり同時実行数 |
| `maxConcurrentTotal` | 50 | システム全体の同時実行数 |
| `timeout` | 10分 | 1ジョブの最大実行時間 |

**変更履歴**: 2026-01-23 に全体上限を 10 → 50 に変更（V1で7,000件超の実績を考慮）

## コマンド

- `npm run dev` - 開発サーバー起動（ファイル変更で自動再起動）
- `npm start` - 本番起動
- デフォルトポート: **3000**（`PORT`環境変数で変更可能）

## GCE 本番環境

**詳細:** `.claude/skills/gce-deploy/SKILL.md`（`/gce-deploy` スキルで実行可能）

| 項目 | 値 |
|------|-----|
| Instance | `dreamcore-v2` |
| Zone | `asia-northeast1-a` |
| URL | `https://v2.dreamcore.gg` |
| PM2 Process | `dreamcore-sandbox` |

デプロイ、ログ確認、再起動などの操作は `/gce-deploy` スキルを参照。

### デプロイ前チェックリスト

**⚠️ デプロイ前に必ず確認すること（502 エラー防止）:**

```bash
# 1. コミット漏れ確認
git status

# 2. リモートとの同期確認
git fetch origin && git status -sb

# 3. 現在のブランチ確認
git branch --show-current

# 4. push 忘れがないか
git push origin main
```

**よくある落とし穴:**
- 新しいモジュール（`server/*.js`）がコミットされていない
- `npm install` が必要な新しい依存関係
- 環境変数の追加漏れ

**推奨:** `/deploy` スキルを使用すると、これらのチェックを自動で実行してからデプロイできる。

## 重要ファイル

- `docs/ENGINEER-HANDOFF.md` - **Modal統合の引き継ぎ文書（必読）**
- `docs/MODAL-MIGRATION-PLAN.md` - Modal移行計画
- `docs/MODAL-DESIGN.md` - Modal技術設計
- `docs/API-REFERENCE.md` - **API/エンドポイント一覧（実装準拠）**
- `.claude/plans/auth-migration.md` - 認証移行ドキュメント（実装の詳細）
- `.claude/plans/sandbox-architecture.md` - セキュリティ/サンドボックス設計
- `server/authMiddleware.js` - 認証ミドルウェア
- `server/config.js` - 設定・起動チェック
- `server/supabaseClient.js` - Supabaseクライアント
- `server/database-supabase.js` - Supabase DB操作（現在使用中）
- `.claude/docs/database-schema.md` - DBスキーマ設計詳細

## 機能スコープ

API リファレンス: `docs/API-REFERENCE.md`

## RLS設計方針

### 基本原則

- **削除済みリソースは見せない**: `is_deleted = true` のアセットはRLSで非表示
- **所有者のみアクセス可**: projects, assets は `owner_id = auth.uid()` でフィルタ

### assets テーブルの特殊動作

SELECTポリシー:
```sql
USING (owner_id = auth.uid() AND is_deleted = FALSE)
```

**Soft Delete後の動作**:
- 更新後、その行はSELECTポリシーにより**見えなくなる**
- PostgRESTのRETURNING（`.select()`）を使うと、更新後の行が取得できずエラーになる

**RLS WITH CHECK制約について**:
- 現在のDB設定では、ユーザークライアントからの`is_deleted = true`更新がRLSで拒否される
- 原因: UPDATEポリシーの`WITH CHECK`句が`is_deleted = FALSE`を要求している可能性
- **対応**: `db.deleteAsset()`は`req.supabase`（ユーザークライアント）を使用しているため、service_roleに変更が必要

**これは仕様です**:
- Phase 1では削除済みアセットを表示しない設計
- ソフトデリート時は `.select()` を使わない（`database-supabase.js:491-495`参照）
- 検証が必要な場合は `service_role` クライアントを使用

**対策済み**: DELETE `/api/assets/:id` エンドポイントでは `supabaseAdmin` (service_role) を使用してsoft deleteを実行

### Wrong Owner アクセス時の挙動

他ユーザーのリソースにアクセスした場合:
- **HTTP 404** が返る（403ではない）
- RLSがクエリ結果をフィルタするため「存在しない」扱いになる
- これはセキュリティ上適切（リソースの存在を漏洩しない）

## テスト

- `node test-rls.js` - RLSポリシーのテスト
- `node test-job-permissions.js` - ジョブ権限テスト
- `node test-ws-permissions-final.js` - WebSocket権限テスト
- `node test-ws-project-operations.js` - プロジェクトCRUD操作テスト
- `node test-assets-api.js` - アセットAPIテスト
- `node test-exception-boundary.js` - 例外・境界ケーステスト
- `node test-prompt-injection.js` - **プロンプトインジェクションE2Eテスト**

### プロンプトインジェクションテスト

**詳細:** `.claude/skills/prompt-injection-test/SKILL.md`

```bash
node test-prompt-injection.js                           # 全テスト
node test-prompt-injection.js --dry-run                 # ペイロード確認のみ
node test-prompt-injection.js --category=tag_escape     # 特定カテゴリ
node test-prompt-injection.js -v                        # 詳細ログ
```

17パターンの攻撃（タグ脱出、指示上書き、APIキー漏洩、コマンド実行等）をテスト。

## 実装済み機能

**最終検証日: 2026-01-22**

### バックエンド ✅

- [x] public系エンドポイント削除（`/api/public-games`等）
- [x] `/play/:projectId` owner-only
- [x] `/api/assets/search` owner限定
- [x] 起動時envバリデーション（config.js）
- [x] Supabase Auth一本化（database-supabase.js使用中）
- [x] RLSポリシー検証済み（test-rls.js）
- [x] WebSocket権限検証済み（test-ws-permissions-final.js）
- [x] プロジェクトCRUD検証済み（test-ws-project-operations.js）
- [x] アセットAPI検証済み（test-assets-api.js）

### フロントエンド ✅

- [x] Supabase Auth SDK導入（public/auth.js）
- [x] Google Sign-In実装
- [x] authFetch APIラッパー実装
- [x] WebSocket認証（access_token）
- [x] プレビューiframe認証（access_token query param）

### 技術的負債（解消済み）

- ~~`database.js`~~ - 削除済み
- ~~`initLoginUsers.js`~~ - 削除済み
- ~~`assets.is_deleted`~~ - マイグレーション実行済み（2026-01-22）
- ~~`visitorId`言及~~ - server/public両方から完全削除（2026-01-23）
- ~~`PROJECTS_DIR`/`getProjectPathV2`~~ - 統一パス構造に移行済み（2026-01-23）

### 統一パス構造

```
/data/users/{userId}/projects/{projectId}/  - プロジェクトファイル
/data/users/{userId}/assets/                - ユーザーアセット
/data/assets/global/                        - グローバルアセット
```

## 開発方針

### ローンチ前ポリシー

- **既存データは破棄可能**: マイグレーションで古いデータ・テーブルを削除してOK
- **互換性不要**: 過去のスキーマとの互換性は維持しない
- **技術的負債の除去**: 不要な構造は積極的に DROP
- **ローンチ後は変更**: 本番データができたら安全版マイグレーションに切り替え

### 計画駆動の開発

- 実装前に必ず計画を立てる（`.claude/plans/` 参照）
- ユーザーは非エンジニアのため、計画から外れた指示をすることがある
- その場合は**遠慮なく指摘**し、計画との整合性を確認すること
- 「この指示は〇〇の計画と矛盾しますが、進めてよいですか？」のように確認する

### サブエージェント並列実行

調査・実装タスクではサブエージェント（Task tool）を**複数並列**で実行する。1つで済ませようとせず、観点ごとに分けて並列起動すること。

### UI 変更時のファイル確認

ユーザーが UI 要素を説明で参照した場合（例：「トップバー」「Information モーダル」）、変更を行う前に**必ず具体的なファイルを確認**する。不明な場合はスクリーンショットを求める。

**理由:** 過去のセッションで、Claude が間違ったファイル（play-public.html vs 実際の UI）を分析し、やり直しが発生した。

### コード変更後の検証

複雑な変更を行った後は、タスク完了前に以下を実行:

1. **TypeScript コンパイラ**: `npx tsc --noEmit`（型エラー検出）
2. **関連テスト**: 変更に関係するテストファイルを実行
3. **エラーがあれば修正**: タスク完了とみなす前に解決

### タスクのフェーズ分割

大きなタスクは明示的なフェーズに分割し、各フェーズの完了を確認してから次に進む:

```
フェーズ1: [具体的なタスク]
  ↓ 完了確認
フェーズ2: [次のタスク]
  ↓ 完了確認
フェーズ3: [最終タスク]
```

**理由:** 過去のセッション分析で、97%のタスクが「部分達成」で終了していた。フェーズ分割で完了率が向上する。

### CSS/スタイリング作業

初期の調整で望ましいビジュアルバランスが達成できない場合は、**段階的な微調整ではなく構造的なリデザイン**を提案する。

**アプローチ:**
1. 現在の CSS を分析し、問題の原因を特定
2. 複数のバリアント（コンパクト版、余白多め版など）を提案
3. ユーザーが選択後に実装

## パフォーマンス最適化 (2026-01-23)

### バックエンド

- **JWT ローカル検証**: `jose` + JWKS で Supabase API 呼び出しゼロ（`server/supabaseClient.js`）
- `/game/*` エンドポイント: DB クエリ削除、ファイルシステムのみで応答

### フロントエンド

- **Supabase SDK 遅延読み込み**: 初期 JS 346KB → 186KB（`window.__loadSupabase()`）
- **早期 auth リダイレクト**: SDK ロード前に localStorage チェック
- **セッションキャッシュ**: localStorage 5分 TTL（`auth.js`）
- **フォント非ブロッキング**: `@import` 削除 → `preconnect` + `media="print" onload`
- **静的ウェルカム**: HTML に直接配置、サジェスト部分のみ JS で更新
- **スケルトンカード**: create.html でプロジェクト一覧の即時表示
- **iframe 遅延表示**: 新規プロジェクトでは非表示（HTTP リクエスト削減）
- **画像 WebP 化**: PNG → WebP で約 90% サイズ削減

## agent-browser 自動ログイン

**詳細:** `.claude/skills/auto-login/SKILL.md`

agent-browser で認証が必要なページにアクセスする際、Google OAuth をバイパスして Supabase Magic Link でログインできる。

### 手順

```bash
# 1. Magic Link を生成
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: 'notef@neighbor.gg'  // 対象ユーザーのメール
}).then(r => console.log(r.data.properties.action_link));
"

# 2. agent-browser でアクセス
agent-browser open "生成されたMagic Link URL"

# 3. 認証完了後、目的のページへ
agent-browser open "https://v2.dreamcore.gg/create"
```

### 用途

- スクリーンショット撮影（ログイン後の画面）
- E2E テスト
- 自動化スクリプト

### 注意

- Magic Link は一度しか使えない
- Service Role Key が必要（`.env` に設定済み）
