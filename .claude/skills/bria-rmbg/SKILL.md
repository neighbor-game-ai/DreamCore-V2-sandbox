---
name: bria-rmbg
type: action
description: BRIA RMBG 2.0 (Replicate API)で画像の背景を除去。「背景を削除して」「背景を透過にして」などの指示で自動的に使用される。高精度な背景除去を提供。
allowed-tools: Bash, Read, AskUserQuestion
---

# BRIA RMBG 2.0 背景除去スキル

Replicate API 経由で BRIA RMBG 2.0 を使用して画像の背景を除去するスキル。

---

## 前提条件

1. **APIキー**: 環境変数 `REPLICATE_API_TOKEN` を設定
   - https://replicate.com/account/api-tokens でAPIキーを取得

```bash
export REPLICATE_API_TOKEN="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

2. **Python パッケージ**:

```bash
pip install replicate requests
```

---

## ツール一覧

| ツール | 説明 |
|-------|------|
| `remove-bg.py` | 背景除去 |

---

## 使用方法

### remove-bg.py - 背景除去

```bash
python3 ~/.claude/skills/bria-rmbg/remove-bg.py 入力画像 [-o 出力画像]
```

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-o`, `--output` | 出力ファイルパス | 入力を上書き |

### 例

```bash
# 上書き保存
python3 ~/.claude/skills/bria-rmbg/remove-bg.py photo.png

# 別名保存
python3 ~/.claude/skills/bria-rmbg/remove-bg.py photo.png -o photo-nobg.png
```

---

## 特徴

- **高精度**: BRIA の最新モデル RMBG 2.0 を使用
- **滑らかなエッジ**: 透明度の段階的な変化でより自然な結果
- **対応形式**: PNG, JPEG
- **料金**: 約 $0.018/画像 (55画像/$1)

---

## 使用例ワークフロー

### 単純な背景除去

```bash
# 写真の背景を除去
python3 ~/.claude/skills/bria-rmbg/remove-bg.py portrait.jpg -o portrait-nobg.png
```

### nanobanana と組み合わせ

```bash
# 1. 画像を生成
python3 ~/.claude/skills/nanobanana/generate.py "リアルなコーヒーカップ" -o coffee.png

# 2. BRIA RMBG で高精度背景除去
python3 ~/.claude/skills/bria-rmbg/remove-bg.py coffee.png
```

---

## API について

- **プラットフォーム**: Replicate
- **モデル**: `bria/remove-background`
- **料金**: 従量課金（約 $0.018/画像）

---

## ファイル構成

```
~/.claude/skills/bria-rmbg/
├── SKILL.md       # このドキュメント
└── remove-bg.py   # 背景除去スクリプト
```
