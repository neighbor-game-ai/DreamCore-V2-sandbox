---
name: image-generation
description: AI画像生成機能。チャット内で自動的にゲームに必要な画像を判断・生成。透過背景PNG対応。キャラクター、敵、アイテム等のゲームアセットを自動生成。
---

# AI画像生成 (チャット統合)

## 概要

GameCreatorMVPでは、チャットの中で自動的にゲームに必要な画像を判断し生成します。
ユーザーがゲームの説明をすると、AIが必要な画像を分析して自動生成し、ゲーム内で使用可能な形で保存します。

## チャット統合型の動作フロー

```
ユーザー: 「猫が魚を集めるゲームを作って」
    ↓
Gemini が自動判断:
  - player.png: 猫のキャラクターが必要
  - item.png: 魚のアイテムが必要
    ↓
画像を自動生成（透過背景PNG）
    ↓
assets/ ディレクトリに保存
    ↓
生成されたコードで assets/player.png, assets/item.png を参照
```

## 自動画像生成の仕組み

### 1. Geminiレスポンスの images フィールド

コード生成時、Geminiは必要に応じて `images` フィールドを返します：

```json
{
  "mode": "create",
  "files": [
    {"path": "index.html", "content": "..."}
  ],
  "images": [
    {
      "name": "player.png",
      "prompt": "cute cat character, game sprite, front view",
      "style": "kawaii"
    },
    {
      "name": "fish.png",
      "prompt": "golden fish, collectible item, shiny",
      "style": "kawaii"
    }
  ],
  "summary": "猫が魚を集めるゲームを作成"
}
```

### 2. 画像が必要な場面

以下のような場合に画像生成を含めてください：

- **キャラクターが必要**: 「猫の」「勇者の」「ロボットの」ゲーム
- **敵が必要**: 「敵を倒す」「モンスターが出る」
- **アイテムが必要**: 「アイテムを集める」「パワーアップ」
- **具体的なテーマ**: 「宇宙船」「車」「動物」など幾何学図形以外

### 3. 画像が不要な場合

- 幾何学図形のみ（四角、丸、三角など）
- 数字やテキストのみ
- 抽象的なパズル

## 透過背景（デフォルト）

全ての生成画像は**透過背景PNG**として生成されます。
ゲームアセットとして使いやすいよう、背景なしで生成されます。

```
生成時のプロンプト自動追加:
"transparent background, PNG format with alpha channel,
isolated game asset, no background, clean edges"
```

## スタイルオプション

| スタイル | 説明 | 適したゲーム |
|---------|------|-------------|
| pixel | ピクセルアート、8ビット | レトロゲーム、ドット絵 |
| anime | アニメ風 | RPG、アクション |
| kawaii | かわいい、丸み | カジュアルゲーム |
| realistic | 写実的 | シミュレーション |
| watercolor | 水彩画風 | アート系ゲーム |
| flat | フラットデザイン | モダンUI |

### スタイル自動判断

スタイルは以下の優先順で自動決定：
1. ユーザーが明示（「ピクセルアート風で」）
2. 検出されたスキル（P5.js→pixel, Three.js→realistic）
3. ゲーム内容から推測
4. デフォルト: kawaii

## 制限事項

- **1リクエストあたり最大3枚**
- 画像サイズ: 512x512（デフォルト）
- 不適切なコンテンツは生成不可

## コード内での参照方法

生成された画像は `assets/` ディレクトリに保存されます：

```javascript
// HTML/JavaScript
const playerImg = new Image();
playerImg.src = 'assets/player.png';

// P5.js
let playerImg;
function preload() {
  playerImg = loadImage('assets/player.png');
}

// Three.js
const texture = new THREE.TextureLoader().load('assets/player.png');
```

## 手動画像生成

チャット統合とは別に、手動で画像を生成することも可能です：

### 方法1: 🎨ボタン（画像生成モーダル）

UIの🎨ボタンから手動で画像を生成できます。

### 方法2: API直接呼び出し

```javascript
// POST /api/generate-image
const response = await fetch('/api/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'かわいい猫のキャラクター',
    style: 'kawaii',
    transparent: true  // デフォルトでtrue
  })
});
const { image } = await response.json();
// image = "data:image/png;base64,..."
```

## プロンプトのコツ

### 良いプロンプト例

```
"cute cat character, side view, walking animation frame"
"pixel art sword, golden handle, glowing blade"
"slime enemy, blue, bouncy, game sprite"
```

### ポイント

- 向き（front view, side view）を指定
- スタイル（pixel art, anime style）を明記
- ゲームアセットであることを示す（game sprite, icon）
- 具体的な特徴を含める

## 画像生成の検出キーワード

ユーザーメッセージに以下が含まれると画像が必要と判断：

- キャラクター関連: 「猫」「犬」「勇者」「プレイヤー」など
- 敵関連: 「敵」「モンスター」「ボス」
- アイテム関連: 「アイテム」「コイン」「宝」「武器」
- テーマ関連: 「宇宙船」「車」「飛行機」など
