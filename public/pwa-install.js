/**
 * PWA Install Prompt - Self-contained module
 *
 * Handles PWA install promotion for both Chromium (beforeinstallprompt)
 * and iOS Safari (manual Add to Home Screen instructions).
 *
 * Injects its own CSS and HTML. No external dependencies.
 * Usage: Add <script src="/pwa-install.js" defer></script> to any page.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  var DISMISS_DAYS = 7;
  var LS_DISMISSED = 'pwa-install-dismissed-v2';
  var LS_INSTALLED = 'pwa-installed';

  // ---------------------------------------------------------------------------
  // Safe localStorage helpers (private browsing / quota / disabled)
  // ---------------------------------------------------------------------------
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Translations (built-in, no external locale files needed)
  // ---------------------------------------------------------------------------
  var TEXTS = {
    en: {
      title: 'Install DreamCore',
      description: 'Fullscreen play & get notified when your game is ready',
      install: 'Install',
      howTo: 'Learn How',
      dismiss: "Don't show again",
      iosTitle: 'Add to Home Screen',
      iosStep1: 'Tap the <strong>Share</strong> button at the bottom',
      iosStep2: 'Scroll down and tap <strong>"Add to Home Screen"</strong>',
      iosStep3: 'Tap <strong>"Add"</strong> in the top right',
      iosOk: 'Got it',
      androidTitle: 'Install App',
      androidStep1: 'Tap the <strong>menu ⋮</strong> button in the top right',
      androidStep2: 'Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>',
      androidOk: 'Got it',
    },
    ja: {
      title: 'DreamCoreをインストール',
      description: '全画面でプレイ & ゲーム完成を通知でお知らせ',
      install: 'インストール',
      howTo: '追加方法',
      dismiss: '今後表示しない',
      iosTitle: 'ホーム画面に追加する方法',
      iosStep1: '画面下部の<strong>共有ボタン</strong>をタップ',
      iosStep2: '<strong>「ホーム画面に追加」</strong>を選択',
      iosStep3: '右上の<strong>「追加」</strong>をタップ',
      iosOk: 'わかった',
      androidTitle: 'アプリをインストール',
      androidStep1: '右上の<strong>メニュー ⋮</strong> をタップ',
      androidStep2: '<strong>「アプリをインストール」</strong>または<strong>「ホーム画面に追加」</strong>をタップ',
      androidOk: 'わかった',
    },
    zh: {
      title: '安装 DreamCore',
      description: '全屏游玩 & 游戏完成时收到通知',
      install: '安装',
      howTo: '了解方法',
      dismiss: '不再显示',
      iosTitle: '添加到主屏幕',
      iosStep1: '点击底部的<strong>分享按钮</strong>',
      iosStep2: '选择<strong>"添加到主屏幕"</strong>',
      iosStep3: '点击右上角的<strong>"添加"</strong>',
      iosOk: '知道了',
      androidTitle: '安装应用',
      androidStep1: '点击右上角的<strong>菜单 ⋮</strong>',
      androidStep2: '点击<strong>"安装应用"</strong>或<strong>"添加到主屏幕"</strong>',
      androidOk: '知道了',
    },
    ko: {
      title: 'DreamCore 설치',
      description: '전체 화면 플레이 & 게임 완성 알림 받기',
      install: '설치',
      howTo: '방법 보기',
      dismiss: '다시 표시 안 함',
      iosTitle: '홈 화면에 추가하는 방법',
      iosStep1: '하단의 <strong>공유 버튼</strong>을 탭',
      iosStep2: '<strong>"홈 화면에 추가"</strong>를 선택',
      iosStep3: '오른쪽 상단의 <strong>"추가"</strong>를 탭',
      iosOk: '확인',
      androidTitle: '앱 설치',
      androidStep1: '오른쪽 상단의 <strong>메뉴 ⋮</strong>를 탭',
      androidStep2: '<strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong>를 탭',
      androidOk: '확인',
    },
    es: {
      title: 'Instalar DreamCore',
      description: 'Pantalla completa & recibe avisos cuando tu juego esté listo',
      install: 'Instalar',
      howTo: 'Cómo añadir',
      dismiss: 'No mostrar de nuevo',
      iosTitle: 'Añadir a pantalla de inicio',
      iosStep1: 'Toca el botón <strong>Compartir</strong> en la parte inferior',
      iosStep2: 'Selecciona <strong>"Añadir a pantalla de inicio"</strong>',
      iosStep3: 'Toca <strong>"Añadir"</strong> en la esquina superior derecha',
      iosOk: 'Entendido',
      androidTitle: 'Instalar aplicación',
      androidStep1: 'Toca el <strong>menú ⋮</strong> en la esquina superior derecha',
      androidStep2: 'Toca <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong>',
      androidOk: 'Entendido',
    },
    pt: {
      title: 'Instalar DreamCore',
      description: 'Tela cheia & receba avisos quando seu jogo estiver pronto',
      install: 'Instalar',
      howTo: 'Como adicionar',
      dismiss: 'Não mostrar novamente',
      iosTitle: 'Adicionar à Tela Inicial',
      iosStep1: 'Toque no botão <strong>Compartilhar</strong> na parte inferior',
      iosStep2: 'Selecione <strong>"Adicionar à Tela Inicial"</strong>',
      iosStep3: 'Toque em <strong>"Adicionar"</strong> no canto superior direito',
      iosOk: 'Entendi',
      androidTitle: 'Instalar aplicativo',
      androidStep1: 'Toque no <strong>menu ⋮</strong> no canto superior direito',
      androidStep2: 'Toque em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>',
      androidOk: 'Entendi',
    },
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getLang() {
    if (window.DreamCoreI18n && window.DreamCoreI18n.currentLang) {
      var lang = window.DreamCoreI18n.currentLang;
      if (TEXTS[lang]) return lang;
    }
    var nav = (navigator.language || '').slice(0, 2).toLowerCase();
    return TEXTS[nav] ? nav : 'en';
  }

  function t(key) {
    var lang = getLang();
    return (TEXTS[lang] && TEXTS[lang][key]) || TEXTS.en[key] || key;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isDismissed() {
    var ts = lsGet(LS_DISMISSED);
    if (!ts) return false;
    var diff = Date.now() - parseInt(ts, 10);
    return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  }

  function isInstalled() {
    return lsGet(LS_INSTALLED) === 'true';
  }

  // ---------------------------------------------------------------------------
  // CSS Injection
  // ---------------------------------------------------------------------------
  function injectStyles() {
    var style = document.createElement('style');
    style.id = 'pwa-install-styles';
    style.textContent = [
      /* Banner */
      '.pwa-install-banner {',
      '  position: fixed;',
      '  top: 0; left: 0; right: 0;',
      '  z-index: 10000;',
      '  background: linear-gradient(135deg, #FF3B30 0%, #FF6B5A 100%);',
      '  color: #fff;',
      '  padding: 12px 16px;',
      '  padding-top: calc(12px + env(safe-area-inset-top, 0px));',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 12px;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,0.15);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  transform: translateY(-100%);',
      '  animation: pwa-slide-in 0.4s ease-out forwards;',
      '  animation-delay: 0.5s;',
      '  opacity: 0;',
      '}',
      '@keyframes pwa-slide-in {',
      '  from { transform: translateY(-100%); opacity: 0; }',
      '  to   { transform: translateY(0);     opacity: 1; }',
      '}',
      '@keyframes pwa-slide-out {',
      '  from { transform: translateY(0);     opacity: 1; }',
      '  to   { transform: translateY(-100%); opacity: 0; }',
      '}',
      '.pwa-install-banner.pwa-hiding {',
      '  animation: pwa-slide-out 0.3s ease-in forwards;',
      '}',
      '.pwa-install-icon {',
      '  flex-shrink: 0;',
      '  width: 40px; height: 40px;',
      '  border-radius: 10px;',
      '  background: rgba(255,255,255,0.2);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 20px;',
      '}',
      '.pwa-install-text {',
      '  flex: 1;',
      '  min-width: 0;',
      '}',
      '.pwa-install-title {',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  line-height: 1.3;',
      '}',
      '.pwa-install-desc {',
      '  font-size: 12px;',
      '  opacity: 0.9;',
      '  line-height: 1.3;',
      '  margin-top: 1px;',
      '}',
      '.pwa-install-actions {',
      '  flex-shrink: 0;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '.pwa-install-btn {',
      '  background: #fff;',
      '  color: #FF3B30;',
      '  border: none;',
      '  border-radius: 20px;',
      '  padding: 8px 16px;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  cursor: pointer;',
      '  white-space: nowrap;',
      '  transition: transform 0.15s;',
      '}',
      '.pwa-install-btn:active {',
      '  transform: scale(0.95);',
      '}',
      '.pwa-dismiss-btn {',
      '  background: none;',
      '  border: none;',
      '  color: rgba(255,255,255,0.8);',
      '  font-size: 20px;',
      '  cursor: pointer;',
      '  padding: 4px;',
      '  line-height: 1;',
      '}',

      /* iOS Modal */
      '.pwa-ios-overlay {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 10001;',
      '  background: rgba(0,0,0,0.5);',
      '  display: flex;',
      '  align-items: flex-end;',
      '  justify-content: center;',
      '  animation: pwa-fade-in 0.3s ease-out;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      '@keyframes pwa-fade-in {',
      '  from { opacity: 0; }',
      '  to   { opacity: 1; }',
      '}',
      '.pwa-ios-modal {',
      '  background: #fff;',
      '  border-radius: 16px 16px 0 0;',
      '  padding: 24px 20px;',
      '  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));',
      '  width: 100%;',
      '  max-width: 420px;',
      '  color: #1a1a1a;',
      '  animation: pwa-modal-up 0.35s ease-out;',
      '}',
      '@keyframes pwa-modal-up {',
      '  from { transform: translateY(100%); }',
      '  to   { transform: translateY(0); }',
      '}',
      '.pwa-ios-modal h3 {',
      '  font-size: 18px;',
      '  font-weight: 700;',
      '  margin: 0 0 20px;',
      '  text-align: center;',
      '}',
      '.pwa-ios-steps {',
      '  list-style: none;',
      '  padding: 0;',
      '  margin: 0 0 24px;',
      '}',
      '.pwa-ios-steps li {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  gap: 12px;',
      '  padding: 12px 0;',
      '  font-size: 15px;',
      '  line-height: 1.5;',
      '  border-bottom: 1px solid #f0f0f0;',
      '}',
      '.pwa-ios-steps li:last-child {',
      '  border-bottom: none;',
      '}',
      '.pwa-ios-step-num {',
      '  flex-shrink: 0;',
      '  width: 28px; height: 28px;',
      '  border-radius: 50%;',
      '  background: #FF3B30;',
      '  color: #fff;',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '}',
      '.pwa-ios-ok-btn {',
      '  display: block;',
      '  width: 100%;',
      '  background: #FF3B30;',
      '  color: #fff;',
      '  border: none;',
      '  border-radius: 12px;',
      '  padding: 14px;',
      '  font-size: 16px;',
      '  font-weight: 600;',
      '  cursor: pointer;',
      '  transition: transform 0.15s;',
      '}',
      '.pwa-ios-ok-btn:active {',
      '  transform: scale(0.97);',
      '}',
      '.pwa-ios-dismiss-link {',
      '  display: block;',
      '  text-align: center;',
      '  margin-top: 12px;',
      '  font-size: 13px;',
      '  color: #8e8e93;',
      '  background: none;',
      '  border: none;',
      '  cursor: pointer;',
      '  padding: 4px;',
      '}',

      /* Step illustration containers */
      '.pwa-ios-step-content {',
      '  flex: 1;',
      '  min-width: 0;',
      '}',
      '.pwa-ios-step-label {',
      '  font-size: 15px;',
      '  line-height: 1.4;',
      '  margin-bottom: 10px;',
      '}',
      '.pwa-ios-illust {',
      '  background: #f5f5f7;',
      '  border-radius: 12px;',
      '  padding: 10px 14px;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 10px;',
      '}',
      '.pwa-ios-illust svg {',
      '  flex-shrink: 0;',
      '}',
      '.pwa-ios-illust-text {',
      '  font-size: 14px;',
      '  color: #333;',
      '  font-weight: 500;',
      '}',

      /* Safari bottom bar illustration */
      '.pwa-ios-safari-bar {',
      '  background: #f5f5f7;',
      '  border-radius: 12px;',
      '  padding: 8px 0;',
      '  display: flex;',
      '  justify-content: space-around;',
      '  align-items: center;',
      '}',
      '.pwa-ios-safari-bar-icon {',
      '  width: 28px; height: 28px;',
      '  display: flex; align-items: center; justify-content: center;',
      '  opacity: 0.35;',
      '}',
      '.pwa-ios-safari-bar-icon.pwa-highlight {',
      '  opacity: 1;',
      '  background: rgba(255,59,48,0.1);',
      '  border-radius: 8px;',
      '  width: 36px; height: 36px;',
      '  position: relative;',
      '}',
      '.pwa-ios-safari-bar-icon.pwa-highlight::after {',
      '  content: "";',
      '  position: absolute;',
      '  inset: -3px;',
      '  border: 2px solid #FF3B30;',
      '  border-radius: 10px;',
      '  animation: pwa-pulse 1.5s ease-in-out infinite;',
      '}',
      '@keyframes pwa-pulse {',
      '  0%, 100% { opacity: 0.4; transform: scale(1); }',
      '  50% { opacity: 0; transform: scale(1.3); }',
      '}',

      /* Add to Home Screen menu item illustration */
      '.pwa-ios-menu-item {',
      '  background: #f5f5f7;',
      '  border-radius: 12px;',
      '  overflow: hidden;',
      '}',
      '.pwa-ios-menu-row {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 12px;',
      '  padding: 10px 14px;',
      '  border-bottom: 1px solid #e8e8e8;',
      '  opacity: 0.35;',
      '  font-size: 14px;',
      '  color: #333;',
      '}',
      '.pwa-ios-menu-row:last-child {',
      '  border-bottom: none;',
      '}',
      '.pwa-ios-menu-row.pwa-highlight {',
      '  opacity: 1;',
      '  background: rgba(255,59,48,0.05);',
      '}',
      '.pwa-ios-menu-row svg {',
      '  flex-shrink: 0;',
      '}',

      /* Arrow indicator */
      '.pwa-ios-arrow {',
      '  display: block;',
      '  text-align: center;',
      '  margin: 6px 0;',
      '  color: #FF3B30;',
      '  font-size: 18px;',
      '  animation: pwa-bounce 1s ease-in-out infinite;',
      '}',
      '@keyframes pwa-bounce {',
      '  0%, 100% { transform: translateY(0); }',
      '  50% { transform: translateY(3px); }',
      '}',
    ].join('\n');

    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Banner
  // ---------------------------------------------------------------------------
  var bannerEl = null;
  var deferredPrompt = null;

  function createBanner() {
    var banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.setAttribute('role', 'alert');

    var actionLabel = isIOS() ? t('howTo') : t('install');

    banner.innerHTML = [
      '<div class="pwa-install-icon"><img src="/icons/icon-192.png" width="32" height="32" alt="DreamCore" style="border-radius:8px"></div>',
      '<div class="pwa-install-text">',
      '  <div class="pwa-install-title">' + t('title') + '</div>',
      '  <div class="pwa-install-desc">' + t('description') + '</div>',
      '</div>',
      '<div class="pwa-install-actions">',
      '  <button class="pwa-install-btn" id="pwaInstallBtn">' + actionLabel + '</button>',
      '  <button class="pwa-dismiss-btn" id="pwaDismissBtn" aria-label="Close">&times;</button>',
      '</div>',
    ].join('');

    document.body.appendChild(banner);
    bannerEl = banner;

    document.getElementById('pwaDismissBtn').addEventListener('click', function () {
      hideBanner();
    });

    document.getElementById('pwaInstallBtn').addEventListener('click', function () {
      if (deferredPrompt) {
        triggerInstall();
      } else if (isIOS()) {
        showIOSModal();
      } else {
        showAndroidModal();
      }
    });
  }

  function dismiss() {
    if (!bannerEl) return;
    bannerEl.classList.add('pwa-hiding');
    lsSet(LS_DISMISSED, String(Date.now()));
    setTimeout(function () {
      if (bannerEl && bannerEl.parentNode) {
        bannerEl.parentNode.removeChild(bannerEl);
      }
      bannerEl = null;
    }, 300);
  }

  function hideBanner() {
    if (!bannerEl) return;
    bannerEl.classList.add('pwa-hiding');
    setTimeout(function () {
      if (bannerEl && bannerEl.parentNode) {
        bannerEl.parentNode.removeChild(bannerEl);
      }
      bannerEl = null;
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // Chromium Install
  // ---------------------------------------------------------------------------
  function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (result) {
      deferredPrompt = null;
      hideBanner();
    });
  }

  // ---------------------------------------------------------------------------
  // iOS Modal
  // ---------------------------------------------------------------------------
  var SVG = {
    share: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    shareHighlight: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    forward: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    tabs: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    addHome: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    copy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    bookmark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    arrowDown: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  };

  function showIOSModal() {
    var previousFocus = document.activeElement;
    var overlay = document.createElement('div');
    overlay.className = 'pwa-ios-overlay';

    var lang = getLang();
    var menuLabels = {
      en: { copy: 'Copy', bookmark: 'Add Bookmark', addHome: 'Add to Home Screen' },
      ja: { copy: 'コピー', bookmark: 'ブックマークを追加', addHome: 'ホーム画面に追加' },
      zh: { copy: '拷贝', bookmark: '添加书签', addHome: '添加到主屏幕' },
      ko: { copy: '복사', bookmark: '북마크 추가', addHome: '홈 화면에 추가' },
      es: { copy: 'Copiar', bookmark: 'Añadir marcador', addHome: 'Añadir a pantalla de inicio' },
      pt: { copy: 'Copiar', bookmark: 'Adicionar marcador', addHome: 'Adicionar à Tela Inicial' },
    };
    var ml = menuLabels[lang] || menuLabels.en;

    overlay.innerHTML = [
      '<div class="pwa-ios-modal" role="dialog" aria-modal="true" aria-label="' + t('iosTitle') + '">',
      '  <h3>' + t('iosTitle') + '</h3>',
      '  <ol class="pwa-ios-steps">',
      '    <li>',
      '      <span class="pwa-ios-step-num">1</span>',
      '      <div class="pwa-ios-step-content">',
      '        <div class="pwa-ios-step-label">' + t('iosStep1') + '</div>',
      '        <div class="pwa-ios-safari-bar">',
      '          <span class="pwa-ios-safari-bar-icon">' + SVG.back + '</span>',
      '          <span class="pwa-ios-safari-bar-icon">' + SVG.forward + '</span>',
      '          <span class="pwa-ios-safari-bar-icon pwa-highlight">' + SVG.shareHighlight + '</span>',
      '          <span class="pwa-ios-safari-bar-icon">' + SVG.book + '</span>',
      '          <span class="pwa-ios-safari-bar-icon">' + SVG.tabs + '</span>',
      '        </div>',
      '      </div>',
      '    </li>',
      '    <li>',
      '      <span class="pwa-ios-step-num">2</span>',
      '      <div class="pwa-ios-step-content">',
      '        <div class="pwa-ios-step-label">' + t('iosStep2') + '</div>',
      '        <span class="pwa-ios-arrow">' + SVG.arrowDown + '</span>',
      '        <div class="pwa-ios-menu-item">',
      '          <div class="pwa-ios-menu-row">' + SVG.copy + ' <span>' + ml.copy + '</span></div>',
      '          <div class="pwa-ios-menu-row">' + SVG.bookmark + ' <span>' + ml.bookmark + '</span></div>',
      '          <div class="pwa-ios-menu-row pwa-highlight">' + SVG.addHome + ' <span style="color:#333;font-weight:600">' + ml.addHome + '</span></div>',
      '        </div>',
      '      </div>',
      '    </li>',
      '    <li>',
      '      <span class="pwa-ios-step-num">3</span>',
      '      <div class="pwa-ios-step-content">',
      '        <div class="pwa-ios-step-label">' + t('iosStep3') + '</div>',
      '        <div class="pwa-ios-illust">',
      '          <img src="/icons/icon-192.png" width="36" height="36" alt="DreamCore" style="border-radius:8px">',
      '          <span class="pwa-ios-illust-text">DreamCore</span>',
      '          <span style="margin-left:auto;color:#007AFF;font-weight:600;font-size:15px">' + (lang === 'ja' ? '追加' : lang === 'zh' ? '添加' : lang === 'ko' ? '추가' : 'Add') + '</span>',
      '        </div>',
      '      </div>',
      '    </li>',
      '  </ol>',
      '  <button class="pwa-ios-ok-btn">' + t('iosOk') + '</button>',
      '  <button class="pwa-ios-dismiss-link">' + t('dismiss') + '</button>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);

    // Focus the OK button for accessibility
    var okBtn = overlay.querySelector('.pwa-ios-ok-btn');
    var dismissLink = overlay.querySelector('.pwa-ios-dismiss-link');
    okBtn.focus();

    function closeModal() {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      okBtn.removeEventListener('click', onOk);
      dismissLink.removeEventListener('click', onDismiss);
      overlay.removeEventListener('click', onOverlay);
      if (previousFocus && previousFocus.focus) {
        previousFocus.focus();
      }
    }

    function onOk() {
      closeModal();
    }

    function onDismiss() {
      closeModal();
      dismiss();
    }

    function onOverlay(e) {
      if (e.target === overlay) {
        closeModal();
      }
    }

    okBtn.addEventListener('click', onOk);
    dismissLink.addEventListener('click', onDismiss);
    overlay.addEventListener('click', onOverlay);
  }

  // ---------------------------------------------------------------------------
  // Android Modal
  // ---------------------------------------------------------------------------
  function showAndroidModal() {
    var previousFocus = document.activeElement;
    var overlay = document.createElement('div');
    overlay.className = 'pwa-ios-overlay';

    overlay.innerHTML = [
      '<div class="pwa-ios-modal" role="dialog" aria-modal="true" aria-label="' + t('androidTitle') + '">',
      '  <h3>' + t('androidTitle') + '</h3>',
      '  <ol class="pwa-ios-steps">',
      '    <li>',
      '      <span class="pwa-ios-step-num">1</span>',
      '      <div class="pwa-ios-step-content">',
      '        <div class="pwa-ios-step-label">' + t('androidStep1') + '</div>',
      '        <div class="pwa-ios-illust">',
      '          <svg width="24" height="24" viewBox="0 0 24 24" fill="#333"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
      '          <span class="pwa-ios-illust-text">Menu</span>',
      '        </div>',
      '      </div>',
      '    </li>',
      '    <li>',
      '      <span class="pwa-ios-step-num">2</span>',
      '      <div class="pwa-ios-step-content">',
      '        <div class="pwa-ios-step-label">' + t('androidStep2') + '</div>',
      '        <div class="pwa-ios-menu-item">',
      '          <div class="pwa-ios-menu-row">' + SVG.bookmark + ' <span>Bookmark</span></div>',
      '          <div class="pwa-ios-menu-row pwa-highlight">' + SVG.addHome + ' <span style="color:#333;font-weight:600">Install app</span></div>',
      '        </div>',
      '      </div>',
      '    </li>',
      '  </ol>',
      '  <button class="pwa-ios-ok-btn">' + t('androidOk') + '</button>',
      '  <button class="pwa-ios-dismiss-link">' + t('dismiss') + '</button>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);

    var okBtn = overlay.querySelector('.pwa-ios-ok-btn');
    var dismissLink = overlay.querySelector('.pwa-ios-dismiss-link');
    okBtn.focus();

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      okBtn.removeEventListener('click', onOk);
      dismissLink.removeEventListener('click', onDismiss);
      overlay.removeEventListener('click', onOverlay);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function onOk() { closeModal(); }
    function onDismiss() { closeModal(); dismiss(); }
    function onOverlay(e) { if (e.target === overlay) closeModal(); }

    okBtn.addEventListener('click', onOk);
    dismissLink.addEventListener('click', onDismiss);
    overlay.addEventListener('click', onOverlay);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function shouldShow() {
    if (isStandalone()) return false;
    if (!isMobile()) return false;
    if (isInstalled()) return false;
    if (isDismissed()) return false;
    return true;
  }

  function init() {
    if (!shouldShow()) return;

    injectStyles();

    // Capture beforeinstallprompt if available (Chromium)
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
    });

    window.addEventListener('appinstalled', function () {
      lsSet(LS_INSTALLED, 'true');
      hideBanner();
      deferredPrompt = null;
    });

    // Show banner immediately on all mobile
    createBanner();
  }

  // Debug: force show banner (for testing on desktop)
  window.__pwaForceShow = function (mode) {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
    lsRemove(LS_DISMISSED);
    lsRemove(LS_INSTALLED);
    if (!document.getElementById('pwa-install-styles')) { injectStyles(); }
    createBanner();
    if (mode === 'ios') { showIOSModal(); }
    else if (mode === 'android') { showAndroidModal(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
