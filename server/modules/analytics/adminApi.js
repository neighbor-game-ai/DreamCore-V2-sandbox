/**
 * Analytics Admin API
 *
 * Admin-only endpoints for analytics dashboard.
 * Mounted at /api/analytics/admin
 *
 * Uses database RPCs for aggregation to avoid PostgREST 1000-row limit.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../authMiddleware');
const { basicAuthAdmin, requireAdmin } = require('./middleware');
const { supabaseAdmin } = require('../../supabaseClient');

/**
 * GET /api/analytics/admin/summary
 * Main analytics dashboard data
 */
router.get('/summary', basicAuthAdmin, authenticate, requireAdmin, async (req, res) => {
  try {
    // Parse period parameters
    const { period = '7d', start, end } = req.query;
    const now = new Date();
    let periodStart, periodEnd;

    if (period === 'custom' && start && end) {
      periodStart = new Date(start);
      periodEnd = new Date(end);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (period === '30d') {
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 29);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      // Default: 7d
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 6);
      periodStart.setHours(0, 0, 0, 0);
    }

    const periodStartISO = periodStart.toISOString();
    const periodEndISO = periodEnd.toISOString();

    // Calculate week/month boundaries for WAU/MAU
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Today boundary
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Run all queries in parallel using RPC functions
    const [
      // DAU array using RPC
      dauArrayResult,
      // WAU using RPC
      wauResult,
      // MAU using RPC
      mauResult,
      // Session stats using RPC
      sessionStatsResult,
      // Event counts using RPC
      eventCountsResult,
      // Funnel using RPC
      funnelResult,
      // Country breakdown using RPC
      countryResult,
      // Device breakdown using RPC
      deviceResult,
      // Top pages using RPC
      topPagesResult,
      // Top games using RPC
      topGamesResult,
      // New vs returning using RPC
      newReturningResult,
      // Total registered users (simple count)
      totalUsersResult,
      // Total published games (simple count)
      totalGamesResult,
      // Today's new users (simple count)
      todayNewUsersResult,
      // Today's new games (simple count)
      todayNewGamesResult,
      // AI metrics (simple counts - won't hit 1000 limit in normal usage)
      aiRequestsResult,
      aiResponsesResult,
      suggestionShownResult,
      suggestionClickResult,
    ] = await Promise.all([
      // DAU array
      supabaseAdmin.rpc('analytics_dau_array', {
        p_start_date: periodStart.toISOString().split('T')[0],
        p_end_date: periodEnd.toISOString().split('T')[0],
      }),

      // WAU
      supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: weekStart.toISOString(),
        p_end_ts: null,
      }),

      // MAU
      supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: monthStart.toISOString(),
        p_end_ts: null,
      }),

      // Session stats
      supabaseAdmin.rpc('analytics_session_stats', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
      }),

      // Event counts
      supabaseAdmin.rpc('analytics_event_counts', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
        p_event_types: ['page_view', 'game_play', 'game_create', 'game_publish', 'error'],
      }),

      // Funnel
      supabaseAdmin.rpc('analytics_funnel', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
      }),

      // Country breakdown
      supabaseAdmin.rpc('analytics_by_country', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
        p_limit: 10,
      }),

      // Device breakdown
      supabaseAdmin.rpc('analytics_by_device', {
        p_since_ts: periodStartISO,
      }),

      // Top pages
      supabaseAdmin.rpc('analytics_top_pages', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
        p_limit: 10,
      }),

      // Top games
      supabaseAdmin.rpc('analytics_top_games', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
        p_limit: 10,
      }),

      // New vs returning
      supabaseAdmin.rpc('analytics_new_vs_returning', {
        p_start_ts: periodStartISO,
        p_end_ts: periodEndISO,
      }),

      // Total registered users
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true }),

      // Total published games
      supabaseAdmin
        .from('published_games')
        .select('id', { count: 'exact', head: true }),

      // Today's new users
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString()),

      // Today's new games
      supabaseAdmin
        .from('published_games')
        .select('id', { count: 'exact', head: true })
        .gte('published_at', todayStart.toISOString()),

      // AI metrics
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'ai_request')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'ai_response')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'suggestion_shown')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'suggestion_click')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),
    ]);

    // ========== Process DAU Array ==========
    const dauArray = (dauArrayResult.data || []).map(row => ({
      date: row.date,
      count: row.count,
    }));

    // ========== Process Event Counts ==========
    const eventCountsMap = new Map();
    (eventCountsResult.data || []).forEach(row => {
      eventCountsMap.set(row.event_type, Number(row.count));
    });

    const eventCounts = {
      page_view: eventCountsMap.get('page_view') || 0,
      game_play: eventCountsMap.get('game_play') || 0,
      game_create: eventCountsMap.get('game_create') || 0,
      game_publish: eventCountsMap.get('game_publish') || 0,
      error: eventCountsMap.get('error') || 0,
    };

    // ========== Process Funnel ==========
    const funnelData = funnelResult.data?.[0] || {};
    const funnel = {
      visited: funnelData.visited || 0,
      created: funnelData.created || 0,
      published: funnelData.published || 0,
      played: funnelData.played || 0,
    };

    // ========== Process Segments ==========
    const byCountry = (countryResult.data || []).map(row => ({
      country: row.country,
      userCount: row.user_count,
    }));

    const byDevice = (deviceResult.data || []).map(row => ({
      os: row.os,
      userCount: row.user_count,
    }));

    const newReturningData = newReturningResult.data?.[0] || {};
    const newVsReturning = {
      newUsers: newReturningData.new_users || 0,
      returningUsers: newReturningData.returning_users || 0,
    };

    // ========== Process Popular Content ==========
    const topPages = (topPagesResult.data || []).map(row => ({
      path: row.path,
      count: Number(row.count),
    }));

    const topGames = (topGamesResult.data || []).map(row => ({
      gameId: row.game_id,
      playCount: Number(row.play_count),
    }));

    // ========== Process Session Stats ==========
    const sessionStats = sessionStatsResult.data?.[0] || {};
    const totalSessions = Number(sessionStats.total_sessions) || 0;
    const avgSessionDuration = sessionStats.avg_duration_sec || 0;

    // ========== Build Response ==========
    res.json({
      metadata: {
        generated_at: new Date().toISOString(),
        period_start: periodStartISO,
        period_end: periodEndISO,
        period,
      },
      kpis: {
        dau: dauArray,
        wau: wauResult.data || 0,
        mau: mauResult.data || 0,
        totalSessions,
        avgSessionDuration,
        totalUsers: totalUsersResult.count || 0,
        totalGames: totalGamesResult.count || 0,
        todayNewUsers: todayNewUsersResult.count || 0,
        todayNewGames: todayNewGamesResult.count || 0,
      },
      aiMetrics: {
        requests: aiRequestsResult.count || 0,
        responses: aiResponsesResult.count || 0,
        suggestionsShown: suggestionShownResult.count || 0,
        suggestionsClicked: suggestionClickResult.count || 0,
        suggestionClickRate: (suggestionShownResult.count || 0) > 0
          ? Math.round(((suggestionClickResult.count || 0) / (suggestionShownResult.count || 0)) * 100)
          : 0,
      },
      eventCounts,
      funnel,
      segments: {
        byCountry,
        byDevice,
        newVsReturning,
      },
      popularContent: {
        topPages,
        topGames,
      },
    });
  } catch (err) {
    console.error('[Analytics Admin] Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

/**
 * GET /api/analytics/admin/retention
 * Retention analytics data
 */
router.get('/retention', basicAuthAdmin, authenticate, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    // Week boundaries
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all RPC queries in parallel
    const [
      // Day retention using RPC
      dayRetentionResult,
      // Lifecycle using RPC
      lifecycleResult,
      // DAU
      dauResult,
      // WAU
      wauResult,
      // MAU
      mauResult,
    ] = await Promise.all([
      supabaseAdmin.rpc('analytics_day_retention', {
        p_days: [1, 3, 7, 14, 30],
      }),

      supabaseAdmin.rpc('analytics_lifecycle'),

      supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: today.toISOString(),
        p_end_ts: null,
      }),

      supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: thisWeekStart.toISOString(),
        p_end_ts: null,
      }),

      supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: monthStart.toISOString(),
        p_end_ts: null,
      }),
    ]);

    // ========== Process Day Retention ==========
    const dayRetention = {};
    (dayRetentionResult.data || []).forEach(row => {
      dayRetention[`d${row.day_n}`] = parseFloat(row.retention_rate) || 0;
    });

    // ========== Process Lifecycle ==========
    const lifecycleData = lifecycleResult.data?.[0] || {};
    const lifecycle = {
      new: lifecycleData.new_users || 0,
      active: lifecycleData.active_users || 0,
      atRisk: lifecycleData.at_risk_users || 0,
      dormant: lifecycleData.dormant_users || 0,
      resurrected: lifecycleData.resurrected_users || 0,
    };

    // ========== Active Users ==========
    const dau = dauResult.data || 0;
    const wau = wauResult.data || 0;
    const mau = mauResult.data || 0;

    // ========== Stickiness ==========
    const currentStickiness = mau > 0 ? (dau / mau) * 100 : 0;

    // Stickiness trend requires day-by-day calculation
    // For now, get last 7 days DAU
    const stickinessTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data: dayDau } = await supabaseAdmin.rpc('analytics_active_users', {
        p_start_ts: dayStart.toISOString(),
        p_end_ts: dayEnd.toISOString(),
      });

      const dayStickiness = mau > 0 ? ((dayDau || 0) / mau) * 100 : 0;
      stickinessTrend.push({
        date: dayStart.toISOString().split('T')[0],
        value: dayStickiness,
      });
    }

    // ========== Cohort Retention ==========
    // Cohort calculation still needs raw data for now
    // This could be optimized with another RPC function in the future
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: sessionsData } = await supabaseAdmin
      .from('user_sessions')
      .select('user_id, started_at')
      .gte('started_at', sixtyDaysAgo.toISOString())
      .not('user_id', 'is', null)
      .order('started_at', { ascending: true })
      .limit(10000); // Higher limit for cohort analysis

    const userFirstSession = new Map();
    const userSessionDays = new Map();

    (sessionsData || []).forEach(row => {
      const userId = row.user_id;
      const sessionDate = new Date(row.started_at);
      sessionDate.setHours(0, 0, 0, 0);
      const dayKey = sessionDate.toISOString().split('T')[0];

      if (!userFirstSession.has(userId)) {
        userFirstSession.set(userId, sessionDate);
      }

      if (!userSessionDays.has(userId)) {
        userSessionDays.set(userId, new Set());
      }
      userSessionDays.get(userId).add(dayKey);
    });

    const cohorts = [];
    for (let i = 0; i < 8; i++) {
      const cohortStart = new Date(thisWeekStart);
      cohortStart.setDate(cohortStart.getDate() - (i * 7));
      const cohortEnd = new Date(cohortStart);
      cohortEnd.setDate(cohortEnd.getDate() + 7);

      const cohortUsers = [];
      userFirstSession.forEach((firstDate, userId) => {
        if (firstDate >= cohortStart && firstDate < cohortEnd) {
          cohortUsers.push(userId);
        }
      });

      if (cohortUsers.length > 0) {
        const weeklyRetention = [];
        for (let w = 0; w <= 4; w++) {
          const weekStartDate = new Date(cohortStart);
          weekStartDate.setDate(weekStartDate.getDate() + (w * 7));
          const weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekEndDate.getDate() + 7);

          if (weekEndDate > now) {
            weeklyRetention.push(null);
            continue;
          }

          let activeInWeek = 0;
          cohortUsers.forEach(userId => {
            const sessionDays = userSessionDays.get(userId);
            let foundInWeek = false;
            sessionDays.forEach(dayKey => {
              const d = new Date(dayKey);
              if (d >= weekStartDate && d < weekEndDate) {
                foundInWeek = true;
              }
            });
            if (foundInWeek) activeInWeek++;
          });

          weeklyRetention.push((activeInWeek / cohortUsers.length) * 100);
        }

        cohorts.push({
          cohort: cohortStart.toISOString().split('T')[0],
          cohortSize: cohortUsers.length,
          week0: weeklyRetention[0],
          week1: weeklyRetention[1],
          week2: weeklyRetention[2],
          week3: weeklyRetention[3],
          week4: weeklyRetention[4],
        });
      }
    }

    res.json({
      generated_at: new Date().toISOString(),
      dayRetention,
      cohortRetention: cohorts,
      stickiness: {
        current: currentStickiness,
        trend: stickinessTrend,
      },
      activeUsers: { dau, wau, mau },
      lifecycle,
    });
  } catch (err) {
    console.error('[Analytics Admin] Retention error:', err);
    res.status(500).json({ error: 'Failed to fetch retention analytics' });
  }
});

module.exports = router;
