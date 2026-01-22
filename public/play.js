/**
 * Play Screen - Game Creator
 * Updated for Supabase Auth
 */

class PlayApp {
  constructor() {
    this.projectId = null;
    this.gameData = null;
    this.accessToken = null;

    // DOM elements
    this.gameFrame = document.getElementById('gameFrame');
    this.backBtn = document.getElementById('backBtn');
    this.likeBtn = document.getElementById('likeBtn');
    this.likeCount = document.getElementById('likeCount');
    this.commentBtn = document.getElementById('commentBtn');
    this.infoBtn = document.getElementById('infoBtn');
    this.zappingBtn = document.getElementById('zappingBtn');
    this.createBtn = document.getElementById('createBtn');
    this.shareBtn = document.getElementById('shareBtn');

    // Bottom sheets
    this.sheetOverlay = document.getElementById('sheetOverlay');
    this.infoSheet = document.getElementById('infoSheet');
    this.commentSheet = document.getElementById('commentSheet');

    // Info sheet elements
    this.gameTitle = document.getElementById('gameTitle');
    this.gameCreator = document.getElementById('gameCreator');
    this.gameDescription = document.getElementById('gameDescription');
    this.gameTags = document.getElementById('gameTags');
  }

  async init() {
    // Get project ID from URL
    const pathParts = window.location.pathname.split('/');
    this.projectId = pathParts[2]; // /play/:projectId

    if (!this.projectId) {
      window.location.href = '/discover';
      return;
    }

    // Get session for authenticated access
    const session = await DreamCoreAuth.getSession();
    if (session) {
      this.accessToken = session.access_token;
    }

    await this.loadGameData();
    this.loadGame();
    this.setupListeners();
  }

  async loadGameData() {
    try {
      // For Phase 1, only owner can access - use authenticated API
      if (this.accessToken) {
        const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}`);
        if (response.ok) {
          const project = await response.json();
          const session = await DreamCoreAuth.getSession();
          this.gameData = {
            id: project.id,
            title: project.name,
            description: project.description || '',
            creatorId: session.user.id,
            creatorName: session.user.user_metadata?.full_name ||
                         session.user.email?.split('@')[0] ||
                         '自分',
            likes: 0,
            tags: []
          };
          this.updateUI();
          return;
        }
      }

      // If not authenticated or not owner, show error
      console.error('Unable to load game data - authentication required');
    } catch (e) {
      console.error('Failed to load game data:', e);
    }
  }

  updateUI() {
    if (!this.gameData) return;

    document.title = `${this.gameData.title || 'ゲーム'} - ゲームクリエイター`;

    if (this.gameTitle) {
      this.gameTitle.textContent = this.gameData.title || 'タイトルなし';
    }
    if (this.gameCreator) {
      this.gameCreator.textContent = this.gameData.creatorName || '不明';
    }
    if (this.gameDescription) {
      this.gameDescription.textContent = this.gameData.description || '説明はありません';
    }
    if (this.likeCount) {
      this.likeCount.textContent = this.gameData.likes || 0;
    }
    if (this.gameTags && this.gameData.tags) {
      const tags = Array.isArray(this.gameData.tags)
        ? this.gameData.tags
        : JSON.parse(this.gameData.tags || '[]');
      this.gameTags.innerHTML = tags.map(tag =>
        `<span class="play-tag">${this.escapeHtml(tag)}</span>`
      ).join('');
    }
  }

  loadGame() {
    if (!this.gameData || !this.gameData.creatorId || !this.accessToken) {
      console.error('Cannot load game: missing creatorId or accessToken');
      return;
    }

    // Load game with access_token for authentication
    const gameUrl = `/game/${this.gameData.creatorId}/${this.projectId}/index.html?access_token=${encodeURIComponent(this.accessToken)}`;
    this.gameFrame.src = gameUrl;
  }

  setupListeners() {
    // Back button
    this.backBtn?.addEventListener('click', () => {
      if (document.referrer && document.referrer.includes(window.location.host)) {
        history.back();
      } else {
        window.location.href = '/discover';
      }
    });

    // Like button
    this.likeBtn?.addEventListener('click', () => this.toggleLike());

    // Comment button
    this.commentBtn?.addEventListener('click', () => this.openSheet('comment'));

    // Info button
    this.infoBtn?.addEventListener('click', () => this.openSheet('info'));

    // Zapping button (disabled in Phase 1)
    this.zappingBtn?.addEventListener('click', () => {
      alert('ランダム再生機能はPhase 2で提供予定です');
    });

    // Create button
    this.createBtn?.addEventListener('click', () => {
      window.location.href = '/create';
    });

    // Share button
    this.shareBtn?.addEventListener('click', () => this.shareGame());

    // Sheet overlay
    this.sheetOverlay?.addEventListener('click', () => this.closeAllSheets());

    // Sheet drag to close
    [this.infoSheet, this.commentSheet].forEach(sheet => {
      if (sheet) {
        let startY = 0;
        let currentY = 0;

        sheet.addEventListener('touchstart', (e) => {
          startY = e.touches[0].clientY;
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
          currentY = e.touches[0].clientY;
          const diff = currentY - startY;
          if (diff > 0) {
            sheet.style.transform = `translateY(${diff}px)`;
          }
        }, { passive: true });

        sheet.addEventListener('touchend', () => {
          const diff = currentY - startY;
          if (diff > 100) {
            this.closeAllSheets();
          } else {
            sheet.style.transform = '';
          }
          startY = 0;
          currentY = 0;
        });
      }
    });
  }

  openSheet(type) {
    this.sheetOverlay?.classList.add('active');

    if (type === 'info') {
      this.infoSheet?.classList.add('active');
    } else if (type === 'comment') {
      this.commentSheet?.classList.add('active');
    }
  }

  closeAllSheets() {
    this.sheetOverlay?.classList.remove('active');
    this.infoSheet?.classList.remove('active');
    this.commentSheet?.classList.remove('active');

    // Reset transform
    if (this.infoSheet) this.infoSheet.style.transform = '';
    if (this.commentSheet) this.commentSheet.style.transform = '';
  }

  async toggleLike() {
    // TODO: Implement like API
    const currentLikes = parseInt(this.likeCount?.textContent || '0');
    const isLiked = this.likeBtn?.classList.contains('liked');

    if (isLiked) {
      this.likeBtn?.classList.remove('liked');
      if (this.likeCount) this.likeCount.textContent = currentLikes - 1;
    } else {
      this.likeBtn?.classList.add('liked');
      if (this.likeCount) this.likeCount.textContent = currentLikes + 1;
    }
  }

  async shareGame() {
    const url = window.location.href;
    const title = this.gameData?.title || 'ゲーム';

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          url: url
        });
      } catch (e) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        alert('URLをコピーしました');
      } catch (e) {
        console.error('Failed to copy:', e);
      }
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const app = new PlayApp();
  app.init();
});
