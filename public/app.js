class GameCreatorApp {
  constructor() {
    this.ws = null;
    this.visitorId = null;
    this.currentProjectId = null;
    this.currentProjectName = null;
    this.projects = [];
    this.isProcessing = false;
    this.currentJobId = null;
    this.jobPollInterval = null;

    // Authentication state
    this.sessionId = null;
    this.currentUser = null;
    this.isAuthenticated = false;

    // Current view state
    this.currentView = 'list'; // 'list', 'editor', 'discover', 'zapping'
    this.currentTab = 'create'; // 'discover', 'create', 'notifications', 'profile'

    // Current version state (null = latest)
    this.currentVersionId = null;

    // Discover/Zapping state
    this.publicGames = [];
    this.zappingIndex = 0;
    this.zappingGames = [];
    this.touchStartY = 0;
    this.touchDeltaY = 0;

    // Attached assets for chat (images to be included in prompt)
    this.attachedAssetsList = [];

    // Login elements
    this.loginView = document.getElementById('loginView');
    this.loginForm = document.getElementById('loginForm');
    this.loginUsername = document.getElementById('loginUsername');
    this.loginError = document.getElementById('loginError');
    this.loginButton = document.getElementById('loginButton');

    // View elements
    this.projectListView = document.getElementById('projectListView');
    this.editorView = document.getElementById('editorView');
    this.projectGrid = document.getElementById('projectGrid');
    this.createProjectButton = document.getElementById('createProjectButton');
    this.listStatusIndicator = document.getElementById('listStatusIndicator');
    this.homeButton = document.getElementById('homeButton');
    this.userDisplayName = document.getElementById('userDisplayName');
    this.logoutButton = document.getElementById('logoutButton');
    this.notificationsButton = document.getElementById('notificationsButton');
    this.notificationsBadge = document.getElementById('notificationsBadge');

    // DOM elements (editor view)
    this.chatMessages = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.attachedAssetsContainer = document.getElementById('attachedAssets');
    this.sendButton = document.getElementById('sendButton');
    this.stopButton = document.getElementById('stopButton');
    this.refreshButton = document.getElementById('refreshButton');
    this.newProjectButton = document.getElementById('newProjectButton');
    this.gamePreview = document.getElementById('gamePreview');
    this.statusIndicator = document.getElementById('statusIndicator');
    this.projectTitle = document.getElementById('projectTitle');
    this.noProjectMessage = document.getElementById('noProjectMessage');
    this.versionsButton = document.getElementById('versionsButton');
    this.versionPanel = document.getElementById('versionPanel');
    this.versionList = document.getElementById('versionList');
    this.closeVersionsButton = document.getElementById('closeVersionsButton');

    // Code viewer elements
    this.viewCodeButton = document.getElementById('viewCodeButton');
    this.downloadButton = document.getElementById('downloadButton');
    this.codeViewerModal = document.getElementById('codeViewerModal');
    this.codeViewerCode = document.getElementById('codeViewerCode');
    this.copyCodeButton = document.getElementById('copyCodeButton');
    this.closeCodeViewer = document.getElementById('closeCodeViewer');

    // Error panel elements
    this.errorPanel = document.getElementById('errorPanel');
    this.errorCount = document.getElementById('errorCount');
    this.errorList = document.getElementById('errorList');
    this.autoFixButton = document.getElementById('autoFixButton');
    this.closeErrorPanel = document.getElementById('closeErrorPanel');
    this.gameStatus = document.getElementById('gameStatus');
    this.gameStatusIcon = document.getElementById('gameStatusIcon');
    this.gameStatusText = document.getElementById('gameStatusText');

    // New game modal elements
    this.newGameModal = document.getElementById('newGameModal');
    this.newGameName = document.getElementById('newGameName');
    this.cancelNewGame = document.getElementById('cancelNewGame');
    this.confirmNewGame = document.getElementById('confirmNewGame');

    // Restore modal elements
    this.restoreModal = document.getElementById('restoreModal');
    this.restoreModalMessage = document.getElementById('restoreModalMessage');
    this.cancelRestore = document.getElementById('cancelRestore');
    this.confirmRestoreBtn = document.getElementById('confirmRestore');
    this.pendingRestoreVersionId = null;

    // Error state
    this.currentErrors = [];

    // Notification permission (check support first for iOS Safari)
    this.notificationPermission = ('Notification' in window) ? Notification.permission : 'denied';
    this.requestNotificationPermission();

    // Restore state
    this.pendingRestore = false;

    // Streaming elements
    this.streamingContainer = document.getElementById('streamingContainer');
    this.streamingStatus = document.getElementById('streamingStatus');
    this.streamingFile = document.getElementById('streamingFile');
    this.streamingOutput = document.getElementById('streamingOutput');
    this.streamingText = '';
    this.typewriterQueue = [];
    this.isTyping = false;

    // Asset elements
    this.assetButton = document.getElementById('assetButton');
    this.assetModal = document.getElementById('assetModal');
    this.closeAssetModal = document.getElementById('closeAssetModal');
    this.assetTabs = document.querySelectorAll('.asset-tab');
    this.assetTabContents = document.querySelectorAll('.asset-tab-content');
    this.myAssetGrid = document.getElementById('myAssetGrid');
    this.publicAssetGrid = document.getElementById('publicAssetGrid');
    this.assetSearch = document.getElementById('assetSearch');
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.uploadForm = document.getElementById('uploadForm');
    this.uploadPreview = document.getElementById('uploadPreview');
    this.uploadSubmit = document.getElementById('uploadSubmit');
    this.assetTags = document.getElementById('assetTags');
    this.assetDescription = document.getElementById('assetDescription');
    this.selectedAssetInfo = document.getElementById('selectedAssetInfo');
    this.insertAssetButton = document.getElementById('insertAssetButton');

    // Asset state
    this.selectedAsset = null;
    this.pendingUploads = [];

    // Image generation elements
    this.imageGenButton = document.getElementById('imageGenButton');
    this.imageGenModal = document.getElementById('imageGenModal');
    this.closeImageGenModal = document.getElementById('closeImageGenModal');
    this.imageGenPrompt = document.getElementById('imageGenPrompt');
    this.imageGenStyle = document.getElementById('imageGenStyle');
    this.imageGenSize = document.getElementById('imageGenSize');
    this.generateImageButton = document.getElementById('generateImageButton');
    this.imagePlaceholder = document.getElementById('imagePlaceholder');
    this.generatedImage = document.getElementById('generatedImage');
    this.imageGenLoading = document.getElementById('imageGenLoading');
    this.insertImageButton = document.getElementById('insertImageButton');
    this.downloadImageButton = document.getElementById('downloadImageButton');

    // Image generation state
    this.generatedImageData = null;

    // Debug toggles
    this.disableSkillsToggle = document.getElementById('disableSkillsToggle');
    this.useClaudeToggle = document.getElementById('useClaudeToggle');

    // Bottom navigation elements
    this.bottomNav = document.getElementById('bottomNav');
    this.navItems = document.querySelectorAll('.nav-item');
    this.navZappingBtn = document.getElementById('navZappingBtn');

    // Discover view elements
    this.discoverView = document.getElementById('discoverView');
    this.discoverGrid = document.getElementById('discoverGrid');
    this.discoverEmpty = document.getElementById('discoverEmpty');

    // Zapping mode elements
    this.zappingMode = document.getElementById('zappingMode');
    this.zappingContainer = document.getElementById('zappingContainer');
    this.zappingBack = document.getElementById('zappingBack');
    this.zappingGameName = document.getElementById('zappingGameName');
    this.zappingCreator = document.getElementById('zappingCreator');
    this.zappingLike = document.getElementById('zappingLike');
    this.zappingLikeCount = document.getElementById('zappingLikeCount');
    this.zappingRemix = document.getElementById('zappingRemix');
    this.zappingShare = document.getElementById('zappingShare');

    // IME composition state
    this.isComposing = false;

    // Try to restore session from localStorage
    this.sessionId = localStorage.getItem('gameCreatorSessionId');

    this.init();
  }

  init() {
    // Setup login form listeners first
    this.setupLoginListeners();

    // Check if we have a valid session
    this.checkSession();
  }

  // ==================== Authentication ====================

  setupLoginListeners() {
    this.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });

    // iOS Safari workaround: listen for both click and touchend
    this.loginButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.login();
    });

    this.loginButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.login();
    });

    this.logoutButton.addEventListener('click', () => {
      this.logout();
    });

    this.notificationsButton?.addEventListener('click', () => {
      window.location.href = '/notifications';
    });
  }

  async checkSession() {
    if (!this.sessionId) {
      this.showLoginView();
      return;
    }

    try {
      const response = await fetch(`/api/auth/me?sessionId=${this.sessionId}`);
      if (response.ok) {
        const data = await response.json();
        this.currentUser = data.user;
        this.visitorId = data.user.visitorId;
        this.isAuthenticated = true;
        this.onAuthSuccess();
      } else {
        // Session invalid or expired
        localStorage.removeItem('gameCreatorSessionId');
        this.sessionId = null;
        this.showLoginView();
      }
    } catch (error) {
      console.error('Session check failed:', error);
      this.showLoginView();
    }
  }

  async login() {
    // Prevent double submission
    if (this.loginButton.disabled) return;

    const username = this.loginUsername.value.trim();

    if (!username) {
      this.showLoginError('ユーザーIDを入力してください');
      return;
    }

    this.loginButton.disabled = true;
    this.loginButton.textContent = 'ログイン中...';
    this.loginError.classList.add('hidden');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Save session
        this.sessionId = data.sessionId;
        this.currentUser = data.user;
        this.visitorId = data.user.visitorId;
        this.isAuthenticated = true;
        localStorage.setItem('gameCreatorSessionId', this.sessionId);

        this.onAuthSuccess();
      } else {
        this.showLoginError(data.error || 'ログインに失敗しました');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showLoginError('サーバーに接続できませんでした');
    } finally {
      this.loginButton.disabled = false;
      this.loginButton.textContent = 'ログイン';
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Clear local state
    localStorage.removeItem('gameCreatorSessionId');
    this.sessionId = null;
    this.currentUser = null;
    this.visitorId = null;
    this.isAuthenticated = false;

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Show login view
    this.showLoginView();
  }

  showLoginView() {
    this.loginView.classList.remove('hidden');
    this.projectListView.classList.add('hidden');
    this.editorView.classList.add('hidden');
    this.loginUsername.focus();
  }

  showLoginError(message) {
    this.loginError.textContent = message;
    this.loginError.classList.remove('hidden');
  }

  onAuthSuccess() {
    // Hide login, show app
    this.loginView.classList.add('hidden');
    this.projectListView.classList.remove('hidden');

    // Show user display name
    if (this.currentUser && this.userDisplayName) {
      this.userDisplayName.textContent = this.currentUser.displayName || this.currentUser.username;
    }

    // Initialize the rest of the app
    this.connectWebSocket();
    this.setupEventListeners();
    this.setupAssetListeners();
    this.setupImageGenListeners();
    this.setupStyleSelectListeners();
    this.setupRouting();
    this.setupErrorListeners();
  }

  // ==================== Error Detection ====================

  setupErrorListeners() {
    // Listen for messages from game iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'gameError') {
        this.handleGameErrors(event.data.errors);
      } else if (event.data && event.data.type === 'gameLoaded') {
        this.handleGameLoaded(event.data);
      }
    });

    // Error panel controls
    this.closeErrorPanel.addEventListener('click', () => {
      this.hideErrorPanel();
    });

    this.autoFixButton.addEventListener('click', () => {
      this.autoFixErrors();
    });
  }

  handleGameErrors(errors) {
    if (!errors || errors.length === 0) return;

    this.currentErrors = errors;
    this.showErrorPanel(errors);
    this.updateGameStatus('error', `${errors.length}件のエラー`);
  }

  handleGameLoaded(data) {
    if (data.success) {
      this.updateGameStatus('success', '実行中');
      this.hideErrorPanel();
      // Hide status after 2 seconds
      setTimeout(() => {
        this.gameStatus.classList.add('hidden');
      }, 2000);
    } else {
      this.handleGameErrors(data.errors);
    }
  }

  showErrorPanel(errors) {
    this.errorCount.textContent = errors.length;
    this.errorList.innerHTML = errors.map(err => `
      <div class="error-item">
        <div class="error-item-type">${this.escapeHtml(err.type)}</div>
        <div class="error-item-message">${this.escapeHtml(err.message)}</div>
        ${err.file || err.line ? `
          <div class="error-item-location">
            ${err.file ? `File: ${err.file}` : ''}
            ${err.line ? ` Line: ${err.line}` : ''}
            ${err.column ? `:${err.column}` : ''}
          </div>
        ` : ''}
      </div>
    `).join('');

    this.errorPanel.classList.remove('hidden');
    this.autoFixButton.disabled = this.isProcessing;
  }

  hideErrorPanel() {
    this.errorPanel.classList.add('hidden');
  }

  updateGameStatus(status, text) {
    this.gameStatus.classList.remove('hidden', 'success', 'error');
    this.gameStatus.classList.add(status);

    if (status === 'success') {
      this.gameStatusIcon.textContent = '✅';
    } else if (status === 'error') {
      this.gameStatusIcon.textContent = '❌';
    } else {
      this.gameStatusIcon.textContent = '⏳';
    }

    this.gameStatusText.textContent = text;
  }

  autoFixErrors() {
    if (!this.currentProjectId || this.currentErrors.length === 0 || this.isProcessing) {
      return;
    }

    // Build error description for Claude
    const errorDescriptions = this.currentErrors.map(err => {
      let desc = `${err.type}: ${err.message}`;
      if (err.file) desc += ` (in ${err.file}`;
      if (err.line) desc += ` line ${err.line}`;
      if (err.file) desc += ')';
      if (err.stack) desc += `\nStack: ${err.stack.split('\n').slice(0, 3).join('\n')}`;
      return desc;
    }).join('\n\n');

    const fixMessage = `The game has the following JavaScript errors. Please fix them:\n\n${errorDescriptions}`;

    // Send as regular message
    this.addMessage(fixMessage, 'user');
    this.hideErrorPanel();

    this.ws.send(JSON.stringify({
      type: 'message',
      content: fixMessage,
      autoFix: true  // Use Claude Code CLI directly for bug fixes
    }));
  }

  // ==================== Routing ====================

  setupRouting() {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
      this.handleRouteChange(event.state);
    });

    // Initial route handling will be done after WebSocket init
  }

  parseRoute() {
    const path = window.location.pathname;

    // Match /project/new
    if (path === '/project/new') {
      return { view: 'new' };
    }

    // Match /project/:id
    const projectMatch = path.match(/^\/project\/([a-zA-Z0-9_-]+)$/);
    if (projectMatch) {
      return { view: 'editor', projectId: projectMatch[1] };
    }

    // Match /zap/:gameId
    const zappingMatch = path.match(/^\/zap\/([a-zA-Z0-9_-]+)$/);
    if (zappingMatch) {
      return { view: 'zapping', gameId: zappingMatch[1] };
    }

    // Match /zap (start from first game)
    if (path === '/zap') {
      return { view: 'zapping', gameId: null };
    }

    // Default to list view
    return { view: 'list' };
  }

  handleRouteChange(state) {
    const route = state || this.parseRoute();

    if (route.view === 'list') {
      this.showListView();
    } else if (route.view === 'new') {
      this.showListView();
      this.createNewProject();
    } else if (route.view === 'editor' && route.projectId) {
      this.showEditorView();
      if (this.currentProjectId !== route.projectId) {
        this.selectProject(route.projectId, false); // Don't push state
      }
    } else if (route.view === 'zapping') {
      this.handleZappingRoute(route.gameId);
    }
  }

  async handleZappingRoute(gameId) {
    // Load public games if not already loaded
    if (this.publicGames.length === 0) {
      await this.loadPublicGames();
    }

    if (this.publicGames.length === 0) {
      // No games available, redirect to discover
      this.navigateTo('/', { view: 'list' });
      return;
    }

    // Find the game index
    let startIndex = 0;
    if (gameId) {
      const index = this.publicGames.findIndex(g => g.id === gameId);
      if (index !== -1) {
        startIndex = index;
      } else {
        // Game not found, update URL to first game
        const firstGame = this.publicGames[0];
        history.replaceState({ view: 'zapping', gameId: firstGame.id }, '', `/zap/${firstGame.id}`);
      }
    } else {
      // No gameId specified, use first game and update URL
      const firstGame = this.publicGames[0];
      history.replaceState({ view: 'zapping', gameId: firstGame.id }, '', `/zap/${firstGame.id}`);
    }

    this.enterZappingMode(startIndex, false); // Don't update URL, already done
  }

  navigateTo(path, state = {}) {
    history.pushState(state, '', path);
    this.handleRouteChange(state);
  }

  showListView() {
    this.currentView = 'list';
    this.projectListView.classList.remove('hidden');
    this.projectListView.classList.add('with-nav');
    this.editorView.classList.add('hidden');
    this.discoverView?.classList.add('hidden');
    this.zappingMode?.classList.add('hidden');
    this.showBottomNav();
    this.updateNavActive('create');
    this.renderProjectGrid();
    document.title = 'Game Creator - Projects';
    this.updateProjectTitle(null);
  }

  showEditorView() {
    this.currentView = 'editor';
    this.projectListView.classList.add('hidden');
    this.editorView.classList.remove('hidden');
    this.discoverView?.classList.add('hidden');
    this.zappingMode?.classList.add('hidden');
    this.hideBottomNav();
  }

  updateNavActive(tab) {
    this.navItems?.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });
    this.currentTab = tab;
  }

  renderProjectGrid() {
    if (this.projects.length === 0) {
      this.projectGrid.innerHTML = `
        <div class="project-empty">
          <p>まだゲームがありません</p>
        </div>
      `;
      return;
    }

    this.projectGrid.innerHTML = this.projects.map(project => `
      <div class="project-card" data-id="${project.id}">
        <div class="project-card-header">
          <h3 class="project-card-title">${this.escapeHtml(project.name)}</h3>
          <div class="project-card-actions">
            <button onclick="event.stopPropagation(); app.renameProjectFromList('${project.id}')" title="名前を変更">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="delete-btn" onclick="event.stopPropagation(); app.deleteProjectFromList('${project.id}')" title="削除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="project-card-meta">
          <div class="project-card-date">${this.formatDate(project.createdAt)}</div>
        </div>
      </div>
    `).join('');

    // Add click handlers
    this.projectGrid.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        const projectId = card.dataset.id;
        this.navigateTo(`/project/${projectId}`, { view: 'editor', projectId });
      });
    });
  }

  formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renameProjectFromList(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newName = prompt('Enter new project name:', project.name);
    if (newName === null || newName === project.name) return;

    this.ws.send(JSON.stringify({
      type: 'renameProject',
      projectId,
      name: newName
    }));
  }

  updateProjectTitle(name, animate = false) {
    if (!name) {
      this.projectTitle.textContent = 'ゲームクリエイター';
      this.projectTitle.classList.remove('editable');
    } else {
      if (animate && this.projectTitle.textContent !== name) {
        // Animate title change
        this.projectTitle.classList.add('title-updating');
        setTimeout(() => {
          this.projectTitle.textContent = name;
          this.projectTitle.classList.remove('title-updating');
          this.projectTitle.classList.add('title-updated');
          setTimeout(() => {
            this.projectTitle.classList.remove('title-updated');
          }, 600);
        }, 150);
      } else {
        this.projectTitle.textContent = name;
      }
      this.projectTitle.classList.add('editable');
    }
  }

  startEditingProjectTitle() {
    if (!this.currentProjectId || !this.currentProjectName) return;

    const currentName = this.currentProjectName;
    this.projectTitle.contentEditable = true;
    this.projectTitle.classList.add('editing');
    this.projectTitle.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(this.projectTitle);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishEditing = () => {
      this.projectTitle.contentEditable = false;
      this.projectTitle.classList.remove('editing');
      const newName = this.projectTitle.textContent.trim();

      if (newName && newName !== currentName) {
        this.ws.send(JSON.stringify({
          type: 'renameProject',
          projectId: this.currentProjectId,
          name: newName
        }));
      } else {
        // Revert to original name if empty or unchanged
        this.projectTitle.textContent = currentName;
      }
    };

    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.projectTitle.blur();
      } else if (e.key === 'Escape') {
        this.projectTitle.textContent = currentName;
        this.projectTitle.blur();
      }
    };

    this.projectTitle.addEventListener('blur', finishEditing, { once: true });
    this.projectTitle.addEventListener('keydown', handleKeydown);
    this.projectTitle.addEventListener('blur', () => {
      this.projectTitle.removeEventListener('keydown', handleKeydown);
    }, { once: true });
  }

  deleteProjectFromList(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;

    this.ws.send(JSON.stringify({
      type: 'deleteProject',
      projectId
    }));
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    // Generate unique session ID for this tab
    if (!this.sessionId) {
      this.sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    this.ws.onopen = () => {
      console.log(`[${this.sessionId}] WebSocket connected`);
      this.reconnectAttempts = 0; // Reset on successful connection
      this.updateStatus('connected', '接続中');
      this.listStatusIndicator.className = 'status-indicator connected';
      this.listStatusIndicator.textContent = '接続中';
      this.ws.send(JSON.stringify({
        type: 'init',
        visitorId: this.visitorId,
        sessionId: this.sessionId
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = (event) => {
      console.log(`[${this.sessionId}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
      this.updateStatus('', '再接続中...');
      this.listStatusIndicator.className = 'status-indicator';
      this.listStatusIndicator.textContent = '再接続中...';
      this.sendButton.disabled = true;
      this.chatInput.disabled = true;
      // Exponential backoff: 1s, 1.5s, 2.25s, ... max 10s
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts || 0), 10000);
      this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
      console.log(`[Reconnect] Attempting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), delay);
    };

    this.ws.onerror = (error) => {
      console.error(`[${this.sessionId}] WebSocket error:`, error);
      this.updateStatus('', 'エラー');
    };

    // Auto-reconnect when page becomes visible (important for mobile)
    this.setupVisibilityHandler();
  }

  setupVisibilityHandler() {
    // Only set up once
    if (this.visibilityHandlerSetup) return;
    this.visibilityHandlerSetup = true;

    // visibilitychange - main handler
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[Visibility] Page became visible, checking connection...');
        // Small delay to let network stabilize after wake
        setTimeout(() => this.checkAndReconnect(), 300);
      }
    });

    // focus - backup for visibilitychange (more reliable on some mobile browsers)
    window.addEventListener('focus', () => {
      console.log('[Focus] Window focused, checking connection...');
      setTimeout(() => this.checkAndReconnect(), 300);
    });

    // online - network reconnected
    window.addEventListener('online', () => {
      console.log('[Online] Network restored, checking connection...');
      setTimeout(() => this.checkAndReconnect(), 500);
    });

    // pageshow - for back/forward cache on mobile
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[Pageshow] Page restored from cache, checking connection...');
        this.checkAndReconnect();
      }
    });

    // First touch after returning - trigger reconnect check
    this.setupTouchReconnect();
  }

  setupTouchReconnect() {
    let lastCheckTime = 0;
    const minInterval = 3000; // Don't check more than once per 3 seconds

    const checkOnInteraction = () => {
      const now = Date.now();
      if (now - lastCheckTime > minInterval) {
        lastCheckTime = now;
        // Only check if connection seems stale
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Silent check - don't update UI unless there's a problem
          this.silentConnectionCheck();
        } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
          console.log('[Touch] Connection dead, reconnecting...');
          this.checkAndReconnect();
        }
      }
    };

    document.addEventListener('touchstart', checkOnInteraction, { passive: true });
    document.addEventListener('click', checkOnInteraction, { passive: true });
  }

  silentConnectionCheck() {
    // Quick ping without UI update
    if (this.silentPingTimeout) return; // Already checking

    this.silentPingTimeout = setTimeout(() => {
      console.log('[Silent] Ping timeout, forcing reconnect...');
      this.silentPingTimeout = null;
      this.forceReconnect();
    }, 2000);

    try {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    } catch (e) {
      clearTimeout(this.silentPingTimeout);
      this.silentPingTimeout = null;
      this.forceReconnect();
    }
  }

  checkAndReconnect() {
    // Clear any existing ping timeout
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      console.log('[Reconnect] WebSocket is closed, reconnecting immediately...');
      this.reconnectAttempts = 0; // Reset for fresh start
      this.connectWebSocket();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      console.log('[Reconnect] WebSocket appears connected, verifying with ping...');
      this.updateStatus('', '接続確認中...');

      // Set a timeout - if no pong within 2 seconds, force reconnect
      this.pingTimeout = setTimeout(() => {
        console.log('[Reconnect] Ping timeout, forcing reconnect...');
        this.forceReconnect();
      }, 2000);

      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        console.log('[Reconnect] Ping failed, reconnecting...');
        clearTimeout(this.pingTimeout);
        this.forceReconnect();
      }
    } else if (this.ws.readyState === WebSocket.CONNECTING) {
      console.log('[Reconnect] WebSocket is already connecting...');
    }
  }

  forceReconnect() {
    // Close existing connection and reconnect
    if (this.ws) {
      this.ws.onclose = null; // Prevent double reconnect
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    this.connectWebSocket();
  }

  setupEventListeners() {
    this.sendButton.addEventListener('click', () => this.sendMessage());

    // Track IME composition state
    this.chatInput.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    this.chatInput.addEventListener('compositionend', () => {
      this.isComposing = false;
    });

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.isComposing) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Mobile keyboard visibility handling (iOS/Android)
    this.setupMobileKeyboardHandling();

    this.refreshButton.addEventListener('click', () => this.refreshPreview());
    this.newProjectButton.addEventListener('click', () => this.createNewProject());
    this.stopButton.addEventListener('click', () => this.stopGeneration());
    this.versionsButton.addEventListener('click', () => this.toggleVersionPanel());
    this.closeVersionsButton.addEventListener('click', () => this.hideVersionPanel());

    // Code viewer buttons
    this.viewCodeButton.addEventListener('click', () => this.showCodeViewer());
    this.downloadButton.addEventListener('click', () => this.downloadProject());
    this.copyCodeButton.addEventListener('click', () => this.copyCode());
    this.closeCodeViewer.addEventListener('click', () => this.hideCodeViewer());
    this.codeViewerModal.addEventListener('click', (e) => {
      if (e.target === this.codeViewerModal) this.hideCodeViewer();
    });

    // Home button - go back to project list
    this.homeButton.addEventListener('click', () => {
      this.navigateTo('/', { view: 'list' });
    });

    // Project title click to edit
    this.projectTitle.addEventListener('click', () => this.startEditingProjectTitle());

    // Create project button in list view
    this.createProjectButton.addEventListener('click', () => this.createNewProject());

    // Scroll detection for create button animation
    this.projectListView.addEventListener('scroll', () => {
      const scrollTop = this.projectListView.scrollTop;
      if (scrollTop > 50) {
        this.createProjectButton.classList.add('scrolled');
      } else {
        this.createProjectButton.classList.remove('scrolled');
      }
    });

    // New game modal
    this.cancelNewGame.addEventListener('click', () => this.hideNewGameModal());
    this.confirmNewGame.addEventListener('click', () => this.confirmCreateProject());
    this.newGameModal.addEventListener('click', (e) => {
      if (e.target === this.newGameModal) this.hideNewGameModal();
    });
    this.newGameName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmCreateProject();
      } else if (e.key === 'Escape') {
        this.hideNewGameModal();
      }
    });

    // Restore modal
    this.cancelRestore.addEventListener('click', () => this.hideRestoreModal());
    this.confirmRestoreBtn.addEventListener('click', () => this.confirmRestore());
    this.restoreModal.addEventListener('click', (e) => {
      if (e.target === this.restoreModal) this.hideRestoreModal();
    });

    // Mobile tab switching
    this.setupMobileTabListeners();

    // Bottom navigation
    this.setupBottomNavListeners();

    // Zapping mode
    this.setupZappingListeners();
  }

  // ==================== Bottom Navigation ====================

  setupBottomNavListeners() {
    if (!this.bottomNav) return;

    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        // Skip if no tab (like zapping button)
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  switchTab(tab) {
    // Update active state
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    this.currentTab = tab;

    // Hide all views first
    this.projectListView.classList.add('hidden');
    this.discoverView.classList.add('hidden');
    this.editorView.classList.add('hidden');

    switch (tab) {
      case 'discover':
        this.showDiscoverView();
        break;
      case 'create':
        this.showCreateView();
        break;
      case 'notifications':
        window.location.href = '/notifications';
        break;
      case 'profile':
        this.showProfileView();
        break;
    }
  }

  showBottomNav() {
    if (this.bottomNav) {
      this.bottomNav.classList.remove('hidden');
    }
  }

  hideBottomNav() {
    if (this.bottomNav) {
      this.bottomNav.classList.add('hidden');
    }
  }

  // ==================== Discover View ====================

  showDiscoverView() {
    this.discoverView.classList.remove('hidden');
    this.currentView = 'discover';
    this.loadPublicGames();
  }

  async loadPublicGames() {
    try {
      const response = await fetch('/api/public-games');
      if (response.ok) {
        const data = await response.json();
        this.publicGames = data.games || [];
        this.renderDiscoverGrid();
      }
    } catch (error) {
      console.error('Failed to load public games:', error);
      this.publicGames = [];
      this.renderDiscoverGrid();
    }
  }

  renderDiscoverGrid() {
    if (!this.discoverGrid) return;

    if (this.publicGames.length === 0) {
      this.discoverGrid.classList.add('hidden');
      this.discoverEmpty.classList.remove('hidden');
      return;
    }

    this.discoverGrid.classList.remove('hidden');
    this.discoverEmpty.classList.add('hidden');

    this.discoverGrid.innerHTML = this.publicGames.map((game, index) => `
      <div class="discover-card" data-game-index="${index}" data-game-id="${game.id}">
        <div class="discover-card-thumbnail" style="background: linear-gradient(135deg, hsl(${(index * 37) % 360}, 70%, 85%), hsl(${(index * 37 + 40) % 360}, 70%, 75%));">
        </div>
        <div class="discover-card-overlay">
          <div class="discover-card-title">${this.escapeHtml(game.name)}</div>
          <div class="discover-card-creator">@${this.escapeHtml(game.creatorName || 'anonymous')}</div>
        </div>
      </div>
    `).join('');

    // Add click listeners
    this.discoverGrid.querySelectorAll('.discover-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.gameIndex);
        this.enterZappingMode(index);
      });
    });
  }

  showCreateView() {
    // Show the project list (MY GAMES)
    this.projectListView.classList.remove('hidden');
    this.projectListView.classList.add('with-nav');
    this.currentView = 'list';
  }

  showProfileView() {
    // Navigate to dedicated mypage
    window.location.href = '/mypage';
  }

  // ==================== Zapping Mode ====================

  setupZappingListeners() {
    if (!this.zappingMode) return;

    // Back button
    this.zappingBack?.addEventListener('click', () => {
      this.exitZappingMode();
    });

    // Nav zapping button (enter zapping or next game)
    this.navZappingBtn?.addEventListener('click', () => {
      if (this.currentView === 'zapping') {
        this.zappingNext();
      } else {
        // Load public games first if needed, then enter zapping
        if (this.publicGames.length > 0) {
          this.enterZappingMode(0);
        } else {
          this.loadPublicGames().then(() => {
            if (this.publicGames.length > 0) {
              this.enterZappingMode(0);
            }
          });
        }
      }
    });

    // Swipe on container for navigation (optional, still works)
    this.zappingContainer?.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.zappingContainer?.addEventListener('touchmove', (e) => {
      this.touchDeltaY = e.touches[0].clientY - this.touchStartY;
    }, { passive: true });

    this.zappingContainer?.addEventListener('touchend', () => {
      if (Math.abs(this.touchDeltaY) > 50) {
        if (this.touchDeltaY < 0) {
          this.zappingNext();
        } else {
          this.zappingPrev();
        }
      }
      this.touchDeltaY = 0;
    });

    // Action buttons
    this.zappingLike?.addEventListener('click', () => this.likeCurrentGame());
    this.zappingRemix?.addEventListener('click', () => this.remixCurrentGame());
    this.zappingShare?.addEventListener('click', () => this.shareCurrentGame());
  }

  enterZappingMode(startIndex = 0, updateUrl = true) {
    if (this.publicGames.length === 0) return;

    this.zappingGames = [...this.publicGames];
    this.zappingIndex = startIndex;
    this.currentView = 'zapping';

    // Hide other views but keep nav visible
    this.discoverView.classList.add('hidden');
    this.projectListView.classList.add('hidden');

    // Show zapping mode with bottom nav
    this.zappingMode.classList.remove('hidden');
    this.showBottomNav();

    // Update URL if requested
    if (updateUrl) {
      const currentGame = this.zappingGames[this.zappingIndex];
      if (currentGame) {
        history.pushState({ view: 'zapping', gameId: currentGame.id }, '', `/zap/${currentGame.id}`);
      }
    }

    // Render the current game
    this.renderZappingSlides();
  }

  exitZappingMode() {
    this.zappingMode.classList.add('hidden');
    this.currentView = 'discover';

    // Navigate back to discover (or home)
    this.navigateTo('/', { view: 'list' });
    this.showBottomNav();
    this.switchTab('discover');
  }

  renderZappingSlides() {
    if (!this.zappingContainer) return;

    const currentGame = this.zappingGames[this.zappingIndex];
    if (!currentGame) return;

    // Update game info
    this.zappingGameName.textContent = currentGame.name;
    this.zappingCreator.textContent = `@${currentGame.creatorName || 'anonymous'}`;
    this.zappingLikeCount.textContent = currentGame.likes || 0;

    // Create slide with iframe
    const gameUrl = `/api/projects/${currentGame.id}/preview?visitorId=${currentGame.creatorId}`;

    this.zappingContainer.innerHTML = `
      <div class="zapping-slide current">
        <iframe src="${gameUrl}" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    `;
  }

  zappingNext() {
    if (this.zappingIndex < this.zappingGames.length - 1) {
      this.zappingIndex++;
      this.updateZappingUrl();
      this.renderZappingSlides();
    }
  }

  zappingPrev() {
    if (this.zappingIndex > 0) {
      this.zappingIndex--;
      this.updateZappingUrl();
      this.renderZappingSlides();
    }
  }

  updateZappingUrl() {
    const currentGame = this.zappingGames[this.zappingIndex];
    if (currentGame) {
      history.replaceState({ view: 'zapping', gameId: currentGame.id }, '', `/zap/${currentGame.id}`);
    }
  }

  likeCurrentGame() {
    const game = this.zappingGames[this.zappingIndex];
    if (!game) return;

    // Toggle like (visual only for now)
    this.zappingLike.classList.toggle('liked');
    const currentLikes = parseInt(this.zappingLikeCount.textContent) || 0;
    if (this.zappingLike.classList.contains('liked')) {
      this.zappingLikeCount.textContent = currentLikes + 1;
    } else {
      this.zappingLikeCount.textContent = Math.max(0, currentLikes - 1);
    }
  }

  remixCurrentGame() {
    const game = this.zappingGames[this.zappingIndex];
    if (!game) return;

    // TODO: Implement remix functionality
    alert(`リミックス機能は近日公開予定です！`);
  }

  shareCurrentGame() {
    const game = this.zappingGames[this.zappingIndex];
    if (!game) return;

    const shareUrl = `${window.location.origin}/zap/${game.id}`;

    if (navigator.share) {
      navigator.share({
        title: game.name,
        text: `${game.name} - Game Creator で作られたゲーム`,
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('リンクをコピーしました！');
      });
    }
  }

  // ==================== Mobile View Switching ====================

  setupMobileTabListeners() {
    const backToChatButton = document.getElementById('backToChatButton');

    if (backToChatButton) {
      backToChatButton.addEventListener('click', () => {
        this.showChatPanel();
      });
    }
  }

  showChatPanel() {
    const chatPanel = document.getElementById('chatPanel');
    const previewPanel = document.getElementById('previewPanel');

    chatPanel.classList.remove('mobile-hidden');
    previewPanel.classList.remove('mobile-active');
  }

  showPreviewPanel() {
    const chatPanel = document.getElementById('chatPanel');
    const previewPanel = document.getElementById('previewPanel');

    chatPanel.classList.add('mobile-hidden');
    previewPanel.classList.add('mobile-active');
    this.refreshPreview();
  }

  handleMessage(data) {
    console.log('[WS Received]', data.type, data);
    switch (data.type) {
      case 'pong':
        // Connection verified - clear all ping timeouts
        if (this.pingTimeout) {
          clearTimeout(this.pingTimeout);
          this.pingTimeout = null;
        }
        if (this.silentPingTimeout) {
          clearTimeout(this.silentPingTimeout);
          this.silentPingTimeout = null;
        }
        console.log('[Reconnect] Pong received, connection verified');
        this.updateStatus('connected', '接続中');
        this.listStatusIndicator.className = 'status-indicator connected';
        this.listStatusIndicator.textContent = '接続中';
        break;

      case 'init':
        this.visitorId = data.visitorId;
        localStorage.setItem('gameCreatorVisitorId', this.visitorId);
        this.projects = data.projects || [];
        this.updateProjectList();

        // Reset streaming state on fresh connection
        this.hideStreaming();
        this.isProcessing = false;
        this.currentJobId = null;
        this.stopButton.classList.add('hidden');

        // Update status indicators
        this.listStatusIndicator.className = 'status-indicator connected';
        this.listStatusIndicator.textContent = '接続中';

        // Handle initial route
        const route = this.parseRoute();
        if (route.view === 'editor' && route.projectId) {
          // URL specifies a project - try to open it
          const project = this.projects.find(p => p.id === route.projectId);
          if (project) {
            this.showEditorView();
            this.selectProject(route.projectId, false);
          } else {
            // Project not found - redirect to list
            this.navigateTo('/', { view: 'list' });
          }
        } else if (route.view === 'new') {
          this.showListView();
          this.createNewProject();
        } else {
          // Default to list view
          this.showListView();
        }
        break;

      case 'projectCreated':
        this.projects = data.projects;
        this.updateProjectList();
        // Navigate to the new project with URL update
        // navigateTo -> handleRouteChange -> selectProject is called internally
        this.navigateTo(`/project/${data.project.id}`, { view: 'editor', projectId: data.project.id });
        this.addMessage(`「${data.project.name}」を作成しました！`, 'system');
        break;

      case 'projectSelected':
        this.currentProjectId = data.projectId;
        localStorage.setItem('gameCreatorLastProjectId', this.currentProjectId);
        this.chatInput.disabled = false;
        this.sendButton.disabled = false;

        // Reset streaming state (in case of reconnect with stale UI)
        this.hideStreaming();
        this.isProcessing = false;
        this.currentJobId = null;
        this.stopButton.classList.add('hidden');

        // Clear and reload history
        this.chatMessages.innerHTML = '';

        // Get versions with edits from server response
        const versions = data.versions || [];

        if (data.history && data.history.length > 0) {
          // Find the last assistant message index for play button
          let lastAssistantIndex = -1;
          for (let i = data.history.length - 1; i >= 0; i--) {
            if (data.history[i].role === 'assistant') {
              lastAssistantIndex = i;
              break;
            }
          }

          // Match assistant messages with versions by reverse order (newest first)
          // Versions are fetched on demand when button is clicked
          const assistantIndices = data.history
            .map((h, i) => h.role === 'assistant' ? i : -1)
            .filter(i => i >= 0);

          // Create a map: assistant message index -> version hash
          const assistantToVersionHash = new Map();
          for (let i = 0; i < Math.min(versions.length, assistantIndices.length); i++) {
            // Match from the end: latest assistant -> latest version
            const assistantIdx = assistantIndices[assistantIndices.length - 1 - i];
            const version = versions[i];
            assistantToVersionHash.set(assistantIdx, version.hash);
          }

          data.history.forEach((h, index) => {
            const isLastAssistant = (h.role === 'assistant' && index === lastAssistantIndex);
            const options = { showPlayButton: isLastAssistant };

            // Store version hash for on-demand loading
            if (h.role === 'assistant' && assistantToVersionHash.has(index)) {
              options.versionHash = assistantToVersionHash.get(index);
            }

            this.addMessage(h.content, h.role, options);
          });
        } else {
          // Show welcome message for new/empty projects
          this.showWelcomeMessage();
        }

        this.refreshPreview();
        this.updatePreviewVisibility(true);

        // Update preview title and page title
        const selectedProject = this.projects.find(p => p.id === this.currentProjectId);
        if (selectedProject) {
          document.title = `${selectedProject.name} - ゲームクリエイター`;
          this.currentProjectName = selectedProject.name;
          this.updateProjectTitle(selectedProject.name);
        }

        // Show versions button and code/download buttons
        this.versionsButton.classList.remove('hidden');
        this.viewCodeButton.classList.remove('hidden');
        this.downloadButton.classList.remove('hidden');

        // Check for active job (recovering from disconnect)
        if (data.activeJob && ['pending', 'processing'].includes(data.activeJob.status)) {
          this.handleActiveJob(data.activeJob);
        }
        break;

      case 'projectDeleted':
        this.projects = data.projects;
        this.updateProjectList();
        this.renderProjectGrid();
        if (!this.currentProjectId || this.currentProjectId === data.projectId) {
          this.currentProjectId = null;
          this.chatMessages.innerHTML = '';
          this.chatInput.disabled = true;
          this.sendButton.disabled = true;
          this.updatePreviewVisibility(false);
          // Navigate back to list if deleted current project
          if (this.currentView === 'editor') {
            this.navigateTo('/', { view: 'list' });
          }
        }
        break;

      case 'projectRenamed':
        // Update projects list if provided
        if (data.projects) {
          this.projects = data.projects;
          this.updateProjectList();
          this.renderProjectGrid();
        }
        // Update current project if it was renamed
        if (data.project && this.currentProjectId === data.project.id) {
          document.title = `${data.project.name} - ゲームクリエイター`;
          this.currentProjectName = data.project.name;
          this.updateProjectTitle(data.project.name, true); // Animate title update
          // Also update in projects array
          const proj = this.projects.find(p => p.id === data.project.id);
          if (proj) {
            proj.name = data.project.name;
            this.updateProjectList();
          }
        }
        break;

      case 'status':
        this.updateStatus('processing', data.message);
        this.isProcessing = true;
        this.sendButton.disabled = true;
        this.stopButton.classList.remove('hidden');
        this.showStreaming();
        break;

      case 'stream':
        this.appendToStream(data.content);
        break;

      case 'fileEdit':
        this.updateStreamingFile(data.filename, data.status);
        break;

      case 'complete':
        this.completeStreaming();
        // Skip message display for chat/restore mode (already handled by their own methods)
        if (data.mode !== 'chat' && data.mode !== 'restore') {
          this.addMessage(data.message, 'assistant', { showPlayButton: true });
        }
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'info':
        this.addMessage(data.message, 'system');
        break;

      case 'gameUpdated':
        this.currentVersionId = null; // Reset to latest version
        this.refreshPreview();
        // Don't auto-switch to preview on mobile - let user read AI response first
        // User can tap "ゲームを遊ぶ" button when ready

        // Check for project name update after spec generation completes
        if (this.currentProjectId) {
          setTimeout(() => {
            this.ws.send(JSON.stringify({
              type: 'getProjectInfo',
              projectId: this.currentProjectId
            }));
          }, 2000); // Wait for spec generation to complete
        }
        break;

      case 'projectInfo':
        // Update project name if changed (from auto-rename)
        if (data.project && this.currentProjectId === data.project.id) {
          if (this.currentProjectName !== data.project.name) {
            document.title = `${data.project.name} - ゲームクリエイター`;
            this.currentProjectName = data.project.name;
            this.updateProjectTitle(data.project.name, true);
            // Update in projects array
            const proj = this.projects.find(p => p.id === data.project.id);
            if (proj) {
              proj.name = data.project.name;
              this.updateProjectList();
            }
          }
        }
        break;

      case 'error':
        this.hideStreaming();
        this.addMessage(data.message, 'error');
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'cancelled':
        this.hideStreaming();
        this.addMessage('停止しました', 'system');
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      // Job-based events
      case 'jobStarted':
        this.handleJobStarted(data.job, data.isExisting);
        break;

      case 'jobUpdate':
      case 'started':
      case 'progress':
      case 'completed':
      case 'failed':
        this.handleJobUpdate(data);
        break;

      case 'geminiCode':
        console.log('[DEBUG] geminiCode received:', data);
        this.displayGeneratedCode(data);
        break;

      case 'geminiChat':
        this.displayChatResponse(data);
        break;

      case 'geminiRestore':
        this.displayRestoreConfirm(data);
        break;

      case 'jobStatus':
        if (data.job) {
          this.handleJobUpdate({ type: data.job.status, job: data.job });
        }
        break;

      case 'versionsList':
        console.log('versionsList received, pendingRestore:', this.pendingRestore, 'versions:', data.versions?.length);
        // Check if we have a pending restore request
        if (this.pendingRestore && data.versions && data.versions.length >= 2) {
          this.pendingRestore = false;
          // Restore to the second version (index 1, since 0 is current)
          const previousVersion = data.versions[1];
          console.log('Auto-restoring to:', previousVersion);
          this.ws.send(JSON.stringify({
            type: 'restoreVersion',
            projectId: this.currentProjectId,
            versionId: previousVersion.id
          }));
          this.addMessage(`前のバージョン（${previousVersion.message}）に戻しています...`, 'system');
        } else if (this.pendingRestore) {
          this.pendingRestore = false;
          this.addMessage('戻せるバージョンがありません', 'system');
        } else {
          this.displayVersions(data.versions);
        }
        break;

      case 'versionRestored':
        this.currentVersionId = data.versionId;
        this.addMessage(`バージョン ${data.versionId} に戻しました`, 'system');
        this.hideVersionPanel();
        this.refreshPreview();
        break;

      case 'styleOptions':
        this.displayStyleSelection(data.dimension, data.styles, data.originalMessage);
        break;
    }
  }

  // Job handling methods
  handleJobStarted(job, isExisting) {
    this.currentJobId = job.id;
    this.isProcessing = true;
    this.sendButton.disabled = true;
    this.stopButton.classList.remove('hidden');
    this.showStreaming();

    // Ask for notification permission on first job
    this.askNotificationPermission();

    if (isExisting) {
      this.updateStreamingStatus(`Resuming job... ${job.progress || 0}%`);
    } else {
      this.updateStreamingStatus('Starting...');
    }
  }

  handleActiveJob(job) {
    // Recovering from disconnect - show existing job progress
    this.currentJobId = job.id;
    this.isProcessing = true;
    this.sendButton.disabled = true;
    this.stopButton.classList.remove('hidden');
    this.showStreaming();
    this.updateStreamingStatus(`処理中... ${job.progress || 0}%`);

    if (job.progress_message) {
      this.appendToStream(`\n[${job.progress_message}]\n`);
    }
  }

  handleJobUpdate(update) {
    switch (update.type) {
      case 'started':
        this.updateStreamingStatus('処理中...');
        break;

      case 'progress':
        this.updateStreamingStatus(`処理中... ${update.progress}%`);
        if (update.message) {
          this.appendToStream(`\n[${update.message}]\n`);
        }
        break;

      case 'completed':
        this.completeStreaming();
        // Skip message display for chat/restore mode (already handled by their own methods)
        if (update.result?.mode !== 'chat' && update.result?.mode !== 'restore') {
          this.currentVersionId = null; // Reset to latest version
          const message = update.result?.message || update.message || 'ゲームを更新しました';
          this.addMessage(message, 'assistant', { showPlayButton: true });
          this.refreshPreview();
        }
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        // Browser notification
        this.showNotification('🎮 ゲーム完成！', {
          body: this.currentProjectName || 'ゲームが更新されました',
        });
        break;

      case 'failed':
        this.hideStreaming();
        this.addMessage(`エラー: ${update.error}`, 'error');
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        // Browser notification
        this.showNotification('⚠️ エラーが発生', {
          body: update.error || 'ゲーム生成に失敗しました',
        });
        break;

      case 'cancelled':
        this.hideStreaming();
        this.addMessage('キャンセルしました', 'system');
        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;
    }
  }

  updateProjectList() {
    // Project selector removed from UI
  }

  selectProject(projectId, updateUrl = true) {
    if (!projectId) return;

    // Reset version state when switching projects
    this.currentVersionId = null;

    // Update URL if needed
    if (updateUrl && window.location.pathname !== `/project/${projectId}`) {
      history.pushState({ view: 'editor', projectId }, '', `/project/${projectId}`);
    }

    // Show editor view
    this.showEditorView();

    this.ws.send(JSON.stringify({
      type: 'selectProject',
      projectId
    }));
  }

  createNewProject() {
    // Skip modal and directly create project with default name
    this.ws.send(JSON.stringify({
      type: 'createProject',
      name: '新しいゲーム'
    }));
  }

  showNewGameModal() {
    this.newGameName.value = '';
    this.newGameModal.classList.remove('hidden');
    // Focus input after animation
    setTimeout(() => this.newGameName.focus(), 100);
  }

  hideNewGameModal() {
    this.newGameModal.classList.add('hidden');
  }

  confirmCreateProject() {
    const name = this.newGameName.value.trim() || '新しいゲーム';
    this.hideNewGameModal();

    this.ws.send(JSON.stringify({
      type: 'createProject',
      name: name
    }));
  }

  updatePreviewVisibility(hasProject) {
    if (hasProject) {
      this.gamePreview.style.display = 'block';
      this.noProjectMessage.classList.add('hidden');
    } else {
      this.gamePreview.style.display = 'none';
      this.noProjectMessage.classList.remove('hidden');
      this.currentProjectName = null;
      this.versionsButton.classList.add('hidden');
      this.viewCodeButton.classList.add('hidden');
      this.downloadButton.classList.add('hidden');
      this.hideVersionPanel();
    }
  }

  // Mobile keyboard handling for iOS/Android
  setupMobileKeyboardHandling() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    const inputContainer = document.querySelector('.chat-input-container');
    const chatMessages = document.getElementById('chatMessages');
    let isKeyboardVisible = false;

    const adjustForKeyboard = () => {
      if (document.activeElement !== this.chatInput) return;
      if (!window.visualViewport) return;

      const vv = window.visualViewport;
      const keyboardHeight = window.innerHeight - vv.height;

      console.log('[Keyboard]', {
        innerHeight: window.innerHeight,
        vvHeight: vv.height,
        keyboardHeight,
        offsetTop: vv.offsetTop
      });

      if (keyboardHeight > 100) {
        isKeyboardVisible = true;

        // Fixed position input at keyboard top
        if (inputContainer) {
          inputContainer.style.position = 'fixed';
          inputContainer.style.bottom = `${keyboardHeight}px`;
          inputContainer.style.left = '0';
          inputContainer.style.right = '0';
          inputContainer.style.zIndex = '1000';
          inputContainer.style.background = 'white';
          inputContainer.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.1)';
        }

        // Add padding to chat messages so content isn't hidden
        if (chatMessages) {
          chatMessages.style.paddingBottom = '120px';
          // Scroll to bottom
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    };

    const resetLayout = () => {
      console.log('[Keyboard] resetLayout called', { isKeyboardVisible });
      isKeyboardVisible = false;

      if (inputContainer) {
        inputContainer.style.position = '';
        inputContainer.style.bottom = '';
        inputContainer.style.left = '';
        inputContainer.style.right = '';
        inputContainer.style.zIndex = '';
        inputContainer.style.background = '';
        inputContainer.style.boxShadow = '';
      }

      if (chatMessages) {
        chatMessages.style.paddingBottom = '';
      }
    };

    // Focus event
    this.chatInput.addEventListener('focus', () => {
      console.log('[Keyboard] focus');
      setTimeout(adjustForKeyboard, 100);
      setTimeout(adjustForKeyboard, 300);
      setTimeout(adjustForKeyboard, 500);
    });

    // Blur event
    this.chatInput.addEventListener('blur', () => {
      console.log('[Keyboard] blur');
      setTimeout(resetLayout, 100);
      setTimeout(resetLayout, 300);
    });

    // Visual viewport events
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const vv = window.visualViewport;
        const keyboardHeight = window.innerHeight - vv.height;
        console.log('[Keyboard] viewport resize', { keyboardHeight, activeElement: document.activeElement?.id });

        if (keyboardHeight < 100) {
          // Keyboard is hidden
          resetLayout();
        } else if (document.activeElement === this.chatInput) {
          adjustForKeyboard();
        }
      });
    }

    // Also reset on touch outside input
    document.addEventListener('touchstart', (e) => {
      if (isKeyboardVisible && !inputContainer?.contains(e.target)) {
        // Tapped outside input area, keyboard will close
        setTimeout(resetLayout, 300);
      }
    });
  }

  sendMessage() {
    const content = this.chatInput.value.trim();
    console.log('[sendMessage]', { content, isProcessing: this.isProcessing, currentProjectId: this.currentProjectId });
    if (!content || this.isProcessing || !this.currentProjectId) {
      console.log('[sendMessage] BLOCKED', { content: !!content, isProcessing: this.isProcessing, hasProjectId: !!this.currentProjectId });
      return;
    }

    // Build final content with attached assets prepended (numbered)
    let finalContent = content;
    if (this.attachedAssetsList.length > 0) {
      const assetLines = this.attachedAssetsList.map((asset, index) =>
        `${index + 1}：画像「${asset.name}」を使用: ${asset.url}`
      ).join('\n');
      finalContent = assetLines + '\n\n' + content;
    }

    // Display message to user (show attached images as thumbnails)
    this.addMessage(content, 'user', { attachedAssets: this.attachedAssetsList.slice() });
    this.chatInput.value = '';
    this.clearAttachedAssets();

    // Include debug options
    const debugOptions = {
      disableSkills: this.disableSkillsToggle?.checked || false,
      useClaude: this.useClaudeToggle?.checked || false
    };

    this.ws.send(JSON.stringify({
      type: 'message',
      content: finalContent,
      debugOptions
    }));
  }

  stopGeneration() {
    if (!this.isProcessing) return;

    if (this.currentJobId) {
      this.ws.send(JSON.stringify({
        type: 'cancel',
        jobId: this.currentJobId
      }));
    } else {
      this.ws.send(JSON.stringify({
        type: 'cancel'
      }));
    }
  }

  addMessage(content, role, options = {}) {
    // Remove welcome message if present
    this.hideWelcomeMessage();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    // Use markdown for assistant messages, basic formatting for others
    if (role === 'assistant') {
      messageDiv.classList.add('markdown-body');

      // Check for suggestions in saved history (format: "提案: a、b、c")
      const suggestionMatch = content.match(/\n\n提案: (.+)$/);
      if (suggestionMatch) {
        const mainMessage = content.replace(/\n\n提案: .+$/, '');
        const suggestions = suggestionMatch[1].split('、');

        let html = this.parseMarkdown(mainMessage);
        html += '<div class="chat-suggestions">';
        suggestions.forEach((suggestion, i) => {
          html += `<button class="suggestion-btn" data-suggestion="${this.escapeHtml(suggestion.trim())}">${this.escapeHtml(suggestion.trim())}</button>`;
        });
        html += '</div>';
        messageDiv.innerHTML = html;

        // Attach click handlers
        messageDiv.querySelectorAll('.suggestion-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.applySuggestion(btn.dataset.suggestion);
          });
        });
      } else {
        messageDiv.innerHTML = this.parseMarkdown(content);
      }

      // Check if we have gemini changes for this message (realtime) or version hash (history)
      const geminiChange = options.geminiChange || this.lastGeminiChange;
      const hasGeminiChange = geminiChange && geminiChange.edits && geminiChange.edits.length > 0;
      const hasVersionHash = !!options.versionHash;

      // Add buttons if we have an active project and (showPlayButton is true OR we have changes)
      if (this.currentProjectId && (options.showPlayButton || hasGeminiChange || hasVersionHash)) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'message-buttons';

        // Add "Play Game" button only for the last assistant message
        if (options.showPlayButton) {
          const playBtn = document.createElement('button');
          playBtn.className = 'play-game-btn';
          playBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            ゲームを遊ぶ
          `;
          playBtn.addEventListener('click', () => {
            this.showPreviewPanel();
          });
          btnContainer.appendChild(playBtn);
        }

        // Add "View Changes" button
        if (hasGeminiChange) {
          // Realtime case: data already available
          const changesBtn = document.createElement('button');
          changesBtn.className = 'view-changes-btn';
          changesBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            変更箇所を見る
          `;
          const changeData = geminiChange;
          changesBtn.addEventListener('click', () => {
            this.showChangesModal(changeData);
          });
          btnContainer.appendChild(changesBtn);
          if (this.lastGeminiChange) {
            this.lastGeminiChange = null;
          }
        } else if (hasVersionHash) {
          // History case: fetch on demand
          const changesBtn = document.createElement('button');
          changesBtn.className = 'view-changes-btn';
          changesBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            変更箇所を見る
          `;
          const versionHash = options.versionHash;
          changesBtn.addEventListener('click', () => {
            this.fetchAndShowChanges(versionHash);
          });
          btnContainer.appendChild(changesBtn);
        }

        messageDiv.appendChild(btnContainer);
      }
    } else {
      const formattedContent = this.formatContent(content);
      messageDiv.innerHTML = formattedContent;
    }

    // Add attached asset thumbnails for user messages (with numbers)
    if (role === 'user' && options.attachedAssets && options.attachedAssets.length > 0) {
      const thumbsDiv = document.createElement('div');
      thumbsDiv.className = 'message-attached-assets';
      thumbsDiv.innerHTML = options.attachedAssets.map((asset, index) => `
        <div class="message-asset-thumb">
          <span class="message-asset-number">【${index + 1}】</span>
          <img src="${asset.url}" alt="${asset.name}" />
        </div>
      `).join('');
      messageDiv.insertBefore(thumbsDiv, messageDiv.firstChild);
    }

    this.chatMessages.appendChild(messageDiv);
    this.scrollToLatestMessage(messageDiv);
  }

  scrollToLatestMessage(messageDiv) {
    // Use scrollIntoView for better mobile keyboard handling
    // Delay slightly to ensure DOM is updated and keyboard state is stable
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (messageDiv && messageDiv.scrollIntoView) {
          messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
      }, 100);
    });
  }

  showWelcomeMessage() {
    // All possible game suggestions
    const allSuggestions = [
      { label: '宇宙シューティング', prompt: '宇宙を飛ぶシューティングゲームを作って' },
      { label: '動物集め', prompt: 'かわいい動物を集めるゲームを作って' },
      { label: 'ブロックパズル', prompt: 'ブロックを消すパズルゲームを作って' },
      { label: 'カーレース', prompt: '車のレースゲームを作って' },
      { label: 'ジャンプアクション', prompt: '障害物を飛び越えるジャンプゲームを作って' },
      { label: 'タップゲーム', prompt: '画面をタップして遊ぶゲームを作って' },
      { label: 'ボール転がし', prompt: 'ボールを転がして遊ぶ3Dゲームを作って' },
      { label: '迷路脱出', prompt: '迷路から脱出するゲームを作って' },
      { label: 'フルーツキャッチ', prompt: '落ちてくるフルーツをキャッチするゲームを作って' },
      { label: 'リズムゲーム', prompt: 'タイミングよくタップするリズムゲームを作って' },
      { label: '釣りゲーム', prompt: '魚を釣るシンプルなゲームを作って' },
      { label: 'モグラたたき', prompt: 'モグラたたきゲームを作って' },
      { label: '玉転がし', prompt: '玉を転がしてゴールを目指すゲームを作って' },
      { label: 'バブルシューター', prompt: '泡を飛ばして消すパズルゲームを作って' },
      { label: 'エンドレスラン', prompt: '走り続けるエンドレスランゲームを作って' },
    ];

    // Randomly select 3 suggestions
    const shuffled = allSuggestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-message';
    welcomeDiv.innerHTML = `
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </div>
      <h3>ようこそ！</h3>
      <p>どんなゲームを作りたいですか？<br>自由に話しかけてください。</p>
      <div class="welcome-examples">
        <span class="example-label">例えば...</span>
        <div class="example-chips">
          ${selected.map(s => `<button class="example-chip" data-prompt="${s.prompt}">${s.label}</button>`).join('')}
        </div>
      </div>
    `;

    // Add click handlers for example chips
    welcomeDiv.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.chatInput.value = chip.dataset.prompt;
        this.chatInput.focus();
        // Remove welcome message
        this.hideWelcomeMessage();
      });
    });

    this.chatMessages.appendChild(welcomeDiv);
  }

  formatContent(content) {
    let escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }

  hideWelcomeMessage() {
    const welcome = this.chatMessages.querySelector('.welcome-message');
    if (welcome) {
      welcome.remove();
    }
  }

  // ==================== Notifications ====================

  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'default') {
      // Don't ask immediately - wait for user interaction
      // We'll ask when they start their first job
      return;
    }

    this.notificationPermission = Notification.permission;
  }

  async askNotificationPermission() {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
      this.notificationPermission = 'granted';
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      return permission === 'granted';
    }

    return false;
  }

  showNotification(title, options = {}) {
    console.log('[Notification] Attempting to show:', title);
    console.log('[Notification] visibilityState:', document.visibilityState);
    console.log('[Notification] permission:', this.notificationPermission);

    // Only show if page is not visible and permission granted
    if (document.visibilityState === 'visible') {
      console.log('[Notification] Skipped: page is visible');
      return;
    }
    if (this.notificationPermission !== 'granted') {
      console.log('[Notification] Skipped: permission not granted');
      return;
    }

    console.log('[Notification] Showing notification!');

    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'game-creator',
      renotify: true,
      ...options
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }

  showChangesModal(data) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('changesModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'changesModal';
      modal.className = 'changes-modal hidden';
      modal.innerHTML = `
        <div class="changes-modal-backdrop"></div>
        <div class="changes-modal-content">
          <div class="changes-modal-header">
            <h3>変更内容</h3>
            <button class="changes-modal-close">&times;</button>
          </div>
          <div class="changes-modal-body"></div>
        </div>
      `;
      document.body.appendChild(modal);

      // Close handlers
      modal.querySelector('.changes-modal-backdrop').addEventListener('click', () => {
        modal.classList.add('hidden');
      });
      modal.querySelector('.changes-modal-close').addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    // Build content
    const body = modal.querySelector('.changes-modal-body');
    const isEdit = data.mode === 'edit';

    let html = '';
    if (data.summary) {
      html += `<div class="changes-summary">${this.escapeHtml(data.summary)}</div>`;
    }

    if (data.edits && data.edits.length > 0) {
      data.edits.forEach((edit, i) => {
        if (edit.diff) {
          // Git diff format
          html += `
            <div class="changes-file">
              <div class="changes-file-header">index.html</div>
              <pre class="changes-diff"><code>${this.escapeHtml(edit.diff)}</code></pre>
            </div>
          `;
        } else if (edit.old_string && edit.new_string) {
          // Structured edit format
          html += `
            <div class="changes-file">
              <div class="changes-file-header">${this.escapeHtml(edit.path || 'index.html')}</div>
              <pre class="changes-diff">
<code class="diff-old">- ${this.escapeHtml(edit.old_string)}</code>
<code class="diff-new">+ ${this.escapeHtml(edit.new_string)}</code>
</pre>
            </div>
          `;
        }
      });
    } else if (data.files) {
      data.files.forEach(file => {
        html += `
          <div class="changes-file">
            <div class="changes-file-header">${this.escapeHtml(file.path)}</div>
            <pre class="changes-code"><code>${this.escapeHtml(file.content)}</code></pre>
          </div>
        `;
      });
    }

    body.innerHTML = html;
    modal.classList.remove('hidden');
  }

  // Fetch version edits on demand and show modal
  fetchAndShowChanges(versionHash) {
    // Show loading state
    this.showChangesModal({ edits: [], summary: '読み込み中...' });

    // Request edits from server
    this.ws.send(JSON.stringify({
      type: 'getVersionEdits',
      projectId: this.currentProjectId,
      versionHash
    }));

    // Handle response (one-time listener)
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'versionEdits' && data.versionHash === versionHash) {
          this.ws.removeEventListener('message', handler);
          this.showChangesModal({
            edits: data.edits || [],
            summary: data.summary || ''
          });
        }
      } catch (e) {
        console.error('Failed to parse version edits:', e);
      }
    };
    this.ws.addEventListener('message', handler);

    // Timeout cleanup
    setTimeout(() => {
      this.ws.removeEventListener('message', handler);
    }, 10000);
  }

  displayGeneratedCode(data) {
    // Store the change data for later viewing
    this.lastGeminiChange = data;
    console.log('[DEBUG] geminiCode received:', data);

    // Save to localStorage for persistence across page reloads
    if (this.currentProjectId) {
      try {
        localStorage.setItem(`geminiChange_${this.currentProjectId}`, JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to save gemini change to localStorage:', e);
      }
    }
    // Don't display anything in chat - changes will be shown via "変更箇所を見る" button
    // The summary will be displayed in the completed message instead
  }

  // Fetch AI context (edits, summary) from server
  async fetchAIContext() {
    if (!this.currentProjectId || !this.visitorId) return null;
    try {
      const response = await fetch(`/api/projects/${this.currentProjectId}/ai-context?visitorId=${this.visitorId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.context && data.context.edits && data.context.edits.length > 0) {
          return {
            mode: 'edit',  // Required for showChangesModal to display edits
            summary: data.context.aiSummary,
            edits: data.context.edits
          };
        }
      }
    } catch (e) {
      console.warn('Failed to fetch AI context from server:', e);
    }
    return null;
  }

  // Load saved Gemini change from localStorage (fallback)
  loadSavedGeminiChange() {
    if (!this.currentProjectId) return null;
    try {
      const saved = localStorage.getItem(`geminiChange_${this.currentProjectId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load gemini change from localStorage:', e);
    }
    return null;
  }

  // Simple markdown to HTML conversion
  parseMarkdown(text) {
    return text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Line breaks (double newline = paragraph, single = br)
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Wrap in paragraph
      .replace(/^(.+)$/, '<p>$1</p>')
      // Clean up empty paragraphs
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[234]>)/g, '$1')
      .replace(/(<\/h[234]>)<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1');
  }

  // Display chat response (no code changes, just conversation)
  displayChatResponse(data) {
    console.log('[displayChatResponse]', data);
    // Remove welcome message if present
    this.hideWelcomeMessage();
    // Hide streaming indicator
    this.hideStreaming();
    this.isProcessing = false;
    this.sendButton.disabled = false;
    this.stopButton.classList.add('hidden');
    console.log('[displayChatResponse] isProcessing set to false');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant chat-response';

    let html = `<div class="message-content markdown-body">${this.parseMarkdown(data.message)}</div>`;

    // Show suggestions as clickable buttons
    if (data.suggestions && data.suggestions.length > 0) {
      html += '<div class="chat-suggestions">';
      data.suggestions.forEach((suggestion, i) => {
        const btnId = `suggestion-${Date.now()}-${i}`;
        html += `<button class="suggestion-btn" id="${btnId}" data-suggestion="${this.escapeHtml(suggestion)}">${this.escapeHtml(suggestion)}</button>`;
      });
      html += '</div>';
    }

    messageDiv.innerHTML = html;
    this.chatMessages.appendChild(messageDiv);

    // Attach click handlers after DOM insertion
    messageDiv.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applySuggestion(btn.dataset.suggestion);
      });
    });

    this.scrollToLatestMessage(messageDiv);
  }

  // Display restore confirmation dialog
  displayRestoreConfirm(data) {
    // Hide streaming indicator
    this.hideStreaming();
    // Remove welcome message if present
    this.hideWelcomeMessage();
    this.isProcessing = false;
    this.sendButton.disabled = false;
    this.stopButton.classList.add('hidden');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant restore-confirm';

    const confirmLabel = data.confirmLabel || '戻す';
    const cancelLabel = data.cancelLabel || 'キャンセル';
    const confirmId = `restore-confirm-${Date.now()}`;
    const cancelId = `restore-cancel-${Date.now()}`;

    messageDiv.innerHTML = `
      <div class="message-content">${this.escapeHtml(data.message)}</div>
      <div class="restore-buttons">
        <button class="restore-btn confirm" id="${confirmId}">${this.escapeHtml(confirmLabel)}</button>
        <button class="restore-btn cancel" id="${cancelId}">${this.escapeHtml(cancelLabel)}</button>
      </div>
    `;

    this.chatMessages.appendChild(messageDiv);

    // Attach click handlers
    const confirmBtn = document.getElementById(confirmId);
    console.log('Attaching click handler to confirm button:', confirmId, confirmBtn);
    confirmBtn.addEventListener('click', () => {
      console.log('Confirm button clicked!');
      this.executeRestore();
      messageDiv.querySelector('.restore-buttons').remove();
    });

    document.getElementById(cancelId).addEventListener('click', () => {
      this.addMessage('キャンセルしました', 'system');
      messageDiv.querySelector('.restore-buttons').remove();
    });

    this.scrollToLatestMessage(messageDiv);
  }

  // Execute restore to previous version
  executeRestore() {
    console.log('executeRestore called, projectId:', this.currentProjectId);
    // Request versions list first to get the previous version
    this.ws.send(JSON.stringify({
      type: 'getVersions',
      projectId: this.currentProjectId
    }));
    // Set flag to auto-restore when versions are received
    this.pendingRestore = true;
    console.log('pendingRestore set to true');
  }

  // Apply a suggestion from chat response
  // For dimension selection (2Dで作成/3Dで作成), send immediately
  // For other suggestions, append to input
  applySuggestion(suggestion) {
    console.log('[applySuggestion]', suggestion, 'isProcessing:', this.isProcessing);
    // Check if this is a dimension selection (should send immediately)
    if (suggestion === '2Dで作成' || suggestion === '3Dで作成') {
      // Send immediately without adding して
      console.log('[applySuggestion] Dimension selection, sending immediately');
      // Force reset processing state for dimension selection
      this.isProcessing = false;
      this.sendButton.disabled = false;
      this.chatInput.value = suggestion;
      this.sendMessage();
      return;
    }

    // For other suggestions, use as-is (suggestions already come in complete form)
    const current = this.chatInput.value.trim();
    if (current) {
      // Append with 、
      this.chatInput.value = current + '、' + suggestion;
    } else {
      this.chatInput.value = suggestion;
    }
    this.chatInput.focus();
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  refreshPreview() {
    if (this.visitorId && this.currentProjectId) {
      // Show loading status
      this.updateGameStatus('loading', '読み込み中...');
      this.currentErrors = [];
      this.hideErrorPanel();

      const timestamp = Date.now();
      this.gamePreview.src = `/game/${this.visitorId}/${this.currentProjectId}/index.html?t=${timestamp}`;
    }
  }

  updateStatus(className, text) {
    this.statusIndicator.className = `status-indicator ${className}`;
    this.statusIndicator.textContent = text;
  }

  // Version methods
  toggleVersionPanel() {
    if (this.versionPanel.classList.contains('hidden')) {
      this.showVersionPanel();
    } else {
      this.hideVersionPanel();
    }
  }

  showVersionPanel() {
    if (!this.currentProjectId) return;

    this.ws.send(JSON.stringify({
      type: 'getVersions',
      projectId: this.currentProjectId
    }));

    this.versionPanel.classList.remove('hidden');
  }

  hideVersionPanel() {
    this.versionPanel.classList.add('hidden');
  }

  // Code viewer methods
  async showCodeViewer() {
    if (!this.currentProjectId || !this.visitorId) return;

    try {
      const response = await fetch(`/api/projects/${this.currentProjectId}/code?visitorId=${this.visitorId}`);
      const data = await response.json();

      if (data.code) {
        this.codeViewerCode.textContent = data.code;
        this.codeViewerModal.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Failed to fetch code:', error);
    }
  }

  hideCodeViewer() {
    this.codeViewerModal.classList.add('hidden');
  }

  async copyCode() {
    const code = this.codeViewerCode.textContent;
    let success = false;

    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(code);
        success = true;
      } catch (error) {
        console.warn('Clipboard API failed, trying fallback:', error);
      }
    }

    // Fallback for non-HTTPS or unsupported browsers
    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (error) {
        console.error('Fallback copy failed:', error);
      }
    }

    if (success) {
      this.copyCodeButton.classList.add('copied');
      this.copyCodeButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        コピー完了
      `;
      setTimeout(() => {
        this.copyCodeButton.classList.remove('copied');
        this.copyCodeButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          コピー
        `;
      }, 2000);
    } else {
      alert('コピーに失敗しました。手動でコードを選択してコピーしてください。');
    }
  }

  async downloadProject() {
    if (!this.currentProjectId || !this.visitorId) return;

    try {
      const response = await fetch(`/api/projects/${this.currentProjectId}/download?visitorId=${this.visitorId}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentProjectName || 'game'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download:', error);
    }
  }

  displayVersions(versions) {
    this.versionList.innerHTML = '';

    if (versions.length === 0) {
      this.versionList.innerHTML = '<div class="version-item"><span style="color:#666">No versions yet</span></div>';
      return;
    }

    versions.forEach((v, index) => {
      const item = document.createElement('div');
      item.className = 'version-item';

      // Determine if this version is currently displayed
      const isCurrent = this.currentVersionId ? (v.id === this.currentVersionId) : (index === 0);
      if (isCurrent) item.classList.add('current');

      const time = new Date(v.timestamp).toLocaleString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      item.innerHTML = `
        <div class="version-item-header">
          <span class="version-id">${v.id.substring(0, 7)}</span>
          <span class="version-time">${time}</span>
        </div>
        <div class="version-message">${this.escapeHtml(v.message)}</div>
        ${isCurrent ? '<span class="version-current-badge">現在</span>' : `<button class="version-restore" data-version="${v.id}">復元</button>`}
      `;

      const restoreBtn = item.querySelector('.version-restore');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.restoreVersion(v.id);
        });
      }

      this.versionList.appendChild(item);
    });
  }

  restoreVersion(versionId) {
    if (!this.currentProjectId) return;

    // Show custom restore modal
    this.pendingRestoreVersionId = versionId;
    this.restoreModalMessage.textContent = `バージョン ${versionId} に戻しますか？`;
    this.restoreModal.classList.remove('hidden');
  }

  hideRestoreModal() {
    this.restoreModal.classList.add('hidden');
    this.pendingRestoreVersionId = null;
  }

  confirmRestore() {
    if (!this.pendingRestoreVersionId || !this.currentProjectId) {
      this.hideRestoreModal();
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'restoreVersion',
      projectId: this.currentProjectId,
      versionId: this.pendingRestoreVersionId
    }));

    this.hideRestoreModal();
  }

  // Streaming methods
  showStreaming() {
    this.streamingText = '';
    this.streamingOutput.innerHTML = '<span class="cursor"></span>';
    this.streamingStatus.textContent = '生成中...';
    this.streamingStatus.className = 'streaming-status';
    this.streamingFile.textContent = 'index.html';
    this.streamingContainer.classList.remove('hidden');
    this.typewriterQueue = [];
    this.isTyping = false;
  }

  hideStreaming() {
    this.streamingContainer.classList.add('hidden');
    this.typewriterQueue = [];
    this.isTyping = false;
  }

  completeStreaming() {
    this.streamingStatus.textContent = '完了';
    this.streamingStatus.className = 'streaming-status completed';

    // Remove cursor
    const cursor = this.streamingOutput.querySelector('.cursor');
    if (cursor) cursor.remove();

    // Hide after delay
    setTimeout(() => {
      this.hideStreaming();
    }, 2000);
  }

  updateStreamingStatus(message) {
    this.streamingStatus.textContent = message;
  }

  updateStreamingFile(filename, status) {
    if (status === 'editing') {
      this.streamingFile.textContent = `editing ${filename}...`;
    } else if (status === 'completed') {
      this.streamingFile.textContent = `${filename}`;
    }
  }

  appendToStream(content) {
    // Add content to queue for typewriter effect
    this.typewriterQueue.push(...content.split(''));

    if (!this.isTyping) {
      this.processTypewriterQueue();
    }
  }

  processTypewriterQueue() {
    if (this.typewriterQueue.length === 0) {
      this.isTyping = false;
      return;
    }

    this.isTyping = true;

    // If tab is hidden (background), process all at once to avoid setTimeout throttling
    const isBackground = document.hidden;
    const charsToProcess = isBackground
      ? this.typewriterQueue.length  // Process all when in background
      : Math.min(5, this.typewriterQueue.length);  // Normal typewriter effect
    let newText = '';

    for (let i = 0; i < charsToProcess; i++) {
      newText += this.typewriterQueue.shift();
    }

    this.streamingText += newText;

    // Update display (keep only last 2000 chars for performance)
    const displayText = this.streamingText.length > 2000
      ? '...' + this.streamingText.slice(-2000)
      : this.streamingText;

    // Escape HTML and add cursor
    const escaped = displayText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    this.streamingOutput.innerHTML = escaped + '<span class="cursor"></span>';

    // Auto-scroll to bottom
    this.streamingOutput.scrollTop = this.streamingOutput.scrollHeight;

    // Continue processing with slight delay for animation effect
    setTimeout(() => this.processTypewriterQueue(), 10);
  }

  // ==================== Asset Management ====================

  setupAssetListeners() {
    // Open/close modal
    this.assetButton.addEventListener('click', () => this.openAssetModal());
    this.closeAssetModal.addEventListener('click', () => this.closeAssetModalHandler());
    this.assetModal.addEventListener('click', (e) => {
      if (e.target === this.assetModal) this.closeAssetModalHandler();
    });

    // Tab switching
    this.assetTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.assetTabs.forEach(t => t.classList.remove('active'));
        this.assetTabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Search
    this.assetSearch.addEventListener('input', () => {
      this.searchAssets(this.assetSearch.value);
    });

    // Upload area
    this.uploadArea.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

    // Drag and drop
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragover');
    });
    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragover');
    });
    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragover');
      this.handleFileSelect(e.dataTransfer.files);
    });

    // Upload submit
    this.uploadSubmit.addEventListener('click', () => this.uploadFiles());

    // Insert asset
    this.insertAssetButton.addEventListener('click', () => this.insertAssetToChat());
  }

  openAssetModal() {
    this.assetModal.classList.remove('hidden');
    this.loadAssets();
  }

  closeAssetModalHandler() {
    this.assetModal.classList.add('hidden');
    this.selectedAsset = null;
    this.clearSelection();
  }

  async loadAssets() {
    if (!this.visitorId) return;

    try {
      const currentProjectId = this.currentProjectId || '';
      const response = await fetch(`/api/assets?visitorId=${this.visitorId}&currentProjectId=${currentProjectId}`);
      const data = await response.json();

      this.renderAssetGridGrouped(this.myAssetGrid, data.assets, true, currentProjectId);

      // Also load public assets
      const publicResponse = await fetch(`/api/assets/search?visitorId=${this.visitorId}`);
      const publicData = await publicResponse.json();
      const publicAssets = publicData.assets.filter(a => a.isPublic && !a.isOwner);
      this.renderAssetGrid(this.publicAssetGrid, publicAssets, false);
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  }

  async searchAssets(query) {
    if (!this.visitorId) return;

    try {
      const url = query
        ? `/api/assets/search?visitorId=${this.visitorId}&q=${encodeURIComponent(query)}`
        : `/api/assets?visitorId=${this.visitorId}`;

      const response = await fetch(url);
      const data = await response.json();
      this.renderAssetGrid(this.myAssetGrid, data.assets, true);
    } catch (error) {
      console.error('Error searching assets:', error);
    }
  }

  renderAssetGridGrouped(container, assets, showActions, currentProjectId) {
    if (assets.length === 0) {
      container.innerHTML = `
        <div class="asset-empty">
          <div class="asset-empty-icon">📁</div>
          <p>No assets found</p>
        </div>
      `;
      return;
    }

    // Group assets by project
    const currentProjectAssets = [];
    const otherProjectGroups = new Map(); // projectId -> { name, assets }
    const unassignedAssets = [];

    assets.forEach(asset => {
      if (!asset.projects || asset.projects.length === 0) {
        unassignedAssets.push(asset);
      } else {
        // Check if this asset belongs to current project
        const isCurrentProject = asset.projects.some(p => p.id === currentProjectId);
        if (isCurrentProject && currentProjectId) {
          currentProjectAssets.push(asset);
        }
        // Also add to other project groups (asset can belong to multiple projects)
        asset.projects.forEach(project => {
          if (project.id !== currentProjectId) {
            if (!otherProjectGroups.has(project.id)) {
              otherProjectGroups.set(project.id, { name: project.name, assets: [] });
            }
            // Avoid duplicates
            const group = otherProjectGroups.get(project.id);
            if (!group.assets.some(a => a.id === asset.id)) {
              group.assets.push(asset);
            }
          }
        });
      }
    });

    let html = '';

    // Current project assets first
    if (currentProjectAssets.length > 0) {
      const currentProject = currentProjectAssets[0].projects.find(p => p.id === currentProjectId);
      const projectName = currentProject ? currentProject.name : 'Current Project';
      html += `
        <div class="asset-group current-project">
          <div class="asset-group-header">
            <span class="asset-group-icon">📂</span>
            <span class="asset-group-name">${projectName}</span>
            <span class="asset-group-badge current">作業中</span>
            <span class="asset-group-count">${currentProjectAssets.length}</span>
          </div>
          <div class="asset-group-grid">
            ${this.renderAssetItems(currentProjectAssets, showActions)}
          </div>
        </div>
      `;
    }

    // Other project groups
    otherProjectGroups.forEach((group, projectId) => {
      html += `
        <div class="asset-group" data-project-id="${projectId}">
          <div class="asset-group-header">
            <span class="asset-group-icon">📁</span>
            <span class="asset-group-name">${group.name}</span>
            <span class="asset-group-count">${group.assets.length}</span>
          </div>
          <div class="asset-group-grid">
            ${this.renderAssetItems(group.assets, showActions)}
          </div>
        </div>
      `;
    });

    // Unassigned assets
    if (unassignedAssets.length > 0) {
      html += `
        <div class="asset-group unassigned">
          <div class="asset-group-header">
            <span class="asset-group-icon">📎</span>
            <span class="asset-group-name">未分類</span>
            <span class="asset-group-count">${unassignedAssets.length}</span>
          </div>
          <div class="asset-group-grid">
            ${this.renderAssetItems(unassignedAssets, showActions)}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add click handlers for selection
    container.querySelectorAll('.asset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        this.selectAsset(item);
      });
    });
  }

  renderAssetItems(assets, showActions) {
    return assets.map(asset => `
      <div class="asset-item ${asset.isPublic ? 'public-badge' : ''}" data-id="${asset.id}" data-url="${asset.url}" data-name="${asset.filename}">
        <div class="asset-thumb">
          ${this.getAssetThumb(asset)}
        </div>
        <div class="asset-name" title="${asset.filename}">${asset.filename}</div>
        ${showActions && asset.isOwner !== false ? `
          <div class="asset-actions">
            <button onclick="app.toggleAssetPublic('${asset.id}', ${!asset.isPublic})">${asset.isPublic ? '🔒' : '🌐'}</button>
            <button onclick="app.deleteAsset('${asset.id}')">🗑️</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  renderAssetGrid(container, assets, showActions) {
    if (assets.length === 0) {
      container.innerHTML = `
        <div class="asset-empty">
          <div class="asset-empty-icon">📁</div>
          <p>No assets found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = assets.map(asset => `
      <div class="asset-item ${asset.isPublic ? 'public-badge' : ''}" data-id="${asset.id}" data-url="${asset.url}" data-name="${asset.filename}">
        <div class="asset-thumb">
          ${this.getAssetThumb(asset)}
        </div>
        <div class="asset-name" title="${asset.filename}">${asset.filename}</div>
        ${showActions && asset.isOwner !== false ? `
          <div class="asset-actions">
            <button onclick="app.toggleAssetPublic('${asset.id}', ${!asset.isPublic})">${asset.isPublic ? '🔒' : '🌐'}</button>
            <button onclick="app.deleteAsset('${asset.id}')">🗑️</button>
          </div>
        ` : ''}
      </div>
    `).join('');

    // Add click handlers for selection
    container.querySelectorAll('.asset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        this.selectAsset(item);
      });
    });
  }

  getAssetThumb(asset) {
    if (asset.mimeType?.startsWith('image/')) {
      return `<img src="${asset.url}" alt="${asset.filename}">`;
    } else if (asset.mimeType?.startsWith('audio/')) {
      return `<span class="audio-icon">🎵</span>`;
    } else {
      return `<span class="audio-icon">📄</span>`;
    }
  }

  selectAsset(item) {
    // Clear previous selection
    this.assetModal.querySelectorAll('.asset-item.selected').forEach(i => {
      i.classList.remove('selected');
    });

    item.classList.add('selected');
    this.selectedAsset = {
      id: item.dataset.id,
      url: item.dataset.url,
      name: item.dataset.name
    };

    this.selectedAssetInfo.textContent = `Selected: ${this.selectedAsset.name}`;
    this.insertAssetButton.classList.remove('hidden');
  }

  clearSelection() {
    this.assetModal.querySelectorAll('.asset-item.selected').forEach(i => {
      i.classList.remove('selected');
    });
    this.selectedAssetInfo.textContent = '';
    this.insertAssetButton.classList.add('hidden');
  }

  handleFileSelect(files) {
    this.pendingUploads = Array.from(files);

    // Show preview
    this.uploadPreview.innerHTML = this.pendingUploads.map((file, index) => `
      <div class="upload-preview-item">
        ${file.type.startsWith('image/')
          ? `<img src="${URL.createObjectURL(file)}" alt="${file.name}">`
          : `<span>📄</span>`
        }
        <span class="name">${file.name}</span>
        <button class="remove" onclick="app.removeUpload(${index})">×</button>
      </div>
    `).join('');

    if (this.pendingUploads.length > 0) {
      this.uploadForm.classList.remove('hidden');
    }
  }

  removeUpload(index) {
    this.pendingUploads.splice(index, 1);
    this.handleFileSelect(this.pendingUploads);

    if (this.pendingUploads.length === 0) {
      this.uploadForm.classList.add('hidden');
    }
  }

  async uploadFiles() {
    if (this.pendingUploads.length === 0 || !this.visitorId) return;

    const tags = this.assetTags.value;
    const description = this.assetDescription.value;

    for (const file of this.pendingUploads) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('visitorId', this.visitorId);
      if (tags) formData.append('tags', tags);
      if (description) formData.append('description', description);

      try {
        const response = await fetch('/api/assets/upload', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        if (data.success) {
          console.log('Uploaded:', data.asset);
        } else {
          console.error('Upload failed:', data.error);
        }
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    // Clear and reload
    this.pendingUploads = [];
    this.uploadPreview.innerHTML = '';
    this.uploadForm.classList.add('hidden');
    this.assetTags.value = '';
    this.assetDescription.value = '';
    this.fileInput.value = '';

    // Reload assets
    this.loadAssets();

    // Switch to My Assets tab
    this.assetTabs[0].click();
  }

  async toggleAssetPublic(assetId, isPublic) {
    try {
      await fetch(`/api/assets/${assetId}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: this.visitorId, isPublic })
      });
      this.loadAssets();
    } catch (error) {
      console.error('Error toggling public:', error);
    }
  }

  async deleteAsset(assetId) {
    if (!confirm('Delete this asset?')) return;

    try {
      await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: this.visitorId })
      });
      this.loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
    }
  }

  insertAssetToChat() {
    if (!this.selectedAsset) return;

    // Check if already attached
    const alreadyAttached = this.attachedAssetsList.some(a => a.id === this.selectedAsset.id);
    if (!alreadyAttached) {
      this.attachedAssetsList.push({
        id: this.selectedAsset.id,
        name: this.selectedAsset.name,
        url: `/api/assets/${this.selectedAsset.id}`
      });
      this.renderAttachedAssets();
    }

    this.closeAssetModalHandler();
    this.chatInput.focus();
  }

  renderAttachedAssets() {
    if (this.attachedAssetsList.length === 0) {
      this.attachedAssetsContainer.classList.add('hidden');
      this.attachedAssetsContainer.innerHTML = '';
      return;
    }

    this.attachedAssetsContainer.classList.remove('hidden');
    this.attachedAssetsContainer.innerHTML = this.attachedAssetsList.map((asset, index) => `
      <div class="attached-asset-item" data-id="${asset.id}">
        <span class="attached-asset-number">【${index + 1}】</span>
        <img src="${asset.url}" alt="${asset.name}" />
        <span class="attached-asset-name">${asset.name}</span>
        <button class="attached-asset-remove" data-id="${asset.id}" title="削除">×</button>
      </div>
    `).join('');

    // Add remove handlers
    this.attachedAssetsContainer.querySelectorAll('.attached-asset-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeAttachedAsset(btn.dataset.id);
      });
    });
  }

  removeAttachedAsset(assetId) {
    this.attachedAssetsList = this.attachedAssetsList.filter(a => a.id !== assetId);
    this.renderAttachedAssets();
  }

  clearAttachedAssets() {
    this.attachedAssetsList = [];
    this.renderAttachedAssets();
  }

  // ==================== Image Generation ====================

  setupImageGenListeners() {
    // Open/close modal
    this.imageGenButton.addEventListener('click', () => this.openImageGenModal());
    this.closeImageGenModal.addEventListener('click', () => this.closeImageGenModalHandler());
    this.imageGenModal.addEventListener('click', (e) => {
      if (e.target === this.imageGenModal) this.closeImageGenModalHandler();
    });

    // Generate button
    this.generateImageButton.addEventListener('click', () => this.generateImage());

    // Insert button
    this.insertImageButton.addEventListener('click', () => this.insertGeneratedImage());

    // Download button
    this.downloadImageButton.addEventListener('click', () => this.downloadGeneratedImage());
  }

  openImageGenModal() {
    this.imageGenModal.classList.remove('hidden');
    this.imageGenPrompt.focus();
  }

  closeImageGenModalHandler() {
    this.imageGenModal.classList.add('hidden');
    this.resetImageGenState();
  }

  resetImageGenState() {
    this.imageGenPrompt.value = '';
    this.imageGenStyle.value = '';
    this.imageGenSize.value = '512x512';
    this.generatedImageData = null;
    this.imagePlaceholder.classList.remove('hidden');
    this.generatedImage.classList.add('hidden');
    this.imageGenLoading.classList.add('hidden');
    this.insertImageButton.classList.add('hidden');
    this.insertImageButton.disabled = true;
    this.downloadImageButton.classList.add('hidden');
    this.downloadImageButton.disabled = true;
  }

  async generateImage() {
    const prompt = this.imageGenPrompt.value.trim();
    if (!prompt) {
      alert('Please enter a description for the image.');
      return;
    }

    const style = this.imageGenStyle.value;
    const size = this.imageGenSize.value;

    // Show loading state
    this.imagePlaceholder.classList.add('hidden');
    this.generatedImage.classList.add('hidden');
    this.imageGenLoading.classList.remove('hidden');
    this.generateImageButton.disabled = true;

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, size })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Image generation failed');
      }

      // Display generated image
      this.generatedImageData = data.image;
      this.generatedImage.src = data.image;
      this.generatedImage.classList.remove('hidden');
      this.imageGenLoading.classList.add('hidden');

      // Enable action buttons
      this.insertImageButton.classList.remove('hidden');
      this.insertImageButton.disabled = false;
      this.downloadImageButton.classList.remove('hidden');
      this.downloadImageButton.disabled = false;

    } catch (error) {
      console.error('Image generation error:', error);
      this.imageGenLoading.classList.add('hidden');
      this.imagePlaceholder.classList.remove('hidden');
      alert('Image generation failed: ' + error.message);
    } finally {
      this.generateImageButton.disabled = false;
    }
  }

  insertGeneratedImage() {
    if (!this.generatedImageData) return;

    // Insert image data reference into chat
    const prompt = this.imageGenPrompt.value.trim();
    const imageRef = `[Generated Image: ${prompt}]\n画像データ: ${this.generatedImageData.substring(0, 100)}...`;
    this.chatInput.value += (this.chatInput.value ? '\n' : '') + imageRef;

    this.closeImageGenModalHandler();
    this.chatInput.focus();
  }

  downloadGeneratedImage() {
    if (!this.generatedImageData) return;

    // Create download link
    const link = document.createElement('a');
    link.href = this.generatedImageData;
    link.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==================== Style Selection (Chat-based) ====================

  setupStyleSelectListeners() {
    // No modal listeners needed - everything happens in chat
  }

  // Display style selection as a chat message
  displayStyleSelection(dimension, styles, originalMessage) {
    // Remove welcome message if present
    this.hideWelcomeMessage();
    // Hide any processing state
    this.isProcessing = false;
    this.sendButton.disabled = false;
    this.stopButton.classList.add('hidden');
    this.hideStreaming();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant style-selection-message';

    const messageId = `style-select-${Date.now()}`;
    const initialCount = 10;
    const hasMore = styles.length > initialCount;

    let html = `
      <div class="message-content">ビジュアルスタイルを選んでください</div>
      <div class="style-scroll-container">
        <div class="style-scroll-track" id="${messageId}">
    `;

    styles.forEach((style, index) => {
      const hiddenClass = index >= initialCount ? 'style-card-hidden' : '';

      html += `
        <div class="style-card-chat ${hiddenClass}" data-style-id="${style.id}" data-dimension="${dimension}" data-original-message="${this.escapeHtml(originalMessage)}">
          <div class="style-card-image-chat">
            ${style.imageUrl
              ? `<img src="${style.imageUrl}" alt="${style.name}" loading="lazy" onerror="this.style.display='none'">`
              : ''
            }
          </div>
          <div class="style-card-info-chat">
            <div class="style-card-name-chat">${this.escapeHtml(style.name)}</div>
          </div>
        </div>
      `;
    });

    // "もっと見る" button (inside scroll track, at the end)
    if (hasMore) {
      html += `
        <div class="style-card-more" id="${messageId}-more">
          <button class="style-more-btn">+${styles.length - initialCount}<br><span>もっと見る</span></button>
        </div>
      `;
    }

    html += `
        </div>
      </div>
      <div class="style-custom-chat">
        <button class="style-custom-btn-chat" data-original-message="${this.escapeHtml(originalMessage)}">スキップ</button>
      </div>
    `;

    messageDiv.innerHTML = html;
    this.chatMessages.appendChild(messageDiv);

    // "もっと見る" button handler
    if (hasMore) {
      const moreBtn = messageDiv.querySelector('.style-more-btn');
      moreBtn.addEventListener('click', () => {
        // Show all hidden cards
        messageDiv.querySelectorAll('.style-card-hidden').forEach(card => {
          card.classList.remove('style-card-hidden');
        });
        // Hide the "more" button
        messageDiv.querySelector('.style-card-more').style.display = 'none';
      });
    }

    // Add click handlers for style cards
    messageDiv.querySelectorAll('.style-card-chat').forEach(card => {
      card.addEventListener('click', () => {
        const styleId = card.dataset.styleId;
        const dim = card.dataset.dimension;
        const origMsg = card.dataset.originalMessage;
        const styleName = card.querySelector('.style-card-name-chat')?.textContent || styleId;

        // Disable further clicks
        messageDiv.querySelectorAll('.style-card-chat').forEach(c => c.style.pointerEvents = 'none');
        messageDiv.querySelector('.style-custom-btn-chat').disabled = true;
        const moreBtn = messageDiv.querySelector('.style-more-btn');
        if (moreBtn) moreBtn.disabled = true;

        // Highlight selected card
        card.classList.add('selected');

        // Add user message showing selection
        this.addMessage(`スタイル: ${styleName}`, 'user');

        // Send message with selected style
        this.ws.send(JSON.stringify({
          type: 'message',
          content: origMsg,
          selectedStyle: {
            dimension: dim,
            styleId: styleId
          }
        }));
      });
    });

    // Add click handler for custom button
    messageDiv.querySelector('.style-custom-btn-chat').addEventListener('click', (e) => {
      const origMsg = e.target.dataset.originalMessage;

      // Disable further clicks
      messageDiv.querySelectorAll('.style-card-chat').forEach(c => c.style.pointerEvents = 'none');
      e.target.disabled = true;

      // Send with skip flag
      this.ws.send(JSON.stringify({
        type: 'message',
        content: origMsg,
        skipStyleSelection: true
      }));
    });

    this.scrollToLatestMessage(messageDiv);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new GameCreatorApp();
});
