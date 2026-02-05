/**
 * Notifications Page - Game Creator
 * Updated for Supabase Auth
 */

class NotificationsApp {
  constructor() {
    this.currentUser = null;
    this.userId = null;
    this.notifications = [];
    this.currentFilter = 'all';

    // DOM elements
    this.loadingState = document.getElementById('loadingState');
    this.emptyState = document.getElementById('emptyState');
    this.notificationsList = document.getElementById('notificationsList');
    this.backBtn = document.getElementById('backBtn');
    this.markAllReadBtn = document.getElementById('markAllReadBtn');
    this.filterTabs = document.querySelectorAll('.notifications-tab');
  }

  async init() {
    // Check authentication using Supabase Auth
    const session = await DreamCoreAuth.getSession();
    if (!session) {
      this.redirectToLogin();
      return;
    }

    // V2 Waitlist: Check access permission
    const { allowed, authError } = await DreamCoreAuth.checkAccess();
    if (authError) {
      window.location.href = '/';  // Auth error → login page
      return;
    }
    if (!allowed) {
      window.location.href = '/waitlist.html';  // Not approved → waitlist
      return;
    }

    this.currentUser = session.user;
    this.userId = session.user.id;

    this.setupListeners();
    await this.loadNotifications();
  }

  redirectToLogin() {
    window.location.href = '/';
  }

