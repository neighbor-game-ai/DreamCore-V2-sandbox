# 画像生成の多様性低下 - 調査報告

**日付:** 2026-02-07
**ステータス:** 調査完了・修正案策定済み（CTO レビュー反映済み）
**深刻度:** P1（ユーザー体験に直接影響）

---

## 問題

ゲーム制作時に生成される画像が毎回同じような見た目になる（ドラゴン、鎧の戦士、ファンタジーRPG風）。ユーザーがビジュアルスタイルを選択しても反映されない。

### 本番ログでの証拠

ユーザーが **「futuristic」スタイルを選択** したにも関わらず:
- `player.png` → `medieval fantasy helmet, crimson cape, silver greatsword`
- `monster.png` → `wyvern dragon monster, bat-like wings, glowing yellow eyes`

---

## 根本原因

### 画像プロンプト生成フロー（現状）

Gemini が2回登場し、その間に Sonnet が割り込んでいる:

```
[Gemini 1回目] コード生成 (gemini-3-pro)
  → ゲームコード + images 配列 + specs を出力
  → ビジュアルガイドを受け取っているので、スタイルに沿ったプロンプトを生成
  → 例: {name: "player.png", prompt: "futuristic cyber soldier with neon visor..."}
  → specs にはスプライトの向き情報も含まれる

         ↓  ★ ここで Sonnet が割り込み ★

[Sonnet] analyzeImageDirection()
  → 元々は「facing right/left を足すだけ」の小さな関数だった
  → SPEC.md からファイル読込で向きを取得（server/claudeRunner.js:1867）
  → ★ 新規ゲームでは specs 保存が画像生成の後（L1899）なので常に null ★
  → ★ geminiResult.specs は既に存在するのに使われていない ★
  → Sonnet フォールバック: STYLE.md / ビジュアルガイドを渡していない
  → Sonnet が元プロンプトを完全に上書き → ファンタジーRPG風のプロンプトを返す

         ↓

[Gemini 2回目] 画像生成 (gemini-2.5-flash-image)
  → Sonnet が上書きしたプロンプトで画像生成
  → ドラゴン・鎧の戦士が出力される
```

**Gemini 1回目の元プロンプトは正しい。Sonnet が間に入ってそれを台無しにしている。**

### 該当コード

| 箇所 | ファイル:行 | 問題 |
|------|------------|------|
| Sonnet フォールバック | `server/claudeRunner.js:576-719` | STYLE.md なしでプロンプト全体を上書き |
| SPEC ファイル読込 | `server/claudeRunner.js:1867` | `this.readSpec()` は保存前なので null |
| SPEC 非同期保存 | `server/claudeRunner.js:1899-1902` | 画像生成の後に specs を保存 |
| style パラメータ未使用 | `server/geminiClient.js:328-332` | API で渡される style を無視 |
| style を API に送信 | `server/index.js:549-552` | style を渡しているが受け取り側で未使用 |

---

## なぜ Sonnet が入ってきたか: 経緯

### 1/9 (e52a3aa): 初期実装 — シンプルに動いていた

Gemini がコード + 画像プロンプトを生成。`geminiClient.js` に `styleHints` 辞書があり、style パラメータでプロンプトに直接注入:

```javascript
// geminiClient.js — 初期
const styleHints = {
  pixel: 'ピクセルアート風、8ビットスタイル、ドット絵',
  anime: 'アニメ風、日本のアニメスタイル',
  kawaii: 'かわいい、キュート、丸みのあるデザイン',
  // ...
};
enhancedPrompt = `${prompt}, ${styleHints[style]}`;
```

**→ Sonnet の割り込みなし。画像がユーザーのゲーム内容に応じて多様だった。**

### 1/10 (ec65258): 画像生成機能追加

Gemini のコード生成レスポンスに `images` 配列を追加。まだ `analyzeImageDirection` なし。

### 1/10 (8e088f4): SPEC.md 分割 — analyzeImageDirection 追加

