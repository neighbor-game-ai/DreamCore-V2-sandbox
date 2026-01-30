class GameCreatorApp {
  constructor() {
    this.ws = null;
    this.userId = null; // Set by Supabase Auth (session.user.id)
    this.currentProjectId = null;
    this.currentProjectName = null;
    this.projects = [];
    this.isProcessing = false;
    this.currentJobId = null;
    this.jobPollInterval = null;

    // Authentication state (Supabase Auth)
    this.sessionId = localStorage.getItem('sessionId');
    this.currentUser = null;
    this.accessToken = null;
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
    this.gamesFilter = document.getElementById('gamesFilter');
    this.currentProjectFilter = 'all';
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
    this.playGameButton = document.getElementById('playGameButton');
    this.publishButton = document.getElementById('publishButton');
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
    this.restoreModalBody = document.querySelector('#restoreModal .restore-modal-body');
    this.restoreModalActions = document.querySelector('#restoreModal .restore-modal-actions');
    this.cancelRestore = document.getElementById('cancelRestore');
    this.confirmRestoreBtn = document.getElementById('confirmRestore');
    this.pendingRestoreVersionId = null;

    // Delete confirmation modal elements
    this.deleteConfirmModal = document.getElementById('deleteConfirmModal');
    this.deleteConfirmTitle = document.getElementById('deleteConfirmTitle');
    this.deleteConfirmMessage = document.getElementById('deleteConfirmMessage');
    this.cancelDelete = document.getElementById('cancelDelete');
    this.confirmDeleteBtn = document.getElementById('confirmDelete');

    // Error state
    this.currentErrors = [];

    // Notification permission (check support first for iOS Safari)
    this.notificationPermission = ('Notification' in window) ? Notification.permission : 'denied';
    this.requestNotificationPermission();

    // Restore state
    this.pendingRestore = false;

    // Limit exceeded state (no longer used for interruption, kept for reference)
    // this.pendingLimitExceededPrompt = null;

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
    this.editAssetButton = document.getElementById('editAssetButton');
    this.publishAssetButton = document.getElementById('publishAssetButton'); // Hidden for now
    this.deleteAssetButton = document.getElementById('deleteAssetButton');
    this.uploadButton = document.getElementById('uploadButton');

    // Image Editor elements
    this.imageEditorModal = document.getElementById('imageEditorModal');
    this.editorCanvas = document.getElementById('editorCanvas');

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

    // Mobile plus menu elements
    this.plusMenuButton = document.getElementById('plusMenuButton');
    this.plusMenuPopup = document.getElementById('plusMenuPopup');
    this.plusMenuAsset = document.getElementById('plusMenuAsset');
    this.plusMenuUpload = document.getElementById('plusMenuUpload');
    this.plusMenuImageGen = document.getElementById('plusMenuImageGen');

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
    this.sessionId = localStorage.getItem('sessionId');

    this.init();
  }

  async init() {
    // Detect which page we're on
    this.currentPage = document.body.dataset.page || 'unknown';

    // Check authentication for protected pages
    const protectedPages = ['discover', 'create', 'editor', 'mypage', 'notifications'];
    if (protectedPages.includes(this.currentPage)) {
      // Non-blocking UI pattern: Show UI immediately, auth in background
      // Step 1: Initialize UI immediately (no waiting)
      this.initPageUI();

      // Step 2: Auth check in background
      this.checkAuthAndConnect();
    }
  }

  /**
   * Initialize page UI immediately (non-blocking)
   * This runs before auth is confirmed
   */
  initPageUI() {
    // Setup event listeners and UI that don't require auth
    this.setupBottomNavListeners();

    // Page-specific UI initialization (without data)
    switch (this.currentPage) {
      case 'discover':
        // Discover page UI setup
        break;
      case 'create':
        this.initCreatePage();
        break;
      case 'editor':
        this.initEditorPage();
        break;
    }
  }

  /**
   * Check auth and connect WebSocket (background, non-blocking)
   */
  async checkAuthAndConnect() {
    try {
      // FAST PATH: Use sync localStorage check first (no SDK, no async)
      const cachedSession = DreamCoreAuth.getSessionSync();

      if (!cachedSession) {
        // Check if this is an OAuth callback
        const url = new URL(window.location.href);
        const hasOAuthParams =
          url.searchParams.has('code') ||
          url.searchParams.has('error') ||
          url.searchParams.has('state') ||
          window.location.hash.includes('access_token=');

        if (hasOAuthParams) {
          // OAuth callback - wait for Supabase to process
          const session = await DreamCoreAuth.getSession();
          if (!session) {
            window.location.href = '/';
            return;
          }

          // V2 Waitlist: Check access permission
          const { allowed } = await DreamCoreAuth.checkAccess();
          if (!allowed) {
            window.location.href = '/waitlist.html';
            return;
          }

          // Access granted - reveal page
          this.revealPage();

          this.accessToken = session.access_token;
          this.currentUser = session.user;
          this.userId = session.user.id;
          this.isAuthenticated = true;
          this.connectWebSocket();
          this.loadPageData();
          return;
        }

        // No cached session and not OAuth - redirect immediately
        window.location.href = '/';
        return;
      }

      // Use cached session for immediate auth
      this.accessToken = cachedSession.access_token;
      this.currentUser = cachedSession.user;
      this.userId = cachedSession.user.id;
      this.isAuthenticated = true;

      // V2 Waitlist: Check access permission BEFORE revealing page
      const { allowed } = await DreamCoreAuth.checkAccess();
      if (!allowed) {
        window.location.href = '/waitlist.html';
        return;
      }

      // Access granted - reveal page
      this.revealPage();

      // Update UI with user info
      if (this.currentUser && this.userDisplayName) {
        this.userDisplayName.textContent = this.currentUser.user_metadata?.full_name ||
                                           this.currentUser.user_metadata?.name ||
                                           this.currentUser.email?.split('@')[0] || '';
      }

      // Connect WebSocket with cached token
      this.connectWebSocket();

      // Load page-specific data
      this.loadPageData();

      // BACKGROUND: Verify session with SDK (refresh if needed)
      DreamCoreAuth.getSession().then(async session => {
        if (!session) {
          // Session expired - redirect to login
          window.location.href = '/';
          return;
        }
        if (session.access_token !== cachedSession.access_token) {
          // Token refreshed - update
          this.accessToken = session.access_token;
        }
      }).catch(err => {
        console.warn('[Auth] Background verification failed:', err);
      });
    } catch (error) {
      console.error('[Auth] Init error:', error);
      window.location.href = '/';
    }
  }

  /**
   * Reveal page after access check passes
   * Removes the visibility:hidden style that prevents flash of content
   */
  revealPage() {
    const style = document.getElementById('access-check-style');
    if (style) {
      style.remove();
    }
  }

  /**
   * Load page-specific data after auth
   */
  loadPageData() {
    switch (this.currentPage) {
      case 'discover':
        this.initDiscoverPage();
        break;
      // create/editor data is loaded via WebSocket
    }
  }

  initPage() {
    // DEPRECATED: Use initPageUI() + checkAuthAndConnect() instead
    // This method is kept for backward compatibility
    console.warn('[App] initPage() is deprecated, use non-blocking pattern');
  }

  _legacyInitPage() {
    // Legacy method - not used in new non-blocking pattern
    switch (this.currentPage) {
      case 'discover':
        this.initDiscoverPage();
        break;
      case 'create':
        this.initCreatePage();
        break;
      case 'editor':
        this.initEditorPage();
        break;
    }
  }

  initDiscoverPage() {
    this.loadPublicGames();
    this.setupZappingListeners();
  }

  initCreatePage() {
    this.setupEventListeners();
  }

  initEditorPage() {
    this.setupEventListeners();
    this.setupAssetListeners();
    this.setupImageGenListeners();
    this.setupPlusMenuListeners();
    this.setupStyleSelectListeners();
    this.setupRouting();
    this.setupErrorListeners();
  }

  // ==================== Authentication ====================

  setupLoginListeners() {
    this.loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });

    // iOS Safari workaround: listen for both click and touchend
    this.loginButton?.addEventListener('click', (e) => {
      e.preventDefault();
      this.login();
    });

    this.loginButton?.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.login();
    });

    this.logoutButton?.addEventListener('click', () => {
      this.logout();
    });

    this.notificationsButton?.addEventListener('click', () => {
      window.location.href = '/notifications';
    });
  }

  async checkSession() {
    // DEPRECATED: 旧認証APIは廃止されました。認証はSupabase Auth（DreamCoreAuth）で処理されます。
    // このメソッドは呼び出されるべきではありません。
    console.warn('[DEPRECATED] checkSession() は廃止されました。DreamCoreAuth を使用してください。');
    throw new Error('checkSession() は廃止されました。認証は Supabase Auth (DreamCoreAuth) で処理してください。');
  }

  async login() {
    // DEPRECATED: 旧認証APIは廃止されました。認証はSupabase Auth（DreamCoreAuth）で処理されます。
    // このメソッドは呼び出されるべきではありません。
    console.warn('[DEPRECATED] login() は廃止されました。DreamCoreAuth.signInWithGoogle() を使用してください。');
    throw new Error('login() は廃止されました。認証は Supabase Auth (DreamCoreAuth) で処理してください。');
  }

  async logout() {
    // Close WebSocket first
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear local state
    this.sessionId = null;
    this.currentUser = null;
    this.accessToken = null;
    this.userId = null;
    this.isAuthenticated = false;

    // Sign out via Supabase Auth (this will redirect to /)
    try {
      await DreamCoreAuth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
      // Redirect anyway
      window.location.href = '/';
    }
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
    this.setupPlusMenuListeners();
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
    this.closeErrorPanel?.addEventListener('click', () => {
      this.hideErrorPanel();
    });

    this.autoFixButton?.addEventListener('click', () => {
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
        this.gameStatus?.classList.add('hidden');
      }, 2000);
    } else {
      this.handleGameErrors(data.errors);
    }
  }

  showErrorPanel(errors) {
    if (!this.errorPanel) return;
    if (this.errorCount) this.errorCount.textContent = errors.length;
    if (this.errorList) {
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
    }

    this.errorPanel.classList.remove('hidden');
    if (this.autoFixButton) this.autoFixButton.disabled = this.isProcessing;
  }

  hideErrorPanel() {
    this.errorPanel?.classList.add('hidden');
  }

  updateGameStatus(status, text) {
    if (!this.gameStatus) return;

    this.gameStatus.classList.remove('hidden', 'success', 'error');
    this.gameStatus.classList.add(status);

    if (this.gameStatusIcon) {
      if (status === 'success') {
        this.gameStatusIcon.textContent = '✅';
      } else if (status === 'error') {
        this.gameStatusIcon.textContent = '❌';
      } else {
        this.gameStatusIcon.textContent = '⏳';
      }
    }

    if (this.gameStatusText) {
      this.gameStatusText.textContent = text;
    }
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
    this.projectListView?.classList.remove('hidden');
    this.projectListView?.classList.add('with-nav');
    this.editorView?.classList.add('hidden');
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
    this.projectListView?.classList.add('hidden');
    this.editorView?.classList.remove('hidden');
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
    if (!this.projectGrid) return;

    // Update filter counts
    const allCount = this.projects.length;
    const publishedCount = this.projects.filter(p => p.isPublic).length;
    const draftCount = this.projects.filter(p => !p.isPublic).length;

    const countAll = document.getElementById('filterCountAll');
    const countPublished = document.getElementById('filterCountPublished');
    const countDraft = document.getElementById('filterCountDraft');
    if (countAll) countAll.textContent = allCount;
    if (countPublished) countPublished.textContent = publishedCount;
    if (countDraft) countDraft.textContent = draftCount;

    if (this.projects.length === 0) {
      this.projectGrid.innerHTML = `
        <div class="project-empty">
          <p>まだゲームがありません</p>
        </div>
      `;
      return;
    }

    // Filter projects based on current filter
    const filter = this.currentProjectFilter || 'all';
    const filteredProjects = this.projects.filter(p => {
      if (filter === 'published') return p.isPublic;
      if (filter === 'draft') return !p.isPublic;
      return true;
    });

    if (filteredProjects.length === 0) {
      const emptyMessage = filter === 'published' ? '公開中のゲームはありません' :
                          filter === 'draft' ? '下書きのゲームはありません' :
                          'まだゲームがありません';
      this.projectGrid.innerHTML = `
        <div class="project-empty">
          <p>${emptyMessage}</p>
        </div>
      `;
      return;
    }

    this.projectGrid.innerHTML = filteredProjects.map((project, index) => `
      <div class="project-card ${project.isPublic ? 'is-published' : ''}" data-id="${project.id}">
        <div class="project-card-thumbnail">
          ${project.isPublic ? `
            <div class="project-card-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              公開中
            </div>
          ` : ''}
          <img
            src="/api/projects/${project.id}/thumbnail?access_token=${encodeURIComponent(this.accessToken)}"
            alt="${this.escapeHtml(project.name)}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            onload="this.style.display='block'; this.nextElementSibling.style.display='none';"
          >
          <div class="project-card-thumbnail-placeholder" style="background: linear-gradient(135deg, hsl(${(index * 37) % 360}, 65%, 75%), hsl(${(index * 37 + 60) % 360}, 70%, 65%));">
            <span class="placeholder-title">${this.escapeHtml(project.name)}</span>
          </div>
        </div>
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
        window.location.href = `/project/${projectId}`;
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

  /**
   * @deprecated V2: No longer needed - assets served via /user-assets/{userId}/{alias}
   * Kept for backward compatibility during transition
   */
  getAuthenticatedAssetUrl(url) {
    // V2: Return URL as-is (no token needed for new endpoints)
    return url;
  }

  renameProjectFromList(projectId) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const modal = document.getElementById('renameModal');
    const modalContent = modal?.querySelector('.new-game-content');
    const input = document.getElementById('renameInput');
    const confirmBtn = document.getElementById('confirmRename');
    const cancelBtn = document.getElementById('cancelRename');

    if (!modal || !input) return;

    // Set current name
    input.value = project.name;
    modal.classList.remove('hidden');
    input.focus();
    input.select();

    // Mobile keyboard handling
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let handleViewportResize = null;

    if (isMobile && window.visualViewport && modalContent) {
      handleViewportResize = () => {
        const vv = window.visualViewport;
        const keyboardHeight = window.innerHeight - vv.height;

        if (keyboardHeight > 100) {
          // Keyboard is visible - move modal up
          modalContent.style.position = 'fixed';
          modalContent.style.bottom = `${keyboardHeight + 20}px`;
          modalContent.style.top = 'auto';
          modalContent.style.left = '16px';
          modalContent.style.right = '16px';
          modalContent.style.transform = 'none';
          modalContent.style.width = 'auto';
        } else {
          // Keyboard hidden - reset
          modalContent.style.position = '';
          modalContent.style.bottom = '';
          modalContent.style.top = '';
          modalContent.style.left = '';
          modalContent.style.right = '';
          modalContent.style.transform = '';
          modalContent.style.width = '';
        }
      };
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    const closeModal = () => {
      modal.classList.add('hidden');
      // Reset modal content position
      if (modalContent) {
        modalContent.style.position = '';
        modalContent.style.bottom = '';
        modalContent.style.top = '';
        modalContent.style.left = '';
        modalContent.style.right = '';
        modalContent.style.transform = '';
        modalContent.style.width = '';
      }
      // Remove event listeners
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', closeModal);
      input.removeEventListener('keydown', handleKeydown);
      if (handleViewportResize) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };

    const handleConfirm = () => {
      const newName = input.value.trim();
      if (newName && newName !== project.name) {
        this.ws.send(JSON.stringify({
          type: 'renameProject',
          projectId,
          name: newName
        }));
      }
      closeModal();
    };

    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', closeModal);
    input.addEventListener('keydown', handleKeydown);
  }

  updateProjectTitle(name, animate = false) {
    if (!this.projectTitle) return;

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

    const modal = document.getElementById('deleteModal');
    const projectNameEl = document.getElementById('deleteProjectName');
    const confirmBtn = document.getElementById('confirmDelete');
    const cancelBtn = document.getElementById('cancelDelete');

    if (!modal) return;

    // Set project name
    if (projectNameEl) {
      projectNameEl.textContent = project.name;
    }
    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', closeModal);
    };

    const handleConfirm = () => {
      this.ws.send(JSON.stringify({
        type: 'deleteProject',
        projectId
      }));
      closeModal();
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', closeModal);
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
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset on successful connection
      if (this.statusIndicator) {
        this.updateStatus('connected', '接続中');
      }
      if (this.listStatusIndicator) {
        this.listStatusIndicator.className = 'status-indicator connected';
        this.listStatusIndicator.textContent = '接続中';
      }
      // Restore send button to normal state
      this.restoreSendButton();
      this.ws.send(JSON.stringify({
        type: 'init',
        access_token: this.accessToken,
        sessionId: this.sessionId
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = (event) => {
      console.log(`[${this.sessionId}] WebSocket closed: code=${event.code}, reason=${event.reason}`);
      this.isConnected = false;
      if (this.statusIndicator) {
        this.updateStatus('', '再接続中...');
      }
      if (this.listStatusIndicator) {
        this.listStatusIndicator.className = 'status-indicator';
        this.listStatusIndicator.textContent = '再接続中...';
      }
      // Show reconnect button
      this.showReconnectButton();
      if (this.chatInput) this.chatInput.disabled = true;
      // Exponential backoff: 1s, 1.5s, 2.25s, ... max 10s
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts || 0), 10000);
      this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
      console.log(`[Reconnect] Attempting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), delay);
    };

    this.ws.onerror = (error) => {
      console.error(`[${this.sessionId}] WebSocket error:`, error);
      if (this.statusIndicator) {
        this.updateStatus('', 'エラー');
      }
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
    // Games filter tabs with animated slider
    const filterSlider = document.getElementById('filterSlider');
    this.gamesFilter?.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.dataset.index);

        // Animate slider with stretch effect
        if (filterSlider && this.gamesFilter) {
          // Add stretch effect
          filterSlider.classList.add('stretching');

          // Update position via CSS variable
          this.gamesFilter.style.setProperty('--slider-index', index);

          // Remove stretch after animation starts
          setTimeout(() => {
            filterSlider.classList.remove('stretching');
          }, 150);
        }

        // Update active state
        this.gamesFilter.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentProjectFilter = tab.dataset.filter;
        this.renderProjectGrid();
      });
    });

    // Editor page elements
    this.sendButton?.addEventListener('click', () => this.sendMessage());

    // Track IME composition state
    this.chatInput?.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    this.chatInput?.addEventListener('compositionend', () => {
      this.isComposing = false;
    });

    this.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.isComposing) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Mobile keyboard visibility handling (iOS/Android)
    if (this.chatInput) {
      this.setupMobileKeyboardHandling();
    }

    this.refreshButton?.addEventListener('click', () => this.refreshPreview());
    this.newProjectButton?.addEventListener('click', () => this.createNewProject());
    this.playGameButton?.addEventListener('click', () => this.showPreviewPanel());
    this.publishButton?.addEventListener('click', () => this.goToPublishPage());
    this.stopButton?.addEventListener('click', () => this.stopGeneration());
    this.versionsButton?.addEventListener('click', () => this.toggleVersionPanel());
    this.closeVersionsButton?.addEventListener('click', () => this.hideVersionPanel());

    // Code viewer buttons
    this.viewCodeButton?.addEventListener('click', () => this.showCodeViewer());
    this.downloadButton?.addEventListener('click', () => this.downloadProject());
    this.copyCodeButton?.addEventListener('click', () => this.copyCode());
    this.closeCodeViewer?.addEventListener('click', () => this.hideCodeViewer());
    this.codeViewerModal?.addEventListener('click', (e) => {
      if (e.target === this.codeViewerModal) this.hideCodeViewer();
    });

    // Home button - go back to project list
    this.homeButton?.addEventListener('click', () => {
      window.location.href = '/create';
    });

    // Project title click to edit
    this.projectTitle?.addEventListener('click', () => this.startEditingProjectTitle());

    // Create project button in list view
    this.createProjectButton?.addEventListener('click', () => this.createNewProject());

    // Scroll detection for create button animation
    this.projectListView?.addEventListener('scroll', () => {
      const scrollTop = this.projectListView.scrollTop;
      if (scrollTop > 50) {
        this.createProjectButton?.classList.add('scrolled');
      } else {
        this.createProjectButton?.classList.remove('scrolled');
      }
    });

    // New game modal
    this.cancelNewGame?.addEventListener('click', () => this.hideNewGameModal());
    this.confirmNewGame?.addEventListener('click', () => this.confirmCreateProject());
    this.newGameModal?.addEventListener('click', (e) => {
      if (e.target === this.newGameModal) this.hideNewGameModal();
    });
    this.newGameName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmCreateProject();
      } else if (e.key === 'Escape') {
        this.hideNewGameModal();
      }
    });

    // Restore modal
    this.cancelRestore?.addEventListener('click', () => this.hideRestoreModal());
    this.confirmRestoreBtn?.addEventListener('click', () => this.confirmRestore());
    this.restoreModal?.addEventListener('click', (e) => {
      if (e.target === this.restoreModal) this.hideRestoreModal();
    });

    // Delete confirmation modal
    this.cancelDelete?.addEventListener('click', () => this.hideDeleteConfirmModal());
    this.confirmDeleteBtn?.addEventListener('click', () => this.confirmDeleteAssets());
    this.deleteConfirmModal?.addEventListener('click', (e) => {
      if (e.target === this.deleteConfirmModal) this.hideDeleteConfirmModal();
    });

    // Mobile tab switching
    this.setupMobileTabListeners();
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
    // Navigate to the appropriate page
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
        window.location.href = '/mypage';
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
    // Phase 1: 公開機能は無効。/api/public-games エンドポイントは削除済み。
    // discoverページは「準備中」表示が正しい動作。
    this.publicGames = [];
    this.renderDiscoverGrid();
  }

  renderDiscoverGrid() {
    if (!this.discoverGrid) return;

    if (this.publicGames.length === 0) {
      this.discoverGrid.classList.add('hidden');
      this.discoverEmpty?.classList.remove('hidden');
      return;
    }

    this.discoverGrid.classList.remove('hidden');
    this.discoverEmpty?.classList.add('hidden');

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
    const gameUrl = `/api/projects/${currentGame.id}/preview`;

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

  goToPublishPage() {
    if (!this.currentProjectId) {
      alert('プロジェクトを選択してください');
      return;
    }
    window.location.href = `/publish.html?id=${this.currentProjectId}`;
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
        if (this.statusIndicator) {
          this.updateStatus('connected', '接続中');
        }
        if (this.listStatusIndicator) {
          this.listStatusIndicator.className = 'status-indicator connected';
          this.listStatusIndicator.textContent = '接続中';
        }
        break;

      case 'init':
        this.userId = data.userId;
        localStorage.setItem('gameCreatorUserId', this.userId);
        this.projects = data.projects || [];

        // Reset streaming state on fresh connection
        if (this.streamingContainer) {
          this.hideStreaming();
        }
        this.isProcessing = false;
        this.currentJobId = null;
        this.stopButton?.classList.add('hidden');

        // Update status indicators
        if (this.listStatusIndicator) {
          this.listStatusIndicator.className = 'status-indicator connected';
          this.listStatusIndicator.textContent = '接続中';
        }

        // Update quota display
        this.updateQuotaDisplay();

        // Handle based on current page
        if (this.currentPage === 'create') {
          // Render project grid on create page
          this.renderProjectGrid();
        } else if (this.currentPage === 'editor') {
          // Get project ID from URL and select it
          const pathParts = window.location.pathname.split('/');
          const projectId = pathParts[pathParts.length - 1];
          if (projectId) {
            const project = this.projects.find(p => p.id === projectId);
            if (project) {
              this.selectProject(projectId, false);
            } else {
              // Project not found - redirect to create page
              window.location.href = '/create';
            }
          }
        }
        break;

      case 'projectCreated':
        this.projects = data.projects;
        // Navigate to the new project's editor page
        window.location.href = `/project/${data.project.id}`;
        break;

      case 'projectSelected':
        this.currentProjectId = data.projectId;
        localStorage.setItem('gameCreatorLastProjectId', this.currentProjectId);
        if (this.chatInput) this.chatInput.disabled = false;
        if (this.sendButton) this.sendButton.disabled = false;

        // Reset streaming state (in case of reconnect with stale UI)
        if (this.streamingContainer) {
          this.hideStreaming();
        }
        this.isProcessing = false;
        this.currentJobId = null;
        this.stopButton?.classList.add('hidden');

        // Get versions with edits from server response
        const versions = data.versions || [];

        if (data.history && data.history.length > 0) {
          // Clear only when we have history to show
          if (this.chatMessages) this.chatMessages.innerHTML = '';
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
          // Hide iframe for new projects (no game yet)
          if (this.gamePreview) {
            this.updatePreviewVisibility(false);
          }
        }

        // Show preview only if project has history (game generated)
        if (this.gamePreview && data.history && data.history.length > 0) {
          this.refreshPreview();
          this.updatePreviewVisibility(true);
        }

        // Update preview title and page title
        const selectedProject = this.projects.find(p => p.id === this.currentProjectId);
        if (selectedProject) {
          document.title = `${selectedProject.name} - ゲームクリエイター`;
          this.currentProjectName = selectedProject.name;
          this.updateProjectTitle(selectedProject.name);
        }

        // Show versions button and code/download buttons
        this.versionsButton?.classList.remove('hidden');
        this.viewCodeButton?.classList.remove('hidden');
        this.downloadButton?.classList.remove('hidden');

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
          if (this.chatMessages) this.chatMessages.innerHTML = '';
          if (this.chatInput) this.chatInput.disabled = true;
          if (this.sendButton) this.sendButton.disabled = true;
          if (this.gamePreview) this.updatePreviewVisibility(false);
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
        this.updatePreviewVisibility(true); // Show iframe (game now exists)
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
        this.hideRestoreModal();
        this.resetRestoreModal();

        // Handle quota exceeded errors
        if (data.error && (data.error.code === 'DAILY_PROJECT_LIMIT_EXCEEDED' || data.error.code === 'DAILY_MESSAGE_LIMIT_EXCEEDED')) {
          this.showQuotaExceededError(data.error);
        } else {
          this.addMessage(data.message || (data.error && data.error.message) || 'エラーが発生しました', 'error');
        }

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

      case 'limitExceeded':
        // User has reached concurrent job limit
        this.handleLimitExceeded(data);
        break;

      case 'jobCancelled':
        // Job was cancelled
        console.log('Job cancelled:', data.jobId);
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
        console.log('versionsList received, pendingRestore:', this.pendingRestore, 'versions:', data.versions?.length, 'currentHead:', data.currentHead);
        // Set current version from server (persisted across page reloads)
        if (data.currentHead) {
          this.currentVersionId = data.currentHead;
        }
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

      case 'restoreProgress':
        this.updateStreamingStatus(data.message);
        this.updateRestoreLoading(data.message);
        break;

      case 'versionRestored':
        this.completeStreaming();
        this.hideRestoreModal();
        this.resetRestoreModal();
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
        // Use userMessage (user-friendly) if available, fallback to raw error
        const errorMessage = update.userMessage || update.error || 'エラーが発生しました';
        this.addMessage(`エラー: ${errorMessage}`, 'error');

        // Show recovery hint for recoverable errors
        if (update.recoverable) {
          this.addMessage('もう一度お試しください', 'system');
        }

        this.updateStatus('connected', '接続中');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        // Browser notification
        this.showNotification('⚠️ エラーが発生', {
          body: errorMessage,
        });
        // Log error code for debugging (console only)
        if (update.code) {
          console.log(`[Error] code=${update.code}, exitCode=${update.exitCode}, recoverable=${update.recoverable}`);
        }
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
      if (this.gamePreview) this.gamePreview.style.display = 'block';
      this.noProjectMessage?.classList.add('hidden');
    } else {
      if (this.gamePreview) this.gamePreview.style.display = 'none';
      this.noProjectMessage?.classList.remove('hidden');
      this.currentProjectName = null;
      this.versionsButton?.classList.add('hidden');
      this.viewCodeButton?.classList.add('hidden');
      this.downloadButton?.classList.add('hidden');
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
      this.chatInput.classList.add('expanded');
      setTimeout(adjustForKeyboard, 100);
      setTimeout(adjustForKeyboard, 300);
      setTimeout(adjustForKeyboard, 500);
    });

    // Blur event
    this.chatInput.addEventListener('blur', () => {
      console.log('[Keyboard] blur');
      // Only collapse if empty
      if (!this.chatInput.value.trim()) {
        this.chatInput.classList.remove('expanded');
      }
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
    // Handle reconnect mode
    if (!this.isConnected) {
      console.log('[sendMessage] Triggering reconnect');
      this.forceReconnect();
      return;
    }

    if (!this.chatInput) return;
    const content = this.chatInput.value.trim();
    console.log('[sendMessage]', { content, isProcessing: this.isProcessing, currentProjectId: this.currentProjectId });
    if (!content || this.isProcessing || !this.currentProjectId) {
      console.log('[sendMessage] BLOCKED', { content: !!content, isProcessing: this.isProcessing, hasProjectId: !!this.currentProjectId });
      return;
    }

    // Build final content with attached assets prepended (numbered)
    // Save attachedAssets before clearing for pendingPrompt support
    const attachedAssetsCopy = this.attachedAssetsList.slice();
    let finalContent = content;
    if (attachedAssetsCopy.length > 0) {
      const assetLines = attachedAssetsCopy.map((asset, index) =>
        `${index + 1}：画像「${asset.name}」を使用: ${asset.url}`
      ).join('\n');
      finalContent = assetLines + '\n\n' + content;
    }

    // Display message to user (show attached images as thumbnails)
    this.addMessage(content, 'user', { attachedAssets: attachedAssetsCopy });
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
      rawContent: content,  // Original user input (for pendingPrompt restore)
      attachedAssets: attachedAssetsCopy,  // For pendingPrompt restore
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
    if (!this.chatMessages) return;
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
      // Support for raw HTML content (e.g., quota error messages)
      if (options.isHtml) {
        messageDiv.innerHTML = content;
        this.chatMessages.appendChild(messageDiv);
        this.scrollToLatestMessage(messageDiv);
        return;
      }

      let displayContent = content;
      let assetsToShow = [];

      // For user messages, parse and extract asset references
      if (role === 'user') {
        assetsToShow = options.attachedAssets || [];

        // Parse assets from content if not provided (for history messages)
        if (assetsToShow.length === 0) {
          const assetPattern = /(\d+)：画像「([^」]+)」を使用: (\/api\/assets\/[a-f0-9-]+)/g;
          let match;
          while ((match = assetPattern.exec(content)) !== null) {
            assetsToShow.push({
              name: match[2],
              url: match[3]
            });
          }
        }

        // Remove asset lines from display content (for history messages)
        if (assetsToShow.length > 0 && !options.attachedAssets) {
          displayContent = content
            .replace(/\d+：画像「[^」]+」を使用: \/api\/assets\/[a-f0-9-]+\n?/g, '')
            .replace(/^\n+/, ''); // Remove leading newlines
        }
      }

      const formattedContent = this.formatContent(displayContent);
      messageDiv.innerHTML = formattedContent;

      // Add attached asset thumbnails for user messages (with numbers)
      if (role === 'user' && assetsToShow.length > 0) {
        const thumbsDiv = document.createElement('div');
        thumbsDiv.className = 'message-attached-assets';
        thumbsDiv.innerHTML = assetsToShow.map((asset, index) => `
          <div class="message-asset-thumb">
            <span class="message-asset-number">【${index + 1}】</span>
            <img src="${this.getAuthenticatedAssetUrl(asset.url)}" alt="${asset.name}" />
          </div>
        `).join('');
        messageDiv.insertBefore(thumbsDiv, messageDiv.firstChild);
      }
    }

    this.chatMessages.appendChild(messageDiv);
    this.scrollToLatestMessage(messageDiv);
  }

  scrollToLatestMessage(messageDiv) {
    if (!this.chatMessages) return;
    // Use scrollIntoView for better mobile keyboard handling
    // Delay slightly to ensure DOM is updated and keyboard state is stable
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!this.chatMessages) return;
        // Simply scroll chat container to bottom
        // This ensures the latest message is fully visible above streaming container
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        // If streaming container is visible, add extra scroll for its height
        if (this.streamingContainer && !this.streamingContainer.classList.contains('hidden')) {
          const streamingHeight = this.streamingContainer.offsetHeight;
          this.chatMessages.scrollTop += streamingHeight;
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

    // Check if static welcome exists (from HTML)
    const existingWelcome = document.getElementById('welcomeMessage');
    const examplesContainer = document.getElementById('welcomeExamples');

    if (existingWelcome && examplesContainer) {
      // Update only the examples part (keep icon/title/desc static)
      examplesContainer.innerHTML = `
        <span class="example-label">例えば...</span>
        <div class="example-chips">
          ${selected.map(s => `<button class="example-chip" data-prompt="${s.prompt}">${s.label}</button>`).join('')}
        </div>
      `;
      // Add click handlers
      examplesContainer.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          if (this.chatInput) {
            this.chatInput.value = chip.dataset.prompt;
            this.chatInput.focus();
          }
          this.hideWelcomeMessage();
        });
      });
      return;
    }

    // Fallback: Create full welcome if static doesn't exist
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-message';
    welcomeDiv.id = 'welcomeMessage';
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
      <div class="welcome-examples" id="welcomeExamples">
        <span class="example-label">例えば...</span>
        <div class="example-chips">
          ${selected.map(s => `<button class="example-chip" data-prompt="${s.prompt}">${s.label}</button>`).join('')}
        </div>
      </div>
    `;

    // Add click handlers for example chips
    welcomeDiv.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (this.chatInput) {
          this.chatInput.value = chip.dataset.prompt;
          this.chatInput.focus();
        }
        this.hideWelcomeMessage();
      });
    });

    if (this.chatMessages) this.chatMessages.appendChild(welcomeDiv);
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
    if (!this.chatMessages) return;
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
    if (!this.currentProjectId) return null;
    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.currentProjectId}/ai-context`);
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

  // Handle limit exceeded - show notification that another project is running
  handleLimitExceeded(data) {
    // Hide streaming indicator, reset state
    this.hideStreaming();
    this.isProcessing = false;
    this.sendButton.disabled = false;
    this.stopButton.classList.add('hidden');

    // Remove any existing limit-exceeded messages to prevent accumulation
    const existingModals = this.chatMessages.querySelectorAll('.limit-exceeded-confirm');
    existingModals.forEach(modal => modal.remove());

    const job = data.jobs && data.jobs[0];
    const projectName = job?.projectName || '別のプロジェクト';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant limit-exceeded-confirm';

    const closeId = `limit-close-${Date.now()}`;

    messageDiv.innerHTML = `
      <div class="message-content">『${this.escapeHtml(projectName)}』で生成中です。<br>完了後にもう一度お試しください。</div>
      <div class="restore-buttons">
        <button class="restore-btn cancel" id="${closeId}">閉じる</button>
      </div>
    `;

    this.chatMessages.appendChild(messageDiv);

    document.getElementById(closeId).addEventListener('click', () => {
      messageDiv.remove();
    });

    this.scrollToLatestMessage(messageDiv);
  }

  // Apply a suggestion from chat response
  // For dimension selection (2Dで作成/3Dで作成), send immediately
  // For other suggestions, append to input
  applySuggestion(suggestion) {
    if (!this.chatInput) return;
    console.log('[applySuggestion]', suggestion, 'isProcessing:', this.isProcessing);
    // Check if this is a dimension selection (should send immediately)
    if (suggestion === '2Dで作成' || suggestion === '3Dで作成') {
      // Send immediately without adding して
      console.log('[applySuggestion] Dimension selection, sending immediately');
      // Force reset processing state for dimension selection
      this.isProcessing = false;
      if (this.sendButton) this.sendButton.disabled = false;
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
    if (!this.gamePreview) return;
    if (this.userId && this.currentProjectId && this.accessToken) {
      // Show loading status
      this.updateGameStatus('loading', '読み込み中...');
      this.currentErrors = [];
      this.hideErrorPanel();

      const timestamp = Date.now();
      this.gamePreview.src = `/game/${this.userId}/${this.currentProjectId}/index.html?t=${timestamp}&access_token=${encodeURIComponent(this.accessToken)}`;
    }
  }

  
  updateStatus(className, text) {
    if (!this.statusIndicator) return;
    this.statusIndicator.className = `status-indicator ${className}`;
    this.statusIndicator.textContent = text;
  }

  // ==================== Quota Display ====================

  async updateQuotaDisplay() {
    const quotaEl = document.getElementById('quotaDisplay');
    if (!quotaEl) return;

    try {
      const token = await DreamCoreAuth.getAccessToken();
      if (!token) return;

      const res = await fetch('/api/quota', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;

      const quota = await res.json();
      this.currentQuota = quota; // Store for popup

      const messagesRemaining = quota.messages.remaining;
      const projectsRemaining = quota.projects.remaining;

      quotaEl.innerHTML = `
        <span class="quota-item" title="メッセージ残り">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          ${messagesRemaining === -1 ? '∞' : messagesRemaining}
        </span>
        <span class="quota-item" title="プロジェクト作成残り">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          ${projectsRemaining === -1 ? '∞' : projectsRemaining}
        </span>
      `;
      quotaEl.classList.remove('hidden');

      // Add click handler for popup (only once)
      if (!quotaEl.dataset.hasClickHandler) {
        quotaEl.dataset.hasClickHandler = 'true';
        quotaEl.style.cursor = 'pointer';
        quotaEl.addEventListener('click', () => this.showQuotaPopup());
      }
    } catch (err) {
      console.error('[Quota] Failed to update display:', err);
    }
  }

  /**
   * Show quota info popup
   */
  showQuotaPopup() {
    if (!this.currentQuota) return;

    const quota = this.currentQuota;
    const resetTime = new Date(quota.resetAt);
    const resetTimeStr = resetTime.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo'
    });

    const msgLimit = quota.messages.limit === -1 ? '無制限' : `${quota.messages.limit}回`;
    const msgUsed = quota.messages.used;
    const projLimit = quota.projects.limit === -1 ? '無制限' : `${quota.projects.limit}回`;
    const projUsed = quota.projects.used;

    // Create popup
    const existingPopup = document.getElementById('quotaPopup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'quotaPopup';
    popup.className = 'quota-popup';
    popup.innerHTML = `
      <div class="quota-popup-content">
        <div class="quota-popup-title">本日の利用状況</div>
        <div class="quota-popup-item">
          <span class="quota-popup-label">チャット（修正依頼）</span>
          <span class="quota-popup-value">${msgUsed} / ${msgLimit}</span>
        </div>
        <div class="quota-popup-item">
          <span class="quota-popup-label">プロジェクト作成</span>
          <span class="quota-popup-value">${projUsed} / ${projLimit}</span>
        </div>
        <div class="quota-popup-reset">リセット: 毎日 09:00（日本時間）</div>
      </div>
    `;

    document.body.appendChild(popup);

    // Close on click outside
    const closePopup = (e) => {
      if (!popup.contains(e.target) && e.target.id !== 'quotaDisplay') {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopup), 10);
  }

  /**
   * Show quota limit modal (for create page)
   */
  showQuotaLimitModal(limitType, limit, resetTimeStr) {
    const modal = document.getElementById('quotaLimitModal');
    const title = document.getElementById('quotaLimitTitle');
    const message = document.getElementById('quotaLimitMessage');
    const reset = document.getElementById('quotaLimitReset');
    const closeBtn = document.getElementById('closeQuotaLimit');

    if (!modal) return;

    title.textContent = `本日の${limitType}上限に達しました`;
    message.textContent = `1日${limit}回までご利用いただけます`;
    reset.textContent = `リセット時刻: 明日 ${resetTimeStr}（日本時間）`;

    modal.classList.remove('hidden');

    // Close handler
    const close = () => {
      modal.classList.add('hidden');
      closeBtn.removeEventListener('click', close);
    };
    closeBtn.addEventListener('click', close);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    }, { once: true });
  }

  showQuotaExceededError(error) {
    const resetTime = new Date(error.resetAt);
    const resetTimeStr = resetTime.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo'
    });

    const isProjectLimit = error.code === 'DAILY_PROJECT_LIMIT_EXCEEDED';
    const limitType = isProjectLimit ? 'プロジェクト作成' : 'メッセージ送信';

    // On create page (no chatMessages), show modal
    if (!this.chatMessages) {
      this.showQuotaLimitModal(limitType, error.limit, resetTimeStr);
      return;
    }

    // On editor page, show styled message in chat
    const errorHtml = `
      <div class="quota-exceeded-error">
        <div class="quota-error-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="quota-error-content">
          <div class="quota-error-title">本日の${limitType}上限に達しました</div>
          <div class="quota-error-detail">1日${error.limit}回までご利用いただけます</div>
          <div class="quota-error-reset">リセット時刻: 明日 ${resetTimeStr}（日本時間）</div>
        </div>
      </div>
    `;

    this.addMessage(errorHtml, 'system', { isHtml: true });
    this.updateQuotaDisplay();
  }

  showReconnectButton() {
    if (!this.sendButton) return;
    this.sendButton.disabled = false;
    this.sendButton.classList.add('reconnect-mode');
    this.sendButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"></polyline>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
      再接続する
    `;
  }

  restoreSendButton() {
    if (!this.sendButton) return;
    this.sendButton.classList.remove('reconnect-mode');
    this.sendButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      送信
    `;
    // Re-enable based on current project state
    if (this.currentProjectId && !this.isProcessing) {
      this.sendButton.disabled = false;
      if (this.chatInput) this.chatInput.disabled = false;
    }
  }

  // Version methods
  toggleVersionPanel() {
    if (!this.versionPanel) return;
    if (this.versionPanel.classList.contains('hidden')) {
      this.showVersionPanel();
    } else {
      this.hideVersionPanel();
    }
  }

  showVersionPanel() {
    if (!this.currentProjectId || !this.versionPanel) return;

    this.ws.send(JSON.stringify({
      type: 'getVersions',
      projectId: this.currentProjectId
    }));

    this.versionPanel.classList.remove('hidden');
  }

  hideVersionPanel() {
    this.versionPanel?.classList.add('hidden');
  }

  // Code viewer methods
  async showCodeViewer() {
    if (!this.currentProjectId || !this.codeViewerModal) return;

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.currentProjectId}/code`);
      const data = await response.json();

      if (data.code && this.codeViewerCode) {
        this.codeViewerCode.textContent = data.code;
        this.codeViewerModal.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Failed to fetch code:', error);
    }
  }

  hideCodeViewer() {
    this.codeViewerModal?.classList.add('hidden');
  }

  async copyCode() {
    if (!this.codeViewerCode) return;
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

    if (success && this.copyCodeButton) {
      this.copyCodeButton.classList.add('copied');
      this.copyCodeButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        コピー完了
      `;
      setTimeout(() => {
        if (!this.copyCodeButton) return;
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
    if (!this.currentProjectId) return;

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.currentProjectId}/download`);
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

  showRestoreLoading(message) {
    // Switch modal body to loading state
    if (this.restoreModalBody) {
      this.restoreModalBody.innerHTML = `
        <div class="restore-modal-loading">
          <div class="spinner"></div>
          <span class="restore-modal-loading-text">${message}</span>
        </div>
      `;
    }
    // Hide action buttons
    if (this.restoreModalActions) {
      this.restoreModalActions.style.display = 'none';
    }
  }

  updateRestoreLoading(message) {
    const textEl = this.restoreModal?.querySelector('.restore-modal-loading-text');
    if (textEl) {
      textEl.textContent = message;
    }
  }

  resetRestoreModal() {
    // Restore modal to original state for next use
    if (this.restoreModalBody) {
      this.restoreModalBody.innerHTML = `
        <p id="restoreModalMessage">このバージョンに戻しますか？</p>
        <p class="restore-modal-hint">現在のバージョンにもいつでも戻れます</p>
      `;
      this.restoreModalMessage = document.getElementById('restoreModalMessage');
    }
    if (this.restoreModalActions) {
      this.restoreModalActions.style.display = '';
    }
  }

  confirmRestore() {
    if (!this.pendingRestoreVersionId || !this.currentProjectId) {
      this.hideRestoreModal();
      return;
    }

    // Show loading in the modal (for mobile users on preview screen)
    this.showRestoreLoading('バージョン復元中...');

    // Also show streaming UI (for desktop users on chat screen)
    this.showStreaming();
    this.updateStreamingStatus('バージョン復元中...');

    this.ws.send(JSON.stringify({
      type: 'restoreVersion',
      projectId: this.currentProjectId,
      versionId: this.pendingRestoreVersionId
    }));
  }

  // Streaming methods
  showStreaming() {
    if (!this.streamingContainer) return;
    this.streamingText = '';
    if (this.streamingOutput) this.streamingOutput.innerHTML = '<span class="cursor"></span>';
    if (this.streamingStatus) {
      this.streamingStatus.textContent = '生成中...';
      this.streamingStatus.className = 'streaming-status';
    }
    if (this.streamingFile) this.streamingFile.textContent = 'index.html';
    this.streamingContainer.classList.remove('hidden');
    this.typewriterQueue = [];
    this.isTyping = false;

    // Scroll to latest message after streaming container appears
    const lastMessage = this.chatMessages?.lastElementChild;
    if (lastMessage) {
      this.scrollToLatestMessage(lastMessage);
    }
  }

  hideStreaming() {
    this.streamingContainer?.classList.add('hidden');
    this.typewriterQueue = [];
    this.isTyping = false;
  }

  completeStreaming() {
    if (this.streamingStatus) {
      this.streamingStatus.textContent = '完了';
      this.streamingStatus.className = 'streaming-status completed';
    }

    // Remove cursor
    const cursor = this.streamingOutput?.querySelector('.cursor');
    if (cursor) cursor.remove();

    // Hide after delay
    setTimeout(() => {
      this.hideStreaming();
    }, 2000);
  }

  updateStreamingStatus(message) {
    if (this.streamingStatus) this.streamingStatus.textContent = message;
  }

  updateStreamingFile(filename, status) {
    if (!this.streamingFile) return;
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

    if (this.streamingOutput) {
      this.streamingOutput.innerHTML = escaped + '<span class="cursor"></span>';
      // Auto-scroll to bottom
      this.streamingOutput.scrollTop = this.streamingOutput.scrollHeight;
    }

    // Continue processing with slight delay for animation effect
    setTimeout(() => this.processTypewriterQueue(), 10);
  }

  // ==================== Asset Management ====================

  setupAssetListeners() {
    if (!this.assetButton || !this.assetModal) return;
    // Open/close modal
    this.assetButton.addEventListener('click', () => this.openAssetModal());
    this.uploadButton?.addEventListener('click', () => this.triggerUpload());
    this.closeAssetModal?.addEventListener('click', () => this.closeAssetModalHandler());
    this.assetModal.addEventListener('click', (e) => {
      if (e.target === this.assetModal) this.closeAssetModalHandler();
    });

    // Tab switching
    this.assetTabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        this.assetTabs.forEach(t => t.classList.remove('active'));
        this.assetTabContents?.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab)?.classList.add('active');
      });
    });

    // Search
    this.assetSearch?.addEventListener('input', () => {
      this.searchAssets(this.assetSearch.value);
    });

    // Upload area
    this.uploadArea?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

    // Drag and drop
    if (this.uploadArea) {
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
    }

    // Upload submit
    this.uploadSubmit?.addEventListener('click', () => this.uploadFiles());

    // Insert asset
    this.insertAssetButton?.addEventListener('click', () => this.insertAssetToChat());

    // Edit asset
    this.editAssetButton?.addEventListener('click', () => this.openImageEditor());

    // Publish asset
    this.publishAssetButton?.addEventListener('click', () => this.toggleSelectedAssetPublic());

    // Delete asset
    this.deleteAssetButton?.addEventListener('click', () => this.deleteSelectedAssets());
  }

  triggerUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,.mp3,.wav,.ogg';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      for (const file of files) {
        try {
          // Compress image before upload
          let processedFile;
          try {
            processedFile = await this.compressImage(file);
          } catch (error) {
            alert(`${file.name}: ${error.message}`);
            continue;
          }

          const formData = new FormData();
          formData.append('file', processedFile);
          formData.append('originalName', file.name);
          if (this.currentProjectId) formData.append('projectId', this.currentProjectId);

          const response = await DreamCoreAuth.authFetch('/api/assets/upload', {
            method: 'POST',
            body: formData
          });

          const data = await response.json();
          if (data.success && data.asset) {
            // Add to attached assets
            this.attachedAssetsList.push(data.asset);
            this.renderAttachedAssets();
          } else {
            console.error('Upload failed:', data.error);
          }
        } catch (error) {
          console.error('Upload error:', error);
        }
      }
    };
    input.click();
  }

  openAssetModal() {
    if (!this.assetModal) return;
    this.assetModal.classList.remove('hidden');
    this.loadAssets();
  }

  closeAssetModalHandler() {
    this.assetModal?.classList.add('hidden');
    this.selectedAsset = null;
    this.clearSelection();
  }

  async loadAssets() {
    try {
      const currentProjectId = this.currentProjectId || '';
      const response = await DreamCoreAuth.authFetch(`/api/assets?currentProjectId=${currentProjectId}`);
      const data = await response.json();

      this.renderAssetGridGrouped(this.myAssetGrid, data.assets, true, currentProjectId);

      // Also load public assets
      const publicResponse = await DreamCoreAuth.authFetch('/api/assets/search');
      const publicData = await publicResponse.json();
      const publicAssets = publicData.assets.filter(a => a.isPublic && !a.isOwner);
      this.renderAssetGrid(this.publicAssetGrid, publicAssets, false);
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  }

  async searchAssets(query) {
    try {
      const url = query
        ? `/api/assets/search?q=${encodeURIComponent(query)}`
        : '/api/assets';

      const response = await DreamCoreAuth.authFetch(url);
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
    return assets.map(asset => {
      const projectId = asset.projects && asset.projects.length > 0 ? asset.projects[0].id : '';
      const isOwner = asset.isOwner !== false;
      return `
      <div class="asset-item ${asset.isPublic ? 'public-badge' : ''}" data-id="${asset.id}" data-url="${asset.url}" data-name="${asset.filename}" data-mimetype="${asset.mimeType || ''}" data-projectid="${projectId}" data-ispublic="${asset.isPublic || false}" data-isowner="${isOwner}">
        <div class="asset-thumb">
          ${this.getAssetThumb(asset)}
        </div>
        <div class="asset-name" title="${asset.filename}">${asset.filename}</div>
      </div>
    `}).join('');
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

    container.innerHTML = assets.map(asset => {
      const projectId = asset.projects && asset.projects.length > 0 ? asset.projects[0].id : '';
      const isOwner = asset.isOwner !== false;
      return `
      <div class="asset-item ${asset.isPublic ? 'public-badge' : ''}" data-id="${asset.id}" data-url="${asset.url}" data-name="${asset.filename}" data-mimetype="${asset.mimeType || ''}" data-projectid="${projectId}" data-ispublic="${asset.isPublic || false}" data-isowner="${isOwner}">
        <div class="asset-thumb">
          ${this.getAssetThumb(asset)}
        </div>
        <div class="asset-name" title="${asset.filename}">${asset.filename}</div>
      </div>
    `}).join('');

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
      return `<img src="${this.getAuthenticatedAssetUrl(asset.url)}" alt="${asset.filename}">`;
    } else if (asset.mimeType?.startsWith('audio/')) {
      return `<span class="audio-icon">🎵</span>`;
    } else {
      return `<span class="audio-icon">📄</span>`;
    }
  }

  selectAsset(item) {
    // Initialize selectedAssets array if not exists
    if (!this.selectedAssets) this.selectedAssets = [];

    const asset = {
      id: item.dataset.id,
      url: item.dataset.url,
      name: item.dataset.name,
      mimeType: item.dataset.mimetype,
      projectId: item.dataset.projectid || '',
      isPublic: item.dataset.ispublic === 'true',
      isOwner: item.dataset.isowner === 'true'
    };

    // Toggle selection
    const existingIndex = this.selectedAssets.findIndex(a => a.id === asset.id);
    if (existingIndex >= 0) {
      // Deselect
      this.selectedAssets.splice(existingIndex, 1);
      item.classList.remove('selected');
    } else {
      // Select
      this.selectedAssets.push(asset);
      item.classList.add('selected');
    }

    this.updateAssetFooter();
  }

  updateAssetFooter() {
    const count = this.selectedAssets?.length || 0;
    const allOwned = this.selectedAssets?.every(a => a.isOwner) || false;
    const arrowIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

    if (count === 0) {
      this.selectedAssetInfo.textContent = '';
      this.selectedAssetInfo.title = '';
      this.insertAssetButton.classList.add('hidden');
      this.editAssetButton?.classList.add('hidden');
      this.publishAssetButton?.classList.add('hidden');
      this.deleteAssetButton?.classList.add('hidden');
    } else if (count === 1) {
      const asset = this.selectedAssets[0];
      this.selectedAssetInfo.textContent = asset.name;
      this.selectedAssetInfo.title = asset.name;
      this.insertAssetButton.innerHTML = `挿入 ${arrowIcon}`;
      this.insertAssetButton.classList.remove('hidden');

      // Show edit button only for single image owned by user
      if (asset.mimeType?.startsWith('image/') && asset.isOwner) {
        this.editAssetButton?.classList.remove('hidden');
      } else {
        this.editAssetButton?.classList.add('hidden');
      }

      // Show delete only for owned assets
      if (asset.isOwner) {
        this.deleteAssetButton?.classList.remove('hidden');
      } else {
        this.deleteAssetButton?.classList.add('hidden');
      }

      // Publish button (hidden for now, kept for future use)
      this.publishAssetButton?.classList.add('hidden');

      // Keep selectedAsset for backward compatibility (edit)
      this.selectedAsset = asset;
    } else {
      this.selectedAssetInfo.textContent = `${count}件選択中`;
      this.selectedAssetInfo.title = this.selectedAssets.map(a => a.name).join('\n');
      this.insertAssetButton.innerHTML = `挿入 (${count}) ${arrowIcon}`;
      this.insertAssetButton.classList.remove('hidden');

      // Hide edit/publish for multiple selection
      this.editAssetButton?.classList.add('hidden');
      this.publishAssetButton?.classList.add('hidden');

      // Show delete only if all assets are owned
      if (allOwned) {
        this.deleteAssetButton?.classList.remove('hidden');
      } else {
        this.deleteAssetButton?.classList.add('hidden');
      }

      this.selectedAsset = null;
    }
  }

  clearSelection() {
    this.assetModal.querySelectorAll('.asset-item.selected').forEach(i => {
      i.classList.remove('selected');
    });
    this.selectedAssets = [];
    this.selectedAsset = null;
    this.updateAssetFooter();
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

  async compressImage(file, maxSize = 300 * 1024, maxDimension = 2048) {
    return new Promise((resolve, reject) => {
      // Skip non-image files
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      // GIF/WebP: preserve animation but enforce size limit
      if (file.type === 'image/gif' || file.type === 'image/webp') {
        if (file.size > maxSize) {
          reject(new Error(`${file.type.split('/')[1].toUpperCase()} file too large: ${(file.size / 1024).toFixed(0)}KB (max ${maxSize / 1024}KB)`));
        } else {
          resolve(file);
        }
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate new dimensions
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Check if image has transparency (PNG)
        const isPng = file.type === 'image/png';
        let hasTransparency = false;
        if (isPng) {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              hasTransparency = true;
              break;
            }
          }
        }

        // Compress with decreasing quality until under maxSize
        const compress = (quality, dimension) => {
          // For transparent PNGs, resize further if needed instead of quality reduction
          let targetCanvas = canvas;
          if (hasTransparency && dimension < maxDimension) {
            const scale = dimension / Math.max(width, height);
            const newW = Math.round(width * scale);
            const newH = Math.round(height * scale);
            targetCanvas = document.createElement('canvas');
            targetCanvas.width = newW;
            targetCanvas.height = newH;
            targetCanvas.getContext('2d').drawImage(img, 0, 0, newW, newH);
          }

          const outputType = hasTransparency ? 'image/png' : 'image/jpeg';
          const ext = hasTransparency ? '.png' : '.jpg';

          targetCanvas.toBlob(
            (blob) => {
              if (blob.size <= maxSize || (hasTransparency && dimension <= 256) || (!hasTransparency && quality <= 0.1)) {
                // Create new file with compressed data
                const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ext), {
                  type: outputType,
                  lastModified: Date.now()
                });
                console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
                resolve(compressedFile);
              } else if (hasTransparency) {
                // For PNG with transparency, reduce dimensions
                compress(quality, Math.round(dimension * 0.8));
              } else {
                // For JPEG, reduce quality
                compress(quality - 0.1, dimension);
              }
            },
            outputType,
            hasTransparency ? undefined : quality
          );
        };

        compress(0.9, Math.max(width, height));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file); // Return original on error
      };

      img.src = url;
    });
  }

  async uploadFiles() {
    if (this.pendingUploads.length === 0 || !this.userId) return;

    const tags = this.assetTags.value;
    const description = this.assetDescription.value;

    for (const file of this.pendingUploads) {
      // Compress image before upload
      let processedFile;
      try {
        processedFile = await this.compressImage(file);
      } catch (error) {
        alert(`${file.name}: ${error.message}`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', processedFile);
      formData.append('originalName', file.name); // Send original filename separately to preserve encoding
      if (this.currentProjectId) formData.append('projectId', this.currentProjectId);
      if (tags) formData.append('tags', tags);
      if (description) formData.append('description', description);

      try {
        const response = await DreamCoreAuth.authFetch('/api/assets/upload', {
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
      await DreamCoreAuth.authFetch(`/api/assets/${assetId}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic })
      });
      this.loadAssets();
    } catch (error) {
      console.error('Error toggling public:', error);
    }
  }

  async deleteAsset(assetId) {
    if (!confirm('Delete this asset?')) return;

    try {
      await DreamCoreAuth.authFetch(`/api/assets/${assetId}`, {
        method: 'DELETE'
      });
      this.loadAssets();
    } catch (error) {
      console.error('Error deleting asset:', error);
    }
  }

  async toggleSelectedAssetPublic() {
    if (!this.selectedAsset) return;
    const newPublicState = !this.selectedAsset.isPublic;

    try {
      await DreamCoreAuth.authFetch(`/api/assets/${this.selectedAsset.id}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newPublicState })
      });

      // Update local state without clearing selection
      this.selectedAsset.isPublic = newPublicState;
      if (this.selectedAssets?.length > 0) {
        const asset = this.selectedAssets.find(a => a.id === this.selectedAsset.id);
        if (asset) asset.isPublic = newPublicState;
      }

      // Update the item's public badge in the grid
      const item = this.assetModal.querySelector(`.asset-item[data-id="${this.selectedAsset.id}"]`);
      if (item) {
        item.dataset.ispublic = newPublicState.toString();
        item.classList.toggle('public-badge', newPublicState);
      }

      // Update footer to reflect new icon
      this.updateAssetFooter();
    } catch (error) {
      console.error('Error toggling public:', error);
    }
  }

  deleteSelectedAssets() {
    const assets = this.selectedAssets || [];
    if (assets.length === 0) return;

    // Show confirmation modal
    this.showDeleteConfirmModal(assets);
  }

  showDeleteConfirmModal(assets) {
    this.pendingDeleteAssets = assets;

    const title = assets.length === 1 ? 'アセットを削除' : `${assets.length}件のアセットを削除`;
    const message = assets.length === 1
      ? `「${assets[0].name}」を削除しますか？`
      : `${assets.length}件のアセットを削除しますか？`;

    this.deleteConfirmTitle.textContent = title;
    this.deleteConfirmMessage.textContent = message;
    this.deleteConfirmModal.classList.remove('hidden');
  }

  hideDeleteConfirmModal() {
    this.deleteConfirmModal.classList.add('hidden');
    this.pendingDeleteAssets = null;
  }

  async confirmDeleteAssets() {
    const assets = this.pendingDeleteAssets;
    if (!assets || assets.length === 0) return;

    this.hideDeleteConfirmModal();

    try {
      for (const asset of assets) {
        await DreamCoreAuth.authFetch(`/api/assets/${asset.id}`, {
          method: 'DELETE'
        });
      }
      this.clearSelection();
      this.loadAssets();
    } catch (error) {
      console.error('Error deleting assets:', error);
    }
  }

  insertAssetToChat() {
    // Handle multiple selected assets
    const assetsToInsert = this.selectedAssets?.length > 0
      ? this.selectedAssets
      : (this.selectedAsset ? [this.selectedAsset] : []);

    if (assetsToInsert.length === 0) return;

    let addedCount = 0;
    for (const asset of assetsToInsert) {
      // Check if already attached
      const alreadyAttached = this.attachedAssetsList.some(a => a.id === asset.id);
      if (!alreadyAttached) {
        this.attachedAssetsList.push({
          id: asset.id,
          name: asset.name,
          url: asset.url  // V2: Use asset's own URL
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.renderAttachedAssets();
    }

    this.closeAssetModalHandler();
    this.chatInput?.focus();
  }

  renderAttachedAssets() {
    if (!this.attachedAssetsContainer) return;
    if (this.attachedAssetsList.length === 0) {
      this.attachedAssetsContainer.classList.add('hidden');
      this.attachedAssetsContainer.innerHTML = '';
      return;
    }

    this.attachedAssetsContainer.classList.remove('hidden');
    this.attachedAssetsContainer.innerHTML = this.attachedAssetsList.map((asset, index) => `
      <div class="attached-asset-item" data-id="${asset.id}">
        <span class="attached-asset-number">【${index + 1}】</span>
        <img src="${this.getAuthenticatedAssetUrl(asset.url)}" alt="${asset.name}" />
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

  // ==================== Image Editor ====================

  initImageEditor() {
    this.imageEditor = new ImageEditor(this.editorCanvas);
    this.currentTool = null;
    this.cropper = null;
    this.cropAspectRatio = NaN;
    this.cropCircle = false;

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
    });

    // Crop ratio buttons (for Cropper.js)
    document.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const ratio = btn.dataset.ratio;
        if (ratio === 'free') {
          this.cropAspectRatio = NaN;
          this.cropCircle = false;
        } else if (ratio === 'circle') {
          this.cropAspectRatio = 1;
          this.cropCircle = true;
        } else {
          const [w, h] = ratio.split(':').map(Number);
          this.cropAspectRatio = w / h;
          this.cropCircle = false;
        }

        // Update Cropper.js if active
        if (this.cropper) {
          this.cropper.setAspectRatio(this.cropAspectRatio);
        }

        // Toggle circle mode visual indicator
        const cropperWrapper = document.getElementById('cropperWrapper');
        if (cropperWrapper) {
          cropperWrapper.classList.toggle('circle-mode', this.cropCircle);
        }
      });
    });

    // Rotate button (90° clockwise)
    document.getElementById('rotateRight')?.addEventListener('click', () => {
      this.imageEditor.rotate(90);
      this.updateUndoButton();
    });

    // Flip buttons
    document.getElementById('flipHorizontal')?.addEventListener('click', () => {
      this.imageEditor.flipHorizontal();
      this.updateUndoButton();
    });
    document.getElementById('flipVertical')?.addEventListener('click', () => {
      this.imageEditor.flipVertical();
      this.updateUndoButton();
    });

    // Resize inputs
    const resizeWidth = document.getElementById('resizeWidth');
    const resizeHeight = document.getElementById('resizeHeight');
    const keepAspect = document.getElementById('keepAspect');

    resizeWidth?.addEventListener('input', () => {
      if (keepAspect?.checked && this.imageEditor.aspectRatio) {
        resizeHeight.value = Math.round(resizeWidth.value / this.imageEditor.aspectRatio);
      }
    });

    resizeHeight?.addEventListener('input', () => {
      if (keepAspect?.checked && this.imageEditor.aspectRatio) {
        resizeWidth.value = Math.round(resizeHeight.value * this.imageEditor.aspectRatio);
      }
    });

    // Apply buttons
    document.getElementById('applyCrop')?.addEventListener('click', () => this.applyCrop());
    document.getElementById('applyResize')?.addEventListener('click', () => this.applyResize());
    document.getElementById('applyRemoveBg')?.addEventListener('click', () => this.applyRemoveBackground());

    // Footer buttons
    document.getElementById('editorUndo')?.addEventListener('click', () => {
      this.imageEditor.undo();
      this.updateUndoButton();
    });
    document.getElementById('editorReset')?.addEventListener('click', () => {
      this.imageEditor.reset();
      this.updateUndoButton();
    });
    document.getElementById('cancelEdit')?.addEventListener('click', () => this.closeImageEditor());
    document.getElementById('saveEditedImage')?.addEventListener('click', () => this.saveEditedImage());
    document.getElementById('closeImageEditor')?.addEventListener('click', () => this.closeImageEditor());

    // Panel cancel buttons
    document.querySelectorAll('[data-cancel-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.selectTool(null));
    });
  }

  openImageEditor() {
    if (!this.selectedAsset) return;

    // Initialize editor if not done
    if (!this.imageEditor) {
      this.initImageEditor();
    }

    // Load image
    this.editingAssetId = this.selectedAsset.id;
    this.editingAssetName = this.selectedAsset.name;
    this.imageEditor.loadImage(this.selectedAsset.url).then(() => {
      // Set resize inputs to current dimensions
      const resizeWidth = document.getElementById('resizeWidth');
      const resizeHeight = document.getElementById('resizeHeight');
      if (resizeWidth && resizeHeight) {
        resizeWidth.value = this.imageEditor.width;
        resizeHeight.value = this.imageEditor.height;
      }
      this.updateUndoButton();
    });

    // Show modal
    this.imageEditorModal?.classList.remove('hidden');
    this.selectTool(null);
  }

  closeImageEditor() {
    this.imageEditorModal?.classList.add('hidden');
    this.selectTool(null);
    this.editingAssetId = null;
    this.editingAssetName = null;
  }

  selectTool(tool) {
    this.currentTool = tool;

    // Update toolbar
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Show/hide panels
    document.querySelectorAll('.tool-panel').forEach(panel => {
      panel.classList.add('hidden');
    });

    // Toggle tool-active class on modal for mobile footer visibility
    const modal = document.querySelector('.image-editor-modal');
    modal?.classList.toggle('tool-active', !!tool);

    if (tool) {
      const panel = document.getElementById(`${tool === 'remove-bg' ? 'removeBg' : tool}Panel`);
      panel?.classList.remove('hidden');
    }

    // Handle Cropper.js
    if (tool === 'crop') {
      this.startCropper();
    } else {
      this.endCropper();
    }
  }

  startCropper() {
    // Get current image from canvas as data URL
    const dataUrl = this.editorCanvas.toDataURL('image/png');

    // Show cropper container, hide canvas
    const cropperWrapper = document.getElementById('cropperWrapper');
    const cropperImage = document.getElementById('cropperImage');
    const canvasWrapper = this.editorCanvas.parentElement;

    canvasWrapper.classList.add('hidden');
    cropperWrapper.classList.remove('hidden');
    cropperWrapper.classList.toggle('circle-mode', this.cropCircle);

    // Set image source
    cropperImage.src = dataUrl;

    // Initialize Cropper.js
    this.cropper = new Cropper(cropperImage, {
      viewMode: 1,
      dragMode: 'move',
      aspectRatio: this.cropAspectRatio || NaN,
      autoCropArea: 1,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      responsive: true,
      background: true
    });
  }

  endCropper() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }

    // Hide cropper container, show canvas
    const cropperWrapper = document.getElementById('cropperWrapper');
    const canvasWrapper = this.editorCanvas.parentElement;

    cropperWrapper?.classList.add('hidden');
    cropperWrapper?.classList.remove('circle-mode');
    canvasWrapper?.classList.remove('hidden');
  }

  applyCrop() {
    if (!this.cropper) return;

    // Get cropped canvas from Cropper.js
    const croppedCanvas = this.cropper.getCroppedCanvas();
    if (!croppedCanvas) return;

    // Apply circular mask if needed
    let finalCanvas = croppedCanvas;
    if (this.cropCircle) {
      const circleCanvas = document.createElement('canvas');
      const size = Math.min(croppedCanvas.width, croppedCanvas.height);
      circleCanvas.width = size;
      circleCanvas.height = size;
      const ctx = circleCanvas.getContext('2d');

      // Create circular clipping path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw cropped image centered
      const offsetX = (croppedCanvas.width - size) / 2;
      const offsetY = (croppedCanvas.height - size) / 2;
      ctx.drawImage(croppedCanvas, -offsetX, -offsetY);

      finalCanvas = circleCanvas;
    }

    // Apply cropped image to ImageEditor
    const img = new Image();
    img.onload = () => {
      this.imageEditor.loadImageFromElement(img);
      this.imageEditor.hasTransparency = this.cropCircle; // Circle crop creates transparency
      this.updateUndoButton();

      // Update resize inputs
      const resizeWidth = document.getElementById('resizeWidth');
      const resizeHeight = document.getElementById('resizeHeight');
      if (resizeWidth && resizeHeight) {
        resizeWidth.value = this.imageEditor.width;
        resizeHeight.value = this.imageEditor.height;
      }
    };
    img.src = finalCanvas.toDataURL('image/png');

    this.selectTool(null);
  }

  applyResize() {
    const width = parseInt(document.getElementById('resizeWidth')?.value);
    const height = parseInt(document.getElementById('resizeHeight')?.value);

    if (width > 0 && height > 0 && width <= 4096 && height <= 4096) {
      this.imageEditor.resize(width, height);
      this.updateUndoButton();
      this.selectTool(null);
    } else {
      alert('サイズは1〜4096pxの範囲で指定してください');
    }
  }

  async applyRemoveBackground() {
    const processing = document.getElementById('bgProcessing');
    const applyBtn = document.getElementById('applyRemoveBg');

    processing?.classList.remove('hidden');
    if (applyBtn) applyBtn.disabled = true;

    try {
      await this.imageEditor.removeBackground(this.userId);
      this.updateUndoButton();
      this.selectTool(null);
    } catch (error) {
      console.error('Background removal failed:', error);
      alert('エラーが起きました。もう一度お試しください。');
    } finally {
      processing?.classList.add('hidden');
      if (applyBtn) applyBtn.disabled = false;
    }
  }

  updateUndoButton() {
    const undoBtn = document.getElementById('editorUndo');
    if (undoBtn) {
      undoBtn.disabled = !this.imageEditor?.canUndo();
    }
  }

  async saveEditedImage() {
    try {
      const blob = await this.imageEditor.toBlob();

      // Create filename with _edited suffix
      const baseName = this.editingAssetName.replace(/\.[^/.]+$/, '');
      const ext = this.editingAssetName.includes('.png') || this.imageEditor.hasTransparency ? '.png' : '.jpg';
      const newName = `${baseName}_edited${ext}`;

      // Convert blob to File for compression
      const file = new File([blob], newName, {
        type: ext === '.png' ? 'image/png' : 'image/jpeg',
        lastModified: Date.now()
      });

      // Compress image before upload
      const compressedFile = await this.compressImage(file);

      // Upload as new asset
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('originalName', newName);
      // Save to current project
      if (this.currentProjectId) {
        formData.append('projectId', this.currentProjectId);
      }

      const response = await DreamCoreAuth.authFetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      // Close editor and refresh asset list
      this.closeImageEditor();
      await this.loadAssets();

      // Clear selection after save
      this.clearSelection();

      // Show success
      console.log('Image saved:', result.asset);
    } catch (error) {
      console.error('Save failed:', error);
      alert('保存に失敗しました: ' + error.message);
    }
  }

  // ==================== Image Generation ====================

  setupImageGenListeners() {
    if (!this.imageGenButton || !this.imageGenModal) return;
    // Open/close modal
    this.imageGenButton.addEventListener('click', () => this.openImageGenModal());
    this.closeImageGenModal?.addEventListener('click', () => this.closeImageGenModalHandler());
    this.imageGenModal.addEventListener('click', (e) => {
      if (e.target === this.imageGenModal) this.closeImageGenModalHandler();
    });

    // Generate button
    this.generateImageButton?.addEventListener('click', () => this.generateImage());

    // Insert button
    this.insertImageButton?.addEventListener('click', () => this.insertGeneratedImage());

    // Download button
    this.downloadImageButton?.addEventListener('click', () => this.downloadGeneratedImage());
  }

  // ==================== Mobile Plus Menu ====================

  setupPlusMenuListeners() {
    if (!this.plusMenuButton || !this.plusMenuPopup) return;

    // Toggle menu on button click
    this.plusMenuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlusMenu();
    });

    // Menu item: Asset
    this.plusMenuAsset?.addEventListener('click', () => {
      this.closePlusMenu();
      this.openAssetModal();
    });

    // Menu item: Upload
    this.plusMenuUpload?.addEventListener('click', () => {
      this.closePlusMenu();
      this.triggerUpload();
    });

    // Menu item: Image Generation
    this.plusMenuImageGen?.addEventListener('click', () => {
      this.closePlusMenu();
      this.openImageGenModal();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.plusMenuPopup && !this.plusMenuPopup.classList.contains('hidden')) {
        if (!this.plusMenuButton.contains(e.target) && !this.plusMenuPopup.contains(e.target)) {
          this.closePlusMenu();
        }
      }
    });
  }

  togglePlusMenu() {
    if (!this.plusMenuPopup || !this.plusMenuButton) return;
    const isHidden = this.plusMenuPopup.classList.contains('hidden');
    if (isHidden) {
      this.plusMenuPopup.classList.remove('hidden');
      this.plusMenuButton.classList.add('active');
    } else {
      this.closePlusMenu();
    }
  }

  closePlusMenu() {
    this.plusMenuPopup?.classList.add('hidden');
    this.plusMenuButton?.classList.remove('active');
  }

  openImageGenModal() {
    if (!this.imageGenModal) return;
    this.imageGenModal.classList.remove('hidden');
    this.imageGenPrompt?.focus();
  }

  closeImageGenModalHandler() {
    this.imageGenModal?.classList.add('hidden');
    this.resetImageGenState();
  }

  resetImageGenState() {
    if (this.imageGenPrompt) this.imageGenPrompt.value = '';
    if (this.imageGenStyle) this.imageGenStyle.value = '';
    if (this.imageGenSize) this.imageGenSize.value = '512x512';
    this.generatedImageData = null;
    this.imagePlaceholder?.classList.remove('hidden');
    this.generatedImage?.classList.add('hidden');
    this.imageGenLoading?.classList.add('hidden');
    // Remove has-image class for mobile layout
    this.imageGenModal?.querySelector('.modal-content')?.classList.remove('has-image');
    if (this.insertImageButton) {
      this.insertImageButton.classList.add('hidden');
      this.insertImageButton.disabled = true;
    }
    if (this.downloadImageButton) {
      this.downloadImageButton.classList.add('hidden');
      this.downloadImageButton.disabled = true;
    }
  }

  async generateImage() {
    if (!this.imageGenPrompt) return;
    const prompt = this.imageGenPrompt.value.trim();
    if (!prompt) {
      alert('Please enter a description for the image.');
      return;
    }

    const style = this.imageGenStyle?.value || '';
    const size = this.imageGenSize?.value || '512x512';

    // Show loading state
    this.imagePlaceholder?.classList.add('hidden');
    this.generatedImage?.classList.add('hidden');
    this.imageGenLoading?.classList.remove('hidden');
    if (this.generateImageButton) this.generateImageButton.disabled = true;

    try {
      const response = await DreamCoreAuth.authFetch('/api/generate-image', {
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
      if (this.generatedImage) {
        this.generatedImage.src = data.image;
        this.generatedImage.classList.remove('hidden');
      }
      this.imageGenLoading?.classList.add('hidden');

      // Add has-image class for mobile layout (show image prominently)
      this.imageGenModal?.querySelector('.modal-content')?.classList.add('has-image');

      // Enable action buttons
      if (this.insertImageButton) {
        this.insertImageButton.classList.remove('hidden');
        this.insertImageButton.disabled = false;
      }
      if (this.downloadImageButton) {
        this.downloadImageButton.classList.remove('hidden');
        this.downloadImageButton.disabled = false;
      }

    } catch (error) {
      console.error('Image generation error:', error);
      this.imageGenLoading?.classList.add('hidden');
      this.imagePlaceholder?.classList.remove('hidden');
      alert('Image generation failed: ' + error.message);
    } finally {
      if (this.generateImageButton) this.generateImageButton.disabled = false;
    }
  }

  insertGeneratedImage() {
    if (!this.generatedImageData || !this.chatInput) return;

    // Insert image data reference into chat
    const prompt = this.imageGenPrompt?.value.trim() || '';
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

// ==================== ImageEditor Class ====================

class ImageEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.originalImage = null;
    this.currentImage = null;
    this.history = [];
    this.width = 0;
    this.height = 0;
    this.aspectRatio = 1;
    this.hasTransparency = false;
  }

  async loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.originalImage = img;
        this.currentImage = this.imageToCanvas(img);
        this.width = img.width;
        this.height = img.height;
        this.aspectRatio = img.width / img.height;
        this.history = [];
        this.hasTransparency = false;
        this.render();
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  loadImageFromElement(img) {
    this.saveHistory();
    this.currentImage = this.imageToCanvas(img);
    this.width = img.width;
    this.height = img.height;
    this.aspectRatio = img.width / img.height;
    this.render();
  }

  imageToCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  render() {
    // Fit canvas to container while maintaining aspect ratio
    // Use editor-canvas-area (grandparent) not canvas-wrapper (parent) for stable sizing
    const container = this.canvas.parentElement?.parentElement;
    if (!container) return;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 40;

    // Scale to fit container (both scale up and down)
    const scaleX = maxWidth / this.width;
    const scaleY = maxHeight / this.height;
    const scale = Math.min(scaleX, scaleY);

    const displayWidth = Math.round(this.width * scale);
    const displayHeight = Math.round(this.height * scale);

    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    this.canvas.style.width = displayWidth + 'px';
    this.canvas.style.height = displayHeight + 'px';

    // Draw checkerboard pattern for transparency
    this.drawCheckerboard();

    // Draw image
    this.ctx.drawImage(this.currentImage, 0, 0, displayWidth, displayHeight);

    // Store scale for crop calculations
    this.displayScale = displayWidth / this.width;
  }

  drawCheckerboard() {
    const size = 10;
    const colors = ['#ffffff', '#e0e0e0'];
    for (let y = 0; y < this.canvas.height; y += size) {
      for (let x = 0; x < this.canvas.width; x += size) {
        this.ctx.fillStyle = colors[((x / size) + (y / size)) % 2 | 0];
        this.ctx.fillRect(x, y, size, size);
      }
    }
  }

  saveHistory() {
    // Save current state to history
    const dataUrl = this.currentImage.toDataURL('image/png');
    this.history.push({
      dataUrl,
      width: this.width,
      height: this.height,
      hasTransparency: this.hasTransparency
    });
    if (this.history.length > 10) this.history.shift();
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    if (this.history.length === 0) return;

    const prev = this.history.pop();
    const img = new Image();
    img.onload = () => {
      this.currentImage = this.imageToCanvas(img);
      this.width = prev.width;
      this.height = prev.height;
      this.aspectRatio = this.width / this.height;
      this.hasTransparency = prev.hasTransparency;
      this.render();
    };
    img.src = prev.dataUrl;
  }

  reset() {
    if (!this.originalImage) return;
    this.currentImage = this.imageToCanvas(this.originalImage);
    this.width = this.originalImage.width;
    this.height = this.originalImage.height;
    this.aspectRatio = this.width / this.height;
    this.history = [];
    this.hasTransparency = false;
    this.render();
  }

  crop(x, y, width, height) {
    this.saveHistory();

    const cropped = document.createElement('canvas');
    cropped.width = width;
    cropped.height = height;
    const ctx = cropped.getContext('2d');
    ctx.drawImage(this.currentImage, x, y, width, height, 0, 0, width, height);

    this.currentImage = cropped;
    this.width = width;
    this.height = height;
    this.aspectRatio = width / height;
    this.render();
  }

  resize(newWidth, newHeight) {
    this.saveHistory();

    const resized = document.createElement('canvas');
    resized.width = newWidth;
    resized.height = newHeight;
    const ctx = resized.getContext('2d');
    ctx.drawImage(this.currentImage, 0, 0, newWidth, newHeight);

    this.currentImage = resized;
    this.width = newWidth;
    this.height = newHeight;
    this.aspectRatio = newWidth / newHeight;
    this.render();
  }

  rotate(degrees) {
    this.saveHistory();

    const radians = degrees * Math.PI / 180;
    const w = this.width;
    const h = this.height;

    // For 90/180/270 degrees, calculate exact dimensions
    let newW, newH;
    if (degrees === 90 || degrees === -90 || degrees === 270 || degrees === -270) {
      newW = h;
      newH = w;
    } else if (degrees === 180 || degrees === -180) {
      newW = w;
      newH = h;
    } else {
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      newW = Math.ceil(w * cos + h * sin);
      newH = Math.ceil(h * cos + w * sin);
    }

    const rotated = document.createElement('canvas');
    rotated.width = newW;
    rotated.height = newH;
    const ctx = rotated.getContext('2d');

    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(radians);
    ctx.drawImage(this.currentImage, -w / 2, -h / 2);

    this.currentImage = rotated;
    this.width = newW;
    this.height = newH;
    this.aspectRatio = newW / newH;
    this.render();
  }

  flipHorizontal() {
    this.saveHistory();

    const flipped = document.createElement('canvas');
    flipped.width = this.width;
    flipped.height = this.height;
    const ctx = flipped.getContext('2d');

    ctx.translate(this.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.currentImage, 0, 0);

    this.currentImage = flipped;
    this.render();
  }

  flipVertical() {
    this.saveHistory();

    const flipped = document.createElement('canvas');
    flipped.width = this.width;
    flipped.height = this.height;
    const ctx = flipped.getContext('2d');

    ctx.translate(0, this.height);
    ctx.scale(1, -1);
    ctx.drawImage(this.currentImage, 0, 0);

    this.currentImage = flipped;
    this.render();
  }

  async removeBackground(userId) {
    // Compress image if too large (max 2048px on longest side)
    const MAX_SIZE = 2048;
    let imageToSend = this.currentImage;

    if (this.width > MAX_SIZE || this.height > MAX_SIZE) {
      const scale = MAX_SIZE / Math.max(this.width, this.height);
      const newWidth = Math.round(this.width * scale);
      const newHeight = Math.round(this.height * scale);

      const compressed = document.createElement('canvas');
      compressed.width = newWidth;
      compressed.height = newHeight;
      const ctx = compressed.getContext('2d');
      ctx.drawImage(this.currentImage, 0, 0, newWidth, newHeight);
      imageToSend = compressed;

      console.log(`Image compressed: ${this.width}x${this.height} -> ${newWidth}x${newHeight}`);
    }

    // Get image as base64
    const dataUrl = imageToSend.toDataURL('image/png');

    const response = await DreamCoreAuth.authFetch('/api/assets/remove-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Background removal failed');
    }

    const result = await response.json();

    // Load result image
    this.saveHistory();

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.currentImage = this.imageToCanvas(img);
        this.width = img.width;
        this.height = img.height;
        this.aspectRatio = this.width / this.height;
        this.hasTransparency = true;
        this.render();
        resolve();
      };
      img.onerror = reject;
      img.src = result.image;
    });
  }

  toDataURL(format = 'image/png') {
    return this.currentImage.toDataURL(format);
  }

  toBlob(format = 'image/png', quality = 0.92) {
    return new Promise(resolve => {
      this.currentImage.toBlob(resolve, format, quality);
    });
  }
}

