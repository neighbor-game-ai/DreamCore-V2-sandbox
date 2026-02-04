# 作業報告: V1→V2 ユーザー移行

**日付:** 2026-02-04
**担当:** Claude Opus 4.5

---

## 概要

DreamCore V1（7,299ユーザー）から V2（27ユーザー）へのユーザー移行を実施。
認証情報とプロフィール情報を移行し、7,309ユーザーの統合を完了。

---

## 環境情報

| 項目 | V1 | V2 |
|------|-----|-----|
| Supabase Project ID | `odqcczjoaznmfpiywmoj` | `tcynrijrovktirsvwiqb` |
| 移行前ユーザー数 | 7,299 | 27 |
| 移行後ユーザー数 | - | 7,309 |

### 認証方法の内訳（V1）

| 認証方法 | 人数 |
|---------|------|
| Google OAuth | 5,821 |
| Email/Password | 896 |
| Apple | 565 |

---

## 実施内容

### Phase 1: 準備

1. **マッピングテーブル作成** (`private.user_migration_map` → `public.user_migration_map`)
   - V1とV2のユーザーIDを紐づけるテーブル
   - 当初privateスキーマに作成したが、PostgRESTからアクセスできずpublicに移動

2. **V1-onlyユーザーリスト作成**
   - V1にのみ存在するユーザー: 7,282件
   - 重複（V1とV2両方に存在）: 15件

### Phase 2: auth.users 移行

**スクリプト:** `scripts/migration-phase-2.js`

- Admin API (`supabase.auth.admin.createUser`) でユーザー作成
- バッチ処理: 100件/バッチ、2秒間隔
- 結果:
  - 作成成功: 7,174
  - スキップ（既存）: 108
  - 失敗: 0

### Phase 2.5: マッピング登録

**スクリプト:** `scripts/migration-phase-2-mapping.js`

- V1とV2のメールアドレスで照合し、マッピングテーブルに登録
- 結果: 7,297件登録

### Phase 3: profiles 移行

**スクリプト:** `scripts/migration-phase-3-v2.js`

**方針変更:** 全プロフィール移行 → display_name のみ移行

- bio / social_links / avatar はユーザー手動更新とする
- 理由: 移行コスト vs 価値のバランス、最新情報をユーザーに入力してもらう

**実装改善:**
- リトライ＋指数バックオフ（500/502/503/504/429対象）
- 失敗IDを `failed_profile_ids.json` に保存
- 冪等性: 既に更新済みのユーザーはスキップ

**結果:**
- 更新成功: 7,295
- 既に更新済み: 1
- スキップ（未マッピング）: 3
- 失敗: 1 → 手動リトライで解決

### Fix: public.users 作成

**問題:** Admin APIでユーザー作成時、`public.users`への挿入トリガーが発火しない

**スクリプト:** `scripts/migration-fix-public-users.js`

- auth.usersに対応するpublic.usersレコードを一括作成
- V1のdisplay_nameも同時に設定

**結果:**
- 作成成功: 7,286
- エラー: 0

### Fix: user_access 登録（ウェイトリスト対応）

**問題:** V2はウェイトリスト方式を採用しており、`user_access` テーブルに登録されていないユーザーはアクセスできない

**スクリプト:** `scripts/migration-user-access.js`

- 移行ユーザー全員を `approved` ステータスで登録
- `user_access` の PK は `email`（`user_id` ではない）

**結果:**
- 既存: 22
- 新規登録: 7,292
- 最終合計: 7,314

---

## 最終結果

| 項目 | 件数 |
|------|------|
| V2 auth.users | 7,309 |
| V2 public.users | 7,309 |
| user_migration_map | 7,297 |
| user_access | 7,314 |

---

## 変更ファイル

| ファイル | 内容 |
|----------|------|
| `scripts/migration-step-1-2.js` | V1-onlyユーザー抽出 |
| `scripts/migration-phase-2.js` | auth.users移行 |
| `scripts/migration-phase-2-mapping.js` | マッピング登録 |
| `scripts/migration-phase-3.js` | profiles移行（初版） |
| `scripts/migration-phase-3-v2.js` | profiles移行（改善版） |
| `scripts/migration-fix-public-users.js` | public.users修正 |
| `scripts/migration-user-access.js` | user_access登録 |
| `scripts/v1-only-users.json` | V1-onlyユーザーデータ |
| `scripts/failed_profile_ids.json` | 失敗ID記録 |
| `.env` | V1_SUPABASE_SERVICE_ROLE_KEY追加 |

---

## DB変更

V2 Supabase Dashboard で実行したSQL:

```sql
-- 1. マッピングテーブル作成
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.user_migration_map (...);

-- 2. publicスキーマに移動
ALTER TABLE private.user_migration_map SET SCHEMA public;

-- 3. RLS無効化
ALTER TABLE public.user_migration_map DISABLE ROW LEVEL SECURITY;

-- 4. 権限付与
GRANT ALL ON public.user_migration_map TO service_role;
GRANT ALL ON public.user_migration_map TO authenticated;
GRANT ALL ON public.user_migration_map TO postgres;
```

---

## 未マッピングユーザー（3件）

V1 profilesにあるが、auth.usersに対応がないユーザー:

- `60fa2a6c-620d-40c5-b56e-2cb57ddce00c`
- `34e44c6a-f926-4593-9461-84ab7f414727`
- `3b1424d8-ebbd-45fa-8e8e-603b115fbf0b`

これらはV1のprofilesテーブルにのみ存在し、auth.usersには存在しない孤児レコード。

---

## 学び・注意点

1. **Admin APIでのユーザー作成はトリガーが発火しない**
   - `auth.users`への挿入トリガーで`public.users`を作成している場合、Admin API経由では発火しない
   - 別途`public.users`レコードを作成する必要がある

2. **Supabaseのレート制限**
   - 連続リクエストで500エラーが発生することがある
   - リトライ＋指数バックオフで対応

3. **PostgRESTはpublicスキーマのみ**
   - privateスキーマのテーブルにはSupabaseクライアントからアクセスできない
   - 必要ならpublicスキーマに移動してRLSで保護

4. **プロフィール移行の最適解**
   - 全データ移行より、最小限（display_name）+ ユーザー手動更新が効率的
   - 古い情報を持ち込まないメリットもある

---

## 次のステップ

1. **初回ログイン時のプロフィール更新促進UI**（任意）
   - 「プロフィール未設定です → 更新してください」バナー

2. **Email/Passwordユーザーへの案内**
   - パスワードリセットが必要（896人）
   - Brevo経由でメール送信を検討

3. ~~計画ファイルの更新~~ ✅ 完了

---

## ステータス

**✅ 移行完了** - 2026-02-04
