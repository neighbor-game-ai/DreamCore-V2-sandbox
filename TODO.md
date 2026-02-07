# TODO - DreamCore V2

## 現在の状況

Phase 1 リファクタリング完了。セキュリティ・安定性の改善を実施。

---

## 最近の作業

### 2026-02-07: Engine V2 統合の巻き戻し（V1 解放） ✅

**詳細:** `.claude/logs/2026-02-07-v1-cleanup.md`

- claudeRunner.js から V2 分岐 3 箇所を除去（コミット: `3179594`）
- GCE デプロイ済み、V1 fail rate 1.01%（正常）、V2 runs = 0
- タグ: `restore-point/20260207-pre-v1-cleanup`, `restore-point/20260207-post-v1-cleanup`
- **main は他エンジニア作業に開放 OK**
- **PR-2（Modal V2 endpoint 削除）は 24 時間監視後に判断**

---

### 2026-02-07: 画像生成の多様性・品質改善 ✅

**詳細:** `.claude/logs/2026-02-07-image-generation-fix.md`

- Sonnet によるプロンプト上書きを廃止（全画像が中世ファンタジーになる問題を解消）
- analyzeImageDirection を AI 呼び出しからルールベースに変更（コスト削減）
- geminiResult.specs フォールバックで新規ゲームの向き情報を画像生成に反映
- p5js-setup スキルテンプレートの `50,50` 固定描画を比率計算パターンに修正
- 正方形パディングは撤回（trim のみ）→ ゲームコード側で `img.height/img.width` 計算
- テスト: キリン避けゲームで縦長/横長キャラの描画・当たり判定とも正常確認
- Gemini への指示にアスペクト比維持のコード例を追加
- facing 正規表現を拡張（front, camera 等もマッチ）
- 3回のテストで全修正の動作を確認、本番デプロイ済み

---

### 2026-02-07: Push 通知抑制 & UI 改善 ✅

**詳細:** `.claude/logs/2026-02-07-push-suppression.md`

- LINE式 Push 通知抑制機能の実装 (エディタ閲覧中は Push 抑制)
- Create ページ UI 改善 (ページネーション, ボタン整理, バグ修正)
- CTO レビュー対応 (lastSeenAt 失効, 一覧ページ誤抑制の修正)
- E2E テスト実施、本番デプロイ完了
- user.html PWA インストール修正（manifest.json 欠落 → 追加）

---

### 2026-02-06: PWA インストールプロンプト実装 ✅

**詳細:** `.claude/logs/2026-02-06-pwa-install-prompt.md`

- モバイルブラウザでアクセスしたユーザーに PWA インストールを促すバナーを実装
- iOS: Safari の「ホーム画面に追加」手順を SVG イラスト付きモーダルで案内
- Android: Chrome `beforeinstallprompt` でネイティブインストール / フォールバックモーダル
- 6言語対応（en, ja, zh, ko, es, pt）、既存ファイル変更最小限
- 全ページ（create, discover, notifications, mypage, user）に対応
- Push 通知の全ユーザー開放（テスト用 Allowlist 解除）
- ドキュメント更新: `docs/PUSH-NOTIFICATION-ARCHITECTURE.md`

---

### 2026-02-06: iOS横スクロール修正（createページ） ✅

**詳細:** `.claude/logs/2026-02-06-ios-horizontal-scroll-fix.md`

- iPhoneで `/create` ページが左右にスワイプできる問題を修正
- **根本原因**: キャッシュバスター `?v=20260205` が未更新で、13回のCSS修正が全てキャッシュにより無効だった
- キャッシュバスター更新後、有効な修正（`.project-list-view` の `overflow-x: clip` + `touch-action: pan-y` 等）が反映され解決
- 冗長に積み重なった防御的CSS/JSを掃除し、必要な修正のみ残した
- 教訓: CSSを変更したら必ず `?v=` を更新すること

---

### 2026-02-06: URL構造リファクタ Phase 2 — ルート意味切替 ✅

**詳細:** `.claude/logs/2026-02-06-url-restructure-phase2.md`

`/` をホーム（create）、`/login` をログイン専用URLに変更:

- `GET /` → create.html（ホーム）に変更（express.static の index.html を上書き）
- `GET /login` → index.html（ログイン画面）は維持
- `GET /index.html` → 301 `/login` は維持
- manifest.json `id` を `/create` に修正（PWA再インストールが必要になる場合あり）
- waitlist.html の認証リダイレクトを `/login` に修正
- E2E全項目パス（agent-browser自動 + 手動通知タップ確認 2026-02-06）

---

### 2026-02-06: Phase 1 リファクタリング（ナビゲーション共通化 + デッドコード削除） ✅

**詳細:** `.claude/logs/2026-02-06-phase1-refactoring.md`

- ナビゲーション重複コード82行を `navigation.js` に統合
- デッドコード16関数 (-112行) 削除
- CTO レビュー対応: currentTab パラメータで同一タブ再読み込み防止
- 回帰テスト13ケース追加
- E2E テスト全 PASS

---

### 2026-02-06: 通知ディープリンク認証修正 + 全ページログインチラ見え修正 ✅

**詳細:** `.claude/logs/2026-02-06-push-deep-link-fix.md`

通知タップでプロジェクトページに遷移する際、ログイン画面にリダイレクトされる問題を修正:

- `app.js` の `getSessionSync()` 失敗時に `await getSession()` フォールバック追加
- 全ページの早期認証チェックに localStorage フォールバック追加（mypage, discover, notifications, editor）
- 全 JS ファイルのログインリダイレクト先を `/login` に統一
- JS ファイルにキャッシュバスター `?v=20260206b` 追加
- E2E テスト: 6ページ × Android/iOS 全パス ✅

**残タスク:** 共通 preauth ヘルパーの作成（全ページの早期認証チェックを1ファイルに統合）

---

### 2026-02-06: クリーンURL導入 ✅

**詳細:** `.claude/logs/2026-02-06-clean-url-introduction.md`

ユーザーに見せるURLから `.html` 拡張子を廃止し、モダンなクリーンURL構造に移行:

- サーバー側にクリーンURLルート8つ + 301リダイレクト8つを追加（クエリ文字列保持）
- フロントエンド15ファイルの `.html` 参照をすべて更新
- OAuth設定（Supabase）に `/create` を追加
- Agent Teams で並列実装、3ラウンドのレビューで品質担保
- game.html ボトムナビの遷移先バグも同時修正

**残タスク:** ログインチラ見え対策（別タスク）、301維持期間管理（最低90日）

---

### 2026-02-05: PWA / Push Notifications 実装 ✅

**詳細:** `.claude/logs/2026-02-05-pwa-push.md`

DreamCoreをPWA化し、プッシュ通知機能を実装:

| 項目 | 内容 |
|------|------|
| **PWA** | manifest.json, Service Worker, アイコン |
| **Push API** | VAPID認証、購読管理、通知履歴 |
| **通知トリガー** | ゲーム生成完了/失敗時に自動送信 |
| **iOS対応** | ユーザージェスチャー必須、ホーム追加後のみ |

**E2E テスト結果:**
| デバイス | 購読 | 手動通知 | ゲーム完成通知 |
|----------|-----|---------|---------------|
| Android 10 | ✅ | ✅ | ✅ |
| iOS 18.5 (PWA) | ✅ | ✅ | ✅ |

**修正した問題:**
- ブラウザキャッシュで新コードが読み込まれない → キャッシュバスター追加
- `DreamCorePush` が未ロード → 動的ローダー追加
- 認証後に購読されない → `ensurePushSubscription()` 追加

