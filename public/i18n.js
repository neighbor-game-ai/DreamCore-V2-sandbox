/**
 * DreamCore i18n - Lightweight internationalization
 * Supports: English (default), Japanese, Chinese, Spanish, Portuguese, Korean
 */
(function() {
  'use strict';

  const SUPPORTED_LANGS = ['en', 'ja', 'zh', 'es', 'pt', 'ko'];
  const DEFAULT_LANG = 'en';
  const STORAGE_KEY = 'dreamcore_lang';

  let currentLang = DEFAULT_LANG;
  let translations = {};
  let initialized = false;

  /**
   * Detect user's preferred language
   * Priority: localStorage > navigator.language > default
   */
  function detectLanguage() {
    // 1. Check localStorage (user's explicit choice)
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      return saved;
    }

    // 2. Check browser language
    const browserLangs = navigator.languages || [navigator.language];
    for (const lang of browserLangs) {
      const code = lang.split('-')[0].toLowerCase();
      if (SUPPORTED_LANGS.includes(code)) {
        return code;
      }
    }

    // 3. Default to English
    return DEFAULT_LANG;
  }

  /**
   * Get translation by key with variable interpolation
   * @param {string} key - Dot notation key (e.g., 'nav.create')
   * @param {Object} vars - Variables to interpolate (e.g., {name: 'Test'})
   * @returns {string} Translated string or key if not found
   */
  function t(key, vars = {}) {
    const langData = translations[currentLang] || translations[DEFAULT_LANG] || {};

    // Navigate nested keys
    const keys = key.split('.');
    let value = langData;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }

    // Fallback to English if not found
    if (value === undefined && currentLang !== DEFAULT_LANG) {
      value = translations[DEFAULT_LANG];
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
    }

    // Return key if still not found
    if (value === undefined || typeof value !== 'string') {
      console.warn(`[i18n] Missing translation: ${key}`);
      return key;
    }

    // Interpolate variables: {name} -> vars.name
    return value.replace(/\{(\w+)\}/g, (_, varName) =>
      vars[varName] !== undefined ? vars[varName] : `{${varName}}`
    );
  }

  /**
   * Set current language and persist to localStorage
   * @param {string} lang - Language code (en, ja, zh)
   * @param {boolean} reload - Whether to reload page after change
   */
  function setLanguage(lang, reload = true) {
    if (!SUPPORTED_LANGS.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
      return;
    }

    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;

    if (reload && initialized) {
      updateDOM();
    }
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Get list of supported languages
   * @returns {string[]} Array of language codes
   */
  function getSupportedLanguages() {
    return [...SUPPORTED_LANGS];
  }

  /**
   * Update all DOM elements with data-i18n attribute
   */
  function updateDOM() {
    // Update text content (supports data-i18n-html="true" for HTML content like <br>)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {};
      const translated = t(key, vars);
      // Use innerHTML only if explicitly allowed (for trusted content like <br>)
      if (el.dataset.i18nHtml === 'true') {
        el.innerHTML = translated;
      } else {
        el.textContent = translated;
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    // Update titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });

    // Update aria-label attributes
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    // Update alt attributes for images
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
      el.alt = t(el.dataset.i18nAlt);
    });

    // Update page title if specified
    const titleEl = document.querySelector('[data-i18n-page-title]');
    if (titleEl) {
      document.title = t(titleEl.dataset.i18nPageTitle);
    }
  }

  /**
   * Load translations from JSON files
   * @returns {Promise<void>}
   */
  async function loadTranslations() {
    const loadPromises = SUPPORTED_LANGS.map(async (lang) => {
      try {
        const res = await fetch(`/locales/${lang}.json`);
        if (res.ok) {
          translations[lang] = await res.json();
        }
      } catch (e) {
        console.warn(`[i18n] Failed to load ${lang}.json:`, e);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Initialize i18n system
   * @returns {Promise<void>}
   */
  async function init() {
    if (initialized) return;

    // Detect and set language
    currentLang = detectLanguage();
    document.documentElement.lang = currentLang;

    // Load translations
    await loadTranslations();

    // Update DOM
    updateDOM();

    initialized = true;
  }

  // Export to global
  window.DreamCoreI18n = {
    init,
    t,
    setLanguage,
    getLanguage,
    getSupportedLanguages,
    updateDOM,
    get currentLang() { return currentLang; }
  };

  // Auto-init on DOMContentLoaded if translations exist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Only auto-init if page has i18n elements
      if (document.querySelector('[data-i18n]')) {
        init();
      }
    });
  }
})();
