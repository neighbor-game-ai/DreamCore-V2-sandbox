# 認証機能改善 - 2026-02-05

## 概要

認証オプションの拡充と多言語メール対応を実施。中国からのユーザー（日本の半数程度のアクセス）に対応するため、メール認証を追加。

## 実施内容

### 1. ウェイトリストメール言語対応

**問題:** 新規登録者に英語メールが届いていた（日本人にも）

**原因:** Edge Function に言語判定ロジックがなかった

**修正:**
- `supabase/functions/waitlist-email/index.ts` を更新
- `language` / `country` フィールドをインターフェースに追加
- `detectLanguage()` 関数を実装（優先順位: ブラウザ言語 → 国コード → 英語デフォルト）
- 日本語/英語の両テンプレートを追加

**デプロイ:** Edge Function VERSION 11

### 2. Apple Sign-In 追加

**目的:** V1 から移行した Apple ID ユーザーのログイン対応

**実装:**
- `public/auth.js` に `signInWithApple()` 関数追加
- `public/index.html` に Apple ボタン追加（黒背景、Apple ガイドライン準拠）
- i18n 翻訳追加（EN/JA/ZH）

**設定:**
- Apple Developer Console で `auth.dreamcore.gg` を Return URL に追加
- Service ID: `com.neighbor.dreamcore-app.service`

### 3. メール認証（マジックリンク）追加

**目的:** 中国など Google/Apple がブロックされている地域からのユーザー対応

**実装:**
- `server/routes/authApi.js` 新規作成
  - `POST /api/auth/magic-link` エンドポイント
  - `supabase.auth.admin.generateLink()` でリンク生成
  - Brevo API で多言語HTMLメール送信
- `public/auth.js` の `signInWithMagicLink()` を自前API呼び出しに変更
- `public/index.html` にメール入力フォーム追加

**多言語対応:**
| 言語 | 件名 |
|------|------|
| 日本語 | DreamCore ログインリンク |
| 英語 | DreamCore Login Link |
| 中国語 | DreamCore 登录链接 |

### 4. 緊急修正: i18n.js 未コミット

**問題:** ログインページが完全に無反応になった

**原因:** `public/i18n.js` が git に追加されておらず、サーバーで 404

**修正:** `git add public/i18n.js` でコミット

## 変更ファイル

### サーバー
- `server/routes/authApi.js` - 新規（マジックリンクAPI）
- `server/index.js` - authApiRouter 登録

### フロントエンド
- `public/auth.js` - signInWithApple, signInWithMagicLink 追加
- `public/index.html` - Apple/メールログインボタン、スタイル追加
- `public/i18n.js` - git に追加（以前は untracked）
- `public/locales/en.json` - メール認証関連の翻訳追加
- `public/locales/ja.json` - 同上
- `public/locales/zh.json` - 同上
- `public/email-preview-magic-link.html` - メールテンプレートプレビュー

### Edge Function
- `supabase/functions/waitlist-email/index.ts` - 言語判定・多言語テンプレート追加

## 設定変更

### Apple Developer Console
- Service ID `com.neighbor.dreamcore-app.service` に追加:
  - Domain: `auth.dreamcore.gg`
  - Return URL: `https://auth.dreamcore.gg/auth/v1/callback`

### Supabase
- Apple Provider: 既存設定を使用
- Edge Function: VERSION 11 にデプロイ

## テスト方法

1. **Apple ログイン:** https://v2.dreamcore.gg/ → 「Appleでログイン」
2. **メールログイン:** https://v2.dreamcore.gg/ → メールアドレス入力 → 「メールでログイン」
3. **メールプレビュー:** https://v2.dreamcore.gg/email-preview-magic-link.html

## 今後の検討事項

- LINE ログイン（日本ユーザー向け）
- Discord ログイン（ゲーマー層向け）
- WeChat ログイン（中国本格対応時、ICP備案が必要）

## コミット履歴

```
e07fb74 docs: add magic link email preview page
3992f37 feat(auth): custom branded magic link emails with multi-language support
61dcc06 feat(auth): add email magic link authentication
2e9a1fc fix: add missing i18n.js to git
9189a8c feat(auth): add Apple Sign-In support
6bc4501 feat(waitlist): add language detection for email templates
```
