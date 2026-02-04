/**
 * Analytics Admin API
 *
 * Admin-only endpoints for analytics dashboard.
 * Mounted at /api/analytics/admin
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

    // Run all queries in parallel
    const [
      totalSessionsResult,
      avgDurationResult,
      pageViewsResult,
      gamePlayResult,
      gameCreateResult,
      gamePublishResult,
      errorsResult,
      dauEventsResult,
      wauEventsResult,
      mauEventsResult,
      visitedUsersResult,
      createdUsersResult,
      publishedUsersResult,
      playedUsersResult,
      countryResult,
      deviceOsResult,
      firstSessionUsersResult,
      topPagesResult,
      topGamesResult,
      totalUsersResult,
      totalGamesResult,
      todayNewUsersResult,
      todayNewGamesResult,
      aiRequestsResult,
      aiResponsesResult,
      suggestionShownResult,
      suggestionClickResult,
    ] = await Promise.all([
      // Total sessions in period
      supabaseAdmin
        .from('user_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', periodStartISO)
        .lte('started_at', periodEndISO),

      // Average session duration
      supabaseAdmin
        .from('user_sessions')
        .select('duration_sec')
        .gte('started_at', periodStartISO)
        .lte('started_at', periodEndISO)
        .not('duration_sec', 'is', null)
        .gt('duration_sec', 0),

      // Page view count
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'page_view')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      // Game play count
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'game_play')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      // Game create count
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'game_create')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      // Game publish count
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'game_publish')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      // Error count
      supabaseAdmin
        .from('user_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'error')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

      // DAU events
      supabaseAdmin
        .from('user_events')
        .select('user_id, event_ts')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO)
        .not('user_id', 'is', null),

      // WAU events
      supabaseAdmin
        .from('user_events')
        .select('user_id')
        .gte('event_ts', weekStart.toISOString())
        .not('user_id', 'is', null),

      // MAU events
      supabaseAdmin
        .from('user_events')
        .select('user_id')
        .gte('event_ts', monthStart.toISOString())
        .not('user_id', 'is', null),

      // Funnel: Users who visited
      supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .gte('started_at', periodStartISO)
        .lte('started_at', periodEndISO)
        .not('user_id', 'is', null),

      // Funnel: Users who created
      supabaseAdmin
        .from('user_events')
        .select('user_id')
        .eq('event_type', 'game_create')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO)
        .not('user_id', 'is', null),

      // Funnel: Users who published
      supabaseAdmin
        .from('user_events')
        .select('user_id')
        .eq('event_type', 'game_publish')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO)
        .not('user_id', 'is', null),

      // Funnel: Users who played
      supabaseAdmin
        .from('user_events')
        .select('user_id')
        .eq('event_type', 'game_play')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO)
        .not('user_id', 'is', null),

      // Country breakdown
      supabaseAdmin
        .from('user_sessions')
        .select('country, user_id')
        .gte('started_at', periodStartISO)
        .lte('started_at', periodEndISO)
        .not('country', 'is', null),

      // Device OS breakdown
      supabaseAdmin
        .from('user_devices')
        .select('os, user_id')
        .gte('last_seen_at', periodStartISO),

      // First session users
      supabaseAdmin
        .from('user_sessions')
        .select('user_id, started_at')
        .gte('started_at', periodStartISO)
        .lte('started_at', periodEndISO)
        .not('user_id', 'is', null)
        .order('started_at', { ascending: true }),

      // Top pages
      supabaseAdmin
        .from('user_events')
        .select('path')
        .eq('event_type', 'page_view')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO)
        .not('path', 'is', null),

      // Top games
      supabaseAdmin
        .from('user_events')
        .select('properties')
        .eq('event_type', 'game_play')
        .gte('event_ts', periodStartISO)
        .lte('event_ts', periodEndISO),

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
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),

      // Today's new games
      supabaseAdmin
        .from('published_games')
        .select('id', { count: 'exact', head: true })
        .gte('published_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),

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

    // ========== Process KPIs ==========
    const dauByDate = new Map();
    const numDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < numDays; i++) {
      const d = new Date(periodStart);
      d.setDate(d.getDate() + i);
      dauByDate.set(d.toISOString().split('T')[0], new Set());
    }

    (dauEventsResult.data || []).forEach(row => {
      const dateKey = row.event_ts.split('T')[0];
      if (dauByDate.has(dateKey)) {
        dauByDate.get(dateKey).add(row.user_id);
      }
    });

    const dauArray = Array.from(dauByDate.entries()).map(([date, users]) => ({
      date,
      count: users.size,
    }));

    const wau = new Set((wauEventsResult.data || []).map(r => r.user_id)).size;
    const mau = new Set((mauEventsResult.data || []).map(r => r.user_id)).size;
    const totalSessions = totalSessionsResult.count || 0;

    const durations = (avgDurationResult.data || []).map(r => r.duration_sec);
    const avgSessionDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // ========== Process Event Counts ==========
    const eventCounts = {
      page_view: pageViewsResult.count || 0,
      game_play: gamePlayResult.count || 0,
      game_create: gameCreateResult.count || 0,
      game_publish: gamePublishResult.count || 0,
      error: errorsResult.count || 0,
    };

    // ========== Process Funnel ==========
    const funnel = {
      visited: new Set((visitedUsersResult.data || []).map(r => r.user_id)).size,
      created: new Set((createdUsersResult.data || []).map(r => r.user_id)).size,
      published: new Set((publishedUsersResult.data || []).map(r => r.user_id)).size,
      played: new Set((playedUsersResult.data || []).map(r => r.user_id)).size,
    };

    // ========== Process Segments ==========
    // By country
    const countryMap = new Map();
    (countryResult.data || []).forEach(row => {
      const country = row.country || 'Unknown';
      if (!countryMap.has(country)) countryMap.set(country, new Set());
      if (row.user_id) countryMap.get(country).add(row.user_id);
    });
    const byCountry = Array.from(countryMap.entries())
      .map(([country, users]) => ({ country, userCount: users.size }))
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, 10);

    // By device OS
    const osMap = new Map();
    (deviceOsResult.data || []).forEach(row => {
      const os = row.os || 'Unknown';
      if (!osMap.has(os)) osMap.set(os, new Set());
      if (row.user_id) osMap.get(os).add(row.user_id);
    });
    const byDevice = Array.from(osMap.entries())
      .map(([os, users]) => ({ os, userCount: users.size }))
      .sort((a, b) => b.userCount - a.userCount);

    // New vs returning users
    const userFirstSession = new Map();
    (firstSessionUsersResult.data || []).forEach(row => {
      if (row.user_id && !userFirstSession.has(row.user_id)) {
        userFirstSession.set(row.user_id, row.started_at);
      }
    });

    const usersInPeriod = Array.from(userFirstSession.keys());
    let newUsers = 0;
    let returningUsers = 0;

    if (usersInPeriod.length > 0) {
      const { data: firstSessionsEver } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id, started_at')
        .in('user_id', usersInPeriod.slice(0, 1000))
        .order('started_at', { ascending: true });

      const actualFirstSession = new Map();
      (firstSessionsEver || []).forEach(row => {
        if (row.user_id && !actualFirstSession.has(row.user_id)) {
          actualFirstSession.set(row.user_id, new Date(row.started_at));
        }
      });

      usersInPeriod.forEach(userId => {
        const firstEver = actualFirstSession.get(userId);
        if (firstEver && firstEver >= periodStart && firstEver <= periodEnd) {
          newUsers++;
        } else {
          returningUsers++;
        }
      });
    }

    // ========== Process Popular Content ==========
    const pageCountMap = new Map();
    (topPagesResult.data || []).forEach(row => {
      const count = pageCountMap.get(row.path) || 0;
      pageCountMap.set(row.path, count + 1);
    });
    const topPages = Array.from(pageCountMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const gameCountMap = new Map();
    (topGamesResult.data || []).forEach(row => {
      const gameId = row.properties?.game_id || row.properties?.gameId;
      if (gameId) {
        const count = gameCountMap.get(gameId) || 0;
        gameCountMap.set(gameId, count + 1);
      }
    });
    const topGames = Array.from(gameCountMap.entries())
      .map(([gameId, playCount]) => ({ gameId, playCount }))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);

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
        wau,
        mau,
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
        newVsReturning: { newUsers, returningUsers },
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

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const twoWeeksAgoStart = new Date(lastWeekStart);
    twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get sessions for retention calculation
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: sessionsData } = await supabaseAdmin
      .from('user_sessions')
      .select('user_id, started_at')
      .gte('started_at', sixtyDaysAgo.toISOString())
      .not('user_id', 'is', null)
      .order('started_at', { ascending: true });

    // Calculate first session date per user
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

    // Calculate Day N retention rates
    const retentionDays = [1, 3, 7, 14, 30];
    const dayRetention = {};

    retentionDays.forEach(n => {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - n);

      let eligibleUsers = 0;
      let retainedUsers = 0;

      userFirstSession.forEach((firstDate, userId) => {
        if (firstDate <= cutoff) {
          eligibleUsers++;
          const sessionDays = userSessionDays.get(userId);
          const targetDate = new Date(firstDate);
          targetDate.setDate(targetDate.getDate() + n);
          const targetKey = targetDate.toISOString().split('T')[0];

          if (sessionDays.has(targetKey)) {
            retainedUsers++;
          }
        }
      });

      dayRetention[`d${n}`] = eligibleUsers > 0 ? (retainedUsers / eligibleUsers) * 100 : 0;
    });

    // Cohort retention (last 8 weeks)
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
          week4: weeklyRetention[4]
        });
      }
    }

    // Active users
    const { data: dauData } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .gte('event_ts', today.toISOString())
      .not('user_id', 'is', null);

    const dau = new Set((dauData || []).map(r => r.user_id)).size;

    const { data: wauData } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .gte('event_ts', thisWeekStart.toISOString())
      .not('user_id', 'is', null);

    const wau = new Set((wauData || []).map(r => r.user_id)).size;

    const { data: mauData } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .gte('event_ts', monthStart.toISOString())
      .not('user_id', 'is', null);

    const mau = new Set((mauData || []).map(r => r.user_id)).size;

    // Stickiness
    const currentStickiness = mau > 0 ? (dau / mau) * 100 : 0;

    // Stickiness trend (last 7 days)
    const stickinessTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayDau = new Set();
      (sessionsData || []).forEach(row => {
        const sessionDate = new Date(row.started_at);
        if (sessionDate >= dayStart && sessionDate < dayEnd) {
          dayDau.add(row.user_id);
        }
      });

      const dayStickiness = mau > 0 ? (dayDau.size / mau) * 100 : 0;
      stickinessTrend.push({
        date: dayStart.toISOString().split('T')[0],
        value: dayStickiness
      });
    }

    // Lifecycle segments
    const { data: lastWeekData } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .gte('event_ts', lastWeekStart.toISOString())
      .lt('event_ts', thisWeekStart.toISOString())
      .not('user_id', 'is', null);

    const lastWeekUsers = new Set((lastWeekData || []).map(r => r.user_id));
    const thisWeekUsers = new Set((wauData || []).map(r => r.user_id));

    const { data: twoWeeksAgoData } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .gte('event_ts', twoWeeksAgoStart.toISOString())
      .lt('event_ts', lastWeekStart.toISOString())
      .not('user_id', 'is', null);

    const twoWeeksAgoUsers = new Set((twoWeeksAgoData || []).map(r => r.user_id));

    let newUsers = 0;
    let activeUsers = 0;
    let atRiskUsers = 0;
    let dormantUsers = 0;
    let resurrectedUsers = 0;

    // New: First session this week
    userFirstSession.forEach((firstDate, userId) => {
      if (firstDate >= thisWeekStart) {
        newUsers++;
      }
    });

    // Active: Active this week AND last week (not new)
    thisWeekUsers.forEach(userId => {
      const firstDate = userFirstSession.get(userId);
      if (firstDate && firstDate < thisWeekStart && lastWeekUsers.has(userId)) {
        activeUsers++;
      }
    });

    // At Risk: Active last week but NOT this week
    lastWeekUsers.forEach(userId => {
      if (!thisWeekUsers.has(userId)) {
        atRiskUsers++;
      }
    });

    // Dormant: Not active this week or last week, but had sessions before
    userFirstSession.forEach((firstDate, userId) => {
      if (!thisWeekUsers.has(userId) && !lastWeekUsers.has(userId) && firstDate < lastWeekStart) {
        dormantUsers++;
      }
    });

    // Resurrected: Active this week, was dormant
    thisWeekUsers.forEach(userId => {
      const firstDate = userFirstSession.get(userId);
      if (firstDate && firstDate < lastWeekStart && !lastWeekUsers.has(userId)) {
        resurrectedUsers++;
      }
    });

    res.json({
      generated_at: new Date().toISOString(),
      dayRetention,
      cohortRetention: cohorts,
      stickiness: {
        current: currentStickiness,
        trend: stickinessTrend
      },
      activeUsers: { dau, wau, mau },
      lifecycle: {
        new: newUsers,
        active: activeUsers,
        atRisk: atRiskUsers,
        dormant: dormantUsers,
        resurrected: resurrectedUsers
      }
    });
  } catch (err) {
    console.error('[Analytics Admin] Retention error:', err);
    res.status(500).json({ error: 'Failed to fetch retention analytics' });
  }
});

module.exports = router;
