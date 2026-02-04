/**
 * Public Profile Page
 * Unified TikTok/Instagram-style profile for both own and others' profiles.
 *
 * XSS Prevention: All user input uses textContent, never innerHTML with user data.
 * CSS Class Names: Matches mypage.js exactly (.mypage-case-visual, etc.)
 */

class ProfileApp {
  constructor() {
    this.profileUserId = null;
    this.profilePublicId = null;
    this.currentUser = null;
    this.isOwner = false;
    this.profileData = null;
    this.games = [];

    // DOM elements (same IDs as mypage.html)
    this.displayNameEl = document.getElementById('displayName');
    this.gameCountEl = document.getElementById('gameCount');
    this.playCountEl = document.getElementById('playCount');
    this.likeCountEl = document.getElementById('likeCount');
    this.bioEl = document.getElementById('bio');
    this.gamesGridEl = document.getElementById('gamesGrid');
  }

  async init() {
    // 1. Parse URL to determine profile lookup method
    // Supports: /@username and /u/:id (public_id or UUID)
    const pathname = window.location.pathname;
    let profileLookup = null;
    let isUsernameUrl = false;

    if (pathname.startsWith('/@')) {
      // /@username format
      const username = pathname.slice(2); // Remove "/@"
      if (!username) {
        return this.showError('ユーザーが見つかりません');
      }
      profileLookup = { type: 'username', value: username };
      isUsernameUrl = true;
    } else if (pathname.startsWith('/u/')) {
      // /u/:id format (public_id or UUID)
      const profileId = pathname.split('/')[2];
      if (!profileId) {
        return this.showError('ユーザーが見つかりません');
      }
      profileLookup = { type: 'id', value: profileId };
    } else {
      return this.showError('ユーザーが見つかりません');
    }

    // 2. Check current user (via auth.js)
    // ASSUMPTION: /api/config is publicly accessible (no auth required).
    // If /api/config fails, user is treated as "logged out" (graceful degradation).
    try {
      // Load Supabase first if needed
      if (typeof window.__loadSupabase === 'function') {
        await window.__loadSupabase();
      }

      if (typeof DreamCoreAuth !== 'undefined') {
        const session = await DreamCoreAuth.getSession();
        if (session) {
          this.currentUser = session.user;
        }
      }
    } catch (e) {
      console.log('[Profile] Not logged in or auth not loaded');
    }

    // 3. Fetch profile data
    try {
      let res;
      if (profileLookup.type === 'username') {
        // Fetch by username
        res = await fetch(`/api/users/username/${encodeURIComponent(profileLookup.value)}/public`);
      } else {
        // Fetch by id (public_id or UUID)
        res = await fetch(`/api/users/${profileLookup.value}/public`);
      }
      if (!res.ok) throw new Error('User not found');
      this.profileData = await res.json();
      this.profileUserId = this.profileData.id;
      this.profilePublicId = this.profileData.public_id;
    } catch (e) {
      return this.showError('ユーザーが見つかりません');
    }

    // 4. Normalize URL
    // - For /@username: keep as-is (this is the preferred format)
    // - For /u/:id: redirect to /@username if available, otherwise keep /u/{public_id}
    if (!isUsernameUrl) {
      // Currently on /u/:id URL
      if (this.profileData.username) {
        // Redirect to /@username (preferred URL)
        const newUrl = `/@${this.profileData.username}${window.location.search}${window.location.hash}`;
        history.replaceState(null, '', newUrl);
      } else if (this.profilePublicId && profileLookup.value !== this.profilePublicId) {
        // Normalize UUID to public_id
        const newUrl = `/u/${this.profilePublicId}${window.location.search}${window.location.hash}`;
        history.replaceState(null, '', newUrl);
      }
    }

    // 5. Check if owner
    this.isOwner = this.currentUser?.id === this.profileUserId;

    // 6. Render
    this.setupListeners();
    this.renderProfile();
    this.renderSocialLinks();
    this.renderActionButtons();
    await this.loadGames();
    this.renderGamesGrid();
    this.initCarousel();

    // 7. Owner-only UI
    if (this.isOwner) {
      const footer = document.getElementById('footerSection');
      if (footer) footer.style.display = '';
    }
  }