**残課題（バックログ）:**
- 通知タップ → プロジェクトページに遷移（現状は `/create.html`）
- 通知種別ごとのリンク先対応（コメント、Remix 等）
- PWA で開く（現状はブラウザが開く）

**ステータス:** E2E完了、改善項目は別途対応

---

### 2026-02-05: Sandbox プリウォーム機能実装 ✅

**詳細:** `.claude/logs/2026-02-05-sandbox-prewarm.md`

Createページアクセス時にModal Sandboxを事前起動し、初回ゲーム生成のコールドスタート待ち時間を削減:

| 項目 | 内容 |
|------|------|
| **トリガー** | WS `init` 完了後（Createページアクセス時） |
| **Sandbox命名** | `user-{full_uuid}`（衝突防止のためフルUUID使用） |
| **旧形式互換** | `dreamcore-{hash}-p2` へのフォールバック |
| **重複防止** | 5分TTLのinMemoryキャッシュ |
| **効果** | 初回生成 26秒 → 15秒（-11秒） |

**変更ファイル:**
- `modal/app.py` - `prewarm_sandbox` エンドポイント追加
- `server/modalClient.js` - `prewarmSandboxByUser()` メソッド追加
- `server/index.js` - WS `init` でプリウォーム呼び出し

**コードレビュー対応:**
- Critical: `user_id[:8]` → フルUUIDに変更（衝突リスク対策）
- Warning: bad state再生成時の `AlreadyExistsError` ハンドリング追加

---

### 2026-02-05: マルチアカウント ゲーム作成テスト ✅

**詳細:** `.claude/logs/2026-02-05-multi-account-test.md`

複数のテストアカウントを使用して E2E テストを実施:

| 項目 | 結果 |
|------|------|
| Magic Link 認証 | ✅ 成功 |
| 2D ゲーム作成 | ✅ 成功（10メッセージ処理） |
| Named Sandbox 再利用 | ✅ "Sandbox already exists" エラーなし |
| 一時的なバグ自動修復 | ✅ AI が自動で修正 |

**発見事項:** 新規テストアカウントは `user_access` テーブルで手動承認が必要

---

### 2026-02-05: i18n 完全対応完了 ✅

**詳細:** `.claude/logs/2026-02-05-i18n-completion.md`

app.js、game.html の残存日本語文字列を全て i18n 化:

| 対象 | 内容 |
|------|------|
| **app.js** | 100+ 文字列を `this.t()` に置換 |
| **game.html** | aria-label, エラー画面, 共有パネル, 系譜エラー |
| **i18n.js** | `data-i18n-aria` サポート追加 |
| **6言語** | game セクションに18キー追加 |
| **mypage.js** | デフォルトユーザー、公開テキスト、共有タイトル |

**CTOレビュー:** 3点の承認条件を確認済み

**追加修正（4954d7c）:** 前回コミットで app.js/mypage.js が漏れていた問題を修正

---

### 2026-02-05: Named Sandbox 最適化 (detect_intent/chat_haiku) ✅

**詳細:** `.claude/logs/2026-02-05-named-sandbox-optimization.md`

「意図を判定中...」の遅延問題を解決:

| 項目 | 内容 |
|------|------|
| **問題** | `run_haiku_in_sandbox()` が毎回新しい Sandbox を作成（3-10秒の冷起動） |
| **解決** | Named Sandbox プール（3つ）を round-robin で再利用 |
| **設定** | `timeout=5h`, `idle_timeout=1h` |
| **効果** | 2回目以降のリクエストは warm sandbox から即座に実行 |

**変更:** `modal/app.py` - `get_claude_sandbox()` ヘルパー追加

---

### 2026-02-05: ゲーム生成パフォーマンス最適化 ✅

**詳細:** `.claude/logs/2026-02-05-is-initialized-backfill.md`

`is_initialized` フラグを唯一の真実（Single Source of Truth）として確立:

| 項目 | 内容 |
|------|------|
| **判定ルール** | DB証拠（published_games, activity_log） → Modal証拠（git コミット数, index.html） |
| **バックフィル結果** | 178件処理、70件 true、108件 false、エラー 0件 |
| **効果** | 2D/3D判定でファイル I/O（200-350ms）を排除 |

**その他の最適化:**
- `Promise.all()` で selectProject の並列クエリ
- バージョン遅延読み込み（別メッセージ `versionsList`）
- 署名付き URL キャッシュ（4分 TTL）
- Visual Guide 生成に 2秒タイムアウト

**スクリプト:** `scripts/backfill-is-initialized.js`

---

### 2026-02-05: 多言語対応（i18n）実装 ✅

**詳細:** `.claude/logs/2026-02-05-i18n-implementation.md`

DreamCore V2 に国際化（i18n）を実装:

| 項目 | 内容 |
|------|------|
| **対応言語** | 英語（デフォルト）、日本語、中国語 |
| **言語検出** | ブラウザ設定から自動検出 |
| **手動切り替え** | 右上の言語セレクターで切り替え可能 |
| **翻訳ガイド** | プロダクト思想を理解した翻訳のためのガイド作成 |

**新規ファイル:**
- `public/i18n.js` - コアモジュール
- `public/locales/{en,ja,zh}.json` - 翻訳ファイル
- `public/locales/TRANSLATION-GUIDE.md` - 翻訳者向けガイド

**バグ修正:**
- 言語セレクターの位置ずれ（`.login-view` に `position: relative` 追加）
- CSS キャッシュ問題（`?v=20260205` キャッシュバスティング追加）

---

### 2026-02-05: 認証機能改善 ✅

**詳細:** `.claude/logs/2026-02-05-auth-improvements.md`

認証オプションの拡充と多言語メール対応を実施:

| 機能 | 内容 |
|------|------|
| **ウェイトリストメール言語対応** | 日本人ユーザーにも英語メールが届いていた問題を修正 |
| **Apple Sign-In** | V1 から移行した Apple ID ユーザーのログイン対応 |
| **メール認証（マジックリンク）** | 中国など Google/Apple がブロックされている地域向け |
| **多言語メール** | 日本語/英語/中国語の3言語対応（Brevo API） |

**変更ファイル:**
- `server/routes/authApi.js` (新規) - マジックリンク API
- `public/auth.js` - signInWithApple, signInWithMagicLink 追加
- `public/index.html` - Apple/メールログインボタン追加
- `public/i18n.js` - git に追加（以前は untracked で 404）
- `supabase/functions/waitlist-email/index.ts` - 言語判定追加

**設定変更:**
- Apple Developer Console: `auth.dreamcore.gg` を Return URL に追加
- Edge Function: VERSION 11 にデプロイ

---

### 2026-02-04: 送信ボタン状態表示をリバート ✅

**コミット:** `4780f82 Revert "feat(ui): add visual state feedback to send button"`

UX の観点から、送信ボタンの動的状態表示（empty/ready/processing/quota）を元のシンプルな実装に戻した。

| 変更前 | 変更後 |
|--------|--------|
| 状態に応じてラベル・アイコン・色が変化 | 「送信」固定ラベル + disabled 制御のみ |

**理由:** UX は "分かりやすさ" と "一貫性" が最優先（CTO 判断）

**方法:** `git revert 672c37d` で安全にリバート（コンフリクトなし）

**デプロイ:** GCE 本番反映済み ✅

---

### 2026-02-04: V1→V2 ユーザー移行 ✅

**詳細:** `.claude/logs/2026-02-04-v1-to-v2-user-migration.md`

