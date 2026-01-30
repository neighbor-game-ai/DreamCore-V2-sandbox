/**
 * Quota Service for DreamCore V2
 *
 * Manages usage quotas for free/pro/team plans.
 * Uses Supabase DB functions for atomic quota consumption.
 */

const { supabaseAdmin } = require('./supabaseClient');
const { TIER_LIMITS } = require('./config');

/**
 * Get user's subscription plan
 * @param {string} userId - User ID
 * @returns {Promise<string>} Plan name ('free', 'pro', 'team')
 */
async function getUserPlan(userId) {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single();

  if (!data || data.status !== 'active') return 'free';
  return data.plan;
}

/**
 * Try to consume project creation quota
 * @param {string} userId - User ID
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number}>}
 */
async function tryConsumeProjectQuota(userId) {
  const plan = await getUserPlan(userId);
  const limit = TIER_LIMITS[plan].dailyProjectCreations;

  const { data, error } = await supabaseAdmin.rpc('try_consume_quota', {
    p_user_id: userId,
    p_field: 'projects_created',
    p_limit: limit
  });

  if (error) throw error;

  const row = data[0];
  return {
    allowed: row.allowed,
    used: row.current_count,
    limit,
    remaining: limit === -1 ? -1 : Math.max(0, limit - row.current_count)
  };
}

/**
 * Try to consume message sending quota
 * @param {string} userId - User ID
 * @returns {Promise<{allowed: boolean, used: number, limit: number, remaining: number}>}
 */
async function tryConsumeMessageQuota(userId) {
  const plan = await getUserPlan(userId);
  const limit = TIER_LIMITS[plan].dailyMessages;

  const { data, error } = await supabaseAdmin.rpc('try_consume_quota', {
    p_user_id: userId,
    p_field: 'messages_sent',
    p_limit: limit
  });

  if (error) throw error;

  const row = data[0];
  return {
    allowed: row.allowed,
    used: row.current_count,
    limit,
    remaining: limit === -1 ? -1 : Math.max(0, limit - row.current_count)
  };
}

/**
 * Get current quota information for a user
 * @param {string} userId - User ID
 * @returns {Promise<{projects: object, messages: object, plan: string}>}
 */
async function getQuotaInfo(userId) {
  const plan = await getUserPlan(userId);
  const limits = TIER_LIMITS[plan];

  const { data, error } = await supabaseAdmin.rpc('get_quota', { p_user_id: userId });

  if (error) throw error;

  const row = data[0] || { projects_created: 0, messages_sent: 0 };

  return {
    projects: {
      used: row.projects_created,
      limit: limits.dailyProjectCreations,
      remaining: limits.dailyProjectCreations === -1 ? -1 : Math.max(0, limits.dailyProjectCreations - row.projects_created)
    },
    messages: {
      used: row.messages_sent,
      limit: limits.dailyMessages,
      remaining: limits.dailyMessages === -1 ? -1 : Math.max(0, limits.dailyMessages - row.messages_sent)
    },
    plan
  };
}

module.exports = {
  getUserPlan,
  tryConsumeProjectQuota,
  tryConsumeMessageQuota,
  getQuotaInfo
};