SPEC.md を3ファイルに分割した際、「SPEC.md からスプライトの向きを読み取る」目的で `analyzeImageDirection()` を追加。フォールバックは **Haiku** で向きだけ判定。

**→ この時点では「向きを足すだけ」の小さな関数。問題なし。**

### 1/11 (2d2677b): Haiku → Sonnet に変更 — ★ スコープ逸脱の始まり

コミットメッセージ: `"Refactor: Use Sonnet for createInitialSpec and analyzeImageDirection"`
理由: `"better image direction analysis"`

**→ Sonnet は Haiku より賢いため、向きだけでなくプロンプト全体を書き換える挙動になった。元プロンプトの上書きが始まる。**

### 1/12 (e2f3c8f): Visual Style Selection 導入 — ★ 最後の砦が消える

- `geminiClient.js` から `styleHints` 辞書と `style` パラメータ処理を **丸ごと削除**
- コメント: `"Use the prompt directly - style should already be incorporated via AI interpreting the visual guideline"`
- 前提: ビジュアルガイドがメッセージに含まれるので、Gemini の元プロンプトにスタイルが反映される

**→ 前提は正しいが、Sonnet が元プロンプトを上書きするので意味がなくなった。**

### 2/1 (e59f5a0): ローカル CLI → Modal Sonnet に移行

本番環境でローカル Claude CLI が使えないため Modal Sonnet に移行。STYLE.md を渡さないまま移行。

### 2/5 (de86475): buildEnhancedImagePrompt 追加

SPEC.md からテーマ・キャラ外見を抽出してプロンプトを強化する関数を追加。
ただし新規ゲームでは SPEC.md がないため空振り。

### まとめ

| 時期 | 状態 | 画像の多様性 |
|------|------|-------------|
| 1/9〜1/10 | Gemini → styleHints 注入 → 画像生成 | **高い** |
| 1/10 | analyzeImageDirection 追加（Haiku、向きだけ） | 高い |
| 1/11 | Haiku → Sonnet に変更（プロンプト上書き開始） | **低下し始める** |
| 1/12 | styleHints 削除 + スタイル選択UI依存 | **さらに低下** |
| 2/1〜 | Modal Sonnet 移行 + STYLE.md 未参照 | **最低** |

**「向きを足すだけ」の小さな関数が、Sonnet 化でプロンプト全体を書き換える関数に膨張し、styleHints 削除で最後のセーフティネットもなくなった。**

---

## 修正案（CTO レビュー反映済み）

### 方針: Sonnet の割り込みを廃止し、Gemini の元プロンプトを信頼する

`createPrompt.js` は既に Gemini に向き・スタイルを含めるよう指示済み。Sonnet の割り込みは不要。

### 修正1: `geminiResult.specs` を画像生成に直接渡す（タイミング問題の解消）

**問題**: 画像生成時に `this.readSpec()` でファイルから読むが、新規ゲームでは specs がまだ保存されていない（保存は L1899 の非同期処理）。しかし `geminiResult.specs` は既に存在する。

**修正**: `geminiResult.specs` を `applyGeminiResult()` → `generateProjectImages()` → `analyzeImageDirection()` に直接渡す。

```javascript
// server/claudeRunner.js:1867 付近
// 変更前:
const gameSpec = this.readSpec(userId, projectId);  // 新規時は null

// 変更後:
const gameSpec = this.readSpec(userId, projectId)
  || this.formatSpecsFromGeminiResult(geminiResult.specs);  // Gemini の結果を直接使う
```

**効果**: 新規ゲームでも SPEC の向き情報・テーマ情報が画像生成に渡る。

### 修正2: `analyzeImageDirection()` を簡素化（Sonnet フォールバック廃止）

