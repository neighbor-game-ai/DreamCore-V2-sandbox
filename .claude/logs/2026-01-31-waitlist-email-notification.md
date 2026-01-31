# ウェイトリストメール通知システム構築

**日付:** 2026-01-31
**タスク:** Supabase Database Webhook + Edge Function + Brevo によるメール自動送信

---

## 実施内容

### 1. システム構築

- **Edge Function (`waitlist-email`)** をデプロイ
  - 日本語/英語の自動判定
  - ウェルカムメール（INSERT時）
  - 承認メール（UPDATE時 pending→approved）
  - 二重送信防止（`welcome_email_sent_at` / `approved_email_sent_at`）

- **Database Webhook** 設定
  - `supabase_functions.http_request` から `net.http_post` に変更
  - PL/pgSQL トリガー関数で JSON ペイロード構築

### 2. 問題解決

#### Brevo API 401 エラー

**症状:** Edge Function から Brevo API 呼び出しで 401 エラー

**調査過程:**
1. 最初は「Key not found」と表示 → API キーの問題と推測
2. 直接 curl でテスト → 成功（Brevo 201）
3. Database Webhook 経由 → 失敗（401）
4. `net._http_response` テーブルを確認 → 真の原因発見

**真の原因:** Brevo の IP 制限（Authorized IPs）
- Supabase Edge Function は動的 IP を使用
- Brevo が「unrecognised IP address」として拒否

**解決:** Brevo Dashboard → Security → Authorised IPs → **Deactivate blocking**

#### トリガーペイロード問題

**症状:** Edge Function に空のペイロードが届く

**原因:** `supabase_functions.http_request` の第4引数（body）が `'{}'` 固定

**解決:** PL/pgSQL で `net.http_post` を使用し、`jsonb_build_object` で動的にペイロード構築

### 3. 画像最適化

| 状態 | 形式 | サイズ |
|------|------|--------|
| 初期 | PNG | 535KB |
| 圧縮後 | PNG (実質JPEG) | 31KB |
| 最終 | JPG | 29KB |

**学び:** PNG 形式は同じ内容でも 5倍以上大きくなる。メール画像は JPG 推奨。

### 4. ドキュメント更新

`docs/WAITLIST-EMAIL-SETUP.md` を実際の手順に更新:
- `SUPABASE_SERVICE_ROLE_KEY` は自動設定されないことを明記
- Brevo IP 制限の無効化（必須）セクション追加
- 画像形式を JPG に変更、30KB 以下推奨

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `supabase/functions/waitlist-email/index.ts` | Edge Function（v7デプロイ済み） |
| `docs/WAITLIST-EMAIL-SETUP.md` | セットアップガイド更新 |
| `public/images/email/hero-banner.jpg` | 画像を JPG 化（29KB） |
| `public/email-preview.html` | プレビューページ追加 |

---

## 技術的な学び

### 1. Supabase Edge Functions の Secrets

- `SUPABASE_URL` と `SUPABASE_ANON_KEY` は自動注入される
- **`SUPABASE_SERVICE_ROLE_KEY` は自動注入されない** → 手動設定必須

### 2. Database Webhook の方式比較

| 方式 | ペイロード | 備考 |
|------|-----------|------|
| `supabase_functions.http_request` | 第4引数固定 | シンプルだが柔軟性なし |
| `net.http_post` + PL/pgSQL | 動的構築可能 | `to_jsonb(NEW)` で行データ取得 |

### 3. Brevo API の注意点

- **IP 制限が有効だと動的 IP からのアクセスが全て拒否される**
- エラーメッセージ「Key not found」は誤解を招く（実際は IP 制限）
- 確認方法: `net._http_response` テーブルで実際のレスポンスを確認

### 4. メール画像の最適化

- 幅: 600px（メールクライアント標準）
- 形式: JPG（PNG は同内容で 5 倍大きい）
- サイズ: 30KB 以下
- 圧縮コマンド: `sips -Z 600 -s format jpeg -s formatOptions 70`

---

## 最終状態

| 項目 | 状態 |
|------|------|
| Edge Function | v7 デプロイ済み |
| Database Webhook | 動作確認済み |
| ウェルカムメール | ✅ 正常送信 |
| 承認メール | ✅ 正常送信 |
| Brevo IP 制限 | 無効化済み |
| 画像 | 29KB JPG |
| ドキュメント | 更新済み |

---

## 今後の改善案

1. **メールテンプレートの外部化** - 現在は Edge Function 内にハードコード
2. **Brevo テンプレート機能の活用** - Brevo 側でテンプレート管理
3. **送信ログの可視化** - 管理画面で送信履歴を確認できるように
