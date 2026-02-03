const ERROR_DETECTION_SCRIPT = `
<script>
(function() {
  var errors = [];
  var MAX_ERRORS = 10;

  // Capture JS errors
  window.onerror = function(msg, url, line, col, error) {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'error',
        message: msg,
        file: url ? url.split('/').pop() : 'unknown',
        line: line,
        column: col,
        stack: error ? error.stack : null
      });
      reportErrors();
    }
    return false;
  };

  // Capture unhandled promise rejections
  window.onunhandledrejection = function(event) {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'unhandledrejection',
        message: event.reason ? (event.reason.message || String(event.reason)) : 'Unknown promise rejection',
        stack: event.reason ? event.reason.stack : null
      });
      reportErrors();
    }
  };

  // Capture console.error
  var originalConsoleError = console.error;
  console.error = function() {
    if (errors.length < MAX_ERRORS) {
      errors.push({
        type: 'console.error',
        message: Array.from(arguments).map(function(a) {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ')
      });
      reportErrors();
    }
    originalConsoleError.apply(console, arguments);
  };

  function reportErrors() {
    try {
      window.parent.postMessage({
        type: 'gameError',
        errors: errors
      }, '*');
    } catch(e) {}
  }

  // Report successful load
  window.addEventListener('load', function() {
    setTimeout(function() {
      try {
        window.parent.postMessage({
          type: 'gameLoaded',
          success: errors.length === 0,
          errorCount: errors.length,
          errors: errors
        }, '*');
      } catch(e) {}
    }, 500);
  });
})();
</script>
`;

const buildAssetInjectScript = (baseUrl) => {
  return `\n<script>window.ASSET_BASE_URL=${JSON.stringify(baseUrl)};</script>\n`;
};

const rewriteUserAssets = (html, baseUrl) => {
  if (!baseUrl) return html;
  const prefix = `${baseUrl}/user-assets/`;
  return html.replace(/(^|["'(\s])\/user-assets\//g, `$1${prefix}`);
};

const injectGameHtml = (html, baseUrl) => {
  const injectScript = buildAssetInjectScript(baseUrl) + ERROR_DETECTION_SCRIPT;
  let content = rewriteUserAssets(html, baseUrl);

  if (content.includes('<head>')) {
    content = content.replace('<head>', '<head>' + injectScript);
  } else if (content.includes('<HEAD>')) {
    content = content.replace('<HEAD>', '<HEAD>' + injectScript);
  } else {
    content = injectScript + content;
  }

  return content;
};

module.exports = {
  ERROR_DETECTION_SCRIPT,
  buildAssetInjectScript,
  rewriteUserAssets,
  injectGameHtml,
  injectPublicGameHtml: (html, baseUrl) => {
    const scriptInjection = `<script>window.ASSET_BASE_URL=${JSON.stringify(baseUrl)};</script>`;
    const styleInjection = `<style>
    *,*::before,*::after{-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:rgba(0,0,0,0)!important;}
    *:focus,*:focus-visible{outline:none!important;box-shadow:none!important;-webkit-focus-ring-color:transparent!important;}
    ::selection{background:transparent!important;}
  </style>`;
    const injection = styleInjection + scriptInjection;

    let content = rewriteUserAssets(html, baseUrl);
    if (content.includes('<head>')) {
      content = content.replace('<head>', '<head>' + injection);
    } else if (content.includes('<HEAD>')) {
      content = content.replace('<HEAD>', '<HEAD>' + injection);
    } else {
      content = injection + content;
    }
    return content;
  }
};
