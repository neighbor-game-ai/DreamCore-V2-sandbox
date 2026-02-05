# PWA / Push Notifications 実装作業ログ

**作業日**: 2026-02-05
**ステータス**: デプロイ完了、E2E検証待ち

## 概要

DreamCoreをPWA化し、プッシュ通知機能を実装。ゲーム生成完了時にブラウザを閉じていても通知を受信可能に。

## 実装内容

### Phase 1: PWA基盤

**新規ファイル**:
- `/public/manifest.json` - Web App Manifest
- `/public/sw.js` - Service Worker
- `/public/icons/` - PWAアイコン (192, 512, maskable, apple-touch)

**変更ファイル**:
- `/public/index.html` - PWAメタタグ追加
- `/public/create.html` - PWAメタタグ + push.js読み込み
- `/public/mypage.html` - PWAメタタグ追加
- `/public/discover.html` - PWAメタタグ追加
- `/public/notifications.html` - PWAメタタグ追加
- `/public/app.js` - SW登録コード追加

### Phase 2: Push通知

**新規ファイル**:
- `/server/pushService.js` - web-pushラッパー、VAPID設定
- `/server/notificationService.js` - 通知作成・管理
- `/server/routes/pushApi.js` - Push購読API
- `/server/routes/notificationsApi.js` - 通知履歴API
- `/public/push.js` - フロントエンド購読モジュール
- `/supabase/migrations/022_push_notifications.sql` - DBマイグレーション

**変更ファイル**:
- `/server/index.js` - ルート登録、jobManager通知連携
- `/public/app.js` - 通知バナーUI、subscribeToPush
- `/package.json` - web-push依存追加
- `/.env.example` - VAPID環境変数

## CTOレビュー対応

### Critical/High（対応済み）
- `uuid_generate_v7()` → `gen_random_uuid()` に変更
- 通知許可は明示ボタンから（iOS要件）
- Push購読は `upsert` で更新
- 410/404時は購読削除
- RLS必須

### Warning（対応済み）
1. `db.getProjectById` に `supabaseAdmin` を渡す
2. iOS通知許可をユーザージェスチャー（ボタン）に変更
3. `unreadCount` を全体件数で再計算
4. `pgcrypto` 拡張を明示

## DBスキーマ

### push_subscriptions
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);
```

### notifications
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('project', 'system', 'social')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  icon TEXT DEFAULT 'default',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  job_id UUID,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);
```

## API エンドポイント

| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/api/push/vapid-key` | 不要 | VAPID公開鍵取得 |
| POST | `/api/push/subscribe` | 必要 | Push購読登録 |
| DELETE | `/api/push/unsubscribe` | 必要 | Push購読解除 |
| GET | `/api/notifications` | 必要 | 通知一覧（ページング対応） |
| GET | `/api/notifications/unread-count` | 必要 | 未読件数 |
| POST | `/api/notifications/:id/read` | 必要 | 既読マーク |
| POST | `/api/notifications/read-all` | 必要 | 全既読 |

## 重要な設計判断

1. **service_role運用**: `push_subscriptions` への書き込みは全て `supabaseAdmin` を使用
2. **重複防止**: `UNIQUE(user_id, job_id)` で同じジョブの二重通知を防止
3. **410/404クリーンアップ**: Push送信失敗時に期限切れ購読を自動削除
4. **read_at サーバー設定**: クライアントから送らせず、サーバー側でタイムスタンプ設定
5. **最小限SWキャッシュ**: icons/ と manifest.json のみ（認証ページはキャッシュしない）

## デプロイ

- **コミット**: `93a28da` feat(pwa): add PWA support and push notifications
- **本番URL**: https://v2.dreamcore.gg
- **VAPID鍵**: GCE `.env` に設定済み

## ヘルスチェック結果

| エンドポイント | 結果 |
|---------------|------|
| `/api/health` | ✅ 200 |
| `/manifest.json` | ✅ 200 |
| `/sw.js` | ✅ 200 |
| `/api/push/vapid-key` | ✅ 200 |
| `/icons/*` | ✅ 200 |

## 残作業（手動E2E）

### A. Push購読〜受信（Chrome/Android）
- [ ] 「通知を有効にする」バナー表示
- [ ] 許可後 `push_subscriptions` にレコード追加
- [ ] ゲーム生成実行
- [ ] ブラウザ閉じた状態で通知受信
- [ ] `notifications` にレコード追加
- [ ] `last_used_at` 更新確認

### B. 410/404削除テスト
- [ ] endpoint を DB で破壊
- [ ] Push送信を発火
- [ ] 該当行が自動削除

### C. iOS 16.4+
- [ ] Safari「ホーム画面に追加」
- [ ] ホーム画面から起動
- [ ] ボタン経由で通知許可
- [ ] Push受信確認
- [ ] Safariタブ内では許可不可を確認

## 関連ファイル

- 計画: `/.claude/plans/sleepy-fluttering-journal.md`
- DBスキーマ: `/.claude/docs/database-schema.md`
- API仕様: `/docs/API-REFERENCE.md`