```javascript
// server/claudeRunner.js - analyzeImageDirection()

// 1. SPEC（ファイル or geminiResult）から向きが取れる場合
//    → 従来通り buildEnhancedImagePrompt() でテーマ・外見を補強
if (specDirection) {
  return this.buildEnhancedImagePrompt(originalPrompt, imageName, gameSpec, specDirection);
}

// 2. Gemini の元プロンプトに既に "facing" が含まれている場合 → そのまま使う
if (/facing\s+(right|left|up|down)/i.test(originalPrompt)) {
  return originalPrompt;
}

// 3. どちらもない場合 → geminiResult.specs の向き情報を使う、なければデフォルト
const specsDirection = this.getDirectionFromSpec(gameSpec, role);
if (specsDirection) {
  return `${originalPrompt}, facing ${specsDirection}, side view, 2D game sprite`;
}

// 4. 最終フォールバック: デフォルト方向
const defaultDirection = role === 'enemy' ? 'left' : 'right';
return `${originalPrompt}, facing ${defaultDirection}, side view, 2D game sprite`;
```

**ケース1は `buildEnhancedImagePrompt()` を使用** し、既存ゲームの SPEC.md からテーマ・キャラ外見を補強する。ケース2〜4は新規ゲーム向けで、Gemini の元プロンプトを最大限信頼する。ケース3で `geminiResult.specs` から方向を取得するため、縦スクロール・トップダウンゲームでも正しい向きが適用される。固定値フォールバック（ケース4）は本当に情報がない場合のみ。

### 修正3: `geminiClient.generateImage()` で style パラメータを復活

**問題**: エディタの手動画像生成で `style` を API 経由で渡している（`server/index.js:549-552`、`public/app.js:5819`）が、`geminiClient.js:328` で受け取っていない。

```javascript
// server/geminiClient.js - generateImage()
// 変更前:
const { prompt, size = '512x512', transparent = true } = options;

// 変更後:
const { prompt, style = '', size = '512x512', transparent = true } = options;

// styleHints を復活
let enhancedPrompt = prompt;
if (style) {
  const styleHints = {
    pixel: 'pixel art style, 8-bit retro',
    anime: 'anime style, Japanese animation',
    kawaii: 'kawaii style, cute, rounded design',
    realistic: 'realistic style, high quality',
    watercolor: 'watercolor painting style, soft touch',
    flat: 'flat design, simple, minimal'
  };
  if (styleHints[style]) {
    enhancedPrompt = `${prompt}, ${styleHints[style]}`;
  }
}
```

**効果**: エディタでユーザーが選んだスタイルが手動画像生成に反映される。

---

## 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `server/claudeRunner.js` | `analyzeImageDirection()` を簡素化（Sonnet フォールバック削除）+ `geminiResult.specs` を画像生成に渡す経路追加 |
| `server/geminiClient.js` | `generateImage()` で `style` パラメータを復活・`styleHints` 辞書を復元 |

サーバー側のみの変更。フロントエンド・Modal への変更なし。

---

## 補足: 追加で発見した問題

### 1. Sonnet 出力のマークダウンアーティファクト

本番ログで確認:
- `dark atmospheric background**`（末尾に `**`）
- `** pixel art large wyvern`（先頭に `**`）

→ Gemini 画像生成のプロンプトに `**` が混入し、画像品質に影響している可能性。
→ Sonnet 廃止で自然に解消。

---

## テスト計画

1. 新規ゲームを「futuristic」スタイルで作成 → 画像が SF 風であることを確認
2. 新規ゲームを「kawaii」スタイルで作成 → 画像がかわいい系であることを確認
3. 縦スクロールゲームを新規作成 → player が facing up、enemy が facing down であることを確認
4. 既存ゲームで画像再生成 → スタイルが維持されることを確認
5. エディタの手動画像生成で「ピクセルアート」選択 → ピクセルアート風の画像が生成されることを確認
6. スタイル未選択で作成 → Gemini のデフォルト動作（従来通り）を確認
7. 向き指定なしのプロンプト → `geminiResult.specs` から向きが取得されることを確認
