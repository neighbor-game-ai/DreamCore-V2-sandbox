/**
 * My Page - Game Creator
 */

class MyPageApp {
  constructor() {
    this.sessionId = localStorage.getItem('gameCreatorSessionId');
    this.currentUser = null;
    this.visitorId = null;
    this.projects = [];

    // DOM elements
    this.displayNameEl = document.getElementById('displayName');
    this.usernameEl = document.getElementById('username');
    this.statGamesEl = document.getElementById('statGames');
    this.statPublicEl = document.getElementById('statPublic');
    this.statAssetsEl = document.getElementById('statAssets');
    this.gamesListEl = document.getElementById('gamesList');
    this.backBtn = document.getElementById('backBtn');
    this.viewAllBtn = document.getElementById('viewAllBtn');
    this.logoutBtn = document.getElementById('logoutBtn');
  }

  async init() {
    // Check authentication
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
      if (!response.ok) {
        return false;
      }
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

    this.viewAllBtn?.addEventListener('click', () => {
      window.location.href = '/';
    });

    this.logoutBtn?.addEventListener('click', () => this.logout());
  }

  async loadData() {
    this.renderProfile();
    await Promise.all([
      this.loadProjects(),
      this.loadAssetCount()
    ]);
    this.renderStats();
    this.renderGamesList();
  }

  renderProfile() {
    if (!this.currentUser) return;

    if (this.displayNameEl) {
      this.displayNameEl.textContent = this.currentUser.displayName || this.currentUser.username;
    }
    if (this.usernameEl) {
      this.usernameEl.textContent = `@${this.currentUser.username}`;
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

  async loadAssetCount() {
    try {
      const response = await fetch(`/api/assets?visitorId=${this.visitorId}`);
      if (response.ok) {
        const data = await response.json();
        this.assetCount = data.assets?.length || 0;
      }
    } catch (e) {
      console.error('Failed to load assets:', e);
      this.assetCount = 0;
    }
  }

  renderStats() {
    const totalGames = this.projects.length;
    const publicGames = this.projects.filter(p => p.isPublic).length;

    if (this.statGamesEl) {
      this.statGamesEl.textContent = totalGames;
    }
    if (this.statPublicEl) {
      this.statPublicEl.textContent = publicGames;
    }
    if (this.statAssetsEl) {
      this.statAssetsEl.textContent = this.assetCount || 0;
    }
  }

  renderGamesList() {
    if (!this.gamesListEl) return;

    if (this.projects.length === 0) {
      this.gamesListEl.innerHTML = `
        <div class="mypage-games-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <p>まだゲームがありません</p>
        </div>
      `;
      return;
    }

    // Show first 5 games
    const recentGames = this.projects.slice(0, 5);

    this.gamesListEl.innerHTML = recentGames.map(game => {
      const date = new Date(game.updatedAt || game.createdAt);
      const formattedDate = this.formatDate(date);
      const statusClass = game.isPublic ? 'public' : 'private';
      const statusText = game.isPublic ? '公開中' : '非公開';

      return `
        <div class="mypage-game-item" data-project-id="${game.id}">
          <div class="mypage-game-thumbnail">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
          <div class="mypage-game-info">
            <div class="mypage-game-name">${this.escapeHtml(game.name)}</div>
            <div class="mypage-game-date">${formattedDate}</div>
          </div>
          <span class="mypage-game-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');

    // Add click handlers
    this.gamesListEl.querySelectorAll('.mypage-game-item').forEach(item => {
      item.addEventListener('click', () => {
        const projectId = item.dataset.projectId;
        if (projectId) {
          window.location.href = `/project/${projectId}`;
        }
      });
    });
  }

  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今日';
    if (days === 1) return '昨日';
    if (days < 7) return `${days}日前`;

    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric'
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

    localStorage.removeItem('gameCreatorSessionId');
    window.location.href = '/';
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  const app = new MyPageApp();
  app.init();
});
