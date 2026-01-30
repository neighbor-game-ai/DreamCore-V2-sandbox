#!/usr/bin/env node
/**
 * Add team subscription for a user (unlimited quota)
 * Usage: node scripts/add-team-subscription.js <email>
 */

require('dotenv').config();
const { supabaseAdmin } = require('../server/supabaseClient');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/add-team-subscription.js <email>');
  process.exit(1);
}

(async () => {
  try {
    // Get user by email
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) throw userError;

    const user = users.find(u => u.email === email);
    if (!user) {
      console.error('User not found:', email);
      process.exit(1);
    }

    console.log('User ID:', user.id);
    console.log('Email:', user.email);

    // Upsert subscription
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan: 'team',
        status: 'active',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    console.log('Subscription updated:', data);
    console.log('\nDone! User now has unlimited quota.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
