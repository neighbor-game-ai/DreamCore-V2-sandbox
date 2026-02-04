/**
 * V1→V2 ユーザー移行 Phase 2.5
 * マッピングテーブルを埋める（RLS無効化後に実行）
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

async function getAllUsers(supabase, label) {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data.users || data.users.length === 0) break;
    users.push(...data.users);
    console.log(`${label}: Page ${page}, total ${users.length}`);
    if (data.users.length < 1000) break;
    page++;
  }
  return users;
}

async function main() {
  console.log('=== マッピングテーブル作成 ===\n');

  // V1とV2のユーザーを取得
  const v1Users = await getAllUsers(v1Supabase, 'V1');
  const v2Users = await getAllUsers(v2Supabase, 'V2');

  console.log(`\nV1: ${v1Users.length}, V2: ${v2Users.length}`);

  // V2ユーザーをメールでインデックス
  const v2ByEmail = new Map();
  for (const u of v2Users) {
    if (u.email) v2ByEmail.set(u.email.toLowerCase(), u);
  }

  // マッピングを作成
  const mappings = [];
  let matched = 0;
  let notFound = 0;

  for (const v1User of v1Users) {
    if (!v1User.email) continue;
    const v2User = v2ByEmail.get(v1User.email.toLowerCase());
    if (v2User) {
      mappings.push({
        v1_user_id: v1User.id,
        v2_user_id: v2User.id,
        email: v1User.email,
        migration_status: 'completed',
        migrated_at: new Date().toISOString(),
        notes: v1User.id === v2User.id ? 'same_uuid' : 'migrated'
      });
      matched++;
    } else {
      notFound++;
    }
  }

  console.log(`\nマッチ: ${matched}, 未発見: ${notFound}`);

  // バッチでinsert
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const { error } = await v2Supabase
      .from('user_migration_map')
      .upsert(batch, { onConflict: 'v1_user_id' });

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`Inserted: ${inserted}/${mappings.length}`);
    }
  }

  console.log('\n=== 完了 ===');
  console.log(`マッピング登録: ${inserted}`);
}

main().catch(console.error);