  setupListeners() {
    // Back button
    this.backBtn?.addEventListener('click', () => {
      window.location.href = '/discover';
    });

    // Mark all as read
    this.markAllReadBtn?.addEventListener('click', () => this.markAllAsRead());

    // Filter tabs
    this.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const filter = tab.dataset.filter;
        this.setFilter(filter);
      });
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switch (tab) {
          case 'discover':
            window.location.href = '/discover';
            break;
          case 'create':
            window.location.href = '/create';
            break;
          case 'notifications':
            // Already on notifications
            break;
          case 'profile':
            // Use /@username if available, otherwise /mypage.html
            DreamCoreAuth.getMyProfileUrl().then(url => {
              window.location.href = url;
            });
            break;
        }
      });
    });

    // Zapping button
    document.getElementById('navZappingBtn')?.addEventListener('click', () => {
      window.location.href = '/discover?zap=1';
    });
  }

  setFilter(filter) {
    this.currentFilter = filter;

    // Update active tab
    this.filterTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });

    this.renderNotifications();
  }

  async loadNotifications() {
    try {
      const response = await DreamCoreAuth.authFetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        this.notifications = data.notifications || [];
      } else {
        // If API doesn't exist yet, use sample data
        this.notifications = this.getSampleNotifications();
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
      // Use sample data for demo
      this.notifications = this.getSampleNotifications();
    }

    this.renderNotifications();
  }

  getSampleNotifications() {
    const now = new Date();
    return [
      {
        id: '1',
        type: 'system',
        title: 'ゲームクリエイター v2.0 リリース',
        message: '新機能が追加されました。AIによる画像生成機能、スプライトシート対応など、より創造的なゲーム制作が可能になりました。',
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        read: false,
        icon: 'announcement'
      },
      {
        id: '2',
        type: 'project',
        title: 'ゲームが公開されました',
        message: '「スペースシューター」が正常に公開されました。共有リンクをコピーして友達にシェアしましょう！',
        createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        read: false,
        projectId: 'demo-project-1',
        icon: 'success'
      },
      {
        id: '3',
        type: 'system',
        title: 'メンテナンスのお知らせ',
        message: '1月20日 AM2:00〜AM5:00にシステムメンテナンスを実施します。この間はサービスをご利用いただけません。',
        createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        read: true,
        icon: 'warning'
      },
      {
        id: '4',
        type: 'project',
        title: 'コメントが届きました',
        message: '「パズルゲーム」にユーザーからコメントが届きました。',
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        read: true,
        projectId: 'demo-project-2',
        icon: 'comment'
      },
      {
        id: '5',
        type: 'system',
        title: 'ようこそゲームクリエイターへ',
        message: 'アカウント作成が完了しました。チャットで話しかけるだけで、あなただけのオリジナルゲームが作れます。',
        createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        read: true,
        icon: 'welcome'
      }
    ];
  }

  renderNotifications() {
    // Hide loading
    this.loadingState?.classList.add('hidden');

    // Filter notifications
    let filtered = this.notifications;
    if (this.currentFilter !== 'all') {
      filtered = this.notifications.filter(n => n.type === this.currentFilter);
    }

    // Show empty state if no notifications
    if (filtered.length === 0) {
      this.emptyState?.classList.remove('hidden');
      this.notificationsList?.classList.add('hidden');
      return;
    }

    this.emptyState?.classList.add('hidden');
    this.notificationsList?.classList.remove('hidden');

    // Group by date
    const groups = this.groupByDate(filtered);

    // Render
    let html = '';
    for (const [dateLabel, items] of Object.entries(groups)) {
      html += `<div class="notifications-date-divider"><span>${dateLabel}</span></div>`;
      items.forEach((notification, index) => {
        html += this.renderNotificationItem(notification, index);
      });
    }

    this.notificationsList.innerHTML = html;

    // Add click handlers
    this.notificationsList.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        this.handleNotificationClick(id);
      });
    });
  }

  groupByDate(notifications) {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(today - 7 * 24 * 60 * 60 * 1000);

    notifications.forEach(notification => {
      const date = new Date(notification.createdAt);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      let label;
      if (dateOnly >= today) {
        label = '今日';
      } else if (dateOnly >= yesterday) {
        label = '昨日';
      } else if (dateOnly >= thisWeek) {
        label = '今週';
      } else {
        label = '以前';
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(notification);
    });

    return groups;
  }

  renderNotificationItem(notification, index) {
    const iconHtml = this.getIconHtml(notification.icon, notification.type);
    const timeAgo = this.formatTimeAgo(notification.createdAt);
    const unreadClass = notification.read ? '' : 'unread';
    const badgeClass = notification.type;
    const badgeText = notification.type === 'system' ? 'システム' : 'プロジェクト';

    return `
      <div class="notification-item ${unreadClass}" data-id="${notification.id}" style="animation-delay: ${index * 0.05}s">
        <div class="notification-icon ${notification.icon || notification.type}">
          ${iconHtml}
        </div>
        <div class="notification-content">
          <div class="notification-title">${this.escapeHtml(notification.title)}</div>
          <div class="notification-message">${this.escapeHtml(notification.message)}</div>
          <div class="notification-meta">
            <span class="notification-time">${timeAgo}</span>
            <span class="notification-badge ${badgeClass}">${badgeText}</span>
          </div>
        </div>
      </div>
    `;
  }

  getIconHtml(iconType, type) {
    const icons = {
      announcement: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>',
      success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      comment: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      welcome: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
      default: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
    };

    return icons[iconType] || icons.default;
  }

  formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;

    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric'
    });
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async handleNotificationClick(id) {
    const notification = this.notifications.find(n => n.id === id);
    if (!notification) return;

    // Mark as read
    if (!notification.read) {
      notification.read = true;
      this.renderNotifications();

      // Call API to mark as read (if exists)
      try {
        await DreamCoreAuth.authFetch(`/api/notifications/${id}/read`, {
          method: 'POST'
        });
      } catch (e) {
        // Ignore API errors for demo
      }
    }

    // Navigate to project if applicable
    if (notification.projectId) {
      window.location.href = `/project/${notification.projectId}`;
    }
  }

  async markAllAsRead() {
    // Mark all as read locally
    this.notifications.forEach(n => n.read = true);
    this.renderNotifications();

    // Call API (if exists)
    try {
      await DreamCoreAuth.authFetch('/api/notifications/read-all', {
        method: 'POST'
      });
    } catch (e) {
      // Ignore API errors for demo
    }
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize i18n
  await DreamCoreI18n.init();
  document.title = DreamCoreI18n.t('page.notifications.title');

  const app = new NotificationsApp();
  app.init();
});
