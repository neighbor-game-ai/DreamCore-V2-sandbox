---
name: nanobanana
description: Google Geminiの画像生成モデル（Nano Banana）で画像を生成・編集。「画像を生成して」「イラストを作って」「この画像を編集して」などの指示で自動的に使用される。「ステッカーを何個か作って」「複数のアイコンを生成して分割」などステッカーシート生成・分割にも対応。
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Nano Banana 画像生成スキル

Google Gemini の画像生成モデルを使用して画像を生成・編集するスキル。

---

## 生成前の確認フロー

**重要**: 画像生成を開始する前に、必ず `AskUserQuestion` ツールで以下を確認すること。

### 確認項目

**共通（常に確認）:**
| 項目 | 選択肢 | 説明 |
|------|--------|------|
| **モデル** | `pro` / `flash` | pro=高品質、flash=高速・低コスト |
| **参照画像** | あり / なし | スタイルをコピーする元画像があるか |
| **背景除去** | Vision API / マゼンタ除去 / 不要 | 参照画像あり→Vision推奨、なし→マゼンタ推奨 |

**複数画像生成の場合のみ追加で確認:**
| 項目 | 選択肢 | 説明 |
|------|--------|------|
| **生成方式** | シート→split / 並列生成 | シート→split推奨（効率的） |

### 質問フロー

**単一画像の場合（3項目）:**
```
画像生成の設定を確認させてください:

1. モデル: pro（高品質）/ flash（高速）
2. 参照画像: ありますか？
3. 背景除去: Vision API / マゼンタ除去 / 不要
```

**複数画像の場合（4項目）:**
```
複数画像生成の設定を確認させてください:

1. モデル: pro（高品質）/ flash（高速）
2. 参照画像: ありますか？
3. 背景除去: Vision API / マゼンタ除去 / 不要
4. 生成方式: シート生成→分割（推奨）/ 個別に並列生成
```

**判断基準:** ユーザーの依頼に「複数」「いくつか」「〇個」「セット」などの表現があれば複数画像として扱う

### 推奨設定

| ケース | モデル | 背景除去 | 大量生成 |
|--------|--------|----------|----------|
| 参照画像のスタイルコピー | pro | Vision API | シート→split |
| シンプルなアイコン | flash | マゼンタ除去 | シート→split |
| 複雑なイラスト | pro | Vision API | 並列 |
| プロトタイプ・テスト | flash | マゼンタ除去 | 並列 |

### 背景除去方法の選び方

| 方法 | 適したケース |
|------|-------------|
| **Vision API** | 実写画像、写真風、複雑な背景、グラデーション背景 |
| **マゼンタ除去** | イラスト、シンプルな図形、線画、フラットデザイン |

**判断基準:**
- 実写・写真風 → **Vision API**
- イラスト・線画・シンプル → **マゼンタ除去**

### 参照画像の取り扱い

ユーザーが参照画像を渡してきた場合:

1. **画像をローカルに保存**: 作業ディレクトリに `reference.png` などで保存
2. **generate.pyに参照**: `-r` オプションでパスを指定

```bash
# 1. 参照画像を保存（Writeツール or ユーザー指定のパス）
# 2. 参照画像を使って生成
python3 ~/.claude/skills/nanobanana/generate.py "Same exact style as this image. Object: coffee cup. NO text." \
  -r /path/to/reference.png -o output.png
```

**注意:**
- ユーザーがペーストした画像 → まずローカルファイルとして保存してから参照
- ユーザーがパスを指定 → そのパスをそのまま `-r` に渡す

## ツール一覧

| ツール | 説明 |
|-------|------|
| `generate.py` | 画像生成 |
| `remove-bg-magenta.py` | マゼンタ背景除去（1px収縮含む） |
| `remove-bg-vision.py` | Vision API背景除去 |
| `erode.py` | 透過画像エッジ収縮 |
| `split_transparent.py` | 透過画像を個別オブジェクトに分割 |

## 前提条件

1. **APIキー**: 環境変数 `GEMINI_API_KEY` を設定
2. **Vision API**: macOS 14.0 (Sonoma) 以降が必要

---

## 1. generate.py - 画像生成

```bash
python3 ~/.claude/skills/nanobanana/generate.py "プロンプト" [オプション]
```

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-o`, `--output` | 出力ファイルパス | `generated_image.png` |
| `-a`, `--aspect-ratio` | アスペクト比 (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`) | `1:1` |
| `-m`, `--model` | モデル (`flash`, `pro`) | `pro` |
| `--magenta-bg` | マゼンタ背景で生成 | なし |
| `-r`, `--reference` | 参照画像のパス | なし |

### 例

```bash
# シンプルな生成
python3 ~/.claude/skills/nanobanana/generate.py "かわいい猫のイラスト"

# 参照画像のスタイルをコピー
python3 ~/.claude/skills/nanobanana/generate.py "Same exact style as this image. Object: coffee cup. NO text." -r reference.png -o coffee.png

# マゼンタ背景で生成（後で透過処理用）
python3 ~/.claude/skills/nanobanana/generate.py "シンプルな星のアイコン" --magenta-bg -o star.png
```

---