DreamCore V1（7,299ユーザー）から V2 への完全移行を実施:

| フェーズ | 内容 | 結果 |
|---------|------|------|
| Phase 1 | マッピングテーブル作成 | ✅ 7,297件 |
| Phase 2 | auth.users 移行 | ✅ 7,174作成 + 108スキップ |
| Phase 3 | display_name 移行 | ✅ 7,296更新 |
| Fix | public.users 作成 | ✅ 7,286作成 |

**最終結果:**
- V2 auth.users: **7,309**
- V2 public.users: **7,309**

**認証方法の内訳（移行元）:**
- Google OAuth: 5,821
- Email/Password: 896（パスワードリセット必要）
- Apple: 565

**方針決定:**
- bio / social_links / avatar は移行せず、ユーザー手動更新とする
- 理由: 移行コスト vs 価値のバランス、最新情報をユーザーに入力してもらう

**学び:**
- Admin API でユーザー作成時、`public.users` トリガーは発火しない
- Supabase 連続リクエストで 500 エラー発生 → リトライ＋指数バックオフで対応
- PostgREST は public スキーマのみアクセス可能

**スクリプト:** `scripts/migration-*.js`（6ファイル）

---

### 2026-02-04: @username プロフィールナビゲーション ✅

**詳細:** `.claude/logs/2026-02-04-username-profile-navigation.md`

TikTok/Instagram スタイルの `/@username` URL を実装:

| 項目 | 内容 |
|------|------|
| **URL 形式** | `/u/{public_id}` → `/@{username}` に統一 |
| **ナビ「マイ」** | `/@{username}` に直接遷移（Spec C） |
| **mypage.html** | リダイレクトなし、直接表示 |
| **予約語保護** | 共通モジュール `usernameValidator.js` |

**変更ファイル:**
- `server/modules/profile/usernameValidator.js` (新規) - 予約語バリデーション
- `server/modules/profile/routes.js` - `/api/users/username/:username/public`
- `server/modules/profile/publicRoutes.js` - `/@:username` ルート
- `public/auth.js` - `getMyProfileUrl()`, キャッシュ機能
- `public/profile.js` - `/@username` 対応、URL 正規化
- `public/mypage.js` - リダイレクト削除
- `public/app.js`, `notifications.js`, `discover.html`, `game.html` - ナビ更新

**UX 改善:** 画面遷移が 3回 → 1回 に削減

**CodeRabbit レビュー:** Warning 2件を修正（クライアント側バリデーション追加、CLI エラー meta 追加）

**デプロイ:** GCE 本番反映済み ✅

---

### 2026-02-04: Asset API モジュール化 (Phase 1) ✅

**詳細:** `.claude/logs/2026-02-04-asset-api-modularization.md`

server/index.js (3,451行) からアセット関連ルートを抽出し、モジュール化:

| 新規ファイル | 内容 |
|--------------|------|
| `server/middleware/uploads.js` | Multer アップロード設定 |
| `server/middleware/assetChecks.js` | アクセス制御ミドルウェア |
| `server/routes/assetsApi.js` | `/api/assets/*` エンドポイント |
| `server/routes/assetsPublic.js` | `/user-assets/*`, `/global-assets/*` |

**結果:** index.js から約540行削減、4ファイルに分割

**テスト:** Unit + E2E (本番) 全て PASS

**E2E レポート:** `screenshots/e2e-test-prod/report.html`

---

### 2026-02-04: Publish API モジュール化 (Phase 2) ✅

**詳細:** `.claude/logs/2026-02-04-publish-api-modularization.md`

Phase 1 に続き、Publish API 関連ルートを抽出:

| 新規ファイル | 内容 |
|--------------|------|
| `server/middleware/projectChecks.js` | checkProjectOwnership ミドルウェア |
| `server/utils/git.js` | gitCommitAsync ユーティリティ |
| `server/routes/publishApi.js` | Publish API (6エンドポイント) |

**結果:** index.js から約500行削減（累計約1,160行削減、3,451→2,292行）

**追加修正:**
- gitCommitAsync のファイルスコープ明示化
- CodeRabbit レビュー実施 → High 優先度 2件修正（try-catch, null チェック）

---

### 2026-02-04: 送信ボタン状態表示改善 ✅

**詳細:** `.claude/logs/2026-02-04-login-title-cors-fix.md`

送信ボタンが無効な理由をユーザーに分かりやすく表示:

| 状態 | ラベル | アイコン | 色 |
|------|--------|----------|-----|
| `ready` | 送信 | 送信 | 青 |
| `empty` | 入力してください | 送信 | グレー |
| `processing` | 処理中… | スピナー | グレー |
| `quota` | 制限中 | 警告 | 赤 |

**変更ファイル:** `editor.html`, `style.css`, `app.js`

---

### 2026-02-04: 公開ゲームAPI修正 & カスタム404ページ ✅

| 作業 | 内容 |
|------|------|
| **FK修正** | `published_games.user_id` の参照先を `auth.users` → `public.users` に変更 |
| **カスタム404** | Expressデフォルトの「Cannot GET」をブランドデザインの404ページに置き換え |

**問題:** `/api/published-games/:id` が `{"error":"Game not found"}` を返す

**原因:** PostgREST が `auth.users` への FK を `public.users` との JOIN に使えなかった

**対応:**
1. 既存FK削除 → `public.users` への新規FK追加（`ON DELETE SET NULL`）
2. スキーマドキュメントにユーザー削除時の注意事項を追記

**残課題:** `user_id` が NOT NULL のため、将来ユーザー削除機能実装時に対応が必要

---

### 2026-02-04: ログイン画面タイトル変更 & R2 CORS設定 ✅

**詳細:** `.claude/logs/2026-02-04-login-title-cors-fix.md`

| 作業 | 内容 |
|------|------|
| **タイトル変更** | ログイン画面を「ゲームクリエイター」→「DreamCore」に変更 |
| **R2 CORS設定** | CDN からのアセット配信で CORS エラーが発生 → wrangler で設定追加 |

**問題:** プレビュー画面で画像・音声が読み込めない（`ERR_BLOCKED_BY_ORB`）

**原因:** Cloudflare R2 CDN に `Access-Control-Allow-Origin` ヘッダーがなかった

**対応:** wrangler CLI で `dreamcore-public` バケットに CORS ルール追加
```json
{
  "allowed": {
    "origins": ["https://v2.dreamcore.gg", "https://play.dreamcore.gg", "http://localhost:3000"],
    "methods": ["GET", "HEAD"],
    "headers": ["*"]
  }
}
```

**変更ファイル:** `public/index.html`, R2 バケット設定

---

### 2026-02-04: ゲーム画面の戻るボタン改善 ✅

**詳細:** `.claude/logs/2026-02-04-game-back-button-navigation.md`

マイページからゲーム画面を開いた後、戻るボタンでマイページに戻れるよう改善:

| 項目 | 内容 |
|------|------|
| **方式** | クエリパラメータ（`?from=mypage`）+ referrer フォールバック |
| **セキュリティ** | `from` は列挙型、`user` は u_ 形式/UUID のみ、referrer は同一ホスト限定 |
| **フォールバック** | from → referrer → `/create.html` の優先順位 |

**変更ファイル:** `mypage.js`, `game.html`

---

### 2026-02-04: プロフィール編集モーダル フルスクリーン化 ✅

**詳細:** `.claude/logs/2026-02-04-profile-editor-fullscreen.md`

プロフィール編集モーダルとナビバーの重なり問題を解決:

