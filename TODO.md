# TODO - DreamCore V2

## 現在の状況

Phase 1 リファクタリング完了。セキュリティ・安定性の改善を実施。

---

## 残タスク

### 中優先度（100人イベント前に必須）

- [x] **同時実行数制御の実装** ✅ 2026-01-23
  - ユーザーあたり1件制限
  - システム全体50件制限
  - タイムアウト10分
  - GCSバックアップ機能（Phase 2）

### 低優先度（運用後に判断）

- [x] profiles テーブル削除 ✅ 2026-01-23
- [ ] インデックス冗長整理（`pg_stat_user_indexes` で確認後）
- [ ] 本番 Redirect URLs に本番URL追加（デプロイ時）
- [ ] iframe sandbox属性のセキュリティ対策（Phase 2でサブドメイン方式で対応）

---

## Phase 2 準備（基盤整備後に着手）

- [ ] 公開機能の設計
- [ ] `/discover` ページ実装
- [ ] `/api/public-games` エンドポイント復活

---

## 将来の機能拡張（調査済み・計画中）

**計画書:** `.claude/docs/session-persistence-plan.md`

**参照リポジトリ:**
- [claudex](https://github.com/Mng-dev-ai/claudex) - Multi-provider、スキルシステム
- [modal-claude-agent-sdk](https://github.com/sshh12/modal-claude-agent-sdk-python) - セキュリティパターン
- [claude-slack-gif-creator](https://github.com/modal-projects/claude-slack-gif-creator) - 永続 Sandbox、セッション管理

### 高優先度（Phase 3）
- [x] **CIDR Allowlist + Proxy** - ネットワーク制限（許可ドメインのみ通信可能）✅ 2026-01-29
- [x] **Idle Timeout** - 未使用 Sandbox 自動終了（20分、コスト削減）✅ 2026-01-28
- [x] **エラー分類改善** - exit_code 追跡、エラータイプ分類 ✅ 2026-01-29

### 中優先度（Phase 4）
- [ ] **セッション永続化** - Claude が会話履歴を記憶（`resume` パラメータ）
- [x] **API キープロキシ** - Sandbox に API キーを渡さないセキュリティ強化 ✅ 2026-01-29
- [x] **Sandbox 再利用** - プロジェクト単位で Sandbox を維持（20分 TTL）✅ 2026-01-28
- [ ] **Sandbox 上限** - ユーザーあたり最大3個の制限（Phase 2）

### 低優先度（将来）
- [ ] カスタムスキル ZIP 配布（ゲームテンプレート）
- [ ] Host Tools パターン（Express 側でのアセット検索）
- [ ] Multi-Provider 抽象化（Modal 以外への切り替え）

---

## 作業履歴

### 2026-01-29: API キープロキシ実装

**詳細:** `.claude/logs/2026-01-29-api-key-proxy.md`

**背景:** Modal Sandbox 内の環境変数（ANTHROPIC_API_KEY, GEMINI_API_KEY）がプロンプトインジェクションで漏洩するリスク

**実装内容:**
- GCE に API Proxy サーバー構築（`/home/notef/api-proxy/`）
- Let's Encrypt で TLS 証明書取得（`api-proxy.dreamcore.gg`）
- Modal Proxy で静的 IP 取得、Nginx で IP 制限
- Modal app.py を `api_proxy_secret` に移行（Sandbox 内に API キーなし）
- `ANTHROPIC_BASE_URL` / `GEMINI_BASE_URL` 経由でプロキシにアクセス

**アーキテクチャ:**
```
Modal Sandbox (API キーなし)
├── Claude CLI → ANTHROPIC_BASE_URL → GCE Proxy → api.anthropic.com
└── Image Gen → GEMINI_BASE_URL → GCE Proxy → googleapis.com
```

**セキュリティ:**
| 対策 | 内容 |
|------|------|
| API キー不在 | Sandbox 環境変数に API キーなし |
| IP 制限 | Modal Proxy 静的 IP（52.55.224.171）のみ許可 |
| URL シークレット | `/a/{secret}/` パスで認証 |
| TLS | Let's Encrypt 証明書 |

---

### 2026-01-29: エラー分類改善

**詳細:** `.claude/logs/2026-01-29-error-classification.md`

**背景:** Claude CLI の終了コードやエラータイプがユーザーに分かりにくかった

**実装内容:**
- Modal app.py: CLI_ERROR_CODES / API_ERROR_CODES 定数追加
- Modal app.py: 非ゼロ exit_code で構造化エラーイベント送信
- jobManager.js: failJob に errorDetails パラメータ追加
- claudeRunner.js: 構造化エラー情報の抽出と伝達
- app.js: userMessage 優先表示、recoverable で再試行ヒント

**エラーメッセージ:**
| エラー | メッセージ | 再試行 |
|--------|----------|--------|
| timeout | 生成に時間がかかりすぎました（5分制限） | ✅ |
| general | 生成中にエラーが発生しました | ❌ |
| network | ネットワーク接続に問題があります | ✅ |
| rate_limit | APIの利用制限に達しました | ✅ |
| sandbox | 実行環境の準備に失敗しました | ❌ |

**テスト機能:** `testError` WebSocket メッセージでエラーをシミュレート可能

---

### 2026-01-29: PROXY統合とSecret化（Modal統合Phase 2）

**詳細:** `.claude/logs/2026-01-29-proxy-integration.md`

**背景:** Modal Sandbox の外部通信を制限し、許可されたAPIのみアクセス可能にする

**実装内容:**
- GCE Squid プロキシ経由で全外部通信を統一
- 許可ドメイン: `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.replicate.com`
- プロキシ認証情報を Modal Secret (`dreamcore-proxy`) に移行
- Sandbox: CIDR allowlist でプロキシIPのみ許可 + 環境変数で PROXY 設定
- Modal Function: 環境変数で PROXY 設定（httpx が自動読取）

**発見した問題:**
- `httpx.Client(proxy=...)` パラメータが Modal 環境で動作しない → 環境変数経由で解決

**最終構成:**
```
Modal Sandbox/Function → GCE Squid Proxy → 許可されたAPI
                         (Basic認証 + ドメイン制限)
```

---

### 2026-01-28: Sandbox 再利用機能（リクエスト高速化）

**詳細:** `.claude/logs/2026-01-28-sandbox-reuse-implementation.md`

**問題:** 毎リクエストで Sandbox を作成→破棄するため、コールドスタート（約10秒）が毎回発生

**実装内容:**
- Named Sandbox パターン: `from_name()` で既存 Sandbox を取得、なければ `create()`
- 命名規則: `dreamcore-{sha256(user_id:project_id)[:12]}`
- `idle_timeout=20分`: アイドル時に自動終了
- `timeout=5時間`: 最大寿命
- `terminate()` 削除: Sandbox は自動終了に任せる
- `sandbox_reused` フラグ: debug イベントで warm/cold を報告

**設計判断:**
- Sandbox 上限（3個）は Phase 2 で実装（TTL で十分、列挙 API なし）
- Skills はコピー方式維持（`CLAUDE_SKILLS_PATH` 未検証のため安全側を優先）

**効果:**
- 初回: 26秒（変わらず）
- 2回目以降: 15秒（約10秒短縮）

---

### 2026-01-28: 同時実行制限 UX 改善

**詳細:** `.claude/logs/2026-01-28-limit-exceeded-ux.md`

**問題:** `maxConcurrentPerUser: 1` の制限により、複数プロジェクトで同時にAI生成できない。エラーになるだけで対処法がわからない。

**初期設計（試行）:** 割り込み機能（OK で既存ジョブをキャンセルし再送信）を試みたが、UI状態管理の複雑さから断念。

**最終実装（通知のみ）:**
- `limitExceeded` イベント: 実行中のジョブ情報とともに送信
- 通知メッセージ: 「『{projectName}』で生成中です。完了後にもう一度お試しください。」
- 「閉じる」ボタンのみ（割り込み不可）

**ユーザーフロー:**
1. プロジェクトAで生成中
2. プロジェクトBで生成開始 → 通知メッセージ表示
3. ユーザーは閉じるボタンで通知を閉じ、Aの完了を待つ
4. Aが完了後、改めてBで生成

---

### 2026-01-28: ローカルキャッシュ実装（プレビュー高速化）

**詳細:** `.claude/logs/2026-01-28-local-cache-implementation.md`

**問題:** Modal 統合後、プレビュー表示と履歴復元が非常に遅い（50-150ms/ファイル × 5-20ファイル）

**原因:** 毎回のファイルリクエストが Modal API を経由していた

**実装内容:**
- `syncFromModal()` 関数追加（Modal → ローカル同期）
- Claude Modal 完了後に自動同期
- 履歴復元後に自動同期
- `/game/*` ルートをローカルファースト配信に変更

**効果:** プレビュー表示・履歴復元が即座に反映されるようになった

---

### 2026-01-28: Modal Git safe.directory 修正

**問題:** 変更履歴が表示されない

**原因:** Modal Volume 上で git コマンドが "dubious ownership" エラー

**修正:**
- Modal `app.py` の全 git コマンドに `-c safe.directory={project_dir}` を追加

---

### 2026-01-28: Modal Cache-Control ヘッダー追加

**実装内容:**
- HTML: `no-store`（常に最新を取得）
- 静的アセット（CSS/JS/画像等）: `public, max-age=3600`（1時間キャッシュ）

---

### 2026-01-28: Modal generate_game volumes 修正

**詳細:** `.claude/logs/2026-01-28-modal-volumes-fix.md`

**問題:** バグフィックス時に Claude Code CLI がエラー「Modal function has no attached volumes」

**原因:** `generate_game` 関数のデコレータに `volumes=` パラメータが欠落

**修正箇所:**
- `/Users/admin/DreamCore-V2-modal/modal/app.py`: `generate_game` に volumes 追加

**解決:** Modal 再デプロイで修正完了

---

### 2026-01-28: Modal await 不足修正

**詳細:** `.claude/logs/2026-01-28-modal-await-fix.md`

**問題:** 既存プロジェクトで追加プロンプトを送ると、毎回「2D/3D」選択が表示される

**原因:** `listProjectFiles` / `readProjectFile` が Modal 環境で Promise を返すが、呼び出し側で await していなかった

**修正箇所:**
- `server/index.js`: 2箇所
- `server/claudeRunner.js`: 9箇所（map内は `Promise.all` に変更）

**解決:** 既存プロジェクトで2D/3D選択が出なくなった

---

### 2026-01-28: Modal ウォームアップ設定

**詳細:** `.claude/logs/2026-01-28-modal-warmup-setup.md`

**実施内容:**
- GCE に cron ジョブ設定（5分ごとに `list_files` エンドポイントを叩く）
- ウォームアップ用プロジェクト作成（`__warmup__`）
- gce-deploy スキルを DreamCore-V2-sandbox 用に更新
- CLAUDE.md に GCE 本番環境セクション追加

**設定内容:**
```
スクリプト: /home/notef/bin/modal-warmup.sh
cron: */5 * * * *
ログ: /home/notef/logs/modal-warmup.log（エラー時のみ）
```

---

### 2026-01-28: Phase C 本番デプロイ完了

**詳細:** `.claude/logs/2026-01-28-phase-c-production-deploy.md`

**実施内容:**
- GitHub リポジトリ作成・プッシュ（`notef-neighbor/DreamCore-V2-sandbox`）
- GCE サーバー（dreamcore-v2）にクローン・起動（ポート 3005）
- 環境変数設定（Supabase, Modal, Gemini）
- ゲーム生成テスト実施・正常完了

**確認結果:**
- ✅ Modal 統合動作確認（`[Modal sync] Committed` ログ出力）
- ✅ Gemini によるゲーム生成・画像生成
- ✅ ゲームの iframe 表示

**発見した問題と対応:**
- SSH ユーザー名: `admin` → `notef`
- Supabase プロジェクト ID: 古い ID を正しい ID に修正
- GEMINI_API_KEY: PM2 起動時に直接指定で解決

---

### 2026-01-27: Modal Git 操作 await 修正

**詳細:** `.claude/logs/2026-01-27-modal-git-await-fix.md`

**実施内容:**
- `server/index.js` の 4箇所で await 不足を修正
- `test-modal-git-operations.js` 新規作成（E2Eテスト）
- ローカル/Modal 両モードでテスト確認済み

**修正箇所:**
- selectProject: `getVersions()` に await
- getVersions: `getVersions()` に await
- getVersionEdits: `getVersionEdits()` に await
- restoreVersion: `restoreVersion()` に await

---

### 2026-01-27: Modal 統合実装（Express側 Phase 1）

**詳細:** `.claude/logs/2026-01-27-modal-integration-express.md`

**実施内容:**
- `config.js` に Modal 環境変数追加（USE_MODAL, MODAL_ENDPOINT等）
- `modalClient.js` 新規作成（SSEパース、API呼び出し、Git操作）
- `claudeRunner.js` に USE_MODAL 分岐追加（detectIntent, detectSkills, Claude CLI実行）
- `userManager.js` のファイル操作・Git操作を Modal 対応

**設計原則:**
- `USE_MODAL=false` で即座にローカル実行にフォールバック可能
- フロントエンド変更なし、WS/API形式維持
- DB操作は Express に集約（Modal に Supabase 情報を渡さない）

**依存タスク:** Modal側の Git 拡張（`/apply_files` に git_log/git_diff/git_restore アクション追加）が必要

---

### 2026-01-25: sandbox-runtime 導入

**詳細:** `.claude/logs/2026-01-25-sandbox-runtime.md`

**実施内容:**
- Claude CLI 実行に sandbox-runtime を適用（OS ネイティブ隔離）
- 全呼び出しを spawnClaudeAsync() に移行（10箇所）
- 初期化 Promise 共有、シェルエスケープ安全化、動的 allowWrite
- 動作検証完了（初期化・実行・ゲーム生成すべて正常）

---

### 2026-01-23: Phase 1 リファクタリング（セキュリティ・安定性）

**詳細:** `.claude/logs/2026-01-23-phase1-refactoring.md`

**実施内容:**
- P0: コマンドインジェクション修正（execFileSync化、versionId検証）
- P1: 子プロセス同時実行制御（1/user, 50/global, 10分タイムアウト）
- P1: RLSポリシー統合（006_sync_rls.sql）
- P2: エラーレスポンス統一（errorResponse.js）

---

### 2026-01-23: 統一パス構造リファクタリング

**詳細:** `.claude/logs/2026-01-23-unified-path-structure.md`

**実施内容:**
- `getProjectPath` を統一構造 `users/{userId}/projects/{projectId}` に変更
- `getProjectPathV2`, `getUserAssetsPathV2` を削除（統合）
- `PROJECTS_DIR`, `ASSETS_DIR` 定数を削除
- 古いMVPドキュメント（ARCHITECTURE.md, SPECIFICATION.md）を削除
- README.md, CLAUDE.md を更新

**新パス構造:**
```
/data/users/{userId}/projects/{projectId}/  - プロジェクト
/data/users/{userId}/assets/                - アセット
/data/assets/global/                        - グローバル
```

---

### 2026-01-23: 画像読み込み問題の調査

**詳細:** `.claude/logs/2026-01-23-image-loading-investigation.md`

**調査内容:**
- `allow-same-origin` 削除を試行 → CDN スクリプトがブロックされゲーム停止
- CORS ヘッダー追加（アセットエンドポイント用）
- `/api/assets/:id` を公開アセット対応に変更

**結論:**
- `allow-same-origin` は Phase 1 では必要（Phase 2 でサブドメイン方式で対応）
- CORS ヘッダーと公開アセット対応は維持

---

### 2026-01-23: visitorId 完全削除

フロントエンドから `visitorId` 変数名を `userId` にリネーム。

**変更ファイル:**
- `public/app.js` - 12箇所リネーム、不要クエリパラメータ削除
- `public/mypage.js`, `notifications.js`, `publish.js` - 各2箇所
- `public/auth.js` - レガシーキークリーンアップ追加
- `CLAUDE.md` - 技術的負債更新

---

### 2026-01-23: アーキテクチャ設計レビュー

元のMVPアーキテクチャ設計書（sandbox-architecture.md）との比較を実施。

**確認結果:**
- ✅ 認証・RLS・データアーキテクチャ: 設計通り
- ⚠️ 同時実行数制御: 未実装 → 計画作成済み
- ⚠️ GCSバックアップ: 未実装（Phase 2）
- ⚠️ iframe allow-same-origin: Phase 2でサブドメイン方式で対応予定

**計画作成:** `.claude/plans/concurrent-execution-control.md`

---

### 2026-01-23: PostgreSQL Table Design レビュー対応

**詳細:** `.claude/logs/2026-01-23-postgresql-table-design-review.md`

**実施内容:**
- wshobson/agents postgresql-table-design スキルでレビュー
- 004_schema_improvements.sql 作成・本番適用
- profiles テーブル削除（技術的負債除去）
- NOT NULL 制約追加、INTEGER → BIGINT
- users.updated_at 追加
- games FK インデックス追加
- rls-policies.sql 更新

**適用結果:**
- テーブル数 9個（設計通り）
- profiles 参照完全削除確認

---

### 2026-01-23: Asset Architecture V2 実装完了

**詳細:** `.claude/logs/2026-01-23-asset-architecture-v2.md`

**実施内容:**
- 005_asset_v2.sql 作成・本番適用（alias, hash, is_global等）
- 新エンドポイント `/user-assets/:userId/:alias`, `/global-assets/:category/:alias`
- AI生成画像のV2対応（saveGeneratedImage更新）
- フロントエンドURL形式変更

**専門家レビュー対応:**
- P0: aliasExists()のis_deleted条件削除（UNIQUE衝突回避）
- P1: filenameサニタイズ追加
- P1: DB失敗時の孤児ファイル削除
- 運用: alias競合ログ追加

**テスト完了:**
- 同名画像自動採番 ✅
- DB失敗時ファイルクリーンアップ ✅

---

### 2026-01-23: 003_sync_schema.sql 本番適用完了

**詳細:** `.claude/logs/2026-01-23-supabase-003-migration.md`

**実施内容:**
- 003_sync_schema.sql 作成・本番適用
- RLS 最適化（`(SELECT auth.uid())`）
- TO authenticated 追加（全29ポリシー）
- WITH CHECK 明示追加（UPDATE 6箇所）
- games ポリシー統一（owner-only）
- FK インデックス追加（10個）
- OAuth コールバックバグ修正

**発見した問題:**
- Supabase Redirect URLs が空だった
- OAuth 後の早期リダイレクト問題

---

### 2026-01-23: 本番調査完了・計画確定

**詳細:** `.claude/plans/supabase-refactoring.md`

**本番調査結果:**
- users: 5件, profiles: 11件
- RLS ポリシー重複（assets/projects 各4ペア）
- 全ポリシーが `{public}` + `auth.uid()` 直書き

---

### 2026-01-22: Phase 1 完了

- Supabase Auth 一本化完了
- 全テストスイート実行・検証完了
- 技術的負債の解消

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト全体のルール・方針 |
| `.claude/plans/supabase-refactoring.md` | リファクタリング計画 |
| `.claude/docs/session-persistence-plan.md` | セッション永続化計画（将来機能） |
| `.claude/logs/` | 作業ログ（日付別） |

---

最終更新: 2026-01-29 (API キープロキシ実装)
