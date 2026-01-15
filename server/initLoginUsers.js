/**
 * Initialize login users for invite-only access
 * Run this script to create the pre-defined users
 */

const db = require('./database');

// Invited users (ID only, no password required)
const INVITED_USERS = [
  'tanakasan',
  'sumiyoshi',
  'hamamiya',
  'ishida',
  'suemaru',
  'gigabit',
  'gimu',
  'rtaro',
  'wadasan',
  'nullsensei',
  'kinopeee',
  'kazuki',
  'kumagai',
  'notef',
];

const initLoginUsers = () => {
  console.log('Initializing login users...\n');

  let created = 0;
  let skipped = 0;

  for (const username of INVITED_USERS) {
    const normalizedUsername = username.trim().toLowerCase();

    // Check if user already exists
    const existing = db.getLoginUserByUsername(normalizedUsername);
    if (existing) {
      console.log(`  [SKIP] ${normalizedUsername} already exists`);
      skipped++;
      continue;
    }

    // Create the user (password not used, just set empty)
    try {
      const newUser = db.createLoginUser(normalizedUsername, '', normalizedUsername);
      console.log(`  [CREATE] ${normalizedUsername} (ID: ${newUser.id})`);
      created++;
    } catch (error) {
      console.error(`  [ERROR] Failed to create ${normalizedUsername}:`, error.message);
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);

  // Display all users
  console.log('\n=== Registered Users ===\n');
  const allUsers = db.getAllLoginUsers();
  for (const u of allUsers) {
    console.log(`- ${u.username}`);
  }
};

// Run if executed directly
if (require.main === module) {
  initLoginUsers();
}

module.exports = { initLoginUsers, INVITED_USERS };
