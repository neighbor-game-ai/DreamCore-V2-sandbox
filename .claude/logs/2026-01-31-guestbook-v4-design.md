# ゲストブックv4デザイン実装

**日付:** 2026-01-31
**作業者:** Claude
**ブランチ:** main

## 背景

ゲームプレイページのゲストブック機能について、v2のベースデザインにv3のゲームタグ機能を組み合わせた「v4」デザインを作成し、本番環境に適用した。

## サンプルファイル

| バージョン | ファイルパス | URL | 説明 |
|-----------|-------------|-----|------|
| v2 | `public/game-sample-tobias-v2.html` | http://35.200.79.157:3005/game-sample-tobias-v2.html | 落書き帳風デザインのベース |
| v3 | `public/game-sample-tobias-v3.html` | http://35.200.79.157:3005/game-sample-tobias-v3.html | Creator向けゲームタグ付き |
| **v4** | `public/game-sample-tobias-v4.html` | http://35.200.79.157:3005/game-sample-tobias-v4.html | **採用版**: v2ベース + ゲームタグ |

## v4デザインの特徴

### 1. ヘッダー
- "Guest Book" + "Live Feed (count)" + "X online"
- 緑色のLiveドット（アニメーション付き）

### 2. 展開可能なVisitor Groups
- スタック表示のアバター（最大4つ）
- クリックで展開 → 各訪問者のゲームタグを表示
- Collapseボタンで折りたたみ

```html
<div class="gb-visitors-container">
    <div class="gb-visitors-group" data-expandable="true">
        <div class="gb-stacked-avatars">...</div>
        <span class="gb-visitors-text"><strong>Name</strong> and X others visited.</span>
        <svg class="gb-visitors-arrow">...</svg>
    </div>
    <div class="gb-visitors-list">
        <div class="gb-visitor-item">
            <div class="gb-visitor-avatar">🐱</div>
            <span class="gb-visitor-text">
                <strong>ねこすき</strong> visited
                <span class="gb-visitor-game blue">このゲーム</span>
            </span>
        </div>
        <!-- ... more visitors ... -->
        <button class="gb-collapse-btn">Collapse</button>
    </div>
</div>
```

### 3. メッセージ（左寄り）
- 吹き出しスタイル（三角形のしっぽ付き）
- ⚡スパークル装飾
- フッターにゲームタグ + いいね + Reply

### 4. リアクション（右寄り）
- v2スタイル: インラインゲームタグなし
- 絵文字 | 縦線 | 名前 + アバター

### 5. 単独訪問（中央）
- シンプルな「Name visited」表示
- ゲームタグなし

### 6. ゲームタグカラー
| 色 | クラス | カラーコード | 用途例 |
|----|--------|-------------|--------|
| Blue | `.blue` | #007AFF | このゲーム |
| Purple | `.purple` | #AF52DE | 別のゲーム |
| Green | `.green` | #34C759 | 冒険RPG |
| Orange | `.orange` | #FF9500 | パズル |

## 実施内容

### 1. v4サンプル作成
- v2のゲストブックデザインをベースに
- v3のゲームタグ機能を組み合わせ
- 展開可能なvisitor groupsを追加

### 2. 本番game.htmlへの適用
- CSSに展開可能グループのスタイルを追加
- フィードHTMLをv4構造に更新
- JavaScriptに展開/折りたたみ機能を追加
- Enterキーでコメント送信機能を追加

### 3. デプロイ
- コミット: `a0c2825`
- GCE本番環境に反映

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `public/game-sample-tobias-v4.html` | v4サンプル新規作成 |
| `public/game.html` | v4デザインを本番適用 |

## CSS追加項目

```css
/* 展開可能Visitor Groups */
.gb-visitors-container { ... }
.gb-visitors-group { ... }
.gb-visitors-group.expanded { ... }
.gb-stacked-avatars { ... }
.gb-stacked-avatar { ... }
.gb-visitors-list { ... }
.gb-visitors-list.visible { ... }
.gb-visitor-item { ... }
.gb-visitor-avatar { ... }
.gb-visitor-text { ... }
.gb-visitor-game { ... }
.gb-visitor-game.blue/purple/green/orange { ... }
.gb-collapse-btn { ... }
```

## JavaScript追加項目

```javascript
// Expandable Visitors Groups
document.querySelectorAll('.gb-visitors-group[data-expandable="true"]')
    .forEach(group => { ... });

// Collapse buttons
document.querySelectorAll('.gb-collapse-btn')
    .forEach(btn => { ... });

// Enter key to send comment
gbCommentInput.addEventListener('keypress', ...);
```

## 確認URL

- **本番ゲームページ**: http://35.200.79.157:3005/game/11a52dbb-48b6-4ac9-b61c-0655b02524d9
- **v4サンプル**: http://35.200.79.157:3005/game-sample-tobias-v4.html

## 学び・注意点

1. **デザインのバージョン管理**
   - サンプルファイル（v2, v3, v4）を残しておくことで比較・参照が容易
   - 採用版がどれかを明確に記録しておく

2. **展開可能UIの実装**
   - `data-expandable="true"` 属性で対象を識別
   - `.expanded` / `.visible` クラスで状態管理
   - `e.stopPropagation()` でイベントバブリング防止（Collapseボタン）

3. **有機的なレイアウト**
   - メッセージ: `align-self: flex-start`（左寄り）
   - リアクション: `align-self: flex-end`（右寄り）
   - 訪問者グループ: `align-self: center`（中央）
