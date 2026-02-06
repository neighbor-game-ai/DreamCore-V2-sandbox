// ============================================
// Publish Page JavaScript
// Updated for Supabase Auth
// ============================================

class PublishPage {
  constructor() {
    this.projectId = new URLSearchParams(window.location.search).get('id');
    this.projectData = null;
    this.userId = null;
    this.accessToken = null;
    this.publishData = {
      title: '',
      description: '',
      howToPlay: '',
      tags: [],
      visibility: 'public',
      remix: 'allowed',
      thumbnailUrl: null
    };
    this.saveTimeout = null;
    this.isDirty = false;
    this.isGenerating = false;
    this.isGeneratingMovie = false;
    this.movieObjectUrl = null;

    if (!this.projectId) {
      alert(DreamCoreI18n.t('publish.noProjectSpecified'));
      window.location.href = '/create';
      return;
    }

    this.init();
  }

  async init() {
    // Check authentication using Supabase Auth
    const session = await DreamCoreAuth.getSession();
    if (!session) {
      alert(DreamCoreI18n.t('publish.loginRequired'));
      window.location.href = '/';
      return;
    }

    this.userId = session.user.id;
    this.accessToken = session.access_token;

    this.bindElements();
    this.bindEvents();
    await this.loadProjectData();
    await this.loadPublishData();
    this.updateUI();
    // this.loadExistingMovie(); // Movie feature disabled
  }

  bindElements() {
    // Header
    this.backButton = document.getElementById('backButton');
    this.saveStatus = document.getElementById('saveStatus');
    this.saveText = this.saveStatus.querySelector('.save-text');

    // Thumbnail
    this.thumbnailPreview = document.getElementById('thumbnailPreview');
    this.thumbnailImage = document.getElementById('thumbnailImage');
    this.regenerateThumbnailBtn = document.getElementById('regenerateThumbnail');
    this.uploadThumbnailBtn = document.getElementById('uploadThumbnail');

    // Movie
    this.moviePreview = document.getElementById('moviePreview');
    this.movieVideo = document.getElementById('movieVideo');
    this.moviePlaceholderText = document.getElementById('moviePlaceholderText');
    this.generateMovieBtn = document.getElementById('generateMovie');

    // Form
    this.titleInput = document.getElementById('gameTitle');
    this.titleCount = document.getElementById('titleCount');
    this.descriptionInput = document.getElementById('gameDescription');
    this.descriptionCount = document.getElementById('descriptionCount');
    this.howToPlayInput = document.getElementById('gameHowToPlay');
    this.howToPlayCount = document.getElementById('howToPlayCount');
    this.tagsContainer = document.getElementById('tagsContainer');
    this.tagInput = document.getElementById('tagInput');

    // Generate buttons
    this.regenerateTitleBtn = document.getElementById('regenerateTitle');
    this.regenerateDescriptionBtn = document.getElementById('regenerateDescription');
    this.regenerateHowToPlayBtn = document.getElementById('regenerateHowToPlay');
    this.regenerateTagsBtn = document.getElementById('regenerateTags');

    // Radio groups
    this.visibilityRadios = document.querySelectorAll('input[name="visibility"]');
    this.remixRadios = document.querySelectorAll('input[name="remix"]');

    // Footer
    this.cancelButton = document.getElementById('cancelButton');
    this.publishButton = document.getElementById('publishButton');

    // Loading
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingText = document.getElementById('loadingText');
  }