| 項目 | 内容 |
|------|------|
| **問題** | モーダル下部とボトムナビが重なり操作不能 |
| **解決** | モバイル時フルスクリーンモーダルに変更 |
| **ナビ制御** | モーダル表示時にナビバーを非表示 |
| **iOS対応** | `safe-area-inset-bottom` でホームインジケーター考慮 |

**変更ファイル:** `profile.css`, `profile.js`

---

### 2026-02-04: ゲームページ Info Panel 刷新 + 編集ボタン追加 ✅

**詳細:** `.claude/logs/2026-02-04-info-panel-edit-button.md`

ゲームページの Information パネルを Nintendo Switch 風デザインに刷新し、オーナー向け編集機能を追加:

| 項目 | 内容 |
|------|------|
| **デザイン** | 赤アクセントバー + タイトル + 作成者（アバター + 名前） |
| **オーナー判定** | Supabase Auth セッションと `game.user_id` を比較 |
| **編集ボタン** | オーナーのみ表示、クリックで `/create.html?project={id}` に遷移 |
| **API修正** | `getPublishedGameById()` に `users` join 追加 |

**変更ファイル:** `game.html`（CSS/HTML/JS）, `database-supabase.js`

---

### 2026-02-04: マイページ プロフィールレイアウト刷新 ✅

**詳細:** `.claude/logs/2026-02-04-mypage-profile-layout.md`

マイページを Instagram スタイルのプロフィールレイアウトに刷新:

| 項目 | 内容 |
|------|------|
| **プロトタイプ** | 自分用・他人用の2種類作成 |
| **レイアウト** | アバター + 統計（横）、名前 + Bio + SNS（縦） |
| **シェア機能** | Web Share API + Clipboard フォールバック |
| **修正** | SNS アイコン中央揃え → 左寄せ |

**変更ファイル:** `mypage.html`, `mypage.js`, `style.css`, `profile.css`, プロトタイプ2件

---

### 2026-02-03: CLI Deploy 機能拡張 ✅

**詳細:** `.claude/logs/2026-02-03-cli-deploy-enhancements.md`

| 機能 | 内容 |
|------|------|
| **Skills 自動更新** | `/skills/` 配信エンドポイント、version.json、Step 0 で更新確認 |
| **メタデータ編集 API** | `PATCH /projects/:id` - ファイル再アップロード不要で title/description 等を更新 |
| **CodeRabbit 対応** | cli_projects エラーハンドリング、cli_published_games 0件→404 |

**コミット:** `0ea77c6`, `f3d84ba`, `4d650d7`, `adb2b13`

---

### 2026-02-03: CLI Deploy メタデータ拡張 ✅

**詳細:** `.claude/logs/2026-02-03-cli-deploy-metadata.md`

CLI Deploy の公開機能を Web 公開と同等に拡張:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `howToPlay` | string | 操作方法・ルール（1000字以内） |
| `tags` | string[] | 検索用タグ（最大5個） |
| `visibility` | string | `"public"` or `"unlisted"` |
| `allowRemix` | boolean | Remix許可 |
| `thumbnail` | file | サムネイル画像（WebP変換） |

**変更内容:**
- `cli-deploy/server/upload.js` - dreamcore.json v2 パーサー、サムネイル抽出
- `cli-deploy/server/routes.js` - サムネイル処理、新フィールド保存
- `.claude/skills/dreamcore-deploy/SKILL.md` - デプロイスキル新規作成
- `docs/CLI-ARCHITECTURE.md` - v2 仕様ドキュメント
- Supabase B マイグレーション（新カラム追加）

---

### 2026-02-03: 招待コード機能実装 ✅

**詳細:** `.claude/logs/2026-02-03-invitation-code.md`

招待コードを持つユーザーは手動承認を待たずに即座にアクセス可能に:

| 項目 | 内容 |
|------|------|
| DB | `invitation_codes`, `invitation_code_uses` テーブル追加 |
| API | `POST /api/invitation/redeem` エンドポイント追加 |
| UI | `waitlist.html` に招待コード入力フォーム追加 |
| ドキュメント | `docs/WAITLIST.md` に招待コード機能を追記 |

**現在の招待コード:**
- `BETATESTER` - βテスター用
- `WFMY7CHS` - コアユーザー向け
- `K60ZYE2U` - X告知用

**その他:**
- CodeRabbit 導入・コードレビュー対応（r2Client URL エンコード、gameHtmlUtils try-catch）

---

### 2026-02-03: CLI Deploy スキーマ統一 & Worker 修正 ✅

**詳細:** `.claude/logs/2026-02-03-cli-schema-alignment.md`

CLI Deploy のデータベーススキーマを Play と統一:

| テーブル | 変更内容 |
|----------|----------|
| **cli_projects** | `title` → `name` リネーム、`game_type`, `storage_path`, `is_public`, `remixed_from` 追加 |
| **cli_published_games** | `title`, `description`, `how_to_play`, `thumbnail_url`, `tags`, `visibility`, `allow_remix`, `play_count`, `like_count`, `updated_at` 追加 |

**Worker 修正:**
- CLI ゲームが 404 になる問題を解決
- 原因: `SUPABASE_SERVICE_ROLE_KEY` が間違っていた（DB lookup 401 エラー）
- 対応: 正しい Supabase B の service_role key を Worker secret に設定

**効果:** CLI と Play で同じデータ構造、同じ API レスポンス形式に統一

---

### 2026-02-03: R2/CDN 完全移行 ✅

**詳細:** `.claude/logs/2026-02-03-r2-cdn-migration.md`

公開ゲーム・サムネイル・アセットの配信を Cloudflare R2 + CDN に移行:

| 機能 | 内容 |
|------|------|
| R2 クライアント | `server/r2Client.js` - S3互換 API |
| ゲーム配信 | `/g/:id/*` → 302 リダイレクト |
| サムネイル配信 | `/api/projects/:id/thumbnail` → 302 リダイレクト |
| **user-assets 配信** | `/user-assets/:userId/:alias` → 302 リダイレクト |
| **global-assets 配信** | `/global-assets/:category/:alias` → 302 リダイレクト |
| サムネイル自動生成 | NanoBanana（Gemini）による新規公開時の自動生成 |
| バックフィル | ゲーム12件 + アセット142件を R2 に移行 |

**CDN URL:**
- ゲーム: `https://cdn.dreamcore.gg/g/{public_id}/`
- アセット: `https://cdn.dreamcore.gg/user-assets/{userId}/{alias}`

**効果:** 「表示されたりされなかったり」問題を解消。Modal Volume の不安定さに依存しない配信基盤を構築。

**追加対応:**
- GCE 本番に R2 環境変数が未設定だった問題を修正
- CSP imgSrc に `cdn.dreamcore.gg` を追加
- **Cloudflare Cache Rules で 404 キャッシュを無効化**（再発防止）

---

### 2026-02-02: プロンプトインジェクション自動テストスイート作成 ✅

**詳細:** `.claude/logs/2026-02-02-prompt-injection-test.md`

プロンプトインジェクション脆弱性の E2E テストスイートを作成:

- 17パターンの攻撃ベクトル（タグ脱出、指示上書き、APIキー漏洩、コマンド実行等）
- 文脈認識の判定ロジック（VULNERABLE / REVIEW / REFUSED / SECURE）
- 誤検出（Claude の拒否メッセージ）を除外する改善済み検出

**テスト結果:** 全17テスト成功（全攻撃が Claude によりブロック）

