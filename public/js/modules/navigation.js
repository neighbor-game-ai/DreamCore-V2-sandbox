/**
 * navigation.js - Shared bottom navigation handler
 *
 * Consolidates duplicated tab-switching logic from mypage.js, notifications.js, profile.js.
 * Each page calls setupBottomNav() with currentTab to prevent redundant reloads,
 * and an optional onProfile callback for custom profile tab behavior.
 */

/**
 * @param {Object} [options]
 * @param {string} [options.currentTab] - The tab identifier of the current page
 *   ('discover'|'create'|'notifications'|'profile'). Clicking this tab is a no-op.
 * @param {function} [options.onProfile] - Custom handler for profile tab click.
 *   Takes precedence over currentTab check for the profile tab.
 *   If omitted, navigates to /@username via DreamCoreAuth.getMyProfileUrl().
 */
function setupBottomNav(options) {
  var opts = options || {};
  var currentTab = opts.currentTab || null;

  document.querySelectorAll('.nav-item[data-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.dataset.tab;

      // Profile tab: custom handler takes precedence over currentTab check
      if (tab === 'profile') {
        if (typeof opts.onProfile === 'function') {
          opts.onProfile();
        } else if (tab === currentTab) {
          // no-op: already on profile
        } else if (typeof DreamCoreAuth !== 'undefined') {
          DreamCoreAuth.getMyProfileUrl().then(function(url) {
            window.location.href = url;
          });
        } else {
          window.location.href = '/mypage';
        }
        return;
      }

      // Other tabs: skip if already on this page
      if (tab === currentTab) return;

      switch (tab) {
        case 'discover':
          window.location.href = '/discover';
          break;
        case 'create':
          window.location.href = '/create';
          break;
        case 'notifications':
          window.location.href = '/notifications';
          break;
      }
    });
  });

  // Zapping button
  var zappingBtn = document.getElementById('navZappingBtn');
  if (zappingBtn) {
    zappingBtn.addEventListener('click', function() {
      window.location.href = '/discover?zap=1';
    });
  }
}
