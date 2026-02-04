# V1 → V2 ユーザー移行計画

**作成日:** 2026-02-04
**ステータス:** 計画中
**最終更新:** 2026-02-04（CTOレビュー反映）

---

## 概要

DreamCore V1（7,299ユーザー）から V2（27ユーザー）へのユーザー移行。
認証情報とプロフィール情報を移行し、将来のゲームデータ移行に備える。

---

## 意思決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| UUID優先 | V2 | V2で作成済みのデータを維持 |
| Apple Sign-in | V2で有効化する | 567人対応のため必須 |
| shadow_banned | 移行する | 1人のみ、影響小 |
| Email/Password | パスワードリセット必須 | Admin APIの制約 |

---

## 環境情報

| 項目 | V1 | V2 |
|------|-----|-----|
| Supabase Project ID | `odqcczjoaznmfpiywmoj` | `tcynrijrovktirsvwiqb` |
| 総ユーザー数 | 7,299 | 27 |
| 重複ユーザー | - | 15 |

### 認証方法の内訳（V1）

| 認証方法 | 人数 | 移行後の動作 |
|---------|------|-------------|
| Google OAuth | 5,833 | そのままログイン可 |
| Email/Password | 899 | **パスワードリセット必要** |
| Apple | 567 | V2にApple Sign-in追加後ログイン可 |

---

## スキーマ比較

### auth.users

両方ともSupabase Auth。互換性あり。

### プロフィールテーブル

| V1 (profiles) | V2 (users) | 移行方法 |
|---------------|------------|----------|
| user_id | id | マッピングテーブル経由 |
| - | email | auth.usersから取得 |
| username | username | そのまま |
| display_name | display_name | そのまま |
| avatar_url | avatar_url | そのまま |
| bio | bio | そのまま |
| x_url | social_links.x | JSONBに変換 |
| instagram_url | social_links.instagram | JSONBに変換 |
| youtube_url | social_links.youtube | JSONBに変換 |
| tiktok_url | social_links.tiktok | JSONBに変換 |
| - | public_id | 自動生成（トリガー） |
| created_at | created_at | そのまま |
| updated_at | updated_at | 移行時刻 |
| shadow_banned | - | 移行する（app_metadataに保存） |
| follower_count | - | 移行しない（V2で再計算） |
| following_count | - | 移行しない |
| role | - | 移行しない |
| invite_code | - | 移行しない |

---

## 移行方針

### 基本方針

1. **V2のUUIDを優先**（重複ユーザーはV2のIDを維持）
2. **Admin APIを使用**（auth.usersへの直接INSERTは避ける）
3. **パスワードリセット必須**（Email/Passwordユーザー）
4. **バッチ処理**（100件ずつ、1秒間隔）
5. **冪等性確保**（再実行時に二重作成を防止）

### 移行対象

| カテゴリ | 人数 | 処理 |
|---------|------|------|
| V2既存（重複） | 15 | auth: スキップ / profiles: マージ |
| V2既存（テスト） | 10 | 維持（@test.local等） |
| V1のみ | ~7,284 | auth + profiles 移行 |

---

## ロールバック方針

### 失敗時の対応

1. **Phase 2（auth移行）失敗時**
   - `user_migration_map` で `migration_status = 'failed'` のユーザーを特定
   - 失敗ユーザーのみ再実行（冪等性により安全）
   - 完全ロールバックが必要な場合: V2の `migrated_from_v1 = true` ユーザーを削除

2. **Phase 3（profiles移行）失敗時**
   - profiles移行は UPDATE のみなので、再実行で上書き可能
   - ロールバック不要（元データはV1に残っている）

3. **Phase 4（メール送信）失敗時**
   - 未送信ユーザーを特定して再送信
   - メール送信は副作用があるため、送信済みフラグを管理

### ロールバックSQL

```sql
-- 移行ユーザーの削除（緊急時のみ）
DELETE FROM auth.users
WHERE raw_app_meta_data->>'migrated_from_v1' = 'true';

-- マッピングテーブルのリセット
TRUNCATE private.user_migration_map;
```