**使用方法:**
```bash
node test-prompt-injection.js              # 全テスト
node test-prompt-injection.js --dry-run    # ペイロード確認
node test-prompt-injection.js --category=tag_escape,api_key_exfil -v
```

**スキル:** `.claude/skills/prompt-injection-test/SKILL.md`

---

### 2026-02-02: CLI Deploy 本番ドメイン移行完了 ✅

**詳細:** `.claude/logs/2026-02-02-cli-deploy-e2e-test.md`

cli.dreamcore.gg への本番ドメイン移行が完了:

| 項目 | 状態 |
|------|------|
| DNS (Cloudflare) | ✅ |
| SSL/TLS | ✅ |
| Worker Custom Domain | ✅ |
| Content-Type 修正 | ✅ |
| CLI_GAMES_DOMAIN 更新 | ✅ |

**本番 URL:**
- API: `https://v2.dreamcore.gg/api/cli/*`
- 認証: `https://v2.dreamcore.gg/cli-auth/auth.html`
- ゲーム配信: `https://cli.dreamcore.gg/g_xxxxx/`

**修正した問題:**
- Supabase Storage が `text/plain` を返す → Worker で拡張子から Content-Type 設定
- auth.html で Supabase SDK 変数名衝突 → `supabaseClient` にリネーム
- CSP が `/cli-auth/` をブロック → 除外対象に追加

**残作業:**
- [x] スキーマ統一（Play と同じ構造に）✅ 2026-02-03
- [x] Worker 認証修正（SUPABASE_SERVICE_ROLE_KEY）✅ 2026-02-03
- [ ] デバッグログ削除
- [ ] Claude Code Skills テスト
- [ ] ユーザー向けドキュメント
- [ ] `/api/published-games/:id/play` の CLI 対応
- [ ] `/api/games/:id/lineage` の CLI 対応

---

### 2026-02-02: 系譜デモページ作成

**詳細:** `.claude/logs/2026-02-02-lineage-showcase-demo.md`

複雑な系譜ツリーのデモページを作成（`public/demo/lineage-showcase.html`）。
深さ制限（現在10世代）の緩和は将来の拡張として TODO に記載。

---

### 2026-02-02: CLI Deploy GCE デプロイ

**詳細:** `.claude/logs/2026-02-02-cli-deploy-gce.md`

CLI Deploy 機能を GCE 本番環境にデプロイ:

| ステップ | 内容 |
|----------|------|
| server/index.js 統合 | 条件付きロード（`SUPABASE_CLI_URL` で有効化） |
| Cloudflare Worker | `cli-dreamcore.notef.workers.dev` にデプロイ |
| 環境変数設定 | GCE .env に CLI Deploy 用変数追加 |
| 本番テスト | `POST /api/cli/device/code` → 成功 |

**発見:** bcrypt/adm-zip 不足、IPv6 Rate Limit 警告（非ブロッキング）

---

### 2026-02-02: Remix機能UI + 環境差分対応

**詳細:** `.claude/logs/2026-02-02-remix-ui-and-fixes.md`

| 作業 | 内容 |
|------|------|
| Remix UI | ボタン、系譜ビュー、成功メッセージ（フラッシュ回避） |
| サムネイル修正 | レート制限から除外（429エラー解消） |
| 環境差分検出 | `/api/health` にコミットハッシュ追加 |

**学び:** PM2再起動後は `uptime` で新プロセス確認が確実

---

### 2026-02-02: Remix機能 + 系譜API 実装

**詳細:** `.claude/logs/2026-02-02-remix-lineage-api.md`

公開ゲームをリミックスする機能と、系譜（先祖・子孫ツリー）を追跡するAPIを実装:

| エンドポイント | 認証 | 説明 |
|---------------|------|------|
| `POST /api/games/:id/remix` | 必須 | 公開ゲームをリミックス |
| `GET /api/games/:id/lineage` | 不要 | 系譜情報を取得 |

**設計方針（itch.io/Roblox モデル）:**
- 非公開ノードは伏せて繋げる（UUID/名前を隠す）
- 先祖は無制限、子孫は maxDepth=10
- CORS: ALLOWED_ORIGINS のみ
- RPC `count_all_remixes` はサーバー専用

**変更ファイル:**
- `server/remixService.js` (新規)
- `server/index.js` (CORS移動 + setupRoutes)
- `supabase/migrations/014_count_all_remixes_rpc.sql` (新規)
- `docs/API-REFERENCE.md` (更新)

---

### 2026-02-01: CSP Report-Only 導入 (Phase 2b)

**詳細:** `.claude/logs/2026-02-01-csp-report-only.md`

Content-Security-Policy-Report-Only ヘッダーを導入:

| 項目 | 内容 |
|------|------|
| 適用対象 | アプリページ (`/`, `/editor.html` 等) |
| 除外対象 | ゲームページ (`/g/`, `/game/`) - AI 生成で CDN 予測不能 |
| モード | Report-Only（ブロックせずログ記録のみ） |

**CSP ディレクティブ:**
- `script-src`: self, unsafe-inline, cdnjs.cloudflare.com
- `style-src`: self, unsafe-inline, fonts.googleapis.com
- `connect-src`: self, wss:, *.supabase.co
- `img-src`: self, data:, blob:, supabase, googleusercontent, qrserver

**違反レポート:** `/api/csp-report` → `[CSP Violation]` ログ

**次のステップ:** 数日間違反ログ監視 → Phase 2c（強制モード移行）

---

### 2026-02-01: Modal chat_sonnet エンドポイント追加

**詳細:** `.claude/logs/2026-02-01-modal-chat-sonnet.md`

セキュリティ対応で本番ローカル CLI 禁止後、`analyzeImageDirection` がエラーになる問題を修正:

| 項目 | 内容 |
|------|------|
| 問題 | 画像方向分析で `Local CLI execution is not allowed` エラー |
| 原因 | Sonnet が必要だが `chat_haiku` は Haiku 固定 |
| 対応 | Modal に `chat_sonnet` エンドポイント追加 |

**変更ファイル:**
- `modal/app.py` - `run_sonnet_in_sandbox()` + `chat_sonnet` エンドポイント
- `server/modalClient.js` - `chatSonnet()` メソッド
- `server/claudeRunner.js` - Modal Sonnet 対応

**検証結果:**
```
[analyzeImageDirection] Using Modal Sonnet for: player.png
[analyzeImageDirection] Using Modal Sonnet for: enemy.png
```

---

### 2026-02-01: セキュリティレビュー対応（P0/P1）

**詳細:** `.claude/logs/2026-02-01-security-review-response.md`

外部セキュリティ専門家（kinopiee氏）によるレビュー指摘に対応:

| Phase | 項目数 | 状態 |
|-------|--------|------|
| P0（リリースブロッカー） | 6件 | ✅ 完了 |
| P1（リリース前） | 5件 | ✅ 完了 |

**P0 対応内容:**
- CLI サンドボックス必須化（本番で USE_MODAL=false → 起動拒否）
- パストラバーサル対策（isPathSafe でファイルパス検証）
- レート制限（AI系 5req/min、一般 60req/min）
- WS 認証タイムアウト（未認証接続を 10秒で切断）
- MIME 判定厳格化（ext && mime）
- SUPABASE_URL 正規化（末尾スラッシュ削除）

**P1 対応内容:**
- SVG サニタイズ（DOMPurify で XSS 対策）
- helmet 導入（セキュリティヘッダー）
- Modal healthCheck 修正（500/503 を異常判定）
- サムネイル修正（WebP 変換 + null 安全化）
- プロンプトインジェクション対策（構造化マーカー + 監査ログ）

