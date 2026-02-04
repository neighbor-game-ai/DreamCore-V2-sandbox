/**
 * V1→V2 ユーザー移行 Phase 2
 * auth.users 移行（Admin APIでユーザー作成）
 *
 * 実行: node scripts/migration-phase-2.js
 * ドライラン: node scripts/migration-phase-2.js --dry-run
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// V2 環境
const V2_URL = process.env.SUPABASE_URL;
const V2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const v2Supabase = createClient(V2_URL, V2_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// 設定
const CONFIG = {
  BATCH_SIZE: 100,           // 1バッチあたりの件数
  BATCH_INTERVAL_MS: 2000,   // バッチ間の待機時間
  USER_INTERVAL_MS: 100,     // ユーザー間の待機時間
  MAX_RETRIES: 3,            // リトライ回数
  RETRY_DELAY_MS: 5000       // リトライ待機時間
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('=== V1→V2 ユーザー移行 Phase 2 ===');
  console.log('auth.users 移行（Admin APIでユーザー作成）');
  if (isDryRun) {
    console.log('\n⚠️  DRY RUN モード - 実際の変更は行いません\n');
  }

  // Step 1.2 の結果を読み込み
  const dataPath = '/Users/admin/DreamCore-V2-sandbox/scripts/v1-only-users.json';
  if (!fs.existsSync(dataPath)) {
    console.error('Error: v1-only-users.json が見つかりません');
    console.error('先に migration-step-1-2.js を実行してください');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const v1OnlyUsers = data.v1_only_users;
  const duplicateUsers = data.duplicate_users;

  console.log(`\n移行対象: ${v1OnlyUsers.length} users`);
  console.log(`重複（マッピングのみ）: ${duplicateUsers.length} users`);
  console.log(`バッチサイズ: ${CONFIG.BATCH_SIZE}`);
  console.log(`推定バッチ数: ${Math.ceil(v1OnlyUsers.length / CONFIG.BATCH_SIZE)}\n`);

  // 統計
  const stats = {
    created: 0,
    skipped: 0,
    failed: 0,
    duplicateMapped: 0
  };

  // Step 2.1: V1-only ユーザーを V2 に作成
  console.log('=== Step 2.1: V1-only ユーザーを V2 に作成 ===\n');

  for (let i = 0; i < v1OnlyUsers.length; i += CONFIG.BATCH_SIZE) {
    const batch = v1OnlyUsers.slice(i, i + CONFIG.BATCH_SIZE);
    const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(v1OnlyUsers.length / CONFIG.BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + CONFIG.BATCH_SIZE, v1OnlyUsers.length)})`);

    for (const user of batch) {
      if (isDryRun) {
        console.log(`  [DRY RUN] Would create: ${user.email}`);
        stats.created++;
        continue;
      }

      // 冪等性チェック: マッピングテーブルに既存か確認
      const { data: existing } = await v2Supabase
                .from('private.user_migration_map')
        .select('v1_user_id')
        .eq('v1_user_id', user.id)
        .single();

      if (existing) {
        console.log(`  Skip (already migrated): ${user.email}`);
        stats.skipped++;
        continue;
      }

      // リトライ付きでユーザー作成
      let success = false;
      let lastError = null;

      for (let retry = 0; retry < CONFIG.MAX_RETRIES && !success; retry++) {
        try {
          const { data: newUser, error } = await v2Supabase.auth.admin.createUser({
            email: user.email,
            email_confirm: true,
            user_metadata: user.user_metadata || {},
            app_metadata: {
              ...(user.app_metadata || {}),
              migrated_from_v1: true,
              v1_user_id: user.id
            }
          });

          if (error) {
            // email already registered エラーは特殊処理
            if (error.message.includes('already been registered') ||
                error.message.includes('duplicate key')) {
              console.log(`  Skip (email exists in V2): ${user.email}`);
              stats.skipped++;
              success = true;
              break;
            }
            throw error;
          }

          // マッピング登録
          const { error: mapError } = await v2Supabase
            .from('private.user_migration_map')
            .insert({
              v1_user_id: user.id,
              v2_user_id: newUser.user.id,
              email: user.email,
              migration_status: 'completed',
              migrated_at: new Date().toISOString()
            })
            .schema('private');

          if (mapError) {
            console.error(`  Warning: Mapping insert failed for ${user.email}:`, mapError.message);
          }

          console.log(`  ✓ Created: ${user.email}`);
          stats.created++;
          success = true;

        } catch (err) {
          lastError = err;
          if (retry < CONFIG.MAX_RETRIES - 1) {
            console.log(`  Retry ${retry + 1}/${CONFIG.MAX_RETRIES} for ${user.email}: ${err.message}`);
            await sleep(CONFIG.RETRY_DELAY_MS);
          }
        }
      }

      if (!success && lastError) {
        console.error(`  ✗ Failed: ${user.email}: ${lastError.message}`);

        // 失敗を記録
        await v2Supabase
          .from('private.user_migration_map')
          .insert({
            v1_user_id: user.id,
            v2_user_id: '00000000-0000-0000-0000-000000000000',
            email: user.email,
            migration_status: 'failed',
            error_message: lastError.message
          })
          .schema('private');

        stats.failed++;
      }

      await sleep(CONFIG.USER_INTERVAL_MS);
    }

    // バッチ間の待機
    if (i + CONFIG.BATCH_SIZE < v1OnlyUsers.length) {
      console.log(`  Waiting ${CONFIG.BATCH_INTERVAL_MS}ms before next batch...\n`);
      await sleep(CONFIG.BATCH_INTERVAL_MS);
    }
  }

  // Step 2.2: 重複ユーザーのマッピング登録
  console.log('\n=== Step 2.2: 重複ユーザーのマッピング登録 ===\n');

  // V2 ユーザーを再取得（ID取得のため）
  const { data: v2UsersData } = await v2Supabase.auth.admin.listUsers({ perPage: 1000 });
  const v2UsersByEmail = new Map();
  for (const u of v2UsersData.users) {
    if (u.email) {
      v2UsersByEmail.set(u.email.toLowerCase(), u);
    }
  }

  for (const dup of duplicateUsers) {
    const v2User = v2UsersByEmail.get(dup.email.toLowerCase());

    if (!v2User) {
      console.log(`  Warning: V2 user not found for ${dup.email}`);
      continue;
    }

    if (isDryRun) {
      console.log(`  [DRY RUN] Would map: ${dup.email} (V1: ${dup.v1_id} -> V2: ${v2User.id})`);
      stats.duplicateMapped++;
      continue;
    }

    const { error } = await v2Supabase
      .from('private.user_migration_map')
      .upsert({
        v1_user_id: dup.v1_id,
        v2_user_id: v2User.id,
        email: dup.email,
        migration_status: 'completed',
        migrated_at: new Date().toISOString(),
        notes: 'duplicate - v2 uuid preserved'
      })
      .schema('private');

    if (error) {
      console.error(`  Error mapping ${dup.email}:`, error.message);
    } else {
      console.log(`  ✓ Mapped duplicate: ${dup.email}`);
      stats.duplicateMapped++;
    }
  }

  // 結果サマリー
  console.log('\n=== Phase 2 完了 ===');
  console.log(`作成成功: ${stats.created}`);
  console.log(`スキップ（既存）: ${stats.skipped}`);
  console.log(`失敗: ${stats.failed}`);
  console.log(`重複マッピング: ${stats.duplicateMapped}`);

  if (stats.failed > 0) {
    console.log('\n⚠️  失敗したユーザーがあります。以下で確認してください:');
    console.log("SELECT * FROM private.user_migration_map WHERE migration_status = 'failed';");
  }

  console.log('\n次のステップ: Phase 3 (profiles 移行)');
}

main().catch(console.error);
