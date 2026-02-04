/**
 * V1→V2 ユーザー移行 Phase 1 Step 1.2
 * V1-only ユーザーリストの作成
 *
 * 実行: node scripts/migration-step-1-2.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// V1 環境
const V1_URL = 'https://odqcczjoaznmfpiywmoj.supabase.co';
const V1_SERVICE_ROLE_KEY = process.env.V1_SUPABASE_SERVICE_ROLE_KEY;

// V2 環境（既存の .env から取得）
const V2_URL = process.env.SUPABASE_URL;
const V2_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!V1_SERVICE_ROLE_KEY) {
  console.error('Error: V1_SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  console.error('.env に追加してください:');
  console.error('V1_SUPABASE_SERVICE_ROLE_KEY=eyJ...');
  process.exit(1);
}

if (!V2_URL || !V2_SERVICE_ROLE_KEY) {
  console.error('Error: V2 Supabase の環境変数が設定されていません');
  process.exit(1);
}

const v1Supabase = createClient(V1_URL, V1_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const v2Supabase = createClient(V2_URL, V2_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function getAllUsers(supabase, label) {
  const users = [];
  let page = 1;
  const perPage = 1000;

  console.log(`\n${label} ユーザー取得中...`);

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      console.error(`Error fetching users (page ${page}):`, error.message);
      break;
    }

    if (!data.users || data.users.length === 0) {
      break;
    }

    users.push(...data.users);
    console.log(`  Page ${page}: ${data.users.length} users (total: ${users.length})`);

    if (data.users.length < perPage) {
      break;
    }

    page++;
  }

  return users;
}

async function main() {
  console.log('=== V1→V2 ユーザー移行 Phase 1 Step 1.2 ===');
  console.log('V1-only ユーザーリストの作成\n');

  // V1 ユーザー取得
  const v1Users = await getAllUsers(v1Supabase, 'V1');
  console.log(`V1 総ユーザー数: ${v1Users.length}`);

  // V2 ユーザー取得
  const v2Users = await getAllUsers(v2Supabase, 'V2');
  console.log(`V2 総ユーザー数: ${v2Users.length}`);

  // V2 のメールアドレスをセットに
  const v2Emails = new Set(v2Users.map(u => u.email?.toLowerCase()).filter(Boolean));

  // V1-only ユーザーを抽出
  const v1OnlyUsers = v1Users.filter(u => u.email && !v2Emails.has(u.email.toLowerCase()));
  const duplicateUsers = v1Users.filter(u => u.email && v2Emails.has(u.email.toLowerCase()));

  console.log('\n=== 結果 ===');
  console.log(`V1 総ユーザー: ${v1Users.length}`);
  console.log(`V2 総ユーザー: ${v2Users.length}`);
  console.log(`重複（V1とV2両方にいる）: ${duplicateUsers.length}`);
  console.log(`V1-only（移行対象）: ${v1OnlyUsers.length}`);

  // 認証方法の内訳
  const providerCounts = {};
  for (const user of v1OnlyUsers) {
    const provider = user.app_metadata?.provider || 'unknown';
    providerCounts[provider] = (providerCounts[provider] || 0) + 1;
  }

  console.log('\n=== V1-only ユーザーの認証方法 ===');
  for (const [provider, count] of Object.entries(providerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${provider}: ${count}`);
  }

  // 結果をファイルに保存（Phase 2 で使用）
  const fs = require('fs');
  const outputPath = '/Users/admin/DreamCore-V2-sandbox/scripts/v1-only-users.json';

  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    v1_total: v1Users.length,
    v2_total: v2Users.length,
    duplicate_count: duplicateUsers.length,
    v1_only_count: v1OnlyUsers.length,
    provider_breakdown: providerCounts,
    v1_only_users: v1OnlyUsers.map(u => ({
      id: u.id,
      email: u.email,
      provider: u.app_metadata?.provider || 'unknown',
      created_at: u.created_at,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata
    })),
    duplicate_users: duplicateUsers.map(u => ({
      v1_id: u.id,
      email: u.email,
      provider: u.app_metadata?.provider || 'unknown'
    }))
  }, null, 2));

  console.log(`\n結果を保存しました: ${outputPath}`);

  // サンプル出力
  console.log('\n=== サンプル（最初の5件） ===');
  for (const user of v1OnlyUsers.slice(0, 5)) {
    console.log(`  ${user.email} (${user.app_metadata?.provider || 'unknown'})`);
  }

  console.log('\n=== Phase 1 Step 1.2 完了 ===');
  console.log('次のステップ: Phase 2 (auth.users 移行)');
}

main().catch(console.error);
