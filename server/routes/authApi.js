/**
 * Auth API Routes
 * Custom authentication endpoints for branded emails
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../supabaseClient');

// Brevo API for sending emails
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = 'noreply@dreamcore.gg';
const SENDER_NAME = 'DreamCore';
const APP_URL = 'https://v2.dreamcore.gg';

/**
 * Send email via Brevo API
 */
async function sendEmail(to, subject, htmlContent) {
  if (!BREVO_API_KEY) {
    console.error('[Auth] BREVO_API_KEY not set');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Auth] Brevo API error: ${response.status} ${errorText}`);
      return false;
    }

    console.log(`[Auth] Magic link email sent to ${to}`);
    return true;
  } catch (error) {
    console.error(`[Auth] Failed to send email: ${error}`);
    return false;
  }
}

/**
 * Get magic link email HTML (Japanese)
 */
function getMagicLinkEmailJa(magicLink) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DreamCore ログイン</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #FF3B30; margin: 0;">DreamCore</h1>
  </div>

  <h2 style="color: #1a1a1a;">ログインリンク</h2>

  <p>下記のボタンをクリックしてDreamCoreにログインしてください。</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${magicLink}" style="display: inline-block; background: #FF3B30; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
      ログインする
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    このリンクは1時間後に無効になります。<br>
    心当たりがない場合は、このメールを無視してください。
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #666; font-size: 14px;">
    DreamCore チーム<br>
    <a href="${APP_URL}" style="color: #FF3B30;">${APP_URL}</a>
  </p>
</body>
</html>
  `.trim();
}

/**
 * Get magic link email HTML (English)
 */
function getMagicLinkEmailEn(magicLink) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DreamCore Login</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #FF3B30; margin: 0;">DreamCore</h1>
  </div>

  <h2 style="color: #1a1a1a;">Login Link</h2>

  <p>Click the button below to log in to DreamCore.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${magicLink}" style="display: inline-block; background: #FF3B30; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Log In
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    This link will expire in 1 hour.<br>
    If you didn't request this, please ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #666; font-size: 14px;">
    The DreamCore Team<br>
    <a href="${APP_URL}" style="color: #FF3B30;">${APP_URL}</a>
  </p>
</body>
</html>
  `.trim();
}

/**
 * Get magic link email HTML (Chinese)
 */
function getMagicLinkEmailZh(magicLink) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DreamCore 登录</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #FF3B30; margin: 0;">DreamCore</h1>
  </div>

  <h2 style="color: #1a1a1a;">登录链接</h2>

  <p>点击下方按钮登录 DreamCore。</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${magicLink}" style="display: inline-block; background: #FF3B30; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
      登录
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    此链接将在1小时后失效。<br>
    如果您没有请求此链接，请忽略此邮件。
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="color: #666; font-size: 14px;">
    DreamCore 团队<br>
    <a href="${APP_URL}" style="color: #FF3B30;">${APP_URL}</a>
  </p>
</body>
</html>
  `.trim();
}

/**
 * Detect language from string
 */
function detectLanguage(lang) {
  if (!lang) return 'en';
  const l = lang.toLowerCase();
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

/**
 * POST /api/auth/magic-link
 * Generate and send a branded magic link email
 */
router.post('/magic-link', async (req, res) => {
  try {
    const { email, language } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate magic link using Supabase Admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email.toLowerCase(),
      options: {
        redirectTo: `${APP_URL}/create.html`
      }
    });

    if (error) {
      console.error('[Auth] Generate link error:', error);
      return res.status(500).json({ error: 'Failed to generate login link' });
    }

    // Get the magic link
    const magicLink = data.properties.action_link;

    // Detect language and get appropriate email content
    const lang = detectLanguage(language);
    let subject, html;

    switch (lang) {
      case 'ja':
        subject = 'DreamCore ログインリンク';
        html = getMagicLinkEmailJa(magicLink);
        break;
      case 'zh':
        subject = 'DreamCore 登录链接';
        html = getMagicLinkEmailZh(magicLink);
        break;
      default:
        subject = 'DreamCore Login Link';
        html = getMagicLinkEmailEn(magicLink);
    }

    // Send email via Brevo
    const sent = await sendEmail(email, subject, html);

    if (!sent) {
      return res.status(500).json({ error: 'Failed to send email' });
    }

    res.json({ success: true, message: 'Magic link sent' });

  } catch (error) {
    console.error('[Auth] Magic link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