**追加パッケージ:** `express-rate-limit`, `helmet`, `dompurify`, `jsdom`

**ブランチ:** `feature/security-review-response`

**残タスク:** ~~CSP Report-Only 導入（Phase 2b）~~ ✅ 完了、CSP 強制モード移行（Phase 2c）- 違反ログ監視後

---

### 2026-02-01: シェアボタンデザイン試行

**詳細:** `.claude/logs/2026-02-01-share-button-design.md`

ゲーム登録後のシェアポップアップ機能を追加し、デザインを複数回試行:

| 試行 | デザイン | 結果 |
|------|----------|------|
| Phase 1 | アイコン + テキスト | 質素すぎる |
| Phase 2 | 任天堂カードスタイル | 元のほうがよかった |
| Phase 3 | シンプル円形アイコン | **採用** |
| 再試行 | DreamCoreスタイル（任天堂×佐藤可士和） | 元に戻して |

**最終結果:** シンプルな円形アイコンデザイン（48px、Flexbox wrap、フラット）

**実装機能:**
- 12種類のシェア先（X, Facebook, LINE, WhatsApp 等）
- UTMパラメータ付きリンク
- QRコード生成
- Web Share API（フォールバック: URLコピー）
- タッチデバイス用タップフィードバック

---

### 2026-02-01: モバイルブラウザ用ハンバーガーメニュー検討

**詳細:** `.claude/logs/2026-02-01-mobile-hamburger-menu-sample.md`

モバイルブラウザでボトムナビとブラウザナビが重なる問題の解決策を検討:

| 項目 | 内容 |
|------|------|
| 問題 | モバイルブラウザで2つのナビバーが重なる |
| 解決案 | ブラウザモード時はハンバーガーメニューに切り替え |
| CSS判定 | `@media (display-mode: browser)` |
| サンプル | `public/sample-game-menu.html` 作成 |
| 本番 | 変更なし（サンプルで検証継続） |

---

### 2026-02-01: セキュリティ改善 Phase 0 実装

**詳細:** `.claude/logs/2026-02-01-security-phase0.md`

技術的負債のセキュリティ改善（Phase 0）を実装:

| 完了項目 |
|----------|
| サムネイル URL から access_token 削除 |
| 署名付き URL でゲーム iframe を保護 |
| authMiddleware から query token サポート削除 |
| Referer フォールバックを HTML 以外に制限 |
| 別タブ問題修正（localStorage フォールバック追加）|
| notifications.js に checkAccess 追加 |

---

### 2026-02-01: セッション・認証関連の修正

**詳細:** `.claude/logs/2026-02-01-session-auth-fixes.md`

セッション期限切れ時の挙動改善:

| 完了項目 |
|----------|
| チャット入力を AI 処理中も有効に（送信ボタンのみ無効化）|
| テキストエリアの高さリセット修正 |
| Quota API エラー修正（uuid_generate_v7 の search_path）|
| iOS Safari キーボード対応（position: sticky）|
| ウェイトリストリダイレクトループ修正（authError フラグ）|
| 無限リダイレクトループ修正（expires_at チェック）|
| トークン期限切れ時の自動リフレッシュ（再ログイン不要に）|

---

### 2026-01-31: ID 規格整備（UUID v7 + public_id）

**詳細:** `.claude/logs/2026-01-31-id-format-strategy.md`

100万ユーザー規模に向けた ID 設計:

- **UUID v7**: 新規レコードのデフォルト（時間順ソート可能、インデックス効率向上）
- **public_id**: 公開 URL 用短縮 ID（`g_xxx`, `u_xxx`, `p_xxx`）

| 完了項目 |
|----------|
| `uuid_generate_v7()` 関数作成 |
| 10テーブルのデフォルトを UUID v7 に変更 |
| public_id カラム追加（published_games, users, projects）|
| 既存データのバックフィル（100件）|
| API ルーティング更新（UUID / public_id 両対応）|
| 公開 URL ルート追加（`/u/:id`, `/p/:id`, `/zap/:id`）|
| フロントエンド共有 URL を public_id に切り替え |
| アクセス制御確認（public / unlisted）|

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
- [x] iframe sandbox属性のセキュリティ対策 ✅ 2026-01-30（itch.io モデル採用）

---

## 技術負債・リファクタリング提案

**詳細:** `/Users/admin/DreamCore-V2-sandbox/.claude/docs/technical-debt-refactoring.md`

専門家レビュー（2026-01-29）に基づく構造改善・セキュリティ改善提案。

### セキュリティ改善（Phase 0）✅ 完了 2026-02-01

**詳細:** `.claude/logs/2026-02-01-security-phase0.md`

| 対象 | 問題 | 状態 |
|------|------|------|
| サムネURLトークン削除 | 公開エンドポイントに不要なトークン付与 | ✅ |
| authMiddlewareクエリ廃止 | URLクエリでaccess_token受付（漏洩リスク） | ✅ |
| ゲームiframeトークン排除 | ゲーム側からトークン読み取り可能 | ✅ 署名付きURL |
| sessionStorage移行 | localStorageのセッション露出 | ✅ 別タブ対応含む |

### 高優先度（コア改善・Phase 1）

| 対象 | 問題 | 工数 |
|------|------|------|
| server/index.js (2,441行) | 9機能ブロック混在、60+エンドポイント | 3-4日 |
| server/claudeRunner.js (3,219行) | 5責務混在、processJob()が247行 | 3-4日 |
| public/app.js (5,677行) | 221メソッド、handleMessage()が375行 | 4-5日 |

### 中優先度（品質改善・Phase 2）

| 対象 | 問題 | 工数 |
|------|------|------|
| server/database-supabase.js | 43箇所の{data,error}重複（17%削減可能） | 1日 |
| server/userManager.js | 69行HTMLテンプレート埋め込み | 0.5日 |

### 低優先度（長期改善・Phase 3）

| 対象 | 問題 | 工数 |
|------|------|------|
| getModalClient() | 3ファイルで同一関数を独立実装 | 0.5日 |
| フロントエンド共通化 | 認証パターン重複（45行削減可能） | 1日 |
| errorResponse.js | 48箇所が直接形式（標準化未使用） | 2日 |

---

## Phase 2 準備（基盤整備後に着手）

- [x] 公開機能の設計 ✅ 2026-01-30
- [x] Published Games API 実装 ✅ 2026-01-30
  - `POST /api/projects/:projectId/publish` - ゲーム公開
  - `DELETE /api/projects/:projectId/publish` - 非公開化
  - `GET /api/published-games/:id` - 公開ゲーム情報（認証不要）
  - `POST /api/published-games/:id/play` - プレイ数カウント（認証不要）
  - `GET /api/published-games` - 公開ゲーム一覧
  - `GET /g/:gameId/*` - 公開ゲームファイル配信（認証不要）
- [x] Nginx 設定（v2.dreamcore.gg / play.dreamcore.gg）✅ 2026-01-30
- [x] SSL 証明書設定（Let's Encrypt）✅ 2026-01-30
- [x] フロントエンド公開 UI（既存の publish.html が対応済み）✅ 2026-01-30
- [ ] `/discover` ページ実装（公開ゲーム一覧UI）

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
- [ ] **Photo Game Creator（初心者向けフロー）** - 写真をアップロードしてパーソナライズされたゲームを作成
  - **サンプル:** `public/sample-photo-game/`（UIプロトタイプ完成）
  - **フロー:** 写真アップロード → 「人物全体」or「顔だけ」選択 → ゲームタイプ選択 → ゲーム生成
  - **実装済み:** 顔検出（face-api.js）、UI/UX、プロンプト生成
  - **未実装:** 背景除去（BRIA RMBG連携）、本体統合
  - **目的:** 初心者でも「自分の写真でゲームが作れる」という明確な体験を提供
