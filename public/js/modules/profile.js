/**
 * Profile Editor Module
 *
 * Handles profile editing functionality including:
 * - Display name
 * - Bio
 * - Avatar upload
 * - Social media links
 */

class ProfileEditor {
  constructor() {
    this.modal = null;
    this.userData = null;
    this.customLinks = [];
    this.isLoading = false;
    this.usernameCheckTimeout = null;
    this.usernameAvailable = null;

    // Social platform definitions
    this.platforms = [
      { key: 'x', icon: '𝕏', placeholder: 'x.com/username' },
      { key: 'youtube', icon: '▶', placeholder: 'youtube.com/@channel' },
      { key: 'github', icon: '⌘', placeholder: 'github.com/username' },
      { key: 'tiktok', icon: '♪', placeholder: 'tiktok.com/@username' },
      { key: 'instagram', icon: '📷', placeholder: 'instagram.com/username' }
    ];
  }

  /**
   * Helper to get translated text
   * Falls back to key if i18n not available
   */
  t(key, vars) {
    if (typeof DreamCoreI18n !== 'undefined') {
      return DreamCoreI18n.t(key, vars);
    }
    // Fallback to last part of key
    return key.split('.').pop();
  }

  /**
   * Open profile editor modal
   */
  async open() {
    try {
      // Fetch current profile
      this.userData = await this.fetchProfile();
      if (!this.userData) {
        alert(this.t('error.systemError'));
        return;
      }

      // Create and show modal
      this.createModal();
      this.populateForm();
      this.showModal();
    } catch (err) {
      console.error('[ProfileEditor] Failed to open:', err);
      alert(this.t('error.systemError'));
    }
  }

  /**
   * Fetch current user profile from API
   */
  async fetchProfile() {
    const res = await DreamCoreAuth.authFetch('/api/users/me');
    if (!res.ok) {
      throw new Error('Failed to fetch profile');
    }
    return res.json();
  }

