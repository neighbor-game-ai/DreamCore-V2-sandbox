/**
 * My Page - Game Creator (Nintendo × Kashiwa Sato Style)
 */

class MyPageApp {
  constructor() {
    this.sessionId = localStorage.getItem('sessionId');
    this.currentUser = null;
    this.visitorId = null;
    this.projects = [];

    // DOM elements
    this.displayNameEl = document.getElementById('displayName');
    this.gameCountEl = document.getElementById('gameCount');
    this.bioEl = document.getElementById('bio');
    this.gamesGridEl = document.getElementById('gamesGrid');
    this.backBtn = document.getElementById('backBtn');
    this.editBtn = document.getElementById('editBtn');
    this.logoutBtn = document.getElementById('logoutBtn');
  }

  async init() {
    if (!this.sessionId) {
      this.redirectToLogin();
      return;
    }

    const isValid = await this.checkSession();
    if (!isValid) {
      this.redirectToLogin();
      return;
    }

    this.setupListeners();
    await this.loadData();
  }

  async checkSession() {
    try {
      const response = await fetch(`/api/auth/me?sessionId=${this.sessionId}`);
      if (!response.ok) return false;
      const data = await response.json();
      this.currentUser = data.user;
      this.visitorId = data.user.visitorId;
      return true;
    } catch (e) {
      console.error('Session check failed:', e);
      return false;
    }
  }

  redirectToLogin() {
    window.location.href = '/';
  }

  setupListeners() {
    this.backBtn?.addEventListener('click', () => {
      window.location.href = '/';
    });

    this.editBtn?.addEventListener('click', () => {
      // TODO: Open edit profile modal
      alert('プロフィール編集機能は準備中です');
    });

    this.logoutBtn?.addEventListener('click', () => this.logout());

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
            // Already on profile
            break;
        }
      });
    });

    // Zapping button
    document.getElementById('navZappingBtn')?.addEventListener('click', () => {
      window.location.href = '/discover?zap=1';
    });
  }

  async loadData() {
    this.renderProfile();
    await this.loadProjects();
    this.renderGameCount();
    this.renderGamesGrid();
  }

  renderProfile() {
    if (!this.currentUser) return;

    if (this.displayNameEl) {
      this.displayNameEl.textContent = this.currentUser.displayName || this.currentUser.username;
    }

    // Bio (placeholder for now)
    if (this.bioEl) {
      const bio = this.currentUser.bio || '';
      this.bioEl.textContent = bio;
      this.bioEl.style.display = bio ? 'block' : 'none';
    }
  }

  async loadProjects() {
    try {
      const response = await fetch(`/api/projects?visitorId=${this.visitorId}`);
      if (response.ok) {
        const data = await response.json();
        this.projects = data.projects || [];
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  renderGameCount() {
    if (this.gameCountEl) {
      this.gameCountEl.textContent = this.projects.length;
    }
  }

  renderGamesGrid() {
    if (!this.gamesGridEl) return;

    // Calculate empty slots (show at least 3 empty slots to invite creation)
    const minEmptySlots = 3;
    const emptySlots = Math.max(minEmptySlots, 6 - this.projects.length);

    // Render game cases (physical package style)
    const gameCases = this.projects.map((game, index) => {
      // Build thumbnail URL from project ID
      const thumbnailUrl = `/api/projects/${game.id}/thumbnail`;
      const gameName = this.escapeHtml(game.name);
      const gameDesc = this.escapeHtml(game.description || '');

      return `
        <div class="mypage-game-case" data-project-id="${game.id}" style="animation-delay: ${index * 0.08}s">
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
            <div class="mypage-empty-case-text">新しいゲーム</div>
          </div>
        </div>
      `;
    }).join('');

    this.gamesGridEl.innerHTML = gameCases + emptyCases;

    // Add click handlers - play game with card insert animation
    this.gamesGridEl.querySelectorAll('.mypage-game-case').forEach(card => {
      card.addEventListener('click', () => {
        const projectId = card.dataset.projectId;
        if (projectId) {
          const thumbnailUrl = `/api/projects/${projectId}/thumbnail`;
          this.playCardInsertAnimation(projectId, thumbnailUrl);
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
      window.location.href = `/game/${this.visitorId}/${projectId}/`;
      return;
    }

    // Set thumbnail as card background
    card.style.backgroundImage = `url(${thumbnailUrl})`;

    // Start animation
    overlay.classList.add('active');

    // Navigate after animation
    setTimeout(() => {
      window.location.href = `/game/${this.visitorId}/${projectId}/`;
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

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': this.sessionId
        }
      });
    } catch (e) {
      console.error('Logout error:', e);
    }

    localStorage.removeItem('sessionId');
    localStorage.removeItem('visitorId');
    localStorage.removeItem('loginUsername');
    window.location.href = '/';
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  const app = new MyPageApp();
  app.init();
});