- [ ] **多言語化（i18n）** - 日本語/英語の2言語対応、ブラウザ言語で自動切替
  - **計画書:** `/Users/admin/.claude/plans/quiet-imagining-rossum.md`
  - 翻訳対象: HTML静的テキスト200+、JS動的テキスト120+
  - 主要ファイル: app.js, editor.html, create.html, publish.js
- [ ] **CLI Remix 機能** - CLI からゲーム URL を指定して Remix
  - CLI でゲーム URL を貼り付け → 元ゲームをダウンロード → 新プロジェクトとして展開
  - `dreamcore.json` に `remixedFrom` フィールド追加（系譜追跡用）
- [ ] **CLI ゲームの Web UI Remix 対応** - CLI アップロードゲームも Web UI から Remix 可能に
  - 現在: Play で作成したゲームのみ Remix 可能
  - 将来: CLI ゲームも `/game/:id` の Remix ボタンで Remix 可能
  - CLI と Play のゲームが相互に Remix できるエコシステム
- [ ] **系譜表示の深さ制限緩和** - 現在10世代、50〜無制限に拡張可能（`remixService.js:198`）
- [ ] **play_count レート制限** - IP+gameId で短時間重複を抑制（悪用対策）
- [ ] **Bottom Navigation 共通化** - 各HTMLに直接記述 → JS動的挿入 or Web Components
- [ ] カスタムスキル ZIP 配布（ゲームテンプレート）
- [ ] Host Tools パターン（Express 側でのアセット検索）
- [ ] Multi-Provider 抽象化（Modal 以外への切り替え）
- [ ] **初回公開最短化 + 拡散強化（Growth Plan）** - テンプレ/自動化/計測拡張（`docs/PRODUCT-GROWTH-PLAN.md`）

---

## 作業履歴

### 2026-01-31: セッション再接続時のトークン更新修正

**詳細:** `.claude/logs/2026-01-31-session-reconnect-fix.md`

**問題:** セッション切れ後の再接続でGoogleログイン画面に飛ばされる

**原因:** 再接続時に古い（期限切れ）トークンを使っていた

**修正内容:**
- `auth.js`: `getFreshSession()` 追加（Refresh Tokenでトークン更新）
- `app.js`: `forceReconnect()` / `reconnectWithFreshToken()` でトークン更新後に再接続

**関連:** Supabase カスタムドメイン `auth.dreamcore.gg` 設定、Google OAuth更新

---

### 2026-01-31: モバイルUI改善 - 画像ボタン分離とバージョンパネル修正

**詳細:** `.claude/logs/2026-01-31-mobile-ui-image-button.md`

**背景:** WhatsApp/LINEのUIパターンを参考に、モバイルのチャット入力エリアを改善

**変更内容:**
- プラスメニューを変更履歴専用に変更
- 画像アイコンボタンを新設（素材、アップロード、画像生成）
- バージョンパネルをbody直下に移動（タブ無視でオーバーレイ表示）

**UI構成（モバイル）:**
```
[+プラス] → 変更履歴
[画像] → 素材、アップロード、画像生成
[テキストエリア] [送信]
```

**変更ファイル:**
- `public/editor.html` - 画像ボタン・メニュー追加、バージョンパネル移動
- `public/style.css` - 画像ボタンスタイル、バージョンパネルfixed化
- `public/app.js` - 画像メニューのイベントリスナー追加

---

### 2026-01-31: マイページ公開ゲームリンク修正 & iframe 専用制限

**詳細:** `.claude/logs/2026-01-31-mypage-published-game-link.md`

**問題:**
- マイページから公開ゲームをクリックしても正しいページに遷移しない
- `play.dreamcore.gg` に直接アクセスできてしまう

**修正内容:**
1. **リンク先修正** (`public/mypage.js`)
   - `/play/${projectId}` → `/game/${gameId}` に変更
   - `project_id` → `published_games.id` を使用

2. **iframe 専用制限** (`server/index.js`)
   - `Sec-Fetch-Dest` ヘッダーで直接アクセスをブロック
   - `document`（直接アクセス）→ 403 エラー
   - `iframe`（v2.dreamcore.gg からの埋め込み）→ 許可

**セキュリティ:**
- `Sec-Fetch-*` ヘッダーは Forbidden header（JavaScript で偽装不可）
- Referer より信頼性が高い

---

### 2026-01-31: ウェイトリスト通知システム構築（メール + Discord）

**詳細:** `.claude/logs/2026-01-31-waitlist-email-notification.md`

**実装内容:**
- Supabase Database Webhook + Edge Function + Brevo によるメール自動送信
- ウェルカムメール（登録時）/ 承認メール（approved時）
- 日本語/英語の自動判定
- 二重送信防止
- **Discord 通知**: 登録時に管理者向け通知を送信

**発見した問題と解決:**
- Brevo IP制限が Edge Function をブロック → **Deactivate blocking** で解決
- `supabase_functions.http_request` が空ペイロード → `net.http_post` + PL/pgSQL で解決
- 画像サイズ 155KB → **29KB JPG** に圧縮

**ドキュメント統合:**
- `docs/WAITLIST-EMAIL-SETUP.md` → `docs/WAITLIST-NOTIFICATIONS.md` にリネーム
- メール + Discord の統合ドキュメント化
- `SUPABASE_SERVICE_ROLE_KEY` は手動設定必須と明記
- Brevo IP制限の無効化（必須）セクション追加

**Edge Function:** v9（メール + Discord 対応）

---

### 2026-01-31: ゲストブックv4デザイン（本番採用版）

**詳細:** `.claude/logs/2026-01-31-guestbook-v4-design.md`

**背景:** v2の落書き帳風デザインにv3のゲームタグ機能を組み合わせた最終版

**サンプルファイル:**
- `public/game-sample-tobias-v2.html` - 落書き帳風デザインのベース
- `public/game-sample-tobias-v3.html` - Creator向けゲームタグ付き
- `public/game-sample-tobias-v4.html` - **採用版**: v2ベース + ゲームタグ

**実装内容:**
- 展開可能なvisitor groups（クリックで各訪問者のゲームタグを表示）
- リアクションからインラインゲームタグ削除（v2スタイル）
- シンプルな単独訪問表示
- メッセージフッターにゲームタグ維持
- Enterキーでコメント送信

**変更ファイル:**
- `public/game-sample-tobias-v4.html` - v4サンプル新規作成
- `public/game.html` - v4デザインを本番適用

**確認URL:**
- 本番: http://35.200.79.157:3005/game/11a52dbb-48b6-4ac9-b61c-0655b02524d9
- v4サンプル: http://35.200.79.157:3005/game-sample-tobias-v4.html

---

### 2026-01-31: ゲストブック落書き帳風デザイン（v2ベース）

**詳細:** `.claude/logs/2026-01-31-guestbook-scrapbook-design.md`

**背景:** 整理された縦型フィードではなく「落書き帳のような温かみ」「人間性を感じる」デザインへの変更依頼

