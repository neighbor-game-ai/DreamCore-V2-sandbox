/**
 * V1→V2 ユーザー移行 Phase 3
 * profiles 移行（V1 profiles → V2 users）
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const V1_URL = 'https://odqcczjoaznmfpiywmoj.supabase.co';
const V1_SERVICE_ROLE_KEY = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;
const V2_URL = process.env.SUPABASE_URL;
const V2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const v1Supabase = createClient(V1_URL, V1_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const v2Supabase = createClient(V2_URL, V2_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== V1→V2 ユーザー移行 Phase 3 ===');
  console.log('profiles 移行\n');

  // Step 3.1: V1 profiles 取得
  console.log('V1 profiles 取得中...');
  const { data: v1Profiles, error: profilesError } = await v1Supabase
    .from('profiles')
    .select('*');

  if (profilesError) {
    console.error('V1 profiles 取得エラー:', profilesError.message);
    process.exit(1);
  }

  console.log(`V1 profiles: ${v1Profiles.length}\n`);

  // Step 3.2: マッピングテーブル取得（ページネーション）
  console.log('マッピングテーブル取得中...');
  const mappings = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await v2Supabase
      .from('user_migration_map')
      .select('v1_user_id, v2_user_id')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('マッピング取得エラー:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    mappings.push(...data);
    console.log(`  取得: ${mappings.length}`);
    if (data.length < limit) break;
    offset += limit;
  }

  const mapByV1 = new Map();
  for (const m of mappings) {
    mapByV1.set(m.v1_user_id, m.v2_user_id);
  }
  console.log(`マッピング: ${mappings.length}\n`);

  // Step 3.3: V2 users 更新
  console.log('V2 users 更新中...\n');

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const profile of v1Profiles) {
    const v2UserId = mapByV1.get(profile.user_id);

    if (!v2UserId) {
      skipped++;
      continue;
    }

    // 最小限の移行: display_name のみ
    // bio / social_links / avatar はユーザー手動更新
    const displayName = profile.display_name || profile.username;

    if (!displayName) {
      skipped++;
      continue;
    }

    const updateData = {
      display_name: displayName
    };

    const { error } = await v2Supabase
      .from('users')
      .update(updateData)
      .eq('id', v2UserId);

    if (error) {
      console.error(`Error updating ${profile.username || profile.user_id}:`, error.message);
      errors++;
    } else {
      updated++;
      if (updated % 500 === 0) {
        console.log(`Updated: ${updated}/${v1Profiles.length}`);
      }
    }
  }

  console.log(`\n=== Phase 3 完了 ===`);
  console.log(`更新成功: ${updated}`);
  console.log(`スキップ（マッピングなし）: ${skipped}`);
  console.log(`エラー: ${errors}`);
}

main().catch(console.error);
