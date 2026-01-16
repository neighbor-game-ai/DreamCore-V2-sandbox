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

    // DOM elements (editor view)
    this.chatMessages = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.sendButton = document.getElementById('sendButton');
    this.stopButton = document.getElementById('stopButton');
    this.refreshButton = document.getElementById('refreshButton');
    this.newProjectButton = document.getElementById('newProjectButton');
    this.gamePreview = document.getElementById('gamePreview');
    this.statusIndicator = document.getElementById('statusIndicator');
    // this.previewTitle removed - no longer in UI
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

    // Notification permission
    this.notificationPermission = Notification.permission;
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

    this.logoutButton.addEventListener('click', () => {
      this.logout();
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
      content: fixMessage
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
    }
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
      this.updateStatus('', '切断されました');
      this.listStatusIndicator.className = 'status-indicator';
      this.listStatusIndicator.textContent = '切断されました';
      this.sendButton.disabled = true;
      this.chatInput.disabled = true;
      setTimeout(() => this.connectWebSocket(), 3000);
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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[Visibility] Page became visible, checking connection...');
        this.checkAndReconnect();
      }
    });

    // Also handle pageshow event (for back/forward cache on mobile)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[Pageshow] Page restored from cache, checking connection...');
        this.checkAndReconnect();
      }
    });
  }

  checkAndReconnect() {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      console.log('[Reconnect] WebSocket is closed, reconnecting...');
      this.connectWebSocket();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      console.log('[Reconnect] WebSocket is already connected');
      // Send a ping to verify connection is alive
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        console.log('[Reconnect] Ping failed, reconnecting...');
        this.connectWebSocket();
      }
    }
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

    // Create project button in list view
    this.createProjectButton.addEventListener('click', () => this.createNewProject());

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
        // TODO: Implement notifications view
        this.showCreateView(); // Fallback for now
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
    // For now, show project list as profile
    this.projectListView.classList.remove('hidden');
    this.projectListView.classList.add('with-nav');
    this.currentView = 'list';
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

  enterZappingMode(startIndex = 0) {
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

    // Render the current game
    this.renderZappingSlides();
  }

  exitZappingMode() {
    this.zappingMode.classList.add('hidden');

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
      this.renderZappingSlides();
    }
  }

  zappingPrev() {
    if (this.zappingIndex > 0) {
      this.zappingIndex--;
      this.renderZappingSlides();
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

    const shareUrl = `${window.location.origin}/play/${game.id}`;

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
        this.navigateTo(`/project/${data.project.id}`, { view: 'editor', projectId: data.project.id });
        this.selectProject(data.project.id, false);
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
        if (data.history && data.history.length > 0) {
          // Find the last assistant message index for play button
          let lastAssistantIndex = -1;
          for (let i = data.history.length - 1; i >= 0; i--) {
            if (data.history[i].role === 'assistant') {
              lastAssistantIndex = i;
              break;
            }
          }

          data.history.forEach((h, index) => {
            const showPlayButton = (h.role === 'assistant' && index === lastAssistantIndex);
            this.addMessage(h.content, h.role, { showPlayButton });
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
        this.projects = data.projects;
        this.updateProjectList();
        this.renderProjectGrid();
        if (this.currentProjectId === data.project.id) {
          document.title = `${data.project.name} - ゲームクリエイター`;
          this.currentProjectName = data.project.name;
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
    this.showNewGameModal();
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

  sendMessage() {
    const content = this.chatInput.value.trim();
    console.log('[sendMessage]', { content, isProcessing: this.isProcessing, currentProjectId: this.currentProjectId });
    if (!content || this.isProcessing || !this.currentProjectId) {
      console.log('[sendMessage] BLOCKED', { content: !!content, isProcessing: this.isProcessing, hasProjectId: !!this.currentProjectId });
      return;
    }

    this.addMessage(content, 'user');
    this.chatInput.value = '';

    // Include debug options
    const debugOptions = {
      disableSkills: this.disableSkillsToggle?.checked || false,
      useClaude: this.useClaudeToggle?.checked || false
    };

    this.ws.send(JSON.stringify({
      type: 'message',
      content,
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

      // Add "Play Game" button if we have an active project and showPlayButton is true
      if (options.showPlayButton && this.currentProjectId) {
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
        messageDiv.appendChild(playBtn);
      }
    } else {
      const formattedContent = this.formatContent(content);
      messageDiv.innerHTML = formattedContent;
    }

    this.chatMessages.appendChild(messageDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

  displayGeneratedCode(data) {
    // Remove welcome message if present
    this.hideWelcomeMessage();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message gemini-code';

    const isEdit = data.mode === 'edit';
    let html = `<div class="gemini-header">${isEdit ? 'Gemini差分' : 'Gemini新規作成'}</div>`;

    if (data.summary) {
      html += `<div class="gemini-summary">${this.escapeHtml(data.summary)}</div>`;
    }

    if (isEdit && data.edits) {
      // Edit mode - show diffs
      data.edits.forEach((edit, i) => {
        const codeId = `code-${Date.now()}-${i}`;
        html += `
          <div class="gemini-file">
            <div class="gemini-file-header">
              <span class="gemini-filename">${this.escapeHtml(edit.path)} (編集 ${i + 1})</span>
              <button class="gemini-toggle" onclick="document.getElementById('${codeId}').classList.toggle('collapsed')">
                折りたたむ
              </button>
            </div>
            <pre id="${codeId}" class="gemini-code-block">
<code class="diff-old">- ${this.escapeHtml(edit.old_string)}</code>
<code class="diff-new">+ ${this.escapeHtml(edit.new_string)}</code>
</pre>
          </div>
        `;
      });
    } else if (data.files) {
      // Create mode - show full files
      data.files.forEach(file => {
        const codeId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        html += `
          <div class="gemini-file">
            <div class="gemini-file-header">
              <span class="gemini-filename">${this.escapeHtml(file.path)}</span>
              <button class="gemini-toggle" onclick="document.getElementById('${codeId}').classList.toggle('collapsed')">
                折りたたむ
              </button>
            </div>
            <pre id="${codeId}" class="gemini-code-block collapsed"><code>${this.escapeHtml(file.content)}</code></pre>
          </div>
        `;
      });
    }

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

    // Attach click handlers for suggestions
    messageDiv.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applySuggestion(btn.dataset.suggestion);
      });
    });

    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

    // For other suggestions, append to existing input
    const current = this.chatInput.value.trim().replace(/して$/, ''); // Remove trailing して
    if (current) {
      // Append with 、and add して at end
      this.chatInput.value = current + '、' + suggestion + 'して';
    } else {
      this.chatInput.value = suggestion + 'して';
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
    try {
      await navigator.clipboard.writeText(code);
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
    } catch (error) {
      console.error('Failed to copy:', error);
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
      const response = await fetch(`/api/assets?visitorId=${this.visitorId}`);
      const data = await response.json();

      this.renderAssetGrid(this.myAssetGrid, data.assets, true);

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

    // Insert asset reference with relative URL into chat input
    const assetUrl = `/api/assets/${this.selectedAsset.id}`;
    const assetRef = `画像「${this.selectedAsset.name}」を使用: ${assetUrl}`;
    this.chatInput.value += (this.chatInput.value ? '\n' : '') + assetRef;

    this.closeAssetModalHandler();
    this.chatInput.focus();
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

    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new GameCreatorApp();
});