// ==================== CropSelection Class ====================
// Instagram/X style crop UI - shows selection from start with draggable handles

class CropSelection {
  constructor(canvas, overlay, editor) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.editor = editor;
    this.rect = null;
    this.aspectRatio = null;
    this.enabled = false;

    // Detect touch device
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Drag state
    this.dragMode = null; // 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    this.dragStart = { x: 0, y: 0 };
    this.rectStart = null;

    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
  }

  enable() {
    this.enabled = true;

    // Set overlay size to match canvas exactly
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.overlay.style.width = w + 'px';
    this.overlay.style.height = h + 'px';

    // Initialize with full canvas selection
    this.rect = { x: 0, y: 0, width: w, height: h };

    // Apply aspect ratio if set
    if (this.aspectRatio) {
      this.applyAspectRatio();
    }

    this.drawOverlay();
    this.updateCropInfo();

    // Add event listeners - use canvas for touch events (more reliable on mobile)
    this.overlay.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    // Touch events on canvas parent wrapper for better mobile support
    this.canvas.parentElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd);
  }

  disable() {
    this.enabled = false;
    this.dragMode = null;
    this.overlay.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.parentElement.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
    this.overlay.innerHTML = '';
  }

  setAspectRatio(ratio) {
    if (!ratio || ratio === 'free') {
      this.aspectRatio = null;
    } else {
      const [w, h] = ratio.split(':').map(Number);
      this.aspectRatio = w / h;
    }

    // Re-apply aspect ratio to current selection
    if (this.enabled && this.rect) {
      this.applyAspectRatio();
      this.drawOverlay();
      this.updateCropInfo();
    }
  }

  applyAspectRatio() {
    if (!this.aspectRatio || !this.rect) return;

    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const currentRatio = this.rect.width / this.rect.height;

    let newW = this.rect.width;
    let newH = this.rect.height;

    if (currentRatio > this.aspectRatio) {
      // Too wide, reduce width
      newW = this.rect.height * this.aspectRatio;
    } else {
      // Too tall, reduce height
      newH = this.rect.width / this.aspectRatio;
    }

    // Center the new rect within the old rect
    const offsetX = (this.rect.width - newW) / 2;
    const offsetY = (this.rect.height - newH) / 2;

    this.rect.x += offsetX;
    this.rect.y += offsetY;
    this.rect.width = newW;
    this.rect.height = newH;

    // Ensure within bounds
    this.clampRect();
  }

  getRect() {
    if (!this.rect) return null;

    const scale = this.editor.displayScale;
    return {
      x: Math.round(this.rect.x / scale),
      y: Math.round(this.rect.y / scale),
      width: Math.round(this.rect.width / scale),
      height: Math.round(this.rect.height / scale)
    };
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  getTouchPos(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    // Scale touch position to canvas coordinates
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  }

  getHandleAtPos(pos) {
    if (!this.rect) return null;

    const { x, y, width, height } = this.rect;
    // Much larger hit area for touch devices
    const handleSize = this.isTouchDevice ? 80 : 20;
    const hs = handleSize / 2;

    // Check corners first (they have priority)
    if (this.isNear(pos, x, y, hs)) return 'nw';
    if (this.isNear(pos, x + width, y, hs)) return 'ne';
    if (this.isNear(pos, x, y + height, hs)) return 'sw';
    if (this.isNear(pos, x + width, y + height, hs)) return 'se';

    // Check edges
    if (pos.x >= x - hs && pos.x <= x + width + hs) {
      if (Math.abs(pos.y - y) < hs) return 'n';
      if (Math.abs(pos.y - (y + height)) < hs) return 's';
    }
    if (pos.y >= y - hs && pos.y <= y + height + hs) {
      if (Math.abs(pos.x - x) < hs) return 'w';
      if (Math.abs(pos.x - (x + width)) < hs) return 'e';
    }

    // Check if inside selection (for move)
    if (pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
      return 'move';
    }

    // On touch devices, if touch is anywhere near the selection, allow move
    if (this.isTouchDevice) {
      const margin = 30;
      if (pos.x >= x - margin && pos.x <= x + width + margin &&
          pos.y >= y - margin && pos.y <= y + height + margin) {
        return 'move';
      }
    }

    return null;
  }

  isNear(pos, x, y, threshold) {
    return Math.abs(pos.x - x) < threshold && Math.abs(pos.y - y) < threshold;
  }

  handleMouseDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const pos = this.getMousePos(e);
    this.startDrag(pos);
  }

  handleTouchStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getTouchPos(e);
    this.startDrag(pos);
  }

  startDrag(pos) {
    this.dragMode = this.getHandleAtPos(pos);
    if (!this.dragMode) return;

    this.dragStart = pos;
    this.rectStart = { ...this.rect };
  }

  handleMouseMove(e) {
    if (!this.enabled) return;

    const pos = this.getMousePos(e);

    if (this.dragMode) {
      e.preventDefault();
      this.updateDrag(pos);
    } else {
      // Update cursor based on hover
      const handle = this.getHandleAtPos(pos);
      this.updateCursor(handle);
    }
  }

  handleTouchMove(e) {
    if (!this.enabled || !this.dragMode) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getTouchPos(e);
    this.updateDrag(pos);
  }

  updateCursor(handle) {
    const cursors = {
      'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
      'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize',
      'move': 'move'
    };
    this.overlay.style.cursor = cursors[handle] || 'default';
  }

  updateDrag(pos) {
    if (!this.dragMode || !this.rectStart) return;

    const dx = pos.x - this.dragStart.x;
    const dy = pos.y - this.dragStart.y;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const minSize = 20;

    if (this.dragMode === 'move') {
      // Move the selection
      this.rect.x = this.rectStart.x + dx;
      this.rect.y = this.rectStart.y + dy;
    } else {
      // Resize from handles
      let { x, y, width, height } = this.rectStart;

      // Adjust based on which handle is being dragged
      if (this.dragMode.includes('w')) {
        const newX = x + dx;
        const newWidth = width - dx;
        if (newWidth >= minSize && newX >= 0) {
          x = newX;
          width = newWidth;
        }
      }
      if (this.dragMode.includes('e')) {
        width = Math.max(minSize, width + dx);
      }
      if (this.dragMode.includes('n')) {
        const newY = y + dy;
        const newHeight = height - dy;
        if (newHeight >= minSize && newY >= 0) {
          y = newY;
          height = newHeight;
        }
      }
      if (this.dragMode.includes('s')) {
        height = Math.max(minSize, height + dy);
      }

      // Apply aspect ratio constraint for corner handles
      if (this.aspectRatio && (this.dragMode.length === 2)) {
        const currentRatio = width / height;
        if (currentRatio > this.aspectRatio) {
          width = height * this.aspectRatio;
        } else {
          height = width / this.aspectRatio;
        }
      }

      this.rect = { x, y, width, height };
    }

    this.clampRect();
    this.drawOverlay();
    this.updateCropInfo();
  }

  clampRect() {
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    // Clamp position
    if (this.rect.x < 0) this.rect.x = 0;
    if (this.rect.y < 0) this.rect.y = 0;

    // Clamp size
    if (this.rect.x + this.rect.width > canvasW) {
      if (this.dragMode === 'move') {
        this.rect.x = canvasW - this.rect.width;
      } else {
        this.rect.width = canvasW - this.rect.x;
      }
    }
    if (this.rect.y + this.rect.height > canvasH) {
      if (this.dragMode === 'move') {
        this.rect.y = canvasH - this.rect.height;
      } else {
        this.rect.height = canvasH - this.rect.y;
      }
    }
  }

  handleMouseUp() {
    this.dragMode = null;
    this.rectStart = null;
  }

  handleTouchEnd() {
    this.dragMode = null;
    this.rectStart = null;
  }

  drawOverlay() {
    if (!this.rect) return;

    const { x, y, width, height } = this.rect;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    // Create overlay with dark areas outside selection and grid inside
    this.overlay.innerHTML = `
      <div class="crop-dark-overlay">
        <div class="crop-dark crop-dark-top" style="height:${y}px;"></div>
        <div class="crop-dark-middle" style="top:${y}px;height:${height}px;">
          <div class="crop-dark crop-dark-left" style="width:${x}px;"></div>
          <div class="crop-dark crop-dark-right" style="width:${canvasW - x - width}px;"></div>
        </div>
        <div class="crop-dark crop-dark-bottom" style="height:${canvasH - y - height}px;"></div>
      </div>
      <div class="crop-selection-box" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px;">
        <div class="crop-grid">
          <div class="crop-grid-line crop-grid-v1"></div>
          <div class="crop-grid-line crop-grid-v2"></div>
          <div class="crop-grid-line crop-grid-h1"></div>
          <div class="crop-grid-line crop-grid-h2"></div>
        </div>
        <div class="crop-handle crop-handle-nw"></div>
        <div class="crop-handle crop-handle-ne"></div>
        <div class="crop-handle crop-handle-sw"></div>
        <div class="crop-handle crop-handle-se"></div>
      </div>
    `;
  }

  updateCropInfo() {
    const info = document.getElementById('cropSizeInfo');
    if (info && this.rect) {
      const actualRect = this.getRect();
      if (actualRect) {
        info.textContent = `${actualRect.width} × ${actualRect.height} px`;
      }
    }
  }
}

// Initialize app when DOM is ready
// Use setTimeout(0) to yield to browser for first paint
document.addEventListener('DOMContentLoaded', () => {
  // Allow browser to paint first, then init
  setTimeout(() => {
    window.app = new GameCreatorApp();
  }, 0);
});
