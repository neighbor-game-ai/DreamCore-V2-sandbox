# ウェイトリストメール通知 セットアップガイド

ウェイトリスト登録・承認時に自動でメール通知を送信する機能。

## キー・シークレット管理

| キー名 | 保存場所 | 用途 |
|--------|----------|------|
| `BREVO_API_KEY` | Supabase Edge Function Secrets | Brevo API認証 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function (自動設定) | DB更新 |

### BREVO_API_KEY の確認・更新

```bash
# 現在の設定を確認
npx supabase secrets list --project-ref tcynrijrovktirsvwiqb

# 新しいキーを設定
npx supabase secrets set BREVO_API_KEY=xkeysib-xxxxx --project-ref tcynrijrovktirsvwiqb
```

### Brevo Dashboard でのキー管理

1. [Brevo Dashboard](https://app.brevo.com/) にログイン
2. 右上アイコン → **SMTP & API** → **API Keys**
3. 既存キーの確認・新規作成

**注意**: APIキーは `xkeysib-` で始まる（`xsmtpsib-` はSMTP用で使用不可）

## 前提条件

- Supabase プロジェクト設定済み
- Brevo (旧Sendinblue) アカウント作成済み
- Supabase CLI インストール済み

## 1. Brevo API キー取得

1. [Brevo](https://app.brevo.com/) にログイン
2. 右上アイコン → **SMTP & API** → **API Keys**
3. **Generate a new API key** をクリック
4. 名前を入力（例: `dreamcore-waitlist`）
5. 生成されたAPIキーをコピー（後で使用）

## 2. マイグレーション実行

```bash
# Supabase Dashboard の SQL Editor で実行
# または supabase db push

# ファイル: supabase/migrations/010_user_access_email_tracking.sql
ALTER TABLE user_access
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_email_sent_at TIMESTAMPTZ;
```

## 3. Edge Function デプロイ

### 3.1 Supabase CLI でログイン

```bash
npx supabase login
```

### 3.2 プロジェクトをリンク

```bash
cd /Users/admin/DreamCore-V2-sandbox
npx supabase link --project-ref tcynrijrovktirsvwiqb
```

### 3.3 Secrets を設定

```bash
npx supabase secrets set BREVO_API_KEY=your-brevo-api-key-here
```

### 3.4 Edge Function をデプロイ

```bash
npx supabase functions deploy waitlist-email
```

## 4. Database Webhook 設定

Supabase Dashboard で設定:

### 4.1 Dashboard にアクセス

https://supabase.com/dashboard/project/tcynrijrovktirsvwiqb/database/hooks

### 4.2 INSERT Webhook 作成

| 項目 | 値 |
|------|-----|
| Name | `waitlist-email-insert` |
| Table | `user_access` |
| Events | `INSERT` のみ |
| Type | `Supabase Edge Functions` |
| Edge Function | `waitlist-email` |
| HTTP Headers | (空でOK - 自動で認証される) |

### 4.3 UPDATE Webhook 作成

| 項目 | 値 |
|------|-----|
| Name | `waitlist-email-update` |
| Table | `user_access` |
| Events | `UPDATE` のみ |
| Type | `Supabase Edge Functions` |
| Edge Function | `waitlist-email` |
| HTTP Headers | (空でOK) |

## 5. テスト

### 5.1 INSERT テスト（ウェルカムメール）

Supabase Dashboard の Table Editor で `user_access` に行を追加:

```
email: test@example.com
status: pending
display_name: テストユーザー
```

→ `test@example.com` にウェルカムメールが届く

### 5.2 UPDATE テスト（承認メール）

追加した行の `status` を `pending` → `approved` に変更:

→ `test@example.com` に承認メールが届く

### 5.3 ログ確認

```bash
npx supabase functions logs waitlist-email
```

## 6. トラブルシューティング

### メールが届かない場合

1. **Edge Function ログを確認**
   ```bash
   npx supabase functions logs waitlist-email --tail
   ```

2. **Brevo API キーを確認**
   - Secrets が正しく設定されているか
   - APIキーが有効か

3. **Webhook 設定を確認**
   - イベントタイプ（INSERT/UPDATE）が正しいか
   - テーブル名が `user_access` か

4. **二重送信防止カラムを確認**
   - `welcome_email_sent_at` / `approved_email_sent_at` が既に設定されていないか

### Brevo送信制限

- 無料プラン: 300通/日
- 超過した場合は翌日まで待つか、プランをアップグレード

## 7. メール画像

### 保存場所

```
public/images/email/hero-banner.png
```

本番URL: `https://v2.dreamcore.gg/images/email/hero-banner.png`

### 画像の要件

| 項目 | 推奨値 |
|------|--------|
| 幅 | 600px（メールクライアント標準） |
| ファイルサイズ | 50KB以下 |
| 形式 | PNG または JPG |

### 画像の圧縮・リサイズ

画像を追加・変更する際は必ず圧縮すること:

```bash
# macOS: sips でリサイズ（幅600pxに縮小）
sips -Z 600 public/images/email/hero-banner.png --out public/images/email/hero-banner.png

# サイズ確認
ls -lh public/images/email/
```

**注意**: 元画像が大きいとメールの読み込みが遅くなり、ユーザー体験が悪化する。必ず50KB以下に圧縮すること。

### デプロイ

画像を変更したら GCE にデプロイ:

```bash
git add public/images/email/
git commit -m "chore: メール画像を更新"
git push

# GCE で pull（/gce-deploy スキル使用）
/usr/local/bin/gcloud compute ssh notef@dreamcore-v2 --zone=asia-northeast1-a --command="cd /home/notef/DreamCore-V2-sandbox && git pull"
```

## 8. メールテンプレートのカスタマイズ

`supabase/functions/waitlist-email/index.ts` の以下の関数を編集:

- `getWelcomeEmailHtml()` - ウェルカムメール
- `getApprovedEmailHtml()` - 承認メール

編集後、再デプロイ:

```bash
npx supabase functions deploy waitlist-email
```

## 9. 送信元メールアドレス

現在の設定:
- 送信元: `noreply@dreamcore.gg`
- 送信者名: `DreamCore`

### 独自ドメインの設定（推奨）

Brevoで独自ドメインを認証すると、迷惑メールに入りにくくなります:

1. Brevo Dashboard → **Senders, Domains & Dedicated IPs**
2. **Add a domain** → `dreamcore.gg`
3. 指示に従ってDNSレコードを追加（SPF, DKIM）
4. 認証完了を待つ

## アーキテクチャ

```
[ユーザー登録] → [Express waitlist.js] → [Supabase INSERT]
                                              ↓
                                    [Database Webhook]
                                              ↓
                                    [Edge Function]
                                              ↓
                                    [Brevo API → メール送信]
                                              ↓
                                    [user_access.welcome_email_sent_at 更新]
```

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `supabase/functions/waitlist-email/index.ts` | Edge Function 本体 |
| `supabase/migrations/010_user_access_email_tracking.sql` | カラム追加マイグレーション |
| `.claude/plans/waitlist-email-plugin.md` | 設計ドキュメント |
| `docs/WAITLIST.md` | ウェイトリスト機能の概要 |
