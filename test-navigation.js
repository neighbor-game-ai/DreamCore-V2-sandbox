/**
 * test-navigation.js - Regression test for shared bottom navigation (currentTab no-op)
 *
 * Verifies that clicking the tab matching currentTab does NOT trigger navigation,
 * preventing the regression where notifications tab caused a page reload.
 *
 * Usage: node test-navigation.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

// --- Minimal DOM mock ---

function createMockDOM(tabs) {
  const listeners = {};
  const elements = tabs.map(tab => ({
    dataset: { tab },
    addEventListener(event, handler) {
      if (!listeners[tab]) listeners[tab] = [];
      listeners[tab].push(handler);
    }
  }));

  return {
    elements,
    listeners,
    clickTab(tabName) {
      (listeners[tabName] || []).forEach(fn => fn());
    }
  };
}

function runNavigationJS(mockWindow, mockDocument) {
  const code = fs.readFileSync(
    path.join(__dirname, 'public/js/modules/navigation.js'),
    'utf-8'
  );
  const context = vm.createContext({
    document: mockDocument,
    window: mockWindow,
    DreamCoreAuth: {
      getMyProfileUrl() {
        return Promise.resolve('/mypage');
      }
    },
    console
  });
  vm.runInContext(code, context);
  return context;
}

function createTestEnv(tabs) {
  const dom = createMockDOM(tabs);
  const navigations = [];

  const mockWindow = {
    location: {
      _href: '/current',
      get href() { return this._href; },
      set href(val) {
        navigations.push(val);
        this._href = val;
      }
    }
  };

  const mockDocument = {
    querySelectorAll(selector) {
      return {
        forEach(fn) { dom.elements.forEach(fn); }
      };
    },
    getElementById() { return null; }
  };

  return { dom, navigations, mockWindow, mockDocument };
}

// --- Tests ---

console.log('\n🧪 Navigation Module Regression Tests\n');

// Test 1: currentTab='notifications' → clicking notifications is no-op
console.log('Test 1: notifications tab no-op when currentTab="notifications"');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  ctx.setupBottomNav({ currentTab: 'notifications' });

  dom.clickTab('notifications');
  assert(navigations.length === 0, 'Clicking notifications tab does NOT navigate');

  dom.clickTab('discover');
  assert(navigations.length === 1 && navigations[0] === '/discover', 'Clicking discover tab navigates to /discover');
}

// Test 2: currentTab='profile' → clicking profile is no-op
console.log('\nTest 2: profile tab no-op when currentTab="profile"');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  ctx.setupBottomNav({ currentTab: 'profile' });

  dom.clickTab('profile');
  assert(navigations.length === 0, 'Clicking profile tab does NOT navigate');
}

// Test 3: currentTab='create' → clicking create is no-op, others navigate
console.log('\nTest 3: create tab no-op when currentTab="create"');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  ctx.setupBottomNav({ currentTab: 'create' });

  dom.clickTab('create');
  assert(navigations.length === 0, 'Clicking create tab does NOT navigate');

  dom.clickTab('notifications');
  assert(navigations.length === 1 && navigations[0] === '/notifications', 'Clicking notifications tab navigates to /notifications');
}

// Test 4: currentTab='discover' → clicking discover is no-op
console.log('\nTest 4: discover tab no-op when currentTab="discover"');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  ctx.setupBottomNav({ currentTab: 'discover' });

  dom.clickTab('discover');
  assert(navigations.length === 0, 'Clicking discover tab does NOT navigate');

  dom.clickTab('create');
  assert(navigations.length === 1 && navigations[0] === '/create', 'Clicking create tab navigates to /create');
}

// Test 5: onProfile callback takes precedence over currentTab for profile tab
console.log('\nTest 5: onProfile callback takes precedence over currentTab');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  let profileCallbackCalled = false;
  ctx.setupBottomNav({
    onProfile: function() { profileCallbackCalled = true; }
  });

  dom.clickTab('profile');
  assert(profileCallbackCalled, 'onProfile callback was called');
  assert(navigations.length === 0, 'No navigation triggered (callback handled it)');
}

// Test 6: No currentTab → all tabs navigate (no no-op)
console.log('\nTest 6: Without currentTab, all non-profile tabs navigate');
{
  const { dom, navigations, mockWindow, mockDocument } = createTestEnv([
    'discover', 'create', 'notifications', 'profile'
  ]);
  const ctx = runNavigationJS(mockWindow, mockDocument);
  ctx.setupBottomNav({});

  dom.clickTab('discover');
  dom.clickTab('create');
  dom.clickTab('notifications');
  assert(navigations.length === 3, 'All 3 tabs triggered navigation');
  assert(navigations[0] === '/discover', 'discover → /discover');
  assert(navigations[1] === '/create', 'create → /create');
  assert(navigations[2] === '/notifications', 'notifications → /notifications');
}

// --- Summary ---
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
