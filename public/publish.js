// ============================================
// Publish Page JavaScript
// ============================================

class PublishPage {
  constructor() {
    this.projectId = new URLSearchParams(window.location.search).get('id');
    this.projectData = null;
    this.visitorId = localStorage.getItem('visitorId');
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

    if (!this.projectId) {
      alert('プロジェクトが指定されていません');
      window.location.href = '/create.html';
      return;
    }

    if (!this.visitorId) {
      alert('ログインが必要です');
      window.location.href = '/';
      return;
    }

    this.init();
  }

  async init() {
    this.bindElements();
    this.bindEvents();
    await this.loadProjectData();
    await this.loadPublishData();
    this.updateUI();
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
      const response = await fetch(`/api/projects/${this.projectId}`);
      if (!response.ok) throw new Error('Failed to load project');
      this.projectData = await response.json();
    } catch (error) {
      console.error('Error loading project:', error);
      alert('プロジェクトの読み込みに失敗しました');
      window.location.href = '/create.html';
    }
  }

  async loadPublishData() {
    try {
      const response = await fetch(`/api/projects/${this.projectId}/publish-draft`);
      if (response.ok) {
        const draft = await response.json();
        if (draft) {
          this.publishData = { ...this.publishData, ...draft };
          return;
        }
      }
    } catch (error) {
      console.log('No existing draft, will generate new data');
    }

    // If no draft exists, generate initial data
    await this.generateInitialData();
  }

  async generateInitialData() {
    this.isGenerating = true;
    this.setFieldsGenerating(true);

    try {
      // Generate title, description, tags with AI
      const response = await fetch(`/api/projects/${this.projectId}/generate-publish-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: this.visitorId })
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
    // Title field
    const titleWrapper = this.titleInput.closest('.input-with-generate');
    const titleGroup = this.titleInput.closest('.form-group');

    // Description field
    const descWrapper = this.descriptionInput.closest('.input-with-generate');
    const descGroup = this.descriptionInput.closest('.form-group');

    // How to play field
    const howToPlayWrapper = this.howToPlayInput.closest('.input-with-generate');
    const howToPlayGroup = this.howToPlayInput.closest('.form-group');

    // Tags
    const tagsGroup = this.tagsContainer.closest('.form-group');

    const elements = [
      titleWrapper, titleGroup,
      descWrapper, descGroup,
      howToPlayWrapper, howToPlayGroup,
      tagsGroup, this.tagsContainer
    ];

    const buttons = [
      this.regenerateTitleBtn,
      this.regenerateDescriptionBtn,
      this.regenerateHowToPlayBtn,
      this.regenerateTagsBtn
    ];

    if (isGenerating) {
      elements.forEach(el => el?.classList.add('generating'));
      buttons.forEach(btn => btn?.classList.add('generating'));

      // Set placeholder text
      this.titleInput.placeholder = '生成中...';
      this.descriptionInput.placeholder = '生成中...';
      this.howToPlayInput.placeholder = '生成中...';
    } else {
      elements.forEach(el => el?.classList.remove('generating'));
      buttons.forEach(btn => btn?.classList.remove('generating'));

      // Restore placeholder text
      this.titleInput.placeholder = 'ゲームのタイトル';
      this.descriptionInput.placeholder = 'ゲームの概要や特徴';
      this.howToPlayInput.placeholder = 'ゲームのルールと操作方法';
    }
  }

  async generateThumbnail() {
    const placeholder = this.thumbnailPreview.querySelector('.thumbnail-placeholder');
    this.thumbnailPreview.classList.add('generating');
    if (placeholder) {
      placeholder.querySelector('span').textContent = 'サムネイルを生成中...';
    }

    try {
      const response = await fetch(`/api/projects/${this.projectId}/generate-thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: this.visitorId,
          title: this.publishData.title
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.thumbnailUrl) {
          this.publishData.thumbnailUrl = result.thumbnailUrl;
          this.thumbnailImage.src = result.thumbnailUrl;
          this.thumbnailImage.classList.remove('hidden');
          if (placeholder) placeholder.classList.add('hidden');
          this.scheduleAutoSave();
        }
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      if (placeholder) {
        placeholder.querySelector('span').textContent = 'サムネイル生成に失敗しました';
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
    if (this.publishData.thumbnailUrl) {
      this.thumbnailImage.src = this.publishData.thumbnailUrl;
      this.thumbnailImage.classList.remove('hidden');
      this.thumbnailPreview.querySelector('.thumbnail-placeholder').classList.add('hidden');
    }
  }

  renderTags() {
    this.tagsContainer.innerHTML = this.publishData.tags.map((tag, index) => `
      <span class="tag">
        ${this.escapeHtml(tag)}
        <button class="tag-remove" data-index="${index}" title="削除">
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
    this.saveText.textContent = '保存中...';

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.savePublishData();
    }, 1000);
  }

  async savePublishData() {
    try {
      const response = await fetch(`/api/projects/${this.projectId}/publish-draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.publishData)
      });

      if (!response.ok) throw new Error('Failed to save');

      this.isDirty = false;
      this.saveStatus.classList.remove('saving');
      this.saveText.textContent = '保存済み';
    } catch (error) {
      console.error('Error saving publish data:', error);
      this.saveText.textContent = '保存失敗';
    }
  }

  async regenerateAll() {
    if (this.isGenerating) return;

    this.isGenerating = true;
    this.setFieldsGenerating(true);

    try {
      const response = await fetch(`/api/projects/${this.projectId}/generate-publish-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: this.visitorId })
      });

      if (response.ok) {
        const result = await response.json();
        this.publishData.title = result.title || this.publishData.title;
        this.publishData.description = result.description || this.publishData.description;
        this.publishData.howToPlay = result.howToPlay || this.publishData.howToPlay;
        this.publishData.tags = result.tags || this.publishData.tags;
        this.updateUI();
        this.scheduleAutoSave();
      }
    } catch (error) {
      console.error('Error regenerating:', error);
      alert('再生成に失敗しました');
    } finally {
      this.isGenerating = false;
      this.setFieldsGenerating(false);
    }
  }

  async regenerateTitle() {
    await this.regenerateAll();
  }

  async regenerateDescription() {
    await this.regenerateAll();
  }

  async regenerateTags() {
    await this.regenerateAll();
  }

  async regenerateHowToPlay() {
    await this.regenerateAll();
  }

  async regenerateThumbnail() {
    if (this.isGenerating) return;

    const placeholder = this.thumbnailPreview.querySelector('.thumbnail-placeholder');
    this.thumbnailImage.classList.add('hidden');
    if (placeholder) {
      placeholder.classList.remove('hidden');
      placeholder.querySelector('span').textContent = 'サムネイルを再生成中...';
    }

    await this.generateThumbnail();
  }

  uploadThumbnail() {
    // TODO: Implement thumbnail upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        // TODO: Upload and set thumbnail
        console.log('Upload thumbnail:', file.name);
      }
    };
    input.click();
  }

  async publish() {
    if (!this.publishData.title.trim()) {
      alert('タイトルを入力してください');
      this.titleInput.focus();
      return;
    }

    this.showLoading('登録しています...');

    try {
      const response = await fetch(`/api/projects/${this.projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.publishData)
      });

      if (!response.ok) throw new Error('Failed to publish');

      const result = await response.json();

      // Show success and redirect
      alert('ゲームを登録しました！');
      window.location.href = `/game.html?id=${result.gameId || this.projectId}`;
    } catch (error) {
      console.error('Error publishing:', error);
      alert('登録に失敗しました');
    } finally {
      this.hideLoading();
    }
  }

  goBack() {
    if (this.isDirty) {
      // Auto-save before leaving
      this.savePublishData().then(() => {
        window.location.href = `/editor.html?id=${this.projectId}`;
      });
    } else {
      window.location.href = `/editor.html?id=${this.projectId}`;
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
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  new PublishPage();
});