---

## 冪等性（Idempotency）

### 二重作成防止

```javascript
// 移行前にマッピングテーブルをチェック
const { data: existing } = await v2Supabase
  .from('private.user_migration_map')
  .select('v1_user_id')
  .eq('v1_user_id', user.id)
  .single();

if (existing) {
  console.log(`Skip: ${user.email} already migrated`);
  continue;
}

// V2のauth.usersにも存在チェック
const { data: v2Existing } = await v2Supabase.auth.admin.listUsers();
const alreadyExists = v2Existing.users.some(u => u.email === user.email);

if (alreadyExists) {
  console.log(`Skip: ${user.email} already exists in V2`);
  // マッピングのみ登録
  continue;
}
```

### 再実行の安全性

| フェーズ | 再実行 | 備考 |
|---------|--------|------|
| Phase 1 | 安全 | CREATE IF NOT EXISTS |
| Phase 2 | 安全 | email重複チェックあり |
| Phase 3 | 安全 | UPSERTで上書き |
| Phase 4 | 要注意 | メール重複送信の可能性 |

---

## レート制限

### Supabase Admin API 制限

| 操作 | 制限 | 対策 |
|------|------|------|
| createUser | 不明確（推定: 60/分） | 100件/バッチ、1秒間隔 |
| listUsers | perPage最大1000 | ページネーション |
| resetPasswordForEmail | 3/時間/メール | 一括送信は別日に分散 |

### バッチ処理設定

```javascript
const CONFIG = {
  BATCH_SIZE: 100,           // 1バッチあたりの件数
  BATCH_INTERVAL_MS: 1000,   // バッチ間の待機時間
  USER_INTERVAL_MS: 50,      // ユーザー間の待機時間
  MAX_RETRIES: 3,            // リトライ回数
  RETRY_DELAY_MS: 5000       // リトライ待機時間
};
```

---

## 実行ステップ

### Phase 1: 準備

#### Step 1.1: マッピングテーブル作成

```sql
-- V2で実行（private schemaに作成）
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.user_migration_map (
  v1_user_id UUID NOT NULL,
  v2_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  migration_status TEXT DEFAULT 'pending', -- pending, completed, failed
  migrated_at TIMESTAMPTZ,
  error_message TEXT,
  notes TEXT,
  PRIMARY KEY (v1_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_map_v2_user
  ON private.user_migration_map(v2_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_map_email
  ON private.user_migration_map(email);

-- RLS: service_role のみアクセス可
ALTER TABLE private.user_migration_map ENABLE ROW LEVEL SECURITY;
```

#### Step 1.2: V1-onlyユーザーリスト作成

```javascript
// V2に存在しないV1ユーザーを抽出
const v1Users = await v1Supabase.auth.admin.listUsers({ perPage: 10000 });
const v2Users = await v2Supabase.auth.admin.listUsers({ perPage: 1000 });

const v2Emails = new Set(v2Users.data.users.map(u => u.email));
const v1OnlyUsers = v1Users.data.users.filter(u => !v2Emails.has(u.email));

console.log(`V1 total: ${v1Users.data.users.length}`);
console.log(`V2 total: ${v2Users.data.users.length}`);
console.log(`V1-only users: ${v1OnlyUsers.length}`);
console.log(`Duplicate users: ${v1Users.data.users.length - v1OnlyUsers.length}`);
```

### Phase 2: auth.users 移行

#### Step 2.1: Admin APIでユーザー作成

