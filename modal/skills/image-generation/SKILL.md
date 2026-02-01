---
name: image-generation
description: 2Dゲームのスプライト画像を生成。Gemini Image APIで生成し、透過背景処理を自動実行。
---

# 画像生成スキル

2Dゲームのスプライト画像を生成する。3D/Three.js では使用しない。

## 使い方

```bash
python /global/scripts/generate_image.py \
  --prompt "画像の説明" \
  --output "assets/ファイル名.png" \
  --transparent
```

## 仕様

| 項目 | 値 |
|------|-----|
| サイズ | 512x512 (固定) |
| 形式 | PNG (透過) |
| 上限 | 1リクエストあたり3枚まで |
| API | Gemini 2.5 Flash Image |

## 透過処理

`--transparent` 指定時（デフォルト）:
1. プロンプトに「on solid magenta (#FF00FF) background」が自動追加
2. マゼンタピクセル (R>180, G<100, B>100) を透明化
3. 1px erosion でエッジにじみ除去
4. 自動トリミング

## コード内での参照

生成した画像は `assets/xxx.png` で参照:

```javascript
// P5.js
let playerImg;
function preload() {
  playerImg = loadImage('assets/player.png');
}

// HTML/Canvas
const img = new Image();
img.src = 'assets/player.png';
```

## 使用条件

- 2Dゲームのみ使用
- 3D/Three.js では画像生成しない（ジオメトリとマテリアルで表現）
- 幾何学図形のみのゲームでは不要

## 画像が必要な場面

- キャラクター（プレイヤー、敵、NPC）
- アイテム（コイン、パワーアップ、武器）
- 具体的なテーマのオブジェクト（車、動物、食べ物など）

## 画像が不要な場面

- 幾何学図形のみ（丸、四角、三角）
- 数字やテキストのみ
- 抽象的なパズル
- 3Dゲーム全般

## プロンプトのコツ

- ゲームアセットであることを明記: `game sprite`, `icon`
- 向きを指定: `facing right`, `side view`, `top-down view`
- スタイルを含める: `pixel art`, `kawaii style`, `flat design`
- 具体的な特徴: 色、サイズ感、表情など

### 向きの判断

ゲームの種類と仕様に基づいて適切な向きを判断すること:
- 横スクロール: プレイヤーは進行方向、敵はプレイヤー方向
- 縦スクロール: 上から見た視点か、進行方向に応じて判断
- その他: ゲームの文脈に合わせて自然な向きを選択

## 例

```bash
# プレイヤーキャラクター
python /global/scripts/generate_image.py \
  --prompt "cute cat character, game sprite, facing right, side view, kawaii style" \
  --output "assets/player.png" \
  --transparent

# 敵キャラクター
python /global/scripts/generate_image.py \
  --prompt "slime monster, game sprite, facing left, bouncy, blue color" \
  --output "assets/enemy.png" \
  --transparent

# アイテム
python /global/scripts/generate_image.py \
  --prompt "golden coin, collectible item, shiny, pixel art style" \
  --output "assets/coin.png" \
  --transparent
```
