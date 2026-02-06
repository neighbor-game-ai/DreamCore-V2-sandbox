/**
 * navigation.js - Shared bottom navigation handler
 *
 * Consolidates duplicated tab-switching logic from mypage.js, notifications.js, profile.js.
 * Each page calls setupBottomNav() with an optional profileHandler callback for custom behavior.
 */

/**
 * @param {Object} [options]
 * @param {function} [options.onProfile] - Custom handler for profile tab click.
 *   If omitted, navigates to /@username via DreamCoreAuth.getMyProfileUrl().
 */
function setupBottomNav(options) {
  var opts = options || {};

  document.querySelectorAll('.nav-item[data-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.dataset.tab;
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
        case 'profile':
          if (typeof opts.onProfile === 'function') {
            opts.onProfile();
          } else if (typeof DreamCoreAuth !== 'undefined') {
            DreamCoreAuth.getMyProfileUrl().then(function(url) {
              window.location.href = url;
            });
          } else {
            window.location.href = '/mypage';
          }
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