```javascript
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

for (let i = 0; i < v1OnlyUsers.length; i += CONFIG.BATCH_SIZE) {
  const batch = v1OnlyUsers.slice(i, i + CONFIG.BATCH_SIZE);
  console.log(`Processing batch ${i / CONFIG.BATCH_SIZE + 1}/${Math.ceil(v1OnlyUsers.length / CONFIG.BATCH_SIZE)}`);

  for (const user of batch) {
    // 冪等性チェック
    const { data: existing } = await v2Supabase
      .from('private.user_migration_map')
      .select('v1_user_id')
      .eq('v1_user_id', user.id)
      .single();

    if (existing) {
      console.log(`Skip: ${user.email} already migrated`);
      continue;
    }

    try {
      const { data, error } = await v2Supabase.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
        user_metadata: user.user_metadata,
        app_metadata: {
          ...user.app_metadata,
          migrated_from_v1: true,
          v1_user_id: user.id
        }
      });

      if (error) throw error;

      // マッピング登録
      await v2Supabase.from('private.user_migration_map').insert({
        v1_user_id: user.id,
        v2_user_id: data.user.id,
        email: user.email,
        migration_status: 'completed',
        migrated_at: new Date().toISOString()
      });

      console.log(`✓ ${user.email}`);

    } catch (err) {
      console.error(`✗ ${user.email}: ${err.message}`);

      // 失敗を記録
      await v2Supabase.from('private.user_migration_map').insert({
        v1_user_id: user.id,
        v2_user_id: '00000000-0000-0000-0000-000000000000', // placeholder
        email: user.email,
        migration_status: 'failed',
        error_message: err.message
      });
    }

    await sleep(CONFIG.USER_INTERVAL_MS);
  }

  await sleep(CONFIG.BATCH_INTERVAL_MS);
}
```

#### Step 2.2: 重複ユーザーのマッピング登録

```javascript
const duplicateUsers = v1Users.data.users.filter(u => v2Emails.has(u.email));

for (const v1User of duplicateUsers) {
  const v2User = v2Users.data.users.find(u => u.email === v1User.email);

  await v2Supabase.from('private.user_migration_map').upsert({
    v1_user_id: v1User.id,
    v2_user_id: v2User.id,
    email: v2User.email,
    migration_status: 'completed',
    migrated_at: new Date().toISOString(),
    notes: 'duplicate - v2 uuid preserved'
  });

  console.log(`Mapped duplicate: ${v1User.email}`);
}
```

### Phase 3: profiles 移行

#### Step 3.1: V1 profiles データ取得

```javascript
const { data: v1Profiles } = await v1Supabase
  .from('profiles')
  .select('*');

console.log(`V1 profiles: ${v1Profiles.length}`);
```

#### Step 3.2: V2 users にプロフィール情報を追加

```javascript
for (const profile of v1Profiles) {
  const { data: mapping } = await v2Supabase
    .from('private.user_migration_map')
    .select('v2_user_id')
    .eq('v1_user_id', profile.user_id)
    .single();

  if (!mapping) {
    console.log(`No mapping for: ${profile.user_id}`);
    continue;
  }

  // social_links を JSONB に変換
  const socialLinks = {};
  if (profile.x_url) socialLinks.x = profile.x_url;
  if (profile.instagram_url) socialLinks.instagram = profile.instagram_url;
  if (profile.youtube_url) socialLinks.youtube = profile.youtube_url;
  if (profile.tiktok_url) socialLinks.tiktok = profile.tiktok_url;

  const { error } = await v2Supabase
    .from('users')
    .update({
      username: profile.username,
      display_name: profile.display_name || profile.username,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null
    })
    .eq('id', mapping.v2_user_id);

  if (error) {
    console.error(`Profile update failed: ${profile.user_id}`, error.message);
  } else {
    console.log(`✓ Profile: ${profile.username || profile.user_id}`);
  }
}
```

### Phase 4: 後処理

#### Step 4.1: Email/Passwordユーザーにリセットメール送信

**注意:** レート制限（3/時間/メール）があるため、一括送信は推奨しない。

```javascript
const emailPasswordUsers = v1OnlyUsers.filter(
  u => u.app_metadata?.provider === 'email'
);

console.log(`Email/Password users to notify: ${emailPasswordUsers.length}`);

// 一括送信ではなく、ユーザーが初回ログイン時にリセットを促す方式を推奨
// または、Brevo経由で案内メールを送信
```

