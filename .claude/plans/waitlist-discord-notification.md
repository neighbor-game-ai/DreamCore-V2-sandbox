# ウェイトリスト Discord 通知

**日付:** 2026-01-31
**方式:** Supabase Database Webhook + Edge Function + Discord Webhook

## 概要

ウェイトリスト登録時に Discord サーバーへ通知を送信する。
Express 側のコード変更ゼロで実現（メール通知と同じパターン）。

## アーキテクチャ

```
[ユーザー登録] → [Supabase INSERT]
                       ↓
              [既存トリガー: waitlist_email_insert_trigger]
                       ↓
              [Edge Function: waitlist-email]
                       ↓
              ┌───────┴───────┐
              ↓               ↓
        [Brevo API]    [Discord Webhook]
        (メール送信)    (チャンネル投稿)
```

## 実装方針

### 方式A: 既存 Edge Function に追加（推奨）

**メリット:**
- 新規トリガー不要
- 1回の INSERT で両方実行
- コード管理が集約

**デメリット:**
- Edge Function の責務が増える

### 方式B: 別 Edge Function を作成

**メリット:**
- 責務分離
- 独立してデプロイ可能

**デメリット:**
- 新規トリガー追加が必要
- 管理対象が増える

**結論:** 方式A を採用（シンプルさ優先）

## Discord Webhook 設定

### 1. Webhook URL 取得

1. Discord サーバーの設定を開く
2. **連携サービス** → **ウェブフック**
3. **新しいウェブフック** をクリック
4. 名前を設定（例: `DreamCore Waitlist`）
5. 投稿先チャンネルを選択
6. **ウェブフックURLをコピー**

### 2. Supabase Secret に保存

```bash
npx supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

## Edge Function 変更

### 追加する処理

```typescript
// Discord Webhook URL
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");

// Discord に通知
async function notifyDiscord(record: UserAccessRecord): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("[waitlist-email] DISCORD_WEBHOOK_URL not set, skipping");
    return;
  }

  const embed = {
    title: "📝 新規ウェイトリスト登録",
    color: 0xE60012, // DreamCore red
    fields: [
      {
        name: "メールアドレス",
        value: record.email,
        inline: true
      },
      {
        name: "表示名",
        value: record.display_name || "(未設定)",
        inline: true
      },
      {
        name: "言語",
        value: record.language || "不明",
        inline: true
      }
    ],
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
    console.log("[waitlist-email] Discord notification sent");
  } catch (error) {
    console.error("[waitlist-email] Discord notification failed:", error);
    // Discord 失敗はメール送信に影響させない
  }
}
```

### INSERT 処理に追加

```typescript
if (payload.type === "INSERT") {
  // Discord 通知（メール送信と並行）
  notifyDiscord(record);  // await しない（失敗してもメールは送る）

  // 既存のメール送信処理...
}
```

## 実装手順

1. [x] Discord サーバーで Webhook URL を取得 ✅ 2026-01-31
2. [x] Supabase Secret に `DISCORD_WEBHOOK_URL` を設定 ✅ 2026-01-31
3. [x] Edge Function に Discord 通知コードを追加 ✅ 2026-01-31
4. [x] Edge Function を再デプロイ（v9） ✅ 2026-01-31
5. [x] テスト INSERT で動作確認 ✅ 2026-01-31

## テスト方法

```sql
-- テスト用 INSERT
INSERT INTO user_access (email, display_name, status, language, requested_at)
VALUES ('discord-test@example.com', 'Discord Test', 'pending', 'ja', NOW());
```

→ Discord チャンネルに通知が届く + メールも送信される

## 通知メッセージ例

```
┌─────────────────────────────────────────┐
│ 📝 新規ウェイトリスト登録              │
├─────────────────────────────────────────┤
│ メールアドレス    表示名      言語      │
│ user@example.com  田中太郎    ja        │
├─────────────────────────────────────────┤
│ 2026-01-31 19:45:00                     │
└─────────────────────────────────────────┘
```

## 注意事項

- Discord Webhook は 30 リクエスト/分 のレート制限あり
- 大量登録時は制限に注意（ただしウェイトリストでは問題にならない想定）
- Webhook URL は Secret として管理（コードに直書きしない）

## 将来の拡張

- 承認時にも通知（「✅ {name} さんを承認しました」）
- 日次サマリー通知（「本日の新規登録: X件」）
- Slack 対応（Webhook 形式がほぼ同じ）
