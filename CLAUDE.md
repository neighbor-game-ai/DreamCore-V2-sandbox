# DreamCore V2 Sandbox

AI-powered browser game creation platform with Modal Sandbox integration.

**Repository**: https://github.com/neighbor-game-ai/DreamCore-V2-sandbox

---

## ⚠️ プロジェクトの根幹（最重要・必読）

### このプロジェクトは「完全な製品版」です

**これは MVP（Minimum Viable Product）ではありません。**

DreamCore-V2-sandbox は、本番稼働中の DreamCore-V2 の**完全なクローン**に Modal Sandbox を統合するプロジェクトです。機能削減、簡略化、「とりあえず動く版」は一切許容されません。

### 絶対に守るべき原則

| 原則 | 説明 |
|------|------|
| **機能の完全継承** | DreamCore-V2 の全機能をそのまま引き継ぐ。機能を削る・省略する・後回しにすることは禁止 |
| **UX の完全維持** | ユーザー体験は 1mm も変えない。フロントエンドのコードは原則変更しない |
| **API 契約の維持** | WebSocket メッセージ形式、REST API のリクエスト/レスポンス形式は一切変更しない |
| **品質基準の維持** | エラーハンドリング、ログ出力、セキュリティ対策は DreamCore-V2 と同等以上 |

### 変更してよいのは「実行基盤」のみ

```
【変更OK】
- Claude CLI の実行場所: ローカル → Modal Sandbox
- ファイルの保存場所: ローカル → Modal Volume

【変更NG】
- フロントエンドのコード
- WebSocket のメッセージ形式
- REST API のエンドポイント・形式
- ユーザーが目にする UI/UX
- 認証フロー
- アセット管理の仕組み
```

### MVP思考への警告

エンジニアは効率を求めるあまり、以下のような「MVP的な判断」をしがちです。**これらはすべて禁止です：**

| ❌ 禁止される判断 | 理由 |
|------------------|------|
| 「この機能は後で実装する」 | 後回しは許容されない。DreamCore-V2 にある機能はすべて初日から動く必要がある |
| 「簡易版を先に作る」 | 簡易版は存在しない。最初から製品版を作る |
| 「エラーハンドリングは後で」 | DreamCore-V2 と同等のエラーハンドリングを最初から実装する |
| 「テストは後で書く」 | DreamCore-V2 のテストがすべてパスする状態を維持する |
| 「とりあえず動けばOK」 | 「とりあえず」は許容されない。本番品質が必須 |
| 「この機能は使われてないから省略」 | 使用頻度に関係なく、すべての機能を実装する |

### 判断に迷ったら

「DreamCore-V2 ではどうなっているか？」を確認し、**それと完全に同じ動作**を実装してください。

DreamCore-V2 のコード:
```
/Users/admin/DreamCore-V2/
```

迷った場合は「機能を削る」方向ではなく「DreamCore-V2 と同じにする」方向で判断してください。

### このプロジェクトのゴール

```
DreamCore-V2 のユーザーが、何の違和感もなく使える状態
```

ユーザーは「バックエンドが Modal になった」ことに気づく必要すらありません。それが成功の基準です。

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

## 将来の機能拡張

計画書: `.claude/docs/session-persistence-plan.md`（セッション永続化、CIDR Allowlist 等）

## 公開ゲームのセキュリティ

iframe sandbox 設定: `docs/IFRAME-SECURITY.md`（sandbox 属性、Permissions Policy の詳細）

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

## Supabase 設定（DreamCore-V2 と共有）

**DreamCore-V2 と同じ Supabase プロジェクトを使用する。新規作成は禁止。**

| 項目 | 値 |
|------|-----|
| プロジェクトID | `tcynrijrovktirsvwiqb` |
| リージョン | Northeast Asia (Tokyo) |
| 環境変数のコピー元 | `/Users/admin/DreamCore-V2/.env` |
| スキーマ定義 | `/Users/admin/DreamCore-V2/.claude/docs/database-schema.md` |

### 禁止事項（Supabase関連）

- 新しい Supabase プロジェクトを作成しない
- テーブル構造を変更しない
- RLS ポリシーを変更しない
- 認証設定を変更しない

Supabase に関する変更が必要な場合は、**まず DreamCore-V2 側で行い**、その後 DreamCore-V2-sandbox に反映する。

## 必須環境変数

起動時に以下が未設定の場合、即エラー終了:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**コピー元**: `/Users/admin/DreamCore-V2/.env`

### Modal統合（`USE_MODAL=true` 時に必要）

- `USE_MODAL` - Modal使用フラグ（`true` / `false`）
- `MODAL_ENDPOINT` - Modal generate エンドポイント
- `MODAL_INTERNAL_SECRET` - Modal内部認証シークレット

## 禁止事項

- `/api/auth/*` の扱いは DreamCore-V2 の現状に従う（勝手に削除・変更しない）
- `visitorId` の新規利用禁止 - すべて `userId` (Supabase Auth) を使用
- `db.getProject()` は使用禁止 - `db.getProjectById()` を使用
- Cookie認証は使用しない - localStorage + Authorization ヘッダー方式を採用

### ハードコード禁止

**環境依存の値をコードに直接書くことは禁止。** 環境が変わると壊れる原因になる。

| ❌ 禁止 | ✅ 代替方法 |
|--------|------------|
| Supabase プロジェクト ID をコードに埋め込む | パターンマッチで検索（例: `sb-*-auth-token`） |
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

**DreamCore-V2 の現状の仕様に完全に従う。**

機能の有効/無効、エンドポイントの挙動、ページの表示内容は、すべて DreamCore-V2 の実装をそのまま引き継ぐ。独自の判断で機能を削減・変更しないこと。

参照: `/Users/admin/DreamCore-V2/`

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

## DreamCore-V2 完了ステータス（引き継ぎ対象）

以下は DreamCore-V2 で完了済みの項目です。これらはすべて DreamCore-V2-sandbox でも同様に動作する必要があります。

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

### 作業記録

ユーザーが作業の記録を依頼した場合（「作業を記録して」「履歴を更新して」「やったことをメモして」等）：

**1. 詳細ログを作成:** `.claude/logs/YYYY-MM-DD-タスク名.md`
- 実施内容の詳細
- 発見した問題と対応
- 専門家レビュー対応
- 変更ファイル一覧
- 学び・注意点

**2. TODO.md を更新:** 概要 + ログへの参照
- 日付と作業タイトル
- `**詳細:** .claude/logs/ファイル名.md` で参照
- 実施内容（箇条書きで簡潔に）
- 発見した問題（あれば）

**ファイル構成:**
```
.claude/logs/          ← 詳細な作業ログ（日付別）
.claude/plans/         ← 計画ファイル
TODO.md                ← 概要 + 参照リンク
```

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
