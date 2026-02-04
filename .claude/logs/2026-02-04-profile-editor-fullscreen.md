# プロフィール編集モーダル フルスクリーン化

**日付:** 2026-02-04

## 背景

プロフィール編集モーダルを開くと、モーダルの下部とボトムナビゲーションバーが重なり、「+ カスタムリンクを追加」ボタンなどが操作できない問題が発生。

## 解決策の検討

| 案 | 内容 | 評価 |
|----|------|------|
| 1. パディング追加 | モーダル下部に 80px パディング | スクロール必要 |
| 2. ナビバー非表示 | モーダル表示時にナビを隠す | シンプル |
| 3. **フルスクリーン** | 画面全体を覆うモーダル | **採用** |
| 4. 別ページ遷移 | `/mypage/edit` ページ | オーバーヘッド |

**採用理由:** Instagram の編集画面と同じパターン。編集体験に集中できる。

## 実装内容

### CSS 変更 (`profile.css`)

モバイル時（480px以下）のスタイルを変更:

```css
@media (max-width: 480px) {
  .profile-modal-backdrop {
    padding: 0;
    background: #fff;
    backdrop-filter: none;
  }

  .profile-modal {
    border-radius: 0;
    height: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
  }

  .profile-modal-body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .profile-modal-footer {
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
}
```

### JS 変更 (`profile.js`)

ナビバーの表示/非表示を制御:

```javascript
showModal() {
  // ... existing code ...

  // Hide bottom navigation on mobile
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    bottomNav.style.display = 'none';
  }
}

close() {
  // ... existing code ...

  // Restore bottom navigation
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) {
    bottomNav.style.display = '';
  }
}
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/css/modules/profile.css` | モバイル時フルスクリーンスタイル |
| `public/js/modules/profile.js` | ナビバー表示/非表示制御 |

## 技術的ポイント

- `safe-area-inset-bottom`: iPhone のホームインジケーター領域を考慮
- `-webkit-overflow-scrolling: touch`: iOS でスムーズスクロール
- `flex-direction: column`: ヘッダー/ボディ/フッターを縦並び、ボディが残りスペースを埋める

## 結果

- プロフィール編集モーダルが画面全体を覆う
- ボトムナビゲーションと重ならない
- すべてのフォーム要素にアクセス可能

## コミット

- `cea40b1` - fix(profile): full-screen modal on mobile to avoid nav overlap
