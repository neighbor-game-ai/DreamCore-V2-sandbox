// Supabase Edge Function: waitlist-email
// ウェイトリスト登録・承認時のメール通知
//
// Trigger: Database Webhook (user_access INSERT/UPDATE)
// Email Service: Brevo (旧Sendinblue)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 環境変数
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// メール送信元
const SENDER_EMAIL = "noreply@dreamcore.gg";
const SENDER_NAME = "DreamCore";
const APP_URL = "https://v2.dreamcore.gg";

// Webhook Payload 型定義
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: UserAccessRecord;
  old_record?: UserAccessRecord;
}

interface UserAccessRecord {
  email: string;
  status: "pending" | "approved";
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  welcome_email_sent_at: string | null;
  approved_email_sent_at: string | null;
}

// Brevo API でメール送信
async function sendEmail(
  to: string,
  toName: string | null,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.error("[waitlist-email] BREVO_API_KEY not set");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: SENDER_NAME,
          email: SENDER_EMAIL,
        },
        to: [
          {
            email: to,
            name: toName || to,
          },
        ],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[waitlist-email] Brevo API error: ${response.status} ${errorText}`);
      return false;
    }

    console.log(`[waitlist-email] Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[waitlist-email] Failed to send email: ${error}`);
    return false;
  }
}

// DB更新: メール送信日時を記録
async function updateEmailSentAt(
  email: string,
  column: "welcome_email_sent_at" | "approved_email_sent_at"
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[waitlist-email] Supabase credentials not set");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase
    .from("user_access")
    .update({ [column]: new Date().toISOString() })
    .eq("email", email);

  if (error) {
    console.error(`[waitlist-email] Failed to update ${column}: ${error.message}`);
  } else {
    console.log(`[waitlist-email] Updated ${column} for ${email}`);
  }
}

// ウェルカムメール HTML
function getWelcomeEmailHtml(displayName: string | null): string {
  const name = displayName || "ユーザー";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ウェイトリストへのご登録ありがとうございます</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #FF3B30; margin: 0;">DreamCore</h1>
  </div>

  <h2 style="color: #1a1a1a;">${name} さん</h2>

  <p>DreamCoreのウェイトリストにご登録いただきありがとうございます。</p>

  <p>現在、サービスの準備を進めております。<br>
  ご利用いただけるようになりましたら、改めてメールでお知らせいたします。</p>

  <p>今しばらくお待ちください。</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #666; font-size: 14px;">
    DreamCore チーム<br>
    <a href="${APP_URL}" style="color: #FF3B30;">${APP_URL}</a>
  </p>
</body>
</html>
  `.trim();
}

// 承認メール HTML
function getApprovedEmailHtml(displayName: string | null): string {
  const name = displayName || "ユーザー";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DreamCoreをご利用いただけるようになりました</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #FF3B30; margin: 0;">DreamCore</h1>
  </div>

  <h2 style="color: #1a1a1a;">${name} さん</h2>

  <p>お待たせいたしました！</p>

  <p><strong>DreamCoreをご利用いただけるようになりました。</strong></p>

  <p>下記のボタンからログインして、AIゲーム制作をお楽しみください。</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${APP_URL}" style="display: inline-block; background: #FF3B30; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
      DreamCoreを始める
    </a>
  </div>

  <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #666; font-size: 14px;">
    DreamCore チーム<br>
    <a href="${APP_URL}" style="color: #FF3B30;">${APP_URL}</a>
  </p>
</body>
</html>
  `.trim();
}

// メイン処理
serve(async (req) => {
  // CORS対応
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload: WebhookPayload = await req.json();

    console.log(`[waitlist-email] Received ${payload.type} event for ${payload.table}`);

    // user_access テーブル以外は無視
    if (payload.table !== "user_access") {
      return new Response(JSON.stringify({ message: "Ignored: not user_access table" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = payload.record;

    // INSERT: ウェルカムメール
    if (payload.type === "INSERT") {
      // 既に送信済みなら何もしない
      if (record.welcome_email_sent_at) {
        console.log(`[waitlist-email] Welcome email already sent to ${record.email}`);
        return new Response(JSON.stringify({ message: "Already sent" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await sendEmail(
        record.email,
        record.display_name,
        "DreamCoreウェイトリストへのご登録ありがとうございます",
        getWelcomeEmailHtml(record.display_name)
      );

      if (success) {
        await updateEmailSentAt(record.email, "welcome_email_sent_at");
      }

      return new Response(JSON.stringify({ message: "Welcome email processed", success }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // UPDATE: 承認メール（status変更時のみ）
    if (payload.type === "UPDATE") {
      const oldRecord = payload.old_record;

      // status変更チェック: pending → approved のみ
      if (!oldRecord || oldRecord.status !== "pending" || record.status !== "approved") {
        console.log(`[waitlist-email] Ignored: not a pending→approved transition`);
        return new Response(JSON.stringify({ message: "Ignored: not approval transition" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 既に送信済みなら何もしない
      if (record.approved_email_sent_at) {
        console.log(`[waitlist-email] Approved email already sent to ${record.email}`);
        return new Response(JSON.stringify({ message: "Already sent" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const success = await sendEmail(
        record.email,
        record.display_name,
        "DreamCoreをご利用いただけるようになりました",
        getApprovedEmailHtml(record.display_name)
      );

      if (success) {
        await updateEmailSentAt(record.email, "approved_email_sent_at");
      }

      return new Response(JSON.stringify({ message: "Approved email processed", success }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // DELETE は無視
    return new Response(JSON.stringify({ message: "Ignored: DELETE event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[waitlist-email] Error: ${error}`);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
