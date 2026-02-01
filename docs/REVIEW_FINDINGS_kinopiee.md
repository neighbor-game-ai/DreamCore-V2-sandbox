# コードレビュー指摘まとめ（リリース前必須 / それ以外）

対象: DreamCore-V2-sandbox

> 指摘を **「リリース前に対応が必要」** と **「それ以外（リリース後に計画対応可）」** に大別。内部の優先度として P0〜P3 を付与。

---

## リリース前に対応が必要

### P0（リリースブロッカー：即時対応 or 仕様確定まで出せない）

- **CLI 実行が非サンドボックス＋`--dangerously-skip-permissions`**

  - 影響: CLI が OS 権限で実行されるため、**リモートコード実行 / 秘密情報読み出し**のリスク。
  - 根拠: `server/claudeRunner.js#129-165`（サンドボックス失敗時に直実行）、`server/claudeRunner.js#1994-2001`（危険フラグ）
  - 推奨: 本番は `USE_SANDBOX=true` を必須化し、失敗時は停止。`--dangerously-skip-permissions` を削除。

- **プロジェクトファイルのパストラバーサル**

  - 影響: `../` を含むファイル名で**プロジェクト外の読み書き**が可能。
  - 根拠: `server/userManager.js#425-447`, `server/userManager.js#543-566`
  - 推奨: `path.resolve` + `isPathSafe` で `projectDir` 外を拒否。

- **レート制限未実装**

  - 影響: 認証/高コスト API へのブルートフォースや濫用が可能。
  - 根拠: `server/config.js#254-274`, `package.json#15-28`, `server/index.js#1-30`
  - 推奨: `express-rate-limit` 導入＋ API/WS 別レート制限。

- **WebSocket 認証タイムアウトなし**

  - 影響: 未認証接続を無期限保持でき、**DoS** が可能。
  - 根拠: `server/index.js#1577-1607`
  - 推奨: 接続後 10 秒以内に `init` が来なければ切断。

- **Referer 依存のゲーム資産アクセス**

  - 影響: Referer 偽装で**非 HTML 資産が取得可能**。
  - 根拠: `server/index.js#1000-1056`
  - 推奨: 署名 URL を全資産に必須化し、payload に `filename` を含める。

- **SVG アップロード + 公開デフォルト**

  - 影響: SVG による XSS/情報漏えいのリスク（公開配信）。
  - 根拠: `server/index.js#103-110`, `server/index.js#564-577`, `server/index.js#753-798`
  - 推奨: SVG 禁止 or サニタイズ。`Content-Disposition: attachment` と CSP 強化。

- **アップロード MIME 判定が緩い（ext OR mime）**

  - 影響: 拡張子偽装の不正ファイル混入が可能。
  - 根拠: `server/index.js#103-110`
  - 推奨: `ext && mime` に変更、またはサーバ側で再判定。

- **SUPABASE_URL 末尾スラッシュで JWT issuer 不一致**

  - 影響: JWT 検証失敗で認証不可（環境差分で**サービス停止級**になり得る）。
  - 根拠: `server/config.js#141-145`, `server/supabaseClient.js#99-106`
  - 推奨: `SUPABASE_URL` を `replace(/\/+$/, '')` で正規化。

- **公開範囲の仕様確認（リリース判断に直結）**
  - 注: 仕様として意図どおりなら優先度を下げられるが、意図と違う場合は**情報露出としてブロッカー**になり得る。
  - **サムネイルが公開取得可能**
    - 影響: 非公開プロジェクトの情報露出。
    - 根拠: `server/index.js#2652-2686`
    - 推奨: 認証必須化 or 仕様確認。
  - **/api/users/:id/public が UUID でも取得可能**
    - 影響: UUID 露出時のプロフィール情報取得。
    - 根拠: `server/index.js#1345-1373`
    - 推奨: public_id のみに限定。
  - **アセットが public デフォルト**
    - 影響: 意図しない公開。
    - 根拠: `server/index.js#564-577`
    - 推奨: デフォルト非公開＋ UI で公開切替。

### P1（リリース前に潰すべき：信頼性・機能破綻が出やすい）

- **Modal healthCheck が 401 以外を健康扱い**

  - 影響: 500/503 でも healthy 判定 → 障害ルーティング。
  - 根拠: `server/modalClient.js#643-664`
  - 推奨: `response.ok` を条件にする。

