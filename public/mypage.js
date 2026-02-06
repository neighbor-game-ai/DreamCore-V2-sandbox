/**
 * My Page - Game Creator (Nintendo × Kashiwa Sato Style)
 * Updated for Supabase Auth
 */

class MyPageApp {
  constructor() {
    this.currentUser = null;
    this.userId = null;
    this.accessToken = null;
    this.projects = [];
    this.profile = null;

    // DOM elements
    this.displayNameEl = document.getElementById('displayName');
    this.gameCountEl = document.getElementById('gameCount');
    this.playCountEl = document.getElementById('playCount');
    this.likeCountEl = document.getElementById('likeCount');
    this.bioEl = document.getElementById('bio');
    this.gamesGridEl = document.getElementById('gamesGrid');
    this.backBtn = document.getElementById('backBtn');
    this.editBtn = document.getElementById('editBtn');
    this.shareBtn = document.getElementById('shareBtn');
    this.logoutBtn = document.getElementById('logoutBtn');
  }

  async init() {
    // Check authentication using Supabase Auth
    const session = await DreamCoreAuth.getSession();
    if (!session) {
      this.redirectToLogin();
      return;
    }

    // V2 Waitlist: Check access permission
    const { allowed, authError } = await DreamCoreAuth.checkAccess();
    if (authError) {
      window.location.href = '/login';  // Auth error → login page
      return;
    }
    if (!allowed) {
      window.location.href = '/waitlist';  // Not approved → waitlist
      return;
    }

    // No redirect - display profile directly on /mypage
    // Share button will generate /@username URL for sharing
    this.currentUser = session.user;
    this.userId = session.user.id;
    this.accessToken = session.access_token;

    this.setupListeners();
    await this.loadData();
  }

  redirectToLogin() {
    window.location.href = '/login';
  }

  setupListeners() {
    this.backBtn?.addEventListener('click', () => {
      window.location.href = '/create';
    });

    this.editBtn?.addEventListener('click', () => {
      const editor = new ProfileEditor();
      editor.open();
    });

    this.shareBtn?.addEventListener('click', () => this.shareProfile());

    this.logoutBtn?.addEventListener('click', () => this.logout());

    // Bottom navigation (shared module)
    setupBottomNav({ currentTab: 'profile' });
  }

  async loadData() {
    await this.loadProfile();
    await this.loadProjects();
    this.renderGameCount();
    this.renderGamesGrid();
  }

