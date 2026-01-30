# クォータ機能（日次利用制限）実装

**日付:** 2026-01-30
**ブランチ:** `feature/quota-v2` → `feature/sandbox-runtime` にマージ

---

## 概要

無料ユーザー向けの日次利用制限機能を実装。プロジェクト作成とメッセージ送信に制限を設け、有料プランへのアップグレード導線を確保。

---

## 制限仕様

| 項目 | free | pro | team |
|------|------|-----|------|
| プロジェクト作成 | 3回/日 | 100回/日 | 無制限 |
| メッセージ送信 | 20回/日 | 500回/日 | 無制限 |
| リセット時刻 | 毎日 09:00 JST (00:00 UTC) | - | - |

---

## 実装内容

### バックエンド

#### 1. `server/config.js`
- `TIER_LIMITS` 定数追加（プラン別制限値）

#### 2. `server/quotaService.js`（新規）
- `getUserPlan(userId)` - サブスクリプション状態からプラン取得
- `tryConsumeProjectQuota(userId)` - プロジェクト作成クォータ消費
- `tryConsumeMessageQuota(userId)` - メッセージ送信クォータ消費
- `getQuotaInfo(userId)` - 現在のクォータ情報取得

#### 3. `server/index.js`
- `getNextResetTime()` ヘルパー追加
- WebSocket `createProject` ハンドラーにクォータチェック追加
- WebSocket `message` ハンドラーにクォータチェック追加
- `GET /api/quota` REST エンドポイント追加

### フロントエンド

#### 1. `public/create.html`
- ヘッダーに `quota-display` 要素追加
- クォータ制限モーダル追加

#### 2. `public/app.js`
- `updateQuotaDisplay()` - ヘッダーにクォータ表示
- `showQuotaPopup()` - クォータ詳細ポップアップ（quota-display 直下に表示）
- `showQuotaLimitModal()` - 制限到達時のモーダル
- `showQuotaExceededError()` - チャット内エラー表示（HTML対応）
- `createNewProject()` - 事前クォータチェック追加（サーバー通信前）
- `addMessage()` - `isHtml` オプション追加

#### 3. `public/style.css`
- `.quota-display` - ヘッダー表示スタイル
- `.quota-popup` - ポップアップスタイル（動的位置決め対応）
- `.quota-exceeded-error` - チャット内エラースタイル
- モバイル対応メディアクエリ

---

## API エンドポイント

### `GET /api/quota`

**認証:** 必須

**レスポンス:**
```json
{
  "projects": {
    "used": 2,
    "limit": 3,
    "remaining": 1
  },
  "messages": {
    "used": 15,
    "limit": 20,
    "remaining": 5
  },
  "plan": "free",
  "resetAt": "2026-01-30T00:00:00.000Z"
}
```

---

## WebSocket エラーコード

| コード | 説明 |
|--------|------|
| `DAILY_PROJECT_LIMIT_EXCEEDED` | プロジェクト作成上限超過 |
| `DAILY_MESSAGE_LIMIT_EXCEEDED` | メッセージ送信上限超過 |

---

## DB 前提条件（実行済み）

以下のマイグレーションは事前に実行済み:
- `008_add_usage_limits.sql`
- `usage_quotas` テーブル
- `subscriptions` テーブル
- `try_consume_quota()` DB関数
- `get_quota()` DB関数

---

## UI/UX 仕様

### ヘッダー表示
- 💬 残り数 / 📁 残り数 の形式で表示
- クリックで詳細ポップアップ

### ポップアップ
- `quota-display` 要素の直下（左端揃え）に表示
- 画面右端はみ出し防止（自動で右寄せに切り替え）
- 外側クリックで閉じる

### 制限到達時
- **create ページ**: モーダル表示
- **editor ページ**: チャット内にスタイル付きエラー表示

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/config.js` | TIER_LIMITS 追加 |
| `server/quotaService.js` | 新規作成 |
| `server/index.js` | クォータチェック + API追加 |
| `public/create.html` | quota-display + モーダル追加 |
| `public/app.js` | クォータ UI ロジック |
| `public/style.css` | クォータ関連スタイル |
| `docs/API-REFERENCE.md` | `/api/quota` ドキュメント追加 |

---

## 設計判断

### Fail-open 方針
クォータサービスでエラーが発生した場合は操作を許可（UX 優先）。

### 事前チェック
プロジェクト作成は `currentQuota` を参照してサーバー通信前にチェック。不要なリクエストを削減。

### service_role 使用
`quotaService` は `supabaseAdmin`（service_role）を使用。RLS をバイパスしてクォータテーブルにアクセス。
