# ウェイトリストメール通知プラグイン

**日付:** 2026-01-31
**方式:** Supabase Database Webhook + Edge Function + Brevo

## 概要

ウェイトリスト登録・承認時にメール通知を送信する外部プラグイン。
Express側のコード変更ゼロで実現する。

## アーキテクチャ

```
[Express waitlist.js]
        ↓
[Supabase user_access INSERT]
        ↓
[Database Webhook] ──→ [Edge Function: waitlist-email]
                                    ↓
                            [Brevo API]
                                    ↓
                            [user_access.welcome_email_sent_at 更新]
```

```
[Supabase Dashboard で status='approved' に更新]
        ↓
[Database Webhook (UPDATE)] ──→ [Edge Function: waitlist-email]
        ↓                                   ↓
[Edge Function が old/new を比較]     [Brevo API]
        ↓                                   ↓
[status変更時のみ処理]              [user_access.approved_email_sent_at 更新]
```

## データベース変更

### user_access テーブルに追加

```sql
ALTER TABLE user_access
ADD COLUMN welcome_email_sent_at TIMESTAMPTZ,
ADD COLUMN approved_email_sent_at TIMESTAMPTZ;
```

## Edge Function 設計

### ファイル構成

```
supabase/
└── functions/
    └── waitlist-email/
        ├── index.ts       # メインエントリ
        └── brevo.ts       # Brevo API クライアント
```

### 入力ペイロード (Database Webhook)

```typescript
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: 'user_access';
  record: {
    id: string;
    user_id: string;
    status: 'pending' | 'approved' | 'rejected';
    email: string;
    display_name: string | null;
    welcome_email_sent_at: string | null;
    approved_email_sent_at: string | null;
  };
  old_record?: {  // UPDATE時のみ
    status: 'pending' | 'approved' | 'rejected';
    // ...
  };
}
```

### 処理フロー

```typescript
// INSERT: ウェルカムメール
if (type === 'INSERT' && !record.welcome_email_sent_at) {
  await sendWelcomeEmail(record.email, record.display_name);
  await updateEmailSentAt(record.id, 'welcome');
}

// UPDATE: 承認メール（status変更時のみ）
if (type === 'UPDATE'
    && old_record?.status === 'pending'
    && record.status === 'approved'
    && !record.approved_email_sent_at) {
  await sendApprovedEmail(record.email, record.display_name);
  await updateEmailSentAt(record.id, 'approved');
}
```

## Brevo API

### エンドポイント

```
POST https://api.brevo.com/v3/smtp/email
```

### リクエスト例

```json
{
  "sender": {
    "name": "DreamCore",
    "email": "noreply@dreamcore.gg"
  },
  "to": [
    {
      "email": "user@example.com",
      "name": "User Name"
    }
  ],
  "subject": "ウェイトリストへのご登録ありがとうございます",
  "htmlContent": "<html>...</html>"
}
```

### 認証

```
api-key: {BREVO_API_KEY}
```

**重要:** APIキーは Edge Function の Secret として設定（DBには保存しない）

## メールテンプレート

### 1. ウェルカムメール（登録時）

**件名:** DreamCoreウェイトリストへのご登録ありがとうございます

**本文:**
```
{display_name} さん

DreamCoreのウェイトリストにご登録いただきありがとうございます。

現在、サービスの準備を進めております。
ご利用いただけるようになりましたら、改めてメールでお知らせいたします。

今しばらくお待ちください。

DreamCore チーム
```

### 2. 承認メール

**件名:** DreamCoreをご利用いただけるようになりました

**本文:**
```
{display_name} さん

お待たせいたしました！

DreamCoreをご利用いただけるようになりました。
下記のリンクからログインして、AIゲーム制作をお楽しみください。

https://v2.dreamcore.gg

ご不明な点がございましたら、お気軽にお問い合わせください。

DreamCore チーム
```

## Supabase 設定手順

### 1. Database Webhook 設定

**Webhook 1: INSERT**
- Name: `waitlist-email-insert`
- Table: `user_access`
- Events: `INSERT`
- URL: `https://{project-ref}.supabase.co/functions/v1/waitlist-email`
- Headers: `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`

**Webhook 2: UPDATE**
- Name: `waitlist-email-update`
- Table: `user_access`
- Events: `UPDATE`
- URL: `https://{project-ref}.supabase.co/functions/v1/waitlist-email`
- Headers: `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`

### 2. Edge Function Secrets

```bash
supabase secrets set BREVO_API_KEY=your-api-key
```

## 二重送信防止

| 条件 | 防止方法 |
|------|----------|
| 同じINSERTで2回送信 | `welcome_email_sent_at` がNULLの時のみ送信 |
| 同じUPDATEで2回送信 | `approved_email_sent_at` がNULLの時のみ送信 |
| status以外の更新で送信 | `old_record.status !== record.status` をチェック |
| pending以外からの承認 | `old_record.status === 'pending'` をチェック |

## エラーハンドリング

| エラー | 対応 |
|--------|------|
| Brevo API失敗 | ログに記録、登録/承認は影響なし |
| DB更新失敗 | ログに記録、次回Webhookで再試行される可能性あり |
| 不正なペイロード | 400エラーを返し、ログに記録 |

## 実装順序

1. [x] user_access テーブルにカラム追加（マイグレーション）- 完了 2026-01-31
2. [x] Edge Function 作成（waitlist-email/index.ts）- 完了 2026-01-31
3. [x] Brevo APIクライアント作成 - Edge Function に統合
4. [x] Edge Function デプロイ - 完了 2026-01-31
5. [x] Supabase Database Webhook 設定 - 完了 2026-01-31
   - `supabase_functions.http_request` を使用
   - INSERT/UPDATE 両方のトリガー作成
6. [x] テスト（INSERT/UPDATE両方）- 完了 2026-01-31
   - INSERT トリガー: ウェルカムメール処理確認
   - UPDATE トリガー: 承認メール処理確認
7. [ ] 本番動作確認（実際のメールアドレスでテスト）

## テスト方法

### 手動テスト

```bash
# Edge Function 直接呼び出し（INSERT シミュレート）
curl -X POST https://{project-ref}.supabase.co/functions/v1/waitlist-email \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "user_access",
    "record": {
      "id": "test-id",
      "user_id": "test-user",
      "email": "test@example.com",
      "display_name": "Test User",
      "status": "pending"
    }
  }'
```

## 今後の拡張

このパターンは他の通知にも適用可能：
- ゲーム公開時の通知
- コメント/リアクション通知
- 週次サマリーメール
