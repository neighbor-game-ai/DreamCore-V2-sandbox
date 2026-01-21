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

    // Calculate minimum slots to show (at least 9, or next multiple of 3)
    const minSlots = 9;
    const gameCount = this.projects.length;
    const totalSlots = Math.max(minSlots, Math.ceil(gameCount / 3) * 3 + 3);
    const emptySlots = totalSlots - gameCount;

    // Render game cards
    const gameCards = this.projects.map((game, index) => {
      const thumbnailUrl = game.thumbnailUrl || null;
      const thumbnailHtml = thumbnailUrl
        ? `<img src="${thumbnailUrl}" alt="${this.escapeHtml(game.name)}" loading="lazy">`
        : `<div class="mypage-game-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>`;

      return `
        <div class="mypage-game-card" data-project-id="${game.id}" style="animation-delay: ${index * 0.05}s">
          ${thumbnailHtml}
        </div>
      `;
    }).join('');

    // Render empty slots with enticing "add" design
    const emptySlotCards = Array(emptySlots).fill(null).map((_, index) => {
      return `
        <div class="mypage-empty-slot" style="animation-delay: ${(gameCount + index) * 0.05}s">
          <div class="mypage-empty-slot-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <span class="mypage-empty-slot-text">つくる</span>
        </div>
      `;
    }).join('');

    this.gamesGridEl.innerHTML = gameCards + emptySlotCards;

    // Add click handlers - play game
    this.gamesGridEl.querySelectorAll('.mypage-game-card').forEach(card => {
      card.addEventListener('click', () => {
        const projectId = card.dataset.projectId;
        if (projectId) {
          window.location.href = `/game/${this.visitorId}/${projectId}/`;
        }
      });
    });

    // Add click handlers - empty slots go to create page
    this.gamesGridEl.querySelectorAll('.mypage-empty-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        window.location.href = '/create';
      });
    });
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