- **サムネ生成で Modal 未初期化参照**

  - 影響: `modalClient` null で例外（生成失敗）。
  - 根拠: `server/index.js#2521-2526`
  - 推奨: `getModalClient()` 経由 or `USE_MODAL` 判定。

- **サムネアップロードが非 WebP でも .webp 保存**

  - 影響: PNG/JPEG を WebP として配信し表示崩れ。
  - 根拠: `server/index.js#2627-2638`
  - 推奨: 変換して保存 or 元拡張子で保存。

- **Remix で listProjectFiles を await していない**

  - 影響: Modal 有効時に TypeError / Remix 失敗。
  - 根拠: `server/userManager.js#1203-1206`
  - 推奨: `await listProjectFiles(...)`。

- **Remix でサブディレクトリ未作成**

  - 影響: nested path で ENOENT。
  - 根拠: `server/userManager.js#1203-1206`
  - 推奨: `mkdirSync(path.dirname(...), {recursive:true})`。

- **セキュリティヘッダー不足（helmet 未導入）**

  - 影響: クリックジャッキング/XSS/MIME スニッフィング等の防御不足。
  - 根拠: `server/index.js#1-30`, `server/index.js#1514-1517`
  - 推奨: `helmet` 導入、CSP を全体に適用。

- **プロンプトインジェクション対策不足**
  - 影響: 悪意のあるユーザー入力でシステムプロンプトを上書きし、**意図しないコード生成**や**指示の無視**が可能。
  - 根拠: `server/claudeRunner.js#914-943`（`buildPrompt` でシステムプロンプトとユーザー入力を文字列連結）
  - 緩和要因:
    - API キーは api-proxy 設計により Sandbox 内に存在しないため漏洩リスクは低い
    - P0「CLI サンドボックス必須化」対応後は、生成コードの実行も Sandbox 内に限定される
  - 推奨:
    1. プロンプト構造化: `<system>...</system>` と `<user>...</user>` でマーカー分離
    2. サニタイズ関数: 制御文字除去、攻撃パターン検出（ログ記録）
    3. 監査ログ: 疑わしい入力を記録し定期レビュー

---

## それ以外（リリース後に計画対応可）

### P2（計画的に対応：品質・運用・機能穴の解消）

- **分類分析スクリプトが空配列で crash/NaN**

  - 影響: reduce/除算で例外 or NaN。
  - 根拠: `server/tools/analyzeClassification.js#20-44`
  - 推奨: `total === 0` の早期リターン。

- **styleImageCache が .webp の styleId を正規化しない**

  - 影響: WebP で styleId 参照が失敗。
  - 根拠: `server/styleImageCache.js#83-89`
  - 推奨: `.webp` も strip。

- **asset search が DB 側フィルタ無し**

  - 影響: 200 件上限のため検索漏れ。
  - 根拠: `server/database-supabase.js#481-504`
  - 推奨: RPC または ILIKE による DB フィルタ。

- **waitlist の認証方式が不統一**

  - 影響: Supabase API への毎回アクセスで遅延/不整合。
  - 根拠: `server/waitlist.js#173-193`, `server/authMiddleware.js#41-102`
  - 推奨: `verifyToken()` に統一。

- **CLI タイムアウト文言が設定と不一致**
  - 影響: 実際は 10 分だが文言は 5 分。
  - 根拠: `server/config.js#256-264`, `server/claudeRunner.js#1539-1544`
  - 推奨: 文言を `timeout` から動的生成。

### P3（低優先・整理候補）

- **parseMarkdown の HTML 生成が将来 XSS リスク**

  - 根拠: `public/app.js#3111-3140`
  - 推奨: DOMPurify 等で最終 HTML を sanitize。

- **削除済み alias の再利用不可**

  - 根拠: `server/database-supabase.js#1535-1543`
  - 推奨: `is_deleted=false` での再利用許可など。

- **cookie-parser 未使用**

  - 根拠: `package.json#15-28`, `server/index.js#1-30`
  - 推奨: 依存削除。

- **TODO 残存（仕様未実装）**
  - 根拠: `server/index.js#1340-1342`, `public/app.js#1719-1723`, `public/play.js#224-228`
  - 推奨: 仕様確定後に実装/削除。
