/**
 * 移行ユーザーを user_access テーブルに approved で登録
 * user_access の PK は email
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const V2_URL = process.env.SUPABASE_URL;
const V2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const v2Supabase = createClient(V2_URL, V2_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('=== user_access 登録 ===\n');

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

  // 既存の user_access 取得（ページネーションで全件取得）
  console.log('既存 user_access 取得中...');
  const existingAccess = [];
  let offset = 0;
  while (true) {
    const { data, error } = await v2Supabase
      .from('user_access')
      .select('email')
      .range(offset, offset + 999);
    if (error) {
      console.error('user_access 取得エラー:', error.message);
      return;
    }
    if (!data || data.length === 0) break;
    existingAccess.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // lowercase で正規化（case mismatch 防止）
  const existingEmails = new Set(existingAccess.map(u => u.email?.toLowerCase()));
  console.log(`既存 user_access: ${existingEmails.size}\n`);

  // V2 public.users から display_name を取得（ページネーションで全件取得）
  console.log('public.users から display_name 取得中...');
  const userMap = new Map();
  offset = 0;
  while (true) {
    const { data, error } = await v2Supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    for (const u of data) {
      userMap.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`public.users: ${userMap.size}\n`);

  // 登録対象を抽出
  const toInsert = [];
  for (const authUser of authUsers) {
    if (!authUser.email) continue;
    // lowercase で比較（case mismatch 防止）
    if (existingEmails.has(authUser.email.toLowerCase())) continue;

    const userData = userMap.get(authUser.id) || {};
    toInsert.push({
      email: authUser.email,
      status: 'approved',
      display_name: userData.display_name || authUser.email.split('@')[0],
      avatar_url: userData.avatar_url || null,
      approved_at: new Date().toISOString()
    });
  }

  console.log(`登録対象: ${toInsert.length}\n`);

  if (toInsert.length === 0) {
    console.log('登録するレコードはありません');
    return;
  }

  // バッチでinsert
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);

    // upsert + ignoreDuplicates で冪等性確保（既存を上書きしない）
    const { error } = await v2Supabase
      .from('user_access')
      .upsert(batch, { onConflict: 'email', ignoreDuplicates: true });

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      // 個別にリトライ
      for (const user of batch) {
        const { error: singleError } = await v2Supabase
          .from('user_access')
          .upsert(user, { onConflict: 'email', ignoreDuplicates: true });
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
  console.log(`登録成功: ${inserted}`);
  console.log(`エラー: ${errors}`);

  // 検証
  const { count } = await v2Supabase.from('user_access').select('*', { count: 'exact', head: true });
  console.log(`\n最終 user_access 件数: ${count}`);
}

main().catch(console.error);
