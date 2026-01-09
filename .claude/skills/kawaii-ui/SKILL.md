---
name: kawaii-ui
description: KAWAII UIスタイル。丸ゴシック体、ステッカー風ボタン、ポップなデザイン。
---

# KAWAII UI デザイン

## フォント

```css
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700&display=swap');

body {
  font-family: 'M PLUS Rounded 1c', sans-serif;
}
```

## ボタン（ステッカー風）

```css
.button {
  border-radius: 25px;
  background: linear-gradient(145deg, #FF69B4, #FF85C1);
  border: 3px solid white;
  box-shadow: 0 4px 15px rgba(255, 105, 180, 0.4);
  color: white;
  font-weight: 700;
  padding: 12px 24px;
  font-size: 18px;
}

.button:active {
  transform: scale(0.95);
}
```

## スコア表示

```css
.score {
  font-size: 24px;
  font-weight: 700;
  color: #FFD700;
  text-shadow: 2px 2px 0 #FF69B4;
}
```

## 完成イメージ

- おもちゃ箱のような「無害で楽しい」印象
- 頭身の低いコロコロしたキャラクター
- パステルネオンな色使い