  async loadProfile() {
    try {
      const response = await DreamCoreAuth.authFetch('/api/users/me');
      if (response.ok) {
        this.profile = await response.json();
        this.renderProfile(this.profile);
        this.renderAvatar(this.profile);
      } else {
        // Fallback to auth user data
        this.renderProfile(null);
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
      this.renderProfile(null);
    }
  }

  renderProfile(profile) {
    if (this.displayNameEl) {
      this.displayNameEl.textContent = profile?.display_name ||
                                        this.currentUser?.user_metadata?.full_name ||
                                        this.currentUser?.email?.split('@')[0] ||
                                        DreamCoreI18n.t('mypage.defaultUser');
    }

    if (this.bioEl) {
      const bio = profile?.bio || '';
      this.bioEl.textContent = bio;

      // Show/hide container based on bio presence
      const bioContainer = document.getElementById('bioContainer');
      if (bioContainer) {
        bioContainer.style.display = bio ? '' : 'none';
      }

      // Setup "more" button for long bios
      this.setupBioExpand(bio);
    }

    // Render social links
    this.renderSocialLinks(profile?.social_links);
  }

  setupBioExpand(bio) {
    const container = document.getElementById('bioContainer');
    if (!container) return;

    // Remove existing more button
    const existingBtn = container.querySelector('.bio-more-btn');
    if (existingBtn) existingBtn.remove();

    // Only show "more" for longer bios (roughly > 2 lines worth)
    if (!bio || bio.length < 40) return;

    const moreBtn = document.createElement('button');
    moreBtn.className = 'bio-more-btn';
    moreBtn.textContent = DreamCoreI18n.t('button.more');
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = this.bioEl.classList.toggle('expanded');
      moreBtn.textContent = isExpanded ? DreamCoreI18n.t('button.less') : DreamCoreI18n.t('button.more');
    });
    container.appendChild(moreBtn);
  }

  renderSocialLinks(socialLinks) {
    const container = document.getElementById('socialLinks');
    if (!container) return;

    container.innerHTML = '';

    if (!socialLinks) {
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
      if (socialLinks[key] && isSafeUrl(socialLinks[key])) {
        const a = document.createElement('a');
        a.href = socialLinks[key];
        a.className = 'mypage-social-link';
        a.textContent = icon;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        container.appendChild(a);
        hasLinks = true;
      }
    }

    // Custom links
    if (socialLinks.custom && Array.isArray(socialLinks.custom)) {
      for (const item of socialLinks.custom) {
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

  renderAvatar(profile) {
    const avatarEl = document.getElementById('avatarContainer');
    if (!avatarEl) return;

    if (profile?.avatar_url) {
      avatarEl.innerHTML = `<img src="${this.escapeHtml(profile.avatar_url)}" alt="Avatar">`;
    }
  }

  async loadProjects() {
    try {
      // Get all published games (Play + CLI)
      const response = await DreamCoreAuth.authFetch('/api/my-published-games');
      if (response.ok) {
        const data = await response.json();
        // Normalize field names for rendering
        this.projects = (data.games || []).map(game => ({
          id: game.project_id || game.id,
          name: game.title,
          description: game.description,
          thumbnailUrl: game.thumbnail_url,
          publishedGameId: game.public_id,
          isCliGame: game.is_cli_game || false
        }));
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  renderGameCount() {
    if (this.gameCountEl) {
      this.gameCountEl.textContent = this.projects.length;
    }
    // TODO: Fetch actual plays/likes from API when available
    if (this.playCountEl) {
      this.playCountEl.textContent = '0';
    }
    if (this.likeCountEl) {
      this.likeCountEl.textContent = '0';
    }
  }

  renderGamesGrid() {
    if (!this.gamesGridEl) return;

    // Calculate empty slots (show at least 3 empty slots to invite creation)
    const minEmptySlots = 3;
    const emptySlots = Math.max(minEmptySlots, 6 - this.projects.length);

    // Render game cases (physical package style)
    const gameCases = this.projects.map((game, index) => {
      // Build thumbnail URL - CLI games use thumbnail_url directly, Play games can use API
      let thumbnailUrl = game.thumbnailUrl;
      if (!thumbnailUrl && !game.isCliGame && game.id) {
        thumbnailUrl = `/api/projects/${game.id}/thumbnail`;
      }
      // Default placeholder if no thumbnail available
      thumbnailUrl = thumbnailUrl || '/img/default-thumbnail.webp';
      const gameName = this.escapeHtml(game.name || 'Untitled');
      const gameDesc = this.escapeHtml(game.description || '');
      // Use publishedGameId for public game URL
      const gameId = game.publishedGameId;

      return `
        <div class="mypage-game-case" data-game-id="${gameId}" style="animation-delay: ${index * 0.08}s">
          <div class="mypage-case-visual">
            <img src="${thumbnailUrl}" alt="${gameName}" loading="lazy" onerror="this.onerror=null;this.classList.add('img-error')">
          </div>
          <div class="mypage-case-info">
            <div class="mypage-case-title">${gameName}</div>
            ${gameDesc ? `<div class="mypage-case-desc">${gameDesc}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Render empty case slots
    const emptyCases = Array(emptySlots).fill(null).map((_, index) => {
      return `
        <div class="mypage-empty-case" style="animation-delay: ${(this.projects.length + index) * 0.08}s">
          <div class="mypage-empty-case-visual">
            <div class="mypage-empty-case-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
          </div>
          <div class="mypage-case-info">
            <div class="mypage-empty-case-text">${DreamCoreI18n.t('editor.publishGame')}</div>
          </div>
        </div>
      `;
    }).join('');

    this.gamesGridEl.innerHTML = gameCases + emptyCases;

    // Add click handlers - open published game
    this.gamesGridEl.querySelectorAll('.mypage-game-case').forEach(card => {
      card.addEventListener('click', () => {
        const gameId = card.dataset.gameId;
        if (gameId) {
          window.location.href = `/game/${gameId}?from=mypage`;
        }
      });
    });

    // Add click handlers - empty cases go to create page
    this.gamesGridEl.querySelectorAll('.mypage-empty-case').forEach(slot => {
      slot.addEventListener('click', () => {
        window.location.href = '/create';
      });
    });

    // iOS-style carousel: scale cards based on position
    this.initCarousel();
  }

  playCardInsertAnimation(projectId, thumbnailUrl) {
    const overlay = document.getElementById('gameStartOverlay');
    const card = document.getElementById('gameStartCard');

    if (!overlay || !card) {
      window.location.href = `/play/${projectId}`;
      return;
    }

    // Set thumbnail as card background
    card.style.backgroundImage = `url(${thumbnailUrl})`;

    // Start animation
    overlay.classList.add('active');

    // Navigate after animation
    setTimeout(() => {
      window.location.href = `/play/${projectId}`;
    }, 800);
  }

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

        // Scale: 1.0 at center, 0.85 at edges
        const scale = Math.max(0.85, 1 - (distance / maxDistance) * 0.15);
        // Opacity: 1.0 at center, 0.6 at edges
        const opacity = Math.max(0.6, 1 - (distance / maxDistance) * 0.4);

        card.style.transform = `scale(${scale})`;
        card.style.opacity = opacity;
      });
    };

    container.addEventListener('scroll', updateCardScales, { passive: true });
    // Initial update
    requestAnimationFrame(updateCardScales);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async shareProfile() {
    // Construct share URL: prefer /@username, fallback to /u/{public_id}
    let shareUrl;
    if (this.profile?.username) {
      shareUrl = `${window.location.origin}/@${this.profile.username}`;
    } else if (this.profile?.public_id) {
      shareUrl = `${window.location.origin}/u/${this.profile.public_id}`;
    } else {
      shareUrl = window.location.href;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: DreamCoreI18n.t('mypage.shareProfileTitle', { name: this.displayNameEl?.textContent || DreamCoreI18n.t('mypage.defaultUser') }),
          url: shareUrl
        });
      } catch (e) {
        // User cancelled or error
        if (e.name !== 'AbortError') {
          this.copyToClipboard(shareUrl);
        }
      }
    } else {
      this.copyToClipboard(shareUrl);
    }
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      // Show brief feedback
      const btn = this.shareBtn;
      if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          btn.innerHTML = originalHTML;
        }, 1500);
      }
    });
  }

  async logout() {
    await DreamCoreAuth.signOut();
    window.location.href = '/login';
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  const app = new MyPageApp();
  app.init();
});