  /**
   * Create modal DOM structure
   */
  createModal() {
    // Remove existing modal if any
    const existing = document.getElementById('profileEditModal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'profileEditModal';
    backdrop.className = 'profile-modal-backdrop hidden';

    backdrop.innerHTML = `
      <div class="profile-modal">
        <div class="profile-modal-header">
          <h2 class="profile-modal-title">${this.escapeAttr(this.t('profileEditor.title'))}</h2>
          <button class="profile-modal-close" id="profileCloseBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="profile-modal-body">
          <div id="profileError" class="profile-error-message" style="display: none;"></div>

          <!-- Avatar Section -->
          <div class="profile-avatar-section">
            <div class="profile-avatar-preview" id="avatarPreview">
              <svg class="profile-avatar-placeholder" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <button class="profile-avatar-upload-btn" id="avatarUploadBtn">${this.escapeAttr(this.t('profileEditor.changePhoto'))}</button>
          </div>

          <!-- Username -->
          <div class="profile-form-group">
            <label class="profile-form-label" for="editUsername">${this.escapeAttr(this.t('profileEditor.username'))}</label>
            <div class="profile-username-input-wrapper">
              <span class="profile-username-prefix">@</span>
              <input type="text" id="editUsername" class="profile-form-input profile-username-input"
                     placeholder="${this.escapeAttr(this.t('profileEditor.usernamePlaceholder').replace('@', ''))}" maxlength="20" pattern="[a-z0-9_]{3,20}">
              <span class="profile-username-status" id="usernameStatus"></span>
            </div>
            <div class="profile-form-hint">
              <span id="usernameHintText">${this.escapeAttr(this.t('profileEditor.usernameHint'))}</span>
              <span id="usernameUrl" class="profile-username-url" style="display: none;">
                <span id="usernameUrlText"></span>
                <button type="button" class="profile-username-copy" id="usernameUrlCopy" title="Copy URL">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </span>
            </div>
          </div>

          <!-- Display Name -->
          <div class="profile-form-group">
            <label class="profile-form-label" for="editDisplayName">${this.escapeAttr(this.t('profileEditor.displayName'))}</label>
            <input type="text" id="editDisplayName" class="profile-form-input" placeholder="${this.escapeAttr(this.t('profileEditor.displayNamePlaceholder'))}" maxlength="50">
            <div class="profile-form-hint">Max 50 characters</div>
          </div>

          <!-- Bio -->
          <div class="profile-form-group">
            <label class="profile-form-label" for="editBio">${this.escapeAttr(this.t('profileEditor.bio'))}</label>
            <textarea id="editBio" class="profile-form-input profile-form-textarea" placeholder="${this.escapeAttr(this.t('profileEditor.bioPlaceholder'))}" maxlength="160"></textarea>
            <div class="profile-form-hint"><span id="bioCharCount">0</span>/160</div>
          </div>

          <!-- Social Links -->
          <div class="profile-social-section">
            <div class="profile-social-title">${this.escapeAttr(this.t('profileEditor.socialLinks'))}</div>
            <div class="profile-social-grid" id="socialLinksGrid">
              <!-- Generated by JS -->
            </div>

            <!-- Custom Links -->
            <div class="profile-custom-links" id="customLinksContainer">
              <!-- Generated by JS -->
            </div>
            <button class="profile-add-custom-link" id="addCustomLinkBtn">+ Custom link</button>
          </div>
        </div>

        <div class="profile-modal-footer">
          <button class="profile-btn profile-btn-cancel" id="profileCancelBtn">${this.escapeAttr(this.t('button.cancel'))}</button>
          <button class="profile-btn profile-btn-save" id="profileSaveBtn">${this.escapeAttr(this.t('button.change'))}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.modal = backdrop;

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup modal event listeners
   */
  setupEventListeners() {
    // Close buttons
    this.modal.querySelector('#profileCloseBtn').addEventListener('click', () => this.close());
    this.modal.querySelector('#profileCancelBtn').addEventListener('click', () => this.close());

    // Save button
    this.modal.querySelector('#profileSaveBtn').addEventListener('click', () => this.save());

    // Avatar upload
    this.modal.querySelector('#avatarUploadBtn').addEventListener('click', () => this.selectAvatar());

    // Add custom link
    this.modal.querySelector('#addCustomLinkBtn').addEventListener('click', () => this.addCustomLink());

    // Bio character count
    const bioInput = this.modal.querySelector('#editBio');
    bioInput.addEventListener('input', () => {
      this.modal.querySelector('#bioCharCount').textContent = bioInput.value.length;
    });

    // Username input with debounced availability check
    const usernameInput = this.modal.querySelector('#editUsername');
    usernameInput.addEventListener('input', () => {
      this.handleUsernameInput(usernameInput.value);
    });

    // Username URL copy button
    this.modal.querySelector('#usernameUrlCopy')?.addEventListener('click', () => {
      this.copyUsernameUrl();
    });

    // Backdrop click to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Escape key to close
    document.addEventListener('keydown', this.handleEscape);
  }

  handleEscape = (e) => {
    if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
      this.close();
    }
  }

  /**
   * Populate form with current user data
   */
  populateForm() {
    // Avatar
    const avatarPreview = this.modal.querySelector('#avatarPreview');
    if (this.userData.avatar_url) {
      avatarPreview.innerHTML = `<img src="${this.escapeAttr(this.userData.avatar_url)}" alt="Avatar">`;
    }

    // Username
    const usernameInput = this.modal.querySelector('#editUsername');
    if (this.userData.username) {
      usernameInput.value = this.userData.username;
      this.updateUsernameUrl(this.userData.username);
      this.setUsernameStatus('current', this.t('profileEditor.usernameInUse'));
    }

    // Display name
    this.modal.querySelector('#editDisplayName').value = this.userData.display_name || '';

    // Bio
    const bioInput = this.modal.querySelector('#editBio');
    bioInput.value = this.userData.bio || '';
    this.modal.querySelector('#bioCharCount').textContent = bioInput.value.length;

    // Social links grid
    this.renderSocialLinksGrid();

    // Custom links
    this.customLinks = this.userData.social_links?.custom?.slice() || [];
    this.renderCustomLinks();
  }

  /**
   * Render social platforms inputs
   */
  renderSocialLinksGrid() {
    const grid = this.modal.querySelector('#socialLinksGrid');
    grid.innerHTML = this.platforms.map(p => `
      <div class="profile-social-item">
        <div class="profile-social-icon">${p.icon}</div>
        <input type="text" class="profile-social-input" id="social-${p.key}"
               placeholder="${p.placeholder}"
               value="${this.escapeAttr(this.userData.social_links?.[p.key] || '')}">
      </div>
    `).join('');
  }

  /**
   * Render custom links
   */
  renderCustomLinks() {
    const container = this.modal.querySelector('#customLinksContainer');
    container.innerHTML = this.customLinks.map((link, index) => `
      <div class="profile-custom-link-item" data-index="${index}">
        <input type="text" class="profile-custom-link-label" placeholder="Label"
               value="${this.escapeAttr(link.label || '')}" maxlength="30">
        <input type="text" class="profile-custom-link-url" placeholder="https://..."
               value="${this.escapeAttr(link.url || '')}">
        <button class="profile-custom-link-remove" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Add remove handlers
    container.querySelectorAll('.profile-custom-link-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.customLinks.splice(idx, 1);
        this.renderCustomLinks();
      });
    });

    // Hide add button if max reached
    const addBtn = this.modal.querySelector('#addCustomLinkBtn');
    addBtn.style.display = this.customLinks.length >= 5 ? 'none' : 'block';
  }

  /**
   * Add a new custom link field
   */
  addCustomLink() {
    if (this.customLinks.length >= 5) return;
    this.customLinks.push({ label: '', url: '' });
    this.renderCustomLinks();

    // Focus on new label input
    const items = this.modal.querySelectorAll('.profile-custom-link-item');
    const lastItem = items[items.length - 1];
    lastItem?.querySelector('.profile-custom-link-label')?.focus();
  }

  /**
   * Get current custom links from form
   */
  getCustomLinks() {
    const items = this.modal.querySelectorAll('.profile-custom-link-item');
    const links = [];

    items.forEach(item => {
      const label = item.querySelector('.profile-custom-link-label').value.trim();
      const url = item.querySelector('.profile-custom-link-url').value.trim();
      if (label && url) {
        links.push({ label, url });
      }
    });

    return links;
  }

  /**
   * Show modal with animation
   */
  showModal() {
    this.modal.classList.remove('hidden');
    // Trigger reflow for animation
    this.modal.offsetHeight;
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Hide bottom navigation on mobile
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
      bottomNav.style.display = 'none';
    }
  }

  /**
   * Close modal
   */
  close() {
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this.handleEscape);

    // Restore bottom navigation
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
      bottomNav.style.display = '';
    }

    setTimeout(() => {
      this.modal.classList.add('hidden');
    }, 300);
  }

  /**
   * Save profile changes
   */
  async save() {
    if (this.isLoading) return;

    const saveBtn = this.modal.querySelector('#profileSaveBtn');
    const errorDiv = this.modal.querySelector('#profileError');
    errorDiv.style.display = 'none';

    // Gather form data
    const usernameValue = this.modal.querySelector('#editUsername').value.trim().toLowerCase();
    const data = {
      display_name: this.modal.querySelector('#editDisplayName').value.trim() || null,
      bio: this.modal.querySelector('#editBio').value.trim() || null,
      social_links: {
        x: this.modal.querySelector('#social-x')?.value.trim() || null,
        youtube: this.modal.querySelector('#social-youtube')?.value.trim() || null,
        github: this.modal.querySelector('#social-github')?.value.trim() || null,
        tiktok: this.modal.querySelector('#social-tiktok')?.value.trim() || null,
        instagram: this.modal.querySelector('#social-instagram')?.value.trim() || null,
        custom: this.getCustomLinks()
      }
    };

    // Include username only if changed
    if (usernameValue !== (this.userData.username || '')) {
      data.username = usernameValue || null;
    }

    // Client-side validation
    if (data.display_name && data.display_name.length > 50) {
      this.showError(this.t('error.systemError'));
      return;
    }
    if (data.bio && data.bio.length > 160) {
      this.showError(this.t('error.systemError'));
      return;
    }

    this.isLoading = true;
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;

    try {
      const res = await DreamCoreAuth.authFetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || this.t('error.systemError'));
      }

      // Success - clear username cache and reload to show changes
      if (typeof DreamCoreAuth !== 'undefined' && DreamCoreAuth.clearMyUsernameCache) {
        DreamCoreAuth.clearMyUsernameCache();
      }
      this.close();
      location.reload();
    } catch (err) {
      console.error('[ProfileEditor] Save error:', err);
      this.showError(err.message);
    } finally {
      this.isLoading = false;
      saveBtn.classList.remove('loading');
      saveBtn.disabled = false;
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = this.modal.querySelector('#profileError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Open file picker for avatar
   */
  selectAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) this.uploadAvatar(file);
    };
    input.click();
  }

  /**
   * Upload avatar image
   */
  async uploadAvatar(file) {
    // Check file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      this.showError(this.t('error.systemError'));
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      this.showError(this.t('error.systemError'));
      return;
    }

    const errorDiv = this.modal.querySelector('#profileError');
    errorDiv.style.display = 'none';

    const uploadBtn = this.modal.querySelector('#avatarUploadBtn');
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = this.t('common.loading');
    uploadBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await DreamCoreAuth.authFetch('/api/users/me/avatar', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || this.t('error.systemError'));
      }

      const { avatar_url } = await res.json();

      // Update preview with cache buster
      const avatarPreview = this.modal.querySelector('#avatarPreview');
      avatarPreview.innerHTML = `<img src="${this.escapeAttr(avatar_url)}?v=${Date.now()}" alt="Avatar">`;

    } catch (err) {
      console.error('[ProfileEditor] Avatar upload error:', err);
      this.showError(err.message);
    } finally {
      uploadBtn.textContent = originalText;
      uploadBtn.disabled = false;
    }
  }

  /**
   * Handle username input with debounced availability check
   */
  handleUsernameInput(value) {
    // Clear previous timeout
    if (this.usernameCheckTimeout) {
      clearTimeout(this.usernameCheckTimeout);
    }

    const normalized = value.toLowerCase().trim();

    // If empty, clear status
    if (!normalized) {
      this.setUsernameStatus('', '');
      this.updateUsernameUrl('');
      return;
    }

    // If same as current username, show "current" status
    if (normalized === this.userData.username) {
      this.setUsernameStatus('current', this.t('profileEditor.usernameInUse'));
      this.updateUsernameUrl(normalized);
      return;
    }

    // Validate format first
    const formatValid = /^[a-z0-9_]{3,20}$/.test(normalized);
    if (!formatValid) {
      if (normalized.length < 3) {
        this.setUsernameStatus('error', this.t('profileEditor.usernameUnavailable'));
      } else if (normalized.length > 20) {
        this.setUsernameStatus('error', this.t('profileEditor.usernameUnavailable'));
      } else {
        this.setUsernameStatus('error', this.t('profileEditor.usernameUnavailable'));
      }
      this.updateUsernameUrl('');
      return;
    }

    // Show checking status
    this.setUsernameStatus('checking', this.t('profileEditor.usernameChecking'));

    // Debounced API check
    this.usernameCheckTimeout = setTimeout(() => {
      this.checkUsernameAvailability(normalized);
    }, 500);
  }

  /**
   * Check username availability via API
   */
  async checkUsernameAvailability(username) {
    try {
      const res = await fetch(`/api/users/username-available?u=${encodeURIComponent(username)}`);
      const data = await res.json();

      // Check if input changed while waiting
      const currentValue = this.modal.querySelector('#editUsername').value.toLowerCase().trim();
      if (currentValue !== username) return;

      if (data.available) {
        this.setUsernameStatus('available', this.t('profileEditor.usernameAvailable'));
        this.updateUsernameUrl(username);
        this.usernameAvailable = true;
      } else {
        this.setUsernameStatus('error', data.error || this.t('profileEditor.usernameUnavailable'));
        this.updateUsernameUrl('');
        this.usernameAvailable = false;
      }
    } catch (err) {
      console.error('[ProfileEditor] Username check error:', err);
      this.setUsernameStatus('error', this.t('error.systemError'));
      this.usernameAvailable = false;
    }
  }

  /**
   * Set username status indicator
   */
  setUsernameStatus(type, message) {
    const statusEl = this.modal.querySelector('#usernameStatus');
    if (!statusEl) return;

    statusEl.className = 'profile-username-status';
    if (type) {
      statusEl.classList.add(`status-${type}`);
    }
    statusEl.textContent = message;
  }

  /**
   * Update username URL display
   */
  updateUsernameUrl(username) {
    const urlContainer = this.modal.querySelector('#usernameUrl');
    const urlText = this.modal.querySelector('#usernameUrlText');

    if (!urlContainer || !urlText) return;

    if (username) {
      urlText.textContent = `v2.dreamcore.gg/@${username}`;
      urlContainer.style.display = 'inline-flex';
    } else {
      urlContainer.style.display = 'none';
    }
  }

  /**
   * Copy username URL to clipboard
   */
  copyUsernameUrl() {
    const username = this.modal.querySelector('#editUsername').value.toLowerCase().trim();
    if (!username) return;

    const url = `https://v2.dreamcore.gg/@${username}`;
    navigator.clipboard.writeText(url).then(() => {
      const copyBtn = this.modal.querySelector('#usernameUrlCopy');
      if (copyBtn) {
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1500);
      }
    }).catch(err => {
      console.error('[ProfileEditor] Copy failed:', err);
    });
  }

  /**
   * Escape HTML attribute
   */
  escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
  }
}

// Export as global
window.ProfileEditor = ProfileEditor;