## 2. remove-bg-magenta.py - マゼンタ背景除去

マゼンタ/ピンク背景を色ベースで透過にする。

```bash
python3 ~/.claude/skills/nanobanana/remove-bg-magenta.py 入力画像 [-o 出力画像]
```

### 仕組み
- R>180, G<100, B>100 の色を透過
- 1px収縮でエッジのピンク残りを除去

### 例

```bash
# 上書き保存
python3 ~/.claude/skills/nanobanana/remove-bg-magenta.py star.png

# 別名保存
python3 ~/.claude/skills/nanobanana/remove-bg-magenta.py star.png -o star-transparent.png
```

---

## 3. remove-bg-vision.py - Vision API背景除去

macOS Vision APIで背景を自動検出して透過にする。

```bash
python3 ~/.claude/skills/nanobanana/remove-bg-vision.py 入力画像 [-o 出力画像]
```

### 特徴
- 前景を自動検出
- 参照画像のスタイル（背景含む）を維持した画像に最適
- macOS 14.0以降が必要

### 例

```bash
# 上書き保存
python3 ~/.claude/skills/nanobanana/remove-bg-vision.py coffee.png

# 別名保存
python3 ~/.claude/skills/nanobanana/remove-bg-vision.py coffee.png -o coffee-transparent.png
```

---

## 4. erode.py - エッジ収縮

透過画像のエッジを任意のピクセル数だけ収縮する。

```bash
python3 ~/.claude/skills/nanobanana/erode.py 入力画像 [-o 出力画像] [-i 収縮量]
```

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-o`, `--output` | 出力画像パス | 入力を上書き |
| `-i`, `--iterations` | 収縮量（ピクセル数） | `1` |

### 例

```bash
# 1px収縮（デフォルト）
python3 ~/.claude/skills/nanobanana/erode.py icon.png

# 3px収縮
python3 ~/.claude/skills/nanobanana/erode.py icon.png -i 3

# 別名保存
python3 ~/.claude/skills/nanobanana/erode.py icon.png -o icon-eroded.png -i 2
```

---

## 5. split_transparent.py - 透過画像分割

透過PNGを個別オブジェクトに分割（ステッカーシート用）。

```bash
python3 ~/.claude/skills/nanobanana/split_transparent.py 入力画像 [出力ディレクトリ]
```

### 仕組み
- アルファチャンネル（透明部分）で境界を検出
- 連結成分ごとに切り出し
- 左上→右下の順で番号付け

### 例

```bash
python3 ~/.claude/skills/nanobanana/split_transparent.py sheet.png ./stickers/
# → stickers/sticker_01.png, sticker_02.png, ...
```

---

## ベストプラクティス

- **素材の大量生成時**: 個別に生成するより、1枚のシートに複数オブジェクトを生成して `split_transparent.py` で分割する方が効率的。API呼び出し回数を削減でき、スタイルの一貫性も保てる。

---

## ワークフロー例

### 透過ステッカー生成（単純なオブジェクト）

```bash
# 1. マゼンタ背景で生成
python3 ~/.claude/skills/nanobanana/generate.py "シンプルな星のアイコン" --magenta-bg -o star.png

# 2. マゼンタ除去
python3 ~/.claude/skills/nanobanana/remove-bg-magenta.py star.png
```

### 参照画像スタイルコピー + 透過

```bash
# 1. 参照画像のスタイルで生成（スタイル維持のためマゼンタ指定なし）
python3 ~/.claude/skills/nanobanana/generate.py "Same exact style as this image. Object: coffee cup. NO text." -r reference.png -o coffee.png

# 2. Vision APIで背景除去
python3 ~/.claude/skills/nanobanana/remove-bg-vision.py coffee.png
```

### ステッカーシート生成 → 分割

```bash
# 1. マゼンタ背景で複数ステッカー生成
python3 ~/.claude/skills/nanobanana/generate.py \
  "Multiple separate kawaii stickers with LARGE gaps: coffee cup, donut, cat, star. Arranged in 2x2 grid, well separated." \
  --magenta-bg -o sheet.png

# 2. 背景透過
python3 ~/.claude/skills/nanobanana/remove-bg-magenta.py sheet.png

# 3. 個別分割
python3 ~/.claude/skills/nanobanana/split_transparent.py sheet.png ./stickers/
```

**プロンプトのコツ:**
- `LARGE gaps between them` - 間隔を広く
- `well separated` - 重ならないように
- `Arranged in XxY grid` - グリッド配置指定

---

## モデル比較

| モデル | ID | 特徴 |
|-------|-----|------|
| Flash | `gemini-2.5-flash-image` | 高速、コスト効率 |
| Pro | `gemini-3-pro-image-preview` | 高品質、複雑な指示に対応 |

## ファイル構成

```
~/.claude/skills/nanobanana/
├── SKILL.md              # このドキュメント
├── generate.py           # 画像生成
├── remove-bg-magenta.py  # マゼンタ背景除去（1px収縮含む）
├── remove-bg-vision.py   # Vision API背景除去
├── remove-bg.swift       # Vision API実装（Swift）
├── erode.py              # エッジ収縮（単体）
└── split_transparent.py  # 透過画像分割
```
