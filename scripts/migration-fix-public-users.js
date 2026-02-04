/**
 * auth.users に対応する public.users レコードを作成
 * Admin API で作成したユーザーはトリガーが発火しないため
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('=== public.users 修正 ===\n');

  // V2 auth.users 取得
  console.log('V2 auth.users 取得中...');
  const authUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await v2Supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data.users || data.users.length === 0) break;
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`auth.users: ${authUsers.length}\n`);

  // V1 profiles 取得（display_name用）
  console.log('V1 profiles 取得中...');
  const { data: v1Profiles } = await v1Supabase.from('profiles').select('user_id, display_name, username');
  const v1ProfileMap = new Map();
  if (v1Profiles) {
    for (const p of v1Profiles) {
      v1ProfileMap.set(p.user_id, p);
    }
  }
  console.log(`V1 profiles: ${v1Profiles?.length || 0}\n`);

  // マッピング取得
  console.log('マッピング取得中...');
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
  const v1ToV2 = new Map();
  const v2ToV1 = new Map();
  for (const m of mappings) {
    v1ToV2.set(m.v1_user_id, m.v2_user_id);
    v2ToV1.set(m.v2_user_id, m.v1_user_id);
  }
  console.log(`マッピング: ${mappings.length}\n`);

  // 既存の public.users 取得
  console.log('既存 public.users 取得中...');
  const { data: existingUsers } = await v2Supabase.from('users').select('id');
  const existingIds = new Set(existingUsers?.map(u => u.id) || []);
  console.log(`既存 public.users: ${existingIds.size}\n`);

  // 不足分を作成
  const toInsert = [];
  for (const authUser of authUsers) {
    if (existingIds.has(authUser.id)) continue;

    // V1のdisplay_nameを取得
    const v1UserId = v2ToV1.get(authUser.id);
    const v1Profile = v1UserId ? v1ProfileMap.get(v1UserId) : null;
    const displayName = v1Profile?.display_name || v1Profile?.username || authUser.email?.split('@')[0] || 'User';

    toInsert.push({
      id: authUser.id,
      email: authUser.email,
      display_name: displayName
    });
  }

  console.log(`作成対象: ${toInsert.length}\n`);

  if (toInsert.length === 0) {
    console.log('作成するレコードはありません');
    return;
  }

  // バッチでinsert
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);

    const { error } = await v2Supabase
      .from('users')
      .insert(batch);

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      // 個別にリトライ
      for (const user of batch) {
        const { error: singleError } = await v2Supabase.from('users').insert(user);
        if (singleError) {
          console.error(`  Failed: ${user.email} - ${singleError.message}`);
          errors++;
        } else {
          inserted++;
        }
        await sleep(50);
      }
    } else {
      inserted += batch.length;
      console.log(`Inserted: ${inserted}/${toInsert.length}`);
    }

    await sleep(100);
  }

  console.log(`\n=== 完了 ===`);
  console.log(`作成成功: ${inserted}`);
  console.log(`エラー: ${errors}`);

  // 検証
  const { count } = await v2Supabase.from('users').select('*', { count: 'exact', head: true });
  console.log(`\n最終 public.users 件数: ${count}`);
}

main().catch(console.error);
