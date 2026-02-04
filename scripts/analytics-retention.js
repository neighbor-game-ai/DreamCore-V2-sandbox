#!/usr/bin/env node
/**
 * Analytics Data Retention Script
 *
 * Deletes old analytics data based on retention policy:
 * - Events: 180 days
 * - Sessions: 365 days
 *
 * Usage:
 *   node scripts/analytics-retention.js
 *   node scripts/analytics-retention.js --dry-run
 *
 * Schedule with cron:
 *   0 3 * * * cd /path/to/project && node scripts/analytics-retention.js >> /var/log/analytics-retention.log 2>&1
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const RETENTION_DAYS = {
  events: 180,
  sessions: 365
};

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`[${new Date().toISOString()}] Starting analytics retention cleanup${dryRun ? ' (DRY RUN)' : ''}...`);

  // Calculate cutoff dates
  const eventsCutoff = new Date();
  eventsCutoff.setDate(eventsCutoff.getDate() - RETENTION_DAYS.events);

  const sessionsCutoff = new Date();
  sessionsCutoff.setDate(sessionsCutoff.getDate() - RETENTION_DAYS.sessions);

  // Count records to be deleted
  const { count: eventsCount, error: eventsCountError } = await supabase
    .from('user_events')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', eventsCutoff.toISOString());

  if (eventsCountError) {
    console.error('Error counting events:', eventsCountError);
    process.exit(1);
  }

  const { count: sessionsCount, error: sessionsCountError } = await supabase
    .from('user_sessions')
    .select('*', { count: 'exact', head: true })
    .lt('created_at', sessionsCutoff.toISOString());

  if (sessionsCountError) {
    console.error('Error counting sessions:', sessionsCountError);
    process.exit(1);
  }

  console.log(`  Events to delete (>180 days): ${eventsCount || 0}`);
  console.log(`  Sessions to delete (>365 days): ${sessionsCount || 0}`);

  if (dryRun) {
    console.log('  Dry run - no data deleted');
    return;
  }

  // Delete old events
  if (eventsCount > 0) {
    const { error: eventsDeleteError } = await supabase
      .from('user_events')
      .delete()
      .lt('created_at', eventsCutoff.toISOString());

    if (eventsDeleteError) {
      console.error('Error deleting events:', eventsDeleteError);
      process.exit(1);
    }
    console.log(`  Deleted ${eventsCount} events`);
  }

  // Delete old sessions
  if (sessionsCount > 0) {
    const { error: sessionsDeleteError } = await supabase
      .from('user_sessions')
      .delete()
      .lt('created_at', sessionsCutoff.toISOString());

    if (sessionsDeleteError) {
      console.error('Error deleting sessions:', sessionsDeleteError);
      process.exit(1);
    }
    console.log(`  Deleted ${sessionsCount} sessions`);
  }

  console.log(`[${new Date().toISOString()}] Cleanup completed successfully`);
}

main().catch(err => {
  console.error('Retention script error:', err);
  process.exit(1);
});
