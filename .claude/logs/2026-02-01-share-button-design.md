# 2026-02-01: シェアボタンデザイン試行

## 概要

ゲーム登録後のシェアポップアップおよび `/game/` ページのシェアパネルのデザインを複数回試行。最終的にユーザーの好みはシンプルな円形アイコンデザインに落ち着いた。

---

## 実施内容

### 1. シェアポップアップ機能追加

**目的:** ゲーム登録完了後にシェアを促す

| 項目 | 内容 |
|------|------|
| トリガー | `publish.js` でゲーム登録成功時 |
| UI | モーダル型ポップアップ |
| 対応SNS | X, Facebook, WhatsApp, LINE, Telegram, Email, SMS, Reddit, Threads |
| ユーティリティ | QRコード, URLコピー, ネイティブシェア |
| UTMパラメータ | 全リンクに付与（`utm_source`, `utm_medium`, `utm_campaign`） |

### 2. デザイン試行の経緯

#### Phase 1: アイコン + テキストボタン
- SNS名を表示するボタン
- ユーザーフィードバック: 「質素すぎる」

#### Phase 2: 任天堂スタイル（カード型）
- 4カラムグリッド配置
- カード型ボタン with ラベル
- ソフトシャドウ、グラデーションオーバーレイ
- バウンシーなホバーアニメーション
- ユーザーフィードバック: **「元のほうがよかった」**

#### Phase 3: シンプル円形アイコン（最終採用）
- アイコンのみの円形ボタン（48x48px）
- Flexbox wrap レイアウト
- フラットデザイン（影なし）
- 基本的なアニメーション（scale + translate）

### 3. `/game/` ページでの再試行

#### DreamCoreスタイル（任天堂 × 佐藤可士和）
試行内容:
- 大胆なヘッダー「友達に広めよう！」
- セクション分け（SNS / メッセージ / ツール）
- 角丸長方形カードボタン
- スタッガードアニメーション
- ユーザーフィードバック: **「元に戻して」**

### 4. 最終結果
シンプルな円形アイコンデザインに統一。

---

## 技術的な修正

### CSS変数の未定義問題
```css
/* 問題: var(--gray-800), var(--gray-700) が未定義 */
.share-btn.share-native { background: var(--gray-800); } /* 白になる */

/* 修正: 直接カラーコードを使用 */
.share-btn.share-native { background: #262626; }
```

### Web Share API フォールバック
```javascript
// 問題: API非対応時にボタンが非表示
if (!navigator.share) {
  nativeBtn.style.display = 'none';
}

// 修正: 常に表示、フォールバックでURLコピー
nativeBtn.onclick = async () => {
  if (navigator.share) {
    await navigator.share({ url, text });
  } else {
    await navigator.clipboard.writeText(url);
    showToast('URLをコピーしました');
  }
};
```

### タッチデバイス対応
```css
/* タップフィードバック */
.share-btn:active {
  transform: scale(0.92);
  opacity: 0.85;
}

/* ホバーはマウスデバイスのみ */
@media (hover: hover) {
  .share-btn:hover {
    transform: translateY(-3px) scale(1.05);
  }
}
```

---

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/publish.html` | シェアポップアップHTML追加 |
| `public/publish.css` | シェアポップアップスタイル |
| `public/publish.js` | シェア機能JS、UTMパラメータ |
| `public/game.html` | シェアパネルCSS/HTML（複数回変更→リバート） |

---

## 学び

1. **ユーザーの好みは予測できない** - 「任天堂らしく」と言われても、最終的にはシンプルなデザインが好まれた
2. **デザイン変更は小さく** - 大きな変更より、既存デザインの改善が受け入れられやすい
3. **CSS変数は定義を確認** - スコープ外で使用すると透明/白になる
4. **フォールバックは常に用意** - Web Share API等は非対応環境を考慮

---

## 関連コミット

```
eefff00 Revert "feat: シェアパネルをDreamCoreスタイルにリデザイン"
99bfcba feat: シェアパネルをDreamCoreスタイルにリデザイン
1cbee86 revert: シェアボタンをシンプルな円形アイコンデザインに戻す
85e5b78 fix: 未定義のCSS変数を直接カラーコードに置換
b46d8cd fix: その他ボタンを常に表示、非対応時はURLコピー
8ca4cfb feat: 任天堂スタイルのシェアボタンに改修
282ef7b feat: ゲームページのシェアパネルを新デザインに統一
91856ef fix: タッチデバイス用のタップフィードバックを追加
e0c3fca feat: シェアボタンをアイコンのみに変更、SNS追加
f34c3d5 style: シェアポップアップのデザイン改善
67e4472 feat: ゲーム登録後にシェアポップアップを表示
```
