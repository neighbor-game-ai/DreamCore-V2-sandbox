/**
 * V1→V2 ユーザー移行 Phase 3 (改善版)
 * - リトライ＋指数バックオフ
 * - 失敗IDを保存
 * - 冪等性: 既に更新済みはスキップ
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

const FAILED_IDS_PATH = '/Users/admin/DreamCore-V2-sandbox/scripts/failed_profile_ids.json';
const MAX_RETRIES = 5;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// リトライ対象のエラー
function isRetryableError(error) {
  const msg = error?.message || '';
  return msg.includes('500') ||
         msg.includes('502') ||
         msg.includes('503') ||
         msg.includes('504') ||
         msg.includes('429') ||
         msg.includes('Internal server error') ||
         msg.includes('timeout');
}

// 指数バックオフ付きリトライ
async function updateWithRetry(v2UserId, displayName) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { error } = await v2Supabase
      .from('users')
      .update({ display_name: displayName })
      .eq('id', v2UserId);

    if (!error) return { success: true };

    if (isRetryableError(error)) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
      console.log(`  Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`);
      await sleep(delay);
    } else {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

async function main() {
  console.log('=== V1→V2 ユーザー移行 Phase 3 (改善版) ===\n');

  // V1 profiles 取得
  console.log('V1 profiles 取得中...');
  const { data: v1Profiles, error: profilesError } = await v1Supabase
    .from('profiles')
    .select('user_id, username, display_name');

  if (profilesError) {
    console.error('V1 profiles 取得エラー:', profilesError.message);
    process.exit(1);
  }
  console.log(`V1 profiles: ${v1Profiles.length}\n`);

  // マッピングテーブル取得
  console.log('マッピングテーブル取得中...');
  const mappings = [];
  let offset = 0;
  while (true) {
    const { data, error } = await v2Supabase
      .from('user_migration_map')
      .select('v1_user_id, v2_user_id')
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    mappings.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const mapByV1 = new Map();
  for (const m of mappings) {
    mapByV1.set(m.v1_user_id, m.v2_user_id);
  }
  console.log(`マッピング: ${mappings.length}\n`);

  // 未マッピングのV1ユーザーをログ
  const unmappedV1 = v1Profiles.filter(p => !mapByV1.has(p.user_id));
  if (unmappedV1.length > 0) {
    console.log(`未マッピング (${unmappedV1.length}件):`);
    unmappedV1.forEach(p => console.log(`  - ${p.user_id} (${p.username || 'no username'})`));
    console.log('');
  }

  // V2で既にdisplay_nameが設定済みのユーザーを取得（冪等性）
  console.log('V2 users 取得中（冪等性チェック用）...');
  const v2UserIds = [...new Set(mappings.map(m => m.v2_user_id))];
  const alreadyUpdated = new Set();

  // バッチで取得
  for (let i = 0; i < v2UserIds.length; i += 500) {
    const batch = v2UserIds.slice(i, i + 500);
    const { data } = await v2Supabase
      .from('users')
      .select('id, display_name')
      .in('id', batch);

    if (data) {
      for (const u of data) {
        // display_nameがemailパターンでなければ既に設定済みとみなす
        if (u.display_name && !u.display_name.includes('@')) {
          alreadyUpdated.add(u.id);
        }
      }
    }
  }
  console.log(`既に更新済み: ${alreadyUpdated.size}\n`);

  // 更新処理
  console.log('V2 users 更新中...\n');
  const failedIds = [];
  let updated = 0;
  let skipped = 0;
  let alreadyDone = 0;

  for (let i = 0; i < v1Profiles.length; i++) {
    const profile = v1Profiles[i];
    const v2UserId = mapByV1.get(profile.user_id);

    if (!v2UserId) {
      skipped++;
      continue;
    }

    if (alreadyUpdated.has(v2UserId)) {
      alreadyDone++;
      continue;
    }

    const displayName = profile.display_name || profile.username;
    if (!displayName) {
      skipped++;
      continue;
    }

    const result = await updateWithRetry(v2UserId, displayName);

    if (result.success) {
      updated++;
      if (updated % 500 === 0) {
        console.log(`Updated: ${updated} (processed: ${i + 1}/${v1Profiles.length})`);
      }
    } else {
      failedIds.push({
        v1_user_id: profile.user_id,
        v2_user_id: v2UserId,
        display_name: displayName,
        error: result.error
      });
    }

    // レート制限回避: 100msごとに1リクエスト
    await sleep(100);
  }

  // 失敗IDを保存
  if (failedIds.length > 0) {
    fs.writeFileSync(FAILED_IDS_PATH, JSON.stringify(failedIds, null, 2));
    console.log(`\n失敗ID保存: ${FAILED_IDS_PATH}`);
  }

  console.log(`\n=== Phase 3 完了 ===`);
  console.log(`更新成功: ${updated}`);
  console.log(`既に更新済み: ${alreadyDone}`);
  console.log(`スキップ: ${skipped}`);
  console.log(`失敗: ${failedIds.length}`);
}

main().catch(console.error);