  setupListeners() {
    // Back button
    document.getElementById('backBtn')?.addEventListener('click', () => {
      if (document.referrer && document.referrer.includes(window.location.host)) {
        history.back();
      } else {
        window.location.href = '/';
      }
    });

    // Logout (owner only)
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      if (typeof DreamCoreAuth !== 'undefined') {
        await DreamCoreAuth.signOut();
      }
      window.location.href = '/';
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
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
            // If logged in and viewing another's profile, go to own profile
            if (this.currentUser?.id && !this.isOwner) {
              DreamCoreAuth.getMyProfileUrl().then(url => {
                window.location.href = url;
              });
            }
            // If viewing own profile, stay here
            break;
        }
      });
    });

    // Zapping button
    document.getElementById('navZappingBtn')?.addEventListener('click', () => {
      window.location.href = '/discover?zap=1';
    });
  }

  /**
   * Render profile info
   * XSS: All user data via textContent
   */
  renderProfile() {
    const profile = this.profileData;

    // Header title
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
      headerTitle.textContent = profile.display_name || 'プロフィール';
    }

    // Page title
    document.title = (profile.display_name || 'プロフィール') + ' - DreamCore';

    // Display name
    if (this.displayNameEl) {
      this.displayNameEl.textContent = profile.display_name || '名前未設定';
    }

    // Bio
    if (this.bioEl) {
      this.bioEl.textContent = profile.bio || '';
      const bioContainer = document.getElementById('bioContainer');
      if (bioContainer) {
        bioContainer.style.display = profile.bio ? '' : 'none';
      }
    }

    // Avatar
    if (profile.avatar_url) {
      const container = document.getElementById('avatarContainer');
      if (container) {
        container.innerHTML = '';
        const img = document.createElement('img');
        img.src = profile.avatar_url;
        img.alt = profile.display_name || 'Avatar';
        container.appendChild(img);
      }
    }
  }

  /**
   * Render social links
   * XSS: URL validation + textContent
   * Same implementation as mypage.js
   */
  renderSocialLinks() {
    const container = document.getElementById('socialLinks');
    if (!container) return;

    container.innerHTML = '';

    const links = this.profileData.social_links;
    if (!links) {
      container.style.display = 'none';
      return;
    }

    // URL safety check (XSS prevention)
    const isSafeUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        return false;
      }
    };

    const platforms = [
      { key: 'x', icon: '𝕏' },
      { key: 'youtube', icon: '▶' },
      { key: 'github', icon: '⌘' },
      { key: 'tiktok', icon: '♪' },
      { key: 'instagram', icon: '📷' }
    ];

    let hasLinks = false;

    // Platform links
    for (const { key, icon } of platforms) {
      if (links[key] && isSafeUrl(links[key])) {
        const a = document.createElement('a');
        a.href = links[key];
        a.className = 'mypage-social-link';
        a.textContent = icon;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        container.appendChild(a);
        hasLinks = true;
      }
    }

    // Custom links
    if (links.custom && Array.isArray(links.custom)) {
      for (const item of links.custom) {
        if (item.label && isSafeUrl(item.url)) {
          const a = document.createElement('a');
          a.href = item.url;
          a.className = 'mypage-social-link mypage-social-custom';
          a.textContent = item.label;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          container.appendChild(a);
          hasLinks = true;
        }
      }
    }

    container.style.display = hasLinks ? 'flex' : 'none';
  }

  /**
   * Render action buttons (dynamic based on owner status)
   */
  renderActionButtons() {
    const container = document.getElementById('actionButtons');
    if (!container) return;
    container.innerHTML = '';

    if (this.isOwner) {
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'mypage-btn-edit';
      editBtn.textContent = 'プロフィールを編集';
      editBtn.addEventListener('click', () => this.openProfileEditor());
      container.appendChild(editBtn);
    } else {
      // Follow button
      const followBtn = document.createElement('button');
      followBtn.className = 'mypage-btn-follow';
      followBtn.textContent = 'フォローする';
      followBtn.addEventListener('click', () => {
        alert('フォロー機能は近日公開予定です');
      });
      container.appendChild(followBtn);
    }

    // Share button (common)
    const shareBtn = document.createElement('button');
    shareBtn.className = 'mypage-btn-share';
    shareBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>';
    shareBtn.addEventListener('click', () => this.shareProfile());
    container.appendChild(shareBtn);
  }

  /**
   * Lazy-load ProfileEditor
   */
  async openProfileEditor() {
    if (typeof ProfileEditor === 'undefined') {
      await this.loadScript('/js/modules/profile.js');
    }
    const editor = new ProfileEditor();
    editor.open();
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Share profile
   * Uses public_id, falls back to UUID if not available.
   *
   * TEMPORARY SPEC (暫定仕様):
   * - Legacy users may not have public_id yet
   * - UUID fallback ensures sharing works for all users
   * - When public_id becomes mandatory, this fallback can be removed
   * - Review needed when: public_id migration is complete
   */
  shareProfile() {
    // Prefer /@username, fallback to /u/{public_id}, then UUID
    let shareUrl;
    if (this.profileData?.username) {
      shareUrl = `${window.location.origin}/@${this.profileData.username}`;
    } else if (this.profilePublicId) {
      shareUrl = `${window.location.origin}/u/${this.profilePublicId}`;
    } else if (this.profileUserId) {
      shareUrl = `${window.location.origin}/u/${this.profileUserId}`;
    } else {
      return;
    }
    const shareData = {
      title: `${this.profileData.display_name || 'ユーザー'} - DreamCore`,
      url: shareUrl,
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        // Show checkmark on share button
        const btn = document.querySelector('.mypage-btn-share');
        if (btn) {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
        }
      });
    }
  }

  async loadGames() {
    try {
      const res = await fetch(`/api/users/${this.profileUserId}/games`);
      if (res.ok) {
        const data = await res.json();
        this.games = data.games || [];

        // Update stats
        if (this.gameCountEl) {
          this.gameCountEl.textContent = this.games.length;
        }

        // Calculate total plays and likes
        let totalPlays = 0;
        let totalLikes = 0;
        for (const game of this.games) {
          totalPlays += game.play_count || 0;
          totalLikes += game.like_count || 0;
        }
        if (this.playCountEl) {
          this.playCountEl.textContent = totalPlays;
        }
        if (this.likeCountEl) {
          this.likeCountEl.textContent = totalLikes;
        }
      }
    } catch (e) {
      console.error('Failed to load games:', e);
    }
  }

  /**
   * Render games grid
   * CSS class names: matches mypage.js exactly
   * XSS: title via textContent
   */
  renderGamesGrid() {
    if (!this.gamesGridEl) return;
    this.gamesGridEl.innerHTML = '';

    // No games (for non-owner)
    if (this.games.length === 0 && !this.isOwner) {
      const empty = document.createElement('div');
      empty.className = 'mypage-games-empty';
      empty.textContent = 'まだゲームがありません';
      this.gamesGridEl.appendChild(empty);
      return;
    }

    // Game cards
    this.games.forEach((game, index) => {
      const card = this.createGameCard(game, index);
      this.gamesGridEl.appendChild(card);
    });

    // Empty slots for owner
    if (this.isOwner) {
      const emptySlots = Math.max(0, 3 - this.games.length);
      for (let i = 0; i < emptySlots; i++) {
        const slot = this.createEmptySlot(this.games.length + i);
        this.gamesGridEl.appendChild(slot);
      }
    }
  }

  /**
   * Create game card
   * CSS: .mypage-game-case, .mypage-case-visual, .mypage-case-title (matches mypage.js)
   * Thumbnail: uses project_id (not game.id which is published_games.id)
   */
  createGameCard(game, index) {
    const card = document.createElement('div');
    card.className = 'mypage-game-case';
    card.dataset.gameId = game.public_id;
    card.style.animationDelay = `${index * 0.08}s`;

    // Thumbnail (.mypage-case-visual)
    const visual = document.createElement('div');
    visual.className = 'mypage-case-visual';

    // Use project_id for thumbnail API (not game.id)
    // Fall back to default if project_id is null
    let thumbnailUrl = game.thumbnail_url;
    if (!thumbnailUrl && !game.is_cli_game && game.project_id) {
      thumbnailUrl = `/api/projects/${game.project_id}/thumbnail`;
    }
    thumbnailUrl = thumbnailUrl || '/img/default-thumbnail.webp';

    const img = document.createElement('img');
    img.src = thumbnailUrl;
    img.alt = game.title || 'Game';
    img.loading = 'lazy';
    img.onerror = function() { this.onerror = null; this.classList.add('img-error'); };
    visual.appendChild(img);
    card.appendChild(visual);

    // Info (.mypage-case-info > .mypage-case-title)
    const info = document.createElement('div');
    info.className = 'mypage-case-info';

    const title = document.createElement('div');
    title.className = 'mypage-case-title';
    title.textContent = game.title || '無題';
    info.appendChild(title);

    card.appendChild(info);

    // Click handler (same as mypage.js: /game/${public_id})
    card.addEventListener('click', () => {
      if (game.public_id) {
        window.location.href = `/game/${game.public_id}?from=profile`;
      }
    });

    return card;
  }

  /**
   * Create empty slot
   * CSS: .mypage-empty-case (matches mypage.js)
   */
  createEmptySlot(index) {
    const slot = document.createElement('div');
    slot.className = 'mypage-empty-case';
    slot.style.animationDelay = `${index * 0.08}s`;

    const visual = document.createElement('div');
    visual.className = 'mypage-empty-case-visual';

    const icon = document.createElement('div');
    icon.className = 'mypage-empty-case-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    visual.appendChild(icon);
    slot.appendChild(visual);

    const info = document.createElement('div');
    info.className = 'mypage-case-info';
    const text = document.createElement('div');
    text.className = 'mypage-empty-case-text';
    text.textContent = 'ゲームを公開';
    info.appendChild(text);
    slot.appendChild(info);

    slot.addEventListener('click', () => {
      window.location.href = '/create';
    });

    return slot;
  }

  /**
   * Initialize carousel (same as mypage.js)
   */
  initCarousel() {
    const container = this.gamesGridEl;
    if (!container) return;

    const updateCardScales = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.left + containerRect.width / 2;

      container.querySelectorAll('.mypage-game-case, .mypage-empty-case').forEach(card => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.left + cardRect.width / 2;
        const distance = Math.abs(containerCenter - cardCenter);
        const maxDistance = containerRect.width / 2;

        const scale = Math.max(0.85, 1 - (distance / maxDistance) * 0.15);
        const opacity = Math.max(0.6, 1 - (distance / maxDistance) * 0.4);

        card.style.transform = `scale(${scale})`;
        card.style.opacity = opacity;
      });
    };

    container.addEventListener('scroll', updateCardScales, { passive: true });
    requestAnimationFrame(updateCardScales);
  }

  /**
   * Show error message
   * XSS: Uses textContent (never innerHTML with user data)
   */
  showError(message) {
    const container = document.getElementById('mypageView');
    if (container) {
      container.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 24px; text-align: center;';

      const p = document.createElement('p');
      p.style.cssText = 'color: #525252; margin-bottom: 16px;';
      p.textContent = message;
      wrapper.appendChild(p);

      const a = document.createElement('a');
      a.href = '/';
      a.style.cssText = 'color: #FF3B30; text-decoration: none;';
      a.textContent = '← ホームに戻る';
      wrapper.appendChild(a);

      container.appendChild(wrapper);
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const app = new ProfileApp();
  app.init();
});