  bindEvents() {
    // Navigation
    this.backButton.addEventListener('click', () => this.goBack());
    this.cancelButton.addEventListener('click', () => this.goBack());

    // Title input
    this.titleInput.addEventListener('input', () => {
      this.publishData.title = this.titleInput.value;
      this.titleCount.textContent = this.titleInput.value.length;
      this.scheduleAutoSave();
    });

    // Description input
    this.descriptionInput.addEventListener('input', () => {
      this.publishData.description = this.descriptionInput.value;
      this.descriptionCount.textContent = this.descriptionInput.value.length;
      this.scheduleAutoSave();
    });

    // How to play input
    this.howToPlayInput.addEventListener('input', () => {
      this.publishData.howToPlay = this.howToPlayInput.value;
      this.howToPlayCount.textContent = this.howToPlayInput.value.length;
      this.scheduleAutoSave();
    });

    // Tag input
    this.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addTag(this.tagInput.value.trim());
      }
    });

    // Visibility
    this.visibilityRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        this.publishData.visibility = radio.value;
        this.scheduleAutoSave();
      });
    });

    // Remix
    this.remixRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        this.publishData.remix = radio.value;
        this.scheduleAutoSave();
      });
    });

    // Generate buttons
    this.regenerateTitleBtn.addEventListener('click', () => this.regenerateTitle());
    this.regenerateDescriptionBtn.addEventListener('click', () => this.regenerateDescription());
    this.regenerateHowToPlayBtn.addEventListener('click', () => this.regenerateHowToPlay());
    this.regenerateTagsBtn.addEventListener('click', () => this.regenerateTags());
    this.regenerateThumbnailBtn.addEventListener('click', () => this.regenerateThumbnail());
    this.uploadThumbnailBtn.addEventListener('click', () => this.uploadThumbnail());
    // this.generateMovieBtn?.addEventListener('click', () => this.generateMovie()); // Movie feature disabled

    // Publish
    this.publishButton.addEventListener('click', () => this.publish());

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  async loadProjectData() {
    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}`);
      if (!response.ok) throw new Error('Failed to load project');
      this.projectData = await response.json();
    } catch (error) {
      console.error('Error loading project:', error);
      alert(DreamCoreI18n.t('publish.projectLoadFailed'));
      window.location.href = '/create';
    }
  }

  async loadPublishData() {
    try {
      console.log('[Publish] Loading publish draft for project:', this.projectId);
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/publish-draft`);
      console.log('[Publish] Draft response status:', response.status);
      if (response.ok) {
        const draft = await response.json();
        console.log('[Publish] Draft data:', draft);
        if (draft) {
          this.publishData = { ...this.publishData, ...draft };
          console.log('[Publish] publishData after merge:', this.publishData);
          return;
        }
      }
    } catch (error) {
      console.log('No existing draft, will generate new data:', error);
    }

    // If no draft exists, generate initial data
    await this.generateInitialData();
  }

  async generateInitialData() {
    this.isGenerating = true;
    this.setFieldsGenerating(true);

    try {
      // Generate title, description, tags with AI
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/generate-publish-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const result = await response.json();
        this.publishData.title = result.title || this.projectData.name || '';
        this.publishData.description = result.description || '';
        this.publishData.howToPlay = result.howToPlay || '';
        this.publishData.tags = result.tags || [];
        this.updateUI();
      } else {
        // Fallback to project name
        this.publishData.title = this.projectData.name || '';
      }

      // Save initial draft
      await this.savePublishData();

      // Generate thumbnail in background
      this.generateThumbnail();
    } catch (error) {
      console.error('Error generating initial data:', error);
      this.publishData.title = this.projectData.name || '';
    } finally {
      this.isGenerating = false;
      this.setFieldsGenerating(false);
    }
  }

  setFieldsGenerating(isGenerating) {
    // Toggle all fields at once (for initial generation)
    ['title', 'description', 'howToPlay', 'tags'].forEach(field => {
      this.setFieldGenerating(field, isGenerating);
    });
  }

  async generateThumbnail() {
    const placeholder = this.thumbnailPreview.querySelector('.thumbnail-placeholder');
    this.thumbnailPreview.classList.add('generating');
    if (placeholder) {
      placeholder.querySelector('span').textContent = DreamCoreI18n.t('publish.generatingThumbnail');
    }

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/generate-thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: this.publishData.title
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.thumbnailUrl) {
          this.publishData.thumbnailUrl = result.thumbnailUrl;
          // キャッシュバスターを追加して強制リロード
          this.thumbnailImage.src = this.getAuthenticatedUrl(result.thumbnailUrl + '?t=' + Date.now());
          this.thumbnailImage.classList.remove('hidden');
          if (placeholder) placeholder.classList.add('hidden');
          // Save immediately (not debounced) to persist thumbnail
          await this.savePublishData();
        }
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      if (placeholder) {
        placeholder.querySelector('span').textContent = DreamCoreI18n.t('publish.thumbnailGenerationFailed');
      }
    } finally {
      this.thumbnailPreview.classList.remove('generating');
    }
  }

  updateUI() {
    // Title
    this.titleInput.value = this.publishData.title;
    this.titleCount.textContent = this.publishData.title.length;

    // Description
    this.descriptionInput.value = this.publishData.description;
    this.descriptionCount.textContent = this.publishData.description.length;

    // How to play
    this.howToPlayInput.value = this.publishData.howToPlay || '';
    this.howToPlayCount.textContent = (this.publishData.howToPlay || '').length;

    // Tags
    this.renderTags();

    // Visibility
    const visibilityRadio = document.querySelector(`input[name="visibility"][value="${this.publishData.visibility}"]`);
    if (visibilityRadio) visibilityRadio.checked = true;

    // Remix
    const remixRadio = document.querySelector(`input[name="remix"][value="${this.publishData.remix}"]`);
    if (remixRadio) remixRadio.checked = true;

    // Thumbnail
    console.log('[Publish] updateUI - thumbnailUrl:', this.publishData.thumbnailUrl);
    if (this.publishData.thumbnailUrl) {
      const thumbnailSrc = this.getAuthenticatedUrl(this.publishData.thumbnailUrl);
      console.log('[Publish] Setting thumbnail src:', thumbnailSrc);
      this.thumbnailImage.src = thumbnailSrc;
      this.thumbnailImage.classList.remove('hidden');
      this.thumbnailPreview.querySelector('.thumbnail-placeholder').classList.add('hidden');

      // Debug: log when image loads or errors
      this.thumbnailImage.onload = () => console.log('[Publish] Thumbnail loaded successfully');
      this.thumbnailImage.onerror = (e) => console.error('[Publish] Thumbnail failed to load:', e);
    }
  }

  renderTags() {
    const deleteTitle = DreamCoreI18n.t('button.delete');
    this.tagsContainer.innerHTML = this.publishData.tags.map((tag, index) => `
      <span class="tag">
        ${this.escapeHtml(tag)}
        <button class="tag-remove" data-index="${index}" title="${deleteTitle}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </span>
    `).join('');

    // Bind remove buttons
    this.tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.removeTag(index);
      });
    });
  }

  addTag(tag) {
    if (!tag || this.publishData.tags.includes(tag) || this.publishData.tags.length >= 10) {
      this.tagInput.value = '';
      return;
    }

    this.publishData.tags.push(tag);
    this.tagInput.value = '';
    this.renderTags();
    this.scheduleAutoSave();
  }

  removeTag(index) {
    this.publishData.tags.splice(index, 1);
    this.renderTags();
    this.scheduleAutoSave();
  }

  scheduleAutoSave() {
    this.isDirty = true;
    this.saveStatus.classList.add('saving');
    this.saveText.textContent = DreamCoreI18n.t('publish.saving');

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.savePublishData();
    }, 1000);
  }

  async savePublishData() {
    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/publish-draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.publishData)
      });

      if (!response.ok) throw new Error('Failed to save');

      this.isDirty = false;
      this.saveStatus.classList.remove('saving');
      this.saveText.textContent = DreamCoreI18n.t('publish.saved');
    } catch (error) {
      console.error('Error saving publish data:', error);
      this.saveText.textContent = DreamCoreI18n.t('publish.saveFailed');
    }
  }

  async regenerateField(fieldName) {
    if (this.isGenerating) return;

    this.isGenerating = true;
    this.setFieldGenerating(fieldName, true);

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/generate-publish-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: fieldName })
      });

      if (response.ok) {
        const result = await response.json();

        // Only update the requested field
        switch (fieldName) {
          case 'title':
            this.publishData.title = result.title || this.publishData.title;
            this.titleInput.value = this.publishData.title;
            this.titleCount.textContent = this.publishData.title.length;
            break;
          case 'description':
            this.publishData.description = result.description || this.publishData.description;
            this.descriptionInput.value = this.publishData.description;
            this.descriptionCount.textContent = this.publishData.description.length;
            break;
          case 'howToPlay':
            this.publishData.howToPlay = result.howToPlay || this.publishData.howToPlay;
            this.howToPlayInput.value = this.publishData.howToPlay;
            this.howToPlayCount.textContent = this.publishData.howToPlay.length;
            break;
          case 'tags':
            this.publishData.tags = result.tags || this.publishData.tags;
            this.renderTags();
            break;
        }

        this.scheduleAutoSave();
      }
    } catch (error) {
      console.error('Error regenerating:', error);
      alert(DreamCoreI18n.t('publish.regenerateFailed'));
    } finally {
      this.isGenerating = false;
      this.setFieldGenerating(fieldName, false);
    }
  }

  setFieldGenerating(fieldName, isGenerating) {
    let input, group, button;

    switch (fieldName) {
      case 'title':
        input = this.titleInput;
        group = this.titleInput.closest('.form-group');
        button = this.regenerateTitleBtn;
        break;
      case 'description':
        input = this.descriptionInput;
        group = this.descriptionInput.closest('.form-group');
        button = this.regenerateDescriptionBtn;
        break;
      case 'howToPlay':
        input = this.howToPlayInput;
        group = this.howToPlayInput.closest('.form-group');
        button = this.regenerateHowToPlayBtn;
        break;
      case 'tags':
        input = this.tagsContainer;
        group = this.tagsContainer.closest('.form-group');
        button = this.regenerateTagsBtn;
        break;
    }

    if (isGenerating) {
      input?.classList.add('generating');
      group?.classList.add('generating');
      button?.classList.add('generating');
    } else {
      input?.classList.remove('generating');
      group?.classList.remove('generating');
      button?.classList.remove('generating');
    }
  }

  async regenerateTitle() {
    await this.regenerateField('title');
  }

  async regenerateDescription() {
    await this.regenerateField('description');
  }

  async regenerateTags() {
    await this.regenerateField('tags');
  }

  async regenerateHowToPlay() {
    await this.regenerateField('howToPlay');
  }

  async regenerateThumbnail() {
    if (this.isGenerating) return;

    const placeholder = this.thumbnailPreview.querySelector('.thumbnail-placeholder');
    this.thumbnailImage.classList.add('hidden');
    if (placeholder) {
      placeholder.classList.remove('hidden');
      placeholder.querySelector('span').textContent = DreamCoreI18n.t('publish.regeneratingThumbnail');
    }

    await this.generateThumbnail();
  }

  loadExistingMovie() {
    // Check if movie already exists
    const movieUrl = `/api/projects/${this.projectId}/movie?t=${Date.now()}`;

    DreamCoreAuth.authFetch(movieUrl, { method: 'HEAD' })
      .then(response => {
        if (response.ok) {
          // Movie exists, show it
          this.setMovieSource(movieUrl);
          this.generateMovieBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            ${DreamCoreI18n.t('publish.regenerate')}
          `;
        }
      })
      .catch(() => {
        // Movie doesn't exist, keep placeholder
      });
  }

  async setMovieSource(movieUrl) {
    try {
      const response = await DreamCoreAuth.authFetch(movieUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Failed to load movie: ${response.status}`);
      }
      const blob = await response.blob();
      if (this.movieObjectUrl) {
        URL.revokeObjectURL(this.movieObjectUrl);
      }
      this.movieObjectUrl = URL.createObjectURL(blob);
      const placeholder = this.moviePreview.querySelector('.movie-placeholder');
      this.movieVideo.src = this.movieObjectUrl;
      this.movieVideo.classList.remove('hidden');
      if (placeholder) {
        placeholder.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error loading movie:', error);
      if (this.moviePlaceholderText) {
        this.moviePlaceholderText.textContent = DreamCoreI18n.t('publish.movieLoadFailed');
      }
    }
  }

  async generateMovie() {
    if (this.isGeneratingMovie) return;
    this.isGeneratingMovie = true;

    const placeholder = this.moviePreview.querySelector('.movie-placeholder');
    this.movieVideo.classList.add('hidden');
    this.moviePreview.classList.add('generating');
    this.generateMovieBtn.disabled = true;

    if (placeholder) {
      placeholder.classList.remove('hidden');
    }
    if (this.moviePlaceholderText) {
      this.moviePlaceholderText.textContent = DreamCoreI18n.t('publish.generatingMovie');
    }

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/generate-movie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (data.success && data.movieUrl) {
        await this.setMovieSource(data.movieUrl);
        this.generateMovieBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          ${DreamCoreI18n.t('publish.regenerate')}
        `;
      } else {
        console.error('Failed to generate movie:', data.error);
        if (this.moviePlaceholderText) {
          this.moviePlaceholderText.textContent = DreamCoreI18n.t('publish.generationFailed');
        }
      }
    } catch (error) {
      console.error('Error generating movie:', error);
      if (this.moviePlaceholderText) {
        this.moviePlaceholderText.textContent = DreamCoreI18n.t('error.systemError');
      }
    } finally {
      this.isGeneratingMovie = false;
      this.moviePreview.classList.remove('generating');
      this.generateMovieBtn.disabled = false;
    }
  }

  // 画像エディタの初期化
  initImageEditor() {
    this.imageEditorModal = document.getElementById('imageEditorModal');
    this.cropperImage = document.getElementById('cropperImage');
    this.cropper = null;

    document.getElementById('closeImageEditor')?.addEventListener('click', () => this.closeImageEditor());
    document.getElementById('cancelEdit')?.addEventListener('click', () => this.closeImageEditor());
    document.getElementById('saveEditedImage')?.addEventListener('click', () => this.applyImageEdit());

    // 回転・反転ボタン
    document.getElementById('rotateRight')?.addEventListener('click', () => {
      this.cropper?.rotate(90);
    });
    document.getElementById('flipHorizontal')?.addEventListener('click', () => {
      this.cropper?.scaleX(this.cropper.getData().scaleX === -1 ? 1 : -1);
    });
    document.getElementById('flipVertical')?.addEventListener('click', () => {
      this.cropper?.scaleY(this.cropper.getData().scaleY === -1 ? 1 : -1);
    });
  }

  openImageEditor(file) {
    if (!this.imageEditorModal) {
      this.initImageEditor();
    }

    // Load image into cropper
    const url = URL.createObjectURL(file);
    this.cropperImage.src = url;
    this.pendingFile = file;

    this.imageEditorModal.classList.remove('hidden');

    // Initialize cropper after image loads
    this.cropperImage.onload = () => {
      if (this.cropper) {
        this.cropper.destroy();
      }
      this.cropper = new Cropper(this.cropperImage, {
        aspectRatio: 9 / 16,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
        background: false
      });
    };
  }

  closeImageEditor() {
    this.imageEditorModal?.classList.add('hidden');
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
    this.pendingFile = null;
  }

  async applyImageEdit() {
    if (!this.cropper) return;

    const placeholder = this.thumbnailPreview.querySelector('.thumbnail-placeholder');

    // Get cropped canvas
    const canvas = this.cropper.getCroppedCanvas({
      maxWidth: 1080,
      maxHeight: 1920,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });

    this.closeImageEditor();

    this.thumbnailPreview.classList.add('generating');
    if (placeholder) {
      placeholder.querySelector('span').textContent = DreamCoreI18n.t('publish.uploading');
    }

    try {
      // Convert to WebP blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/webp', 0.85);
      });
      const file = new File([blob], 'thumbnail.webp', { type: 'image/webp' });
      console.log(`Cropped & compressed: ${this.pendingFile?.size || 0} -> ${file.size} bytes`);

      const formData = new FormData();
      formData.append('thumbnail', file);

      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/upload-thumbnail`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        if (result.thumbnailUrl) {
          this.publishData.thumbnailUrl = result.thumbnailUrl;
          this.thumbnailImage.src = this.getAuthenticatedUrl(result.thumbnailUrl + '?t=' + Date.now());
          this.thumbnailImage.classList.remove('hidden');
          if (placeholder) placeholder.classList.add('hidden');
          await this.savePublishData();
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      if (placeholder) {
        placeholder.querySelector('span').textContent = DreamCoreI18n.t('publish.uploadFailed');
      }
    } finally {
      this.thumbnailPreview.classList.remove('generating');
    }
  }

  uploadThumbnail() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.openImageEditor(file);
      }
    };
    input.click();
  }

  async publish() {
    if (!this.publishData.title.trim()) {
      alert(DreamCoreI18n.t('publish.enterTitle'));
      this.titleInput.focus();
      return;
    }

    this.showLoading(DreamCoreI18n.t('publish.registering'));

    try {
      const response = await DreamCoreAuth.authFetch(`/api/projects/${this.projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.publishData)
      });

      if (!response.ok) throw new Error('Failed to publish');

      const result = await response.json();

      // Show share modal instead of alert
      this.showShareModal(result.gameId);
    } catch (error) {
      console.error('Error publishing:', error);
      alert(DreamCoreI18n.t('publish.publishFailed'));
    } finally {
      this.hideLoading();
    }
  }

  showShareModal(gameId) {
    const modal = document.getElementById('shareModal');
    const previewImage = document.getElementById('sharePreviewImage');
    const gameTitle = document.getElementById('shareGameTitle');

    // Set preview data
    if (this.publishData.thumbnailUrl) {
      previewImage.src = this.getAuthenticatedUrl(this.publishData.thumbnailUrl);
    } else {
      previewImage.src = `/api/projects/${this.projectId}/thumbnail`;
    }
    gameTitle.textContent = this.publishData.title;

    // Game URL
    const gameUrl = `${window.location.origin}/game/${gameId}`;

    // Bind share buttons
    const shareText = DreamCoreI18n.t('publish.shareText', { title: this.publishData.title });

    // UTMパラメーター付きURL生成
    const getShareUrl = (source, medium = 'social') => {
      const params = new URLSearchParams({
        utm_source: source,
        utm_medium: medium,
        utm_campaign: 'game_share'
      });
      return `${gameUrl}?${params.toString()}`;
    };

    // X (Twitter)
    document.getElementById('shareX').onclick = () => {
      const url = getShareUrl('twitter');
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420');
    };

    // Facebook
    document.getElementById('shareFacebook').onclick = () => {
      const url = getShareUrl('facebook');
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420');
    };

    // WhatsApp
    document.getElementById('shareWhatsApp').onclick = () => {
      const url = getShareUrl('whatsapp');
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + url)}`, '_blank', 'width=550,height=420');
    };

    // LINE
    document.getElementById('shareLine').onclick = () => {
      const url = getShareUrl('line');
      window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420');
    };

    // Telegram
    document.getElementById('shareTelegram').onclick = () => {
      const url = getShareUrl('telegram');
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`, '_blank', 'width=550,height=420');
    };

    // Email
    document.getElementById('shareEmail').onclick = () => {
      const url = getShareUrl('email', 'email');
      const subject = encodeURIComponent(this.publishData.title);
      const body = encodeURIComponent(`${shareText}\n\n${url}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    // SMS/iMessage
    document.getElementById('shareSMS').onclick = () => {
      const url = getShareUrl('sms', 'sms');
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const separator = isIOS ? '&' : '?';
      window.location.href = `sms:${separator}body=${encodeURIComponent(shareText + ' ' + url)}`;
    };

    // Reddit
    document.getElementById('shareReddit').onclick = () => {
      const url = getShareUrl('reddit');
      window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(this.publishData.title)}`, '_blank', 'width=550,height=420');
    };

    // Threads
    document.getElementById('shareThreads').onclick = () => {
      const url = getShareUrl('threads');
      window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText + ' ' + url)}`, '_blank', 'width=550,height=420');
    };

    // QRコード
    document.getElementById('shareQR').onclick = () => {
      const url = getShareUrl('qr', 'qr');
      this.showQRCode(url);
    };

    // URLコピー
    document.getElementById('shareCopy').onclick = async () => {
      const url = getShareUrl('copy', 'clipboard');
      try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById('shareCopy');
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    // ネイティブシェア（Web Share API）- 非対応時はURLコピーにフォールバック
    const nativeBtn = document.getElementById('shareNative');
    nativeBtn.onclick = async () => {
      const url = getShareUrl('native', 'share_api');
      if (navigator.share) {
        try {
          await navigator.share({
            title: this.publishData.title,
            text: shareText,
            url: url
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
          }
        }
      } else {
        // Web Share API非対応: URLをコピー
        try {
          await navigator.clipboard.writeText(url);
          const label = nativeBtn.querySelector('.share-btn-label');
          if (label) {
            const original = label.textContent;
            label.textContent = DreamCoreI18n.t('game.copied');
            setTimeout(() => { label.textContent = original; }, 1500);
          }
        } catch (err) {
          console.error('Copy failed:', err);
        }
      }
    };

    // QRモーダルの閉じるボタン
    document.getElementById('qrCloseBtn').onclick = () => {
      document.getElementById('qrModal').classList.add('hidden');
    };

    document.getElementById('shareViewGame').onclick = () => {
      window.location.href = `/game/${gameId}`;
    };

    // Show modal
    modal.classList.remove('hidden');
  }

  goBack() {
    if (this.isDirty) {
      // Auto-save before leaving
      this.savePublishData().then(() => {
        window.location.href = `/editor?id=${this.projectId}`;
      });
    } else {
      window.location.href = `/editor?id=${this.projectId}`;
    }
  }

  showLoading(text) {
    this.loadingText.textContent = text;
    this.loadingOverlay.classList.remove('hidden');
  }

  hideLoading() {
    this.loadingOverlay.classList.add('hidden');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * @deprecated V2: No longer needed - assets served via /user-assets/{userId}/{alias}
   * Kept for backward compatibility during transition
   */
  getAuthenticatedUrl(url) {
    // V2: Return URL as-is (no token needed for new endpoints)
    return url;
  }

  showQRCode(url) {
    const modal = document.getElementById('qrModal');
    const canvas = document.getElementById('qrCanvas');

    // QRコード生成（シンプルなCanvas実装）
    this.generateQRCode(canvas, url);

    modal.classList.remove('hidden');
  }

  generateQRCode(canvas, text) {
    // QRコードライブラリがない場合は、Google Chart APIを使用
    const size = 200;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
    };
    img.onerror = () => {
      // フォールバック：URLを表示
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(DreamCoreI18n.t('publish.qrGenerationError'), size/2, size/2);
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  new PublishPage();
});
