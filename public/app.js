class GameCreatorApp {
  constructor() {
    this.ws = null;
    this.visitorId = null;
    this.currentProjectId = null;
    this.projects = [];
    this.isProcessing = false;
    this.currentJobId = null;
    this.jobPollInterval = null;

    // Current view state
    this.currentView = 'list'; // 'list' or 'editor'

    // View elements
    this.projectListView = document.getElementById('projectListView');
    this.editorView = document.getElementById('editorView');
    this.projectGrid = document.getElementById('projectGrid');
    this.createProjectButton = document.getElementById('createProjectButton');
    this.listStatusIndicator = document.getElementById('listStatusIndicator');
    this.homeButton = document.getElementById('homeButton');

    // DOM elements (editor view)
    this.chatMessages = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.sendButton = document.getElementById('sendButton');
    this.stopButton = document.getElementById('stopButton');
    this.refreshButton = document.getElementById('refreshButton');
    this.newProjectButton = document.getElementById('newProjectButton');
    this.projectSelect = document.getElementById('projectSelect');
    this.gamePreview = document.getElementById('gamePreview');
    this.statusIndicator = document.getElementById('statusIndicator');
    this.previewTitle = document.getElementById('previewTitle');
    this.noProjectMessage = document.getElementById('noProjectMessage');
    this.versionsButton = document.getElementById('versionsButton');
    this.versionPanel = document.getElementById('versionPanel');
    this.versionList = document.getElementById('versionList');
    this.closeVersionsButton = document.getElementById('closeVersionsButton');

    // Error panel elements
    this.errorPanel = document.getElementById('errorPanel');
    this.errorCount = document.getElementById('errorCount');
    this.errorList = document.getElementById('errorList');
    this.autoFixButton = document.getElementById('autoFixButton');
    this.closeErrorPanel = document.getElementById('closeErrorPanel');
    this.gameStatus = document.getElementById('gameStatus');
    this.gameStatusIcon = document.getElementById('gameStatusIcon');
    this.gameStatusText = document.getElementById('gameStatusText');

    // Error state
    this.currentErrors = [];

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

    // IME composition state
    this.isComposing = false;

    // Try to restore visitorId from localStorage
    this.visitorId = localStorage.getItem('gameCreatorVisitorId');

    this.init();
  }

  init() {
    // Show list view immediately (don't wait for WebSocket)
    this.projectListView.classList.remove('hidden');

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
    this.updateGameStatus('error', `${errors.length} error(s)`);
  }

  handleGameLoaded(data) {
    if (data.success) {
      this.updateGameStatus('success', 'Running');
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
    this.editorView.classList.add('hidden');
    this.renderProjectGrid();
    document.title = 'Game Creator - Projects';
  }

  showEditorView() {
    this.currentView = 'editor';
    this.projectListView.classList.add('hidden');
    this.editorView.classList.remove('hidden');
  }

  renderProjectGrid() {
    if (this.projects.length === 0) {
      this.projectGrid.innerHTML = `
        <div class="project-empty">
          <div class="project-empty-icon">🎮</div>
          <p>No projects yet</p>
          <button class="create-project-btn" onclick="app.createNewProject()">+ Create Your First Game</button>
        </div>
      `;
      return;
    }

    this.projectGrid.innerHTML = this.projects.map(project => `
      <div class="project-card" data-id="${project.id}">
        <div class="project-card-header">
          <h3 class="project-card-title">${this.escapeHtml(project.name)}</h3>
          <div class="project-card-actions">
            <button onclick="event.stopPropagation(); app.renameProjectFromList('${project.id}')">✏️</button>
            <button class="delete-btn" onclick="event.stopPropagation(); app.deleteProjectFromList('${project.id}')">🗑️</button>
          </div>
        </div>
        <div class="project-card-meta">
          <div class="project-card-date">
            📅 ${this.formatDate(project.createdAt)}
          </div>
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
      this.updateStatus('connected', 'Connected');
      this.listStatusIndicator.className = 'status-indicator connected';
      this.listStatusIndicator.textContent = 'Connected';
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
      this.updateStatus('', 'Disconnected');
      this.listStatusIndicator.className = 'status-indicator';
      this.listStatusIndicator.textContent = 'Disconnected';
      this.sendButton.disabled = true;
      this.chatInput.disabled = true;
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error(`[${this.sessionId}] WebSocket error:`, error);
      this.updateStatus('', 'Error');
    };
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
    this.projectSelect.addEventListener('change', (e) => this.selectProject(e.target.value, true));
    this.stopButton.addEventListener('click', () => this.stopGeneration());
    this.versionsButton.addEventListener('click', () => this.toggleVersionPanel());
    this.closeVersionsButton.addEventListener('click', () => this.hideVersionPanel());

    // Home button - go back to project list
    this.homeButton.addEventListener('click', () => {
      this.navigateTo('/', { view: 'list' });
    });

    // Create project button in list view
    this.createProjectButton.addEventListener('click', () => this.createNewProject());

    // Mobile tab switching
    this.setupMobileTabListeners();

    // Preset buttons
    this.setupPresetListeners();
  }

  // ==================== Mobile Tab Switching ====================

  setupMobileTabListeners() {
    const tabBar = document.getElementById('mobileTabBar');
    const chatPanel = document.getElementById('chatPanel');
    const previewPanel = document.getElementById('previewPanel');

    if (!tabBar) return;

    tabBar.addEventListener('click', (e) => {
      const tab = e.target.closest('.mobile-tab');
      if (!tab) return;

      const tabName = tab.dataset.tab;
      this.switchMobileTab(tabName);
    });
  }

  switchMobileTab(tabName) {
    const tabs = document.querySelectorAll('.mobile-tab');
    const chatPanel = document.getElementById('chatPanel');
    const previewPanel = document.getElementById('previewPanel');

    // Update tab active state
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide panels
    if (tabName === 'chat') {
      chatPanel.classList.remove('mobile-hidden');
      previewPanel.classList.remove('mobile-active');
    } else if (tabName === 'preview') {
      chatPanel.classList.add('mobile-hidden');
      previewPanel.classList.add('mobile-active');
      // Refresh preview when switching to it
      this.refreshPreview();
    }
  }

  // ==================== Preset Buttons ====================

  setupPresetListeners() {
    const presetButtons = document.getElementById('presetButtons');
    if (!presetButtons) return;

    presetButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.preset-btn');
      if (!btn) return;

      const prompt = btn.dataset.prompt;
      if (prompt) {
        // Set the prompt in the input
        this.chatInput.value = prompt;
        // Send the message
        this.sendMessage();
        // Switch to chat tab on mobile (if on preview)
        if (window.innerWidth <= 768) {
          this.switchMobileTab('chat');
        }
      }
    });
  }

  handleMessage(data) {
    console.log('[WS Received]', data.type, data);
    switch (data.type) {
      case 'init':
        this.visitorId = data.visitorId;
        localStorage.setItem('gameCreatorVisitorId', this.visitorId);
        this.projects = data.projects || [];
        this.updateProjectList();

        // Update status indicators
        this.listStatusIndicator.className = 'status-indicator connected';
        this.listStatusIndicator.textContent = 'Connected';

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
        this.addMessage(`Project "${data.project.name}" created!`, 'system');
        break;

      case 'projectSelected':
        this.currentProjectId = data.projectId;
        localStorage.setItem('gameCreatorLastProjectId', this.currentProjectId);
        this.chatInput.disabled = false;
        this.sendButton.disabled = false;

        // Clear and reload history
        this.chatMessages.innerHTML = '';
        if (data.history && data.history.length > 0) {
          data.history.forEach(h => {
            this.addMessage(h.content, h.role);
          });
        }

        this.refreshPreview();
        this.updatePreviewVisibility(true);

        // Update preview title and page title
        const selectedProject = this.projects.find(p => p.id === this.currentProjectId);
        if (selectedProject) {
          this.previewTitle.textContent = selectedProject.name;
          document.title = `${selectedProject.name} - Game Creator`;
        }

        // Show versions button
        this.versionsButton.classList.remove('hidden');

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
          this.previewTitle.textContent = data.project.name;
          document.title = `${data.project.name} - Game Creator`;
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
          this.addMessage(data.message, 'assistant');
        }
        this.updateStatus('connected', 'Connected');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'info':
        this.addMessage(data.message, 'system');
        break;

      case 'gameUpdated':
        this.refreshPreview();
        break;

      case 'error':
        this.hideStreaming();
        this.addMessage(data.message, 'error');
        this.updateStatus('connected', 'Connected');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'cancelled':
        this.hideStreaming();
        this.addMessage('Stopped', 'system');
        this.updateStatus('connected', 'Connected');
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
        this.addMessage(`Restored to ${data.versionId}`, 'system');
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
    this.updateStreamingStatus(`Processing... ${job.progress || 0}%`);

    if (job.progress_message) {
      this.appendToStream(`\n[${job.progress_message}]\n`);
    }
  }

  handleJobUpdate(update) {
    switch (update.type) {
      case 'started':
        this.updateStreamingStatus('Processing...');
        break;

      case 'progress':
        this.updateStreamingStatus(`Processing... ${update.progress}%`);
        if (update.message) {
          this.appendToStream(`\n[${update.message}]\n`);
        }
        break;

      case 'completed':
        this.completeStreaming();
        // Skip message display for chat/restore mode (already handled by their own methods)
        if (update.result?.mode !== 'chat' && update.result?.mode !== 'restore') {
          const message = update.result?.message || update.message || 'ゲームを更新しました';
          this.addMessage(message, 'assistant');
          this.refreshPreview();
        }
        this.updateStatus('connected', 'Connected');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'failed':
        this.hideStreaming();
        this.addMessage(`Error: ${update.error}`, 'error');
        this.updateStatus('connected', 'Connected');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;

      case 'cancelled':
        this.hideStreaming();
        this.addMessage('Job cancelled', 'system');
        this.updateStatus('connected', 'Connected');
        this.isProcessing = false;
        this.currentJobId = null;
        this.sendButton.disabled = false;
        this.stopButton.classList.add('hidden');
        break;
    }
  }

  updateProjectList() {
    this.projectSelect.innerHTML = '<option value="">-- Select Project --</option>';
    this.projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      if (project.id === this.currentProjectId) {
        option.selected = true;
      }
      this.projectSelect.appendChild(option);
    });
  }

  selectProject(projectId, updateUrl = true) {
    if (!projectId) return;

    this.projectSelect.value = projectId;

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
    const name = prompt('Enter project name:', 'New Game');
    if (name === null) return;

    this.ws.send(JSON.stringify({
      type: 'createProject',
      name: name || 'New Game'
    }));
  }

  updatePreviewVisibility(hasProject) {
    if (hasProject) {
      this.gamePreview.style.display = 'block';
      this.noProjectMessage.classList.add('hidden');
    } else {
      this.gamePreview.style.display = 'none';
      this.noProjectMessage.classList.remove('hidden');
      this.previewTitle.textContent = 'Preview';
      this.versionsButton.classList.add('hidden');
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

  addMessage(content, role) {
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
    } else {
      const formattedContent = this.formatContent(content);
      messageDiv.innerHTML = formattedContent;
    }

    this.chatMessages.appendChild(messageDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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

  displayGeneratedCode(data) {
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

    messageDiv.innerHTML = html;
    this.chatMessages.appendChild(messageDiv);
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
      this.updateGameStatus('loading', 'Loading...');
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

  displayVersions(versions) {
    this.versionList.innerHTML = '';

    if (versions.length === 0) {
      this.versionList.innerHTML = '<div class="version-item"><span style="color:#666">No versions yet</span></div>';
      return;
    }

    versions.forEach(v => {
      const item = document.createElement('div');
      item.className = 'version-item';

      const time = new Date(v.timestamp).toLocaleString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      item.innerHTML = `
        <div class="version-info">
          <span class="version-id">${v.id}</span>
          <span class="version-message">${v.message}</span>
          <span class="version-time">${time}</span>
        </div>
        <button class="version-restore" data-version="${v.id}">Restore</button>
      `;

      item.querySelector('.version-restore').addEventListener('click', () => {
        this.restoreVersion(v.id);
      });

      this.versionList.appendChild(item);
    });
  }

  restoreVersion(versionId) {
    if (!this.currentProjectId) return;

    if (!confirm(`Restore to ${versionId}? Current state will be saved as a new version.`)) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'restoreVersion',
      projectId: this.currentProjectId,
      versionId
    }));
  }

  // Streaming methods
  showStreaming() {
    this.streamingText = '';
    this.streamingOutput.innerHTML = '<span class="cursor"></span>';
    this.streamingStatus.textContent = 'Generating...';
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
    this.streamingStatus.textContent = 'Complete';
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
          <div class="style-card-image-chat" style="background:#2d2d44">
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