**実装内容:**
- 背景に羽根のSVGをランダム配置（落書き帳の温かみ）
- 有機的な配置: メッセージ左寄り、リアクション右寄り、訪問者中央
- メッセージバブルにスパークル装飾（⚡）追加
- リアクションピル: 絵文字|縦線|名前+アバター形式
- glassmorphismスタイルの訪問者グループ

**変更ファイル:**
- `public/game-sample-tobias-v2.html` - CSS/HTML/JS全面改修

---

### 2026-01-31: ゲームプレイページのタップハイライト無効化

**詳細:** `.claude/logs/2026-01-31-game-play-page-tap-highlight.md`

**問題:** `/game/:id` ページでiframe内をタッチすると、iframe枠全体が一瞬ハイライトされる

**原因:**
1. iframe要素自体がフォーカス時にハイライトされる
2. iframe内のゲームHTMLにタップハイライト無効化CSSがない

**実装内容:**
- `game.html`: tap-highlight無効CSS、:focus outline無効、iframe blur on focus
- `play-public.html`: 同上
- `server/index.js`: `/g/` 配信時に tap-highlight 無効CSSを注入

**学び:**
- iframe内のスタイルは親ページから制御不可 → サーバーサイド注入が必要
- ローカルテストの限界 → playDomainが本番を指すため、本番デプロイが必要

---

### 2026-01-30: Git履歴表示問題の調査と自動初期化機能

**詳細:** `.claude/logs/2026-01-30-git-history-auto-init.md`

**背景:** Modal移行初期に `applyFiles` の同期が失敗したプロジェクトで変更履歴が表示されない問題

**実装内容:**
- Modal `handle_git_log` に自動初期化ロジック追加（`.git` がなければ作成）
- `autoInitialized` フラグを Modal → サーバー → フロントエンドに伝播
- UI通知「履歴が復元されました」を表示
- Modal sync 失敗時の CRITICAL ログを追加

**結果:**
- 新規プロジェクト: 履歴が正常に表示される ✅
- 過去の問題プロジェクト: 自動初期化されるが、過去の履歴は復元不可

**学び:**
- Modal warm container は新しいデプロイを即座に反映しない（`modal app stop` が必要）
- サイレントエラーは問題発見を遅らせる → 適切なログが重要

---

### 2026-01-30: クォータ機能（日次利用制限）

**詳細:** `.claude/logs/2026-01-30-quota-feature.md`

**実装内容:**
- 無料ユーザー向け日次利用制限（プロジェクト3回/日、メッセージ20回/日）
- `GET /api/quota` エンドポイント追加
- ヘッダーにクォータ表示 + ポップアップ
- 制限到達時のモーダル/チャット内エラー表示
- 事前クォータチェック（サーバー通信前）

**変更ファイル:**
- `server/quotaService.js` - 新規作成
- `server/config.js` - TIER_LIMITS 追加
- `server/index.js` - クォータチェック + API
- `public/app.js`, `create.html`, `style.css` - UI実装
- `docs/API-REFERENCE.md` - エンドポイントドキュメント

---

### 2026-01-30: プロモーション動画セクション非表示

**実装内容:**
- publish ページからプロモーション動画生成セクションを削除
- 将来的に機能を有効化する場合はコードを復元

**変更ファイル:**
- `public/publish.html` - movie-section 削除
- `public/publish.css` - movie 関連スタイル削除
- `public/publish.js` - movie 関連処理をコメントアウト

---

### 2026-01-30: ウェイトリスト/アクセス管理

**詳細:** `.claude/logs/2026-01-30-sandbox-architecture.md`（末尾セクション）
**ドキュメント:** `docs/WAITLIST.md`

**実装内容:**
- V2 初期リリース用アクセス制御
- Google OAuth でログイン → `pending` / `approved` で管理
- 承認は Supabase Dashboard から手動

**変更ファイル:**
- `supabase/migrations/009_user_access.sql` - テーブル定義
- `server/waitlist.js` - API ルート
- `public/waitlist.html` - ウェイトリストページ
- `public/auth.js` - `checkAccess()` 追加
- `public/app.js`, `mypage.js`, `discover.html` - アクセスチェック追加

**無効化方法:** `server/index.js` で `waitlist.setupRoutes(app);` をコメントアウト

---

### 2026-01-30: サンドボックスアーキテクチャ実装

**詳細:** `.claude/logs/2026-01-30-sandbox-architecture.md`
**ドキュメント:** `docs/IFRAME-SECURITY.md`

**変更内容:**
- アーキテクチャ反転（v2 が play を iframe 埋め込み）
- `/game/:gameId` ゲーム詳細ページ追加
- iframe sandbox/permissions 設定強化

**sandbox 属性（許可）:**
- `allow-scripts`, `allow-pointer-lock`, `allow-popups`
- `allow-orientation-lock`, `allow-forms`

**sandbox 属性（禁止）:**
- `allow-modals`, `allow-same-origin`, `allow-top-navigation`, `allow-downloads`

**Permissions Policy（許可）:**
- `fullscreen`, `accelerometer`, `gyroscope`, `gamepad`
- `camera`, `microphone`, `autoplay`

---

### 2026-01-30: V2 ゲーム公開・表示機能実装

**詳細:** `.claude/logs/2026-01-30-published-games-feature.md`

**実装内容:**
- `published_games` テーブル作成（Supabase）
- 公開 API エンドポイント 6個実装
- `/g/:gameId/*` 公開ゲームファイル配信ルート
- `play-public.html` iframe ラッパー（play.dreamcore.gg 用）
- DNS 設定（v2.dreamcore.gg, play.dreamcore.gg → 35.200.79.157）
- SSL 証明書取得（Let's Encrypt）
- Nginx 設定（両ドメイン → localhost:3005）

**セキュリティ対応:**
- パストラバーサル対策（isPathSafe）
- iframe sandbox（allow-same-origin 削除）
- CORS 設定（play.dreamcore.gg からのアクセス許可）
- CSP frame-ancestors 設定
- RLS で unlisted を保護（service_role 経由のみ）

**発見した問題:**
- CORS パスマッチングが trailing slash 必須だった → 修正

**テスト結果:** CLI テスト全項目合格

**プレイURL形式:** `https://play.dreamcore.gg/g/{gameId}`

---

### 2026-01-29: サムネイル生成修正

**詳細:** `.claude/logs/2026-01-29-thumbnail-generation-fix.md`

**問題:** publish.html でサムネイルが表示されない

**原因:**
1. GCE に `python3.12-venv` パッケージがない
2. NanoBanana の依存関係（`google-genai`, `pillow`）がない
3. プロンプト生成にローカル Claude CLI を使用（GCE にない）

**対応:**
- `sudo apt-get install python3.12-venv`
- NanoBanana venv 作成 + 依存関係インストール
- `generate-thumbnail` を Modal Haiku 対応に修正

---

### 2026-01-29: claudeChat Modal Haiku 統合

**詳細:** `.claude/logs/2026-01-29-claudechat-modal-haiku.md`

**問題:** GCE に Claude CLI がなく、チャットモードが常に Gemini にフォールバックしていた

**実装内容:**
- Modal `chat_haiku` エンドポイント追加
- `modalClient.chatHaiku()` メソッド追加
- `claudeChat.js` を Modal Haiku 対応に書き換え
- インポートエラー修正 (`getModalClient` → `modalClient` 直接使用)

**検証結果:**
```
[claudeChat] Calling Modal chat_haiku...
[claudeChat] Modal Haiku responded in 16204ms
Job completed with Haiku (chat mode): 91b17fd1-...
```

---

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

最終更新: 2026-02-05 (Sandbox プリウォーム機能)
