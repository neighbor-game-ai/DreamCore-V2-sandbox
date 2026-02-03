# 招待コード機能の実装

**日付:** 2026-02-03
**作業者:** Claude

## 実施内容

### 1. CodeRabbit 導入・コードレビュー対応

- CodeRabbit スキルをインストール（`npx skills add coderabbitai/skills --yes`）
- CodeRabbit CLI をインストール・認証
- コードレビューを実行し、以下を修正:
  - `server/r2Client.js`: URL エンコーディング追加（特殊文字対応）
  - `server/gameHtmlUtils.js`: JSON.stringify に try-catch 追加（循環参照対策）
  - `.gitignore`: `.wrangler/` を追加

### 2. 招待コード機能の実装

- **目的**: 招待コードを持つユーザーは手動承認を待たずに即座にアクセス可能にする
- **DB設計**:
  - `invitation_codes` テーブル: コード管理（RLS有効、ポリシーなし＝service_roleのみ）
  - `invitation_code_uses` テーブル: 使用履歴（同一ユーザーの重複使用防止）
  - `user_access.invitation_code` カラム追加
- **API**: `POST /api/invitation/redeem` エンドポイント追加
- **フロントエンド**: `waitlist.html` に招待コード入力フォーム追加

### 3. UI修正

- 招待コード入力フォームのレイアウト崩れを修正（Flexbox設定）
- 入力フィールドが見えない問題を修正（背景色・ボーダー追加）

### 4. バグ修正

- `user_access` テーブルの主キーが `email` であることを考慮し、upsert の `onConflict` を `'user_id'` から `'email'` に修正

### 5. 招待コード発行

| コード | 用途 |
|--------|------|
| `BETATESTER` | βテスター用 |
| `WFMY7CHS` | コアユーザー向け |
| `K60ZYE2U` | X告知用 |

### 6. ドキュメント更新

- `docs/WAITLIST.md` に招待コード機能のドキュメントを追加

## 発見した問題と対応

| 問題 | 原因 | 対応 |
|------|------|------|
| 招待コード適用時に「承認処理に失敗しました」 | `user_access` の主キーが `email` なのに `onConflict: 'user_id'` を使用 | `onConflict: 'email'` に修正 |
| 入力フォームが横並びにならない | Flexbox の設定不足 | `flex-direction: row`, `align-items: stretch` 追加 |
| 入力フィールドが見えない | 背景色・ボーダーがない | `background: #f9fafb`, `border: 2px solid #e5e7eb` 追加 |

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/waitlist.js` | `redeemInvitationCode()` 関数追加、`/api/invitation/redeem` エンドポイント追加、upsert の onConflict 修正 |
| `public/waitlist.html` | 招待コード入力フォーム追加、CSS修正 |
| `server/r2Client.js` | URL エンコーディング追加（CodeRabbit指摘対応） |
| `server/gameHtmlUtils.js` | JSON.stringify に try-catch 追加（CodeRabbit指摘対応） |
| `.gitignore` | `.wrangler/` 追加 |
| `docs/WAITLIST.md` | 招待コード機能のドキュメント追加 |

## DBマイグレーション

```sql
-- 20260203080521_add_invitation_codes.sql
CREATE TABLE invitation_codes (
  code TEXT PRIMARY KEY CHECK (code = upper(code)),
  description TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE invitation_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES invitation_codes(code),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code, user_id)
);
CREATE INDEX idx_invitation_code_uses_user_id ON invitation_code_uses(user_id);
ALTER TABLE invitation_code_uses ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_access ADD COLUMN IF NOT EXISTS invitation_code TEXT;
```

## コミット

1. `cde870b` - feat(waitlist): add invitation code feature
2. `4d73e03` - docs(waitlist): add invitation code documentation

## 学び・注意点

- `user_access` テーブルは `email` が主キーであり、`user_id` ではない
- Supabase の RLS でポリシーを作成しない場合、クライアントからのアクセスは完全にブロックされる（service_role のみアクセス可）
- 招待コードは大文字で正規化して保存・比較する（`CHECK (code = upper(code))`）