#### Step 4.2: 移行完了通知メール（Brevo経由）

```javascript
// Brevo APIで一括メール送信
const emailList = v1OnlyUsers.map(u => ({
  email: u.email,
  attributes: {
    MIGRATED: true,
    NEEDS_PASSWORD_RESET: u.app_metadata?.provider === 'email'
  }
}));

// Brevoにコンタクト追加 → キャンペーンメール送信
```

---

## 検証クエリ

### 移行前チェック

```sql
-- V1 総ユーザー数
SELECT COUNT(*) FROM auth.users; -- V1で実行

-- V2 総ユーザー数（移行前）
SELECT COUNT(*) FROM auth.users; -- V2で実行
```

### 移行後チェック

```sql
-- V2 auth.users 件数
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE raw_app_meta_data->>'migrated_from_v1' = 'true') as migrated
FROM auth.users;

-- V2 public.users 件数
SELECT COUNT(*) FROM public.users;

-- マッピングテーブル件数
SELECT migration_status, COUNT(*)
FROM private.user_migration_map
GROUP BY migration_status;

-- 期待値
-- total: 27 + 7,284 = 7,311
-- migrated: 7,284
-- public.users: 7,311
-- mapping completed: 7,299
```

### サンプルユーザー検証

```sql
-- 特定ユーザーの移行確認
SELECT u.id, u.email, u.raw_app_meta_data->>'provider' as provider,
       p.username, p.display_name
FROM auth.users u
LEFT JOIN public.users p ON p.id = u.id
WHERE u.email = 'test@example.com';
```

---

## 通知・サポート

### パスワードリセット案内メール文面

```
件名: 【DreamCore】新バージョンへの移行のお知らせ

{display_name} 様

いつもDreamCoreをご利用いただきありがとうございます。

DreamCoreは新バージョン（V2）に移行いたしました。
お客様のアカウントは自動的に移行されていますが、
メールアドレス・パスワードでログインされている方は、
初回ログイン時にパスワードの再設定が必要です。

▼ パスワード再設定
https://v2.dreamcore.gg/reset-password

▼ 新しいDreamCore
https://v2.dreamcore.gg

ご不明な点がございましたら、お気軽にお問い合わせください。

DreamCore運営チーム
support@dreamcore.gg
```

### 問い合わせ導線

- サポートメール: support@dreamcore.gg
- FAQ: https://v2.dreamcore.gg/help/migration

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| Admin API レート制限 | 移行が遅延 | バッチ処理 + sleep |
| email重複エラー | 一部ユーザー移行失敗 | 事前に重複チェック、冪等性確保 |
| public.users トリガー未発火 | プロフィール未作成 | Phase 3で明示的にUPDATE |
| Apple Sign-in 未対応 | 567人ログイン不可 | **事前にV2でApple Sign-in有効化** |
| パスワードリセット未完了 | 899人ログイン不可 | 案内メール + サポート対応 |

---

## 前提条件（移行実行前に完了必須）

- [ ] V2でApple Sign-inを有効化
- [ ] パスワードリセットページの実装（`/reset-password`）
- [ ] サポートメールアドレスの準備
- [ ] Brevoでの移行通知メールテンプレート作成

---

## タイムライン（見積もり）

| フェーズ | 所要時間 |
|---------|----------|
| Phase 1: 準備 | 30分 |
| Phase 2: auth移行 | 1-2時間（7,284件 / 100件バッチ） |
| Phase 3: profiles移行 | 30分 |
| Phase 4: 後処理 | 1時間 |
| **合計** | **3-4時間** |

---

## 承認

- [x] 計画レビュー完了（CTO）
- [ ] 前提条件の完了確認
- [ ] テスト環境での検証完了
- [ ] 本番実行承認

---

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-02-04 | 初版作成 |
| 2026-02-04 | CTOレビュー反映（ロールバック、冪等性、レート制限、検証クエリ、通知） |
