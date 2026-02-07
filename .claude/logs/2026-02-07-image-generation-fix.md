# 画像生成の多様性・品質改善

**日付:** 2026-02-07
**作業者:** Claude
**ステータス:** 完了・本番デプロイ済み

---

## 問題

ゲーム制作時に生成される画像が毎回同じような見た目になる（ドラゴン、鎧の戦士、ファンタジーRPG風）。ユーザーがビジュアルスタイルを選択しても反映されない。加えて、画像のアスペクト比がゲームコードの描画サイズと合わず歪む。

## 根本原因

### 1. Sonnet によるプロンプト上書き（P1）

`analyzeImageDirection()` が Sonnet を呼び出し、Gemini のスタイル反映済みプロンプトを中世ファンタジー風に書き換えていた。

**経緯:**
- 1/9: 初期実装（styleHints で style を直接注入 → 画像多様）
- 1/10: analyzeImageDirection 追加（Haiku、向きだけ → 問題なし）
- 1/11: Haiku → Sonnet に変更（プロンプト全体を上書きし始める）
- 1/12: styleHints 削除（Sonnet 上書きで最後のセーフティネット消失）
- 2/1: Modal Sonnet 移行（STYLE.md 未参照のまま）

### 2. アスペクト比の歪み

- 全画像を 512x512（正方形）で生成
- `sharp.trim()` で透明部分を削除 → 不規則サイズ（例: 320x450）
- ゲームコードが固定サイズ（60x60）で描画 → 歪み

## 実施内容

### Fix 1: Sonnet フォールバック廃止（claudeRunner.js）

`analyzeImageDirection()` を async AI 呼び出しから sync ルールベース関数に変更:
1. Gemini のプロンプトに `facing` があればそのまま信頼（最優先）
2. specs に向き情報があれば追加
3. デフォルト方向（player=right, enemy=left）

**AIコスト削減:** 画像1枚あたり Sonnet API 1回 → 0回

### Fix 2: geminiResult.specs フォールバック（claudeRunner.js）

新規ゲームでは `readSpec()` が null（specs は画像生成後に保存される）。
`geminiResult.specs` を直接テキスト化して `gameSpec` に渡すようにした。

### Fix 3: style パラメータ復活（geminiClient.js）

エディタの手動画像生成で `style` パラメータが無視されていた問題を修正。
`styleHints` 辞書（pixel, anime, kawaii 等）を復元。

### Fix 4: buildEnhancedImagePrompt 上書き廃止（claudeRunner.js）

specs にキャラ外見情報がある場合、Gemini の元プロンプトを丸ごと置き換えていた。
→ 全ケースで「Gemini の元プロンプト + 向き追加」に統一。

### Fix 5: facing 正規表現の拡張（claudeRunner.js）

`/facing\s+(right|left|up|down)/` → `/facing\s+\w/`
Gemini が `facing front`, `facing the camera` 等を書くケースに対応。

### ~~Fix 6: 正方形パディング（geminiClient.js）~~ → 撤回

当初 `trim()` 後に正方形パディングを追加したが、後に以下の矛盾を発見し撤回:
- 正方形パディング → `img.height/img.width` が常に 1.0 → アスペクト比計算が無効化
- 当たり判定にも透明余白が含まれてしまう

**最終方針:** trim のみ（パディングなし）。ゲームコード側で比率計算。

### Fix 7: アスペクト比維持指示（createPrompt.js, updatePrompt.js）

Gemini にコード生成時「`p.image()` で元画像のアスペクト比を維持して描画」を指示。

### Fix 8: p5js-setup スキルテンプレート修正（SKILL.md）

Gemini がスキルのサンプルコードをそのままコピーする問題を発見。
`drawSprite` ヘルパーと全 `p.image()` の例を `50, 50` 固定から比率計算に変更:
```javascript
// Before: drawSprite(p, img, x, y, w, h, fallbackColor) → 50, 50 固定
// After:  drawSprite(p, img, x, y, displayW, fallbackColor) → img.height/img.width で計算
```
`★画像描画の注意` セクションを追加し、`✅正しい / ❌禁止` パターンを明示。

### Fix 9: 正方形パディング撤回（geminiClient.js）

Fix 8 でゲームコード側が修正されたため、Fix 6 の正方形パディングを削除。
trim 後の非正方形画像をそのまま保存する運用に変更。

## テスト結果

### テスト1: ピカチュウ風ゲーム
- player.png: `cute yellow electric mouse...pixel art style` → Sonnet 上書きなし ✅
- facing 重複/矛盾を発見 → Fix 4, 5 で解消

### テスト2: アルプスの少女ゲーム
- player.png: `cute alpine girl...facing front` → facing front を正規表現が検出 ✅（Fix 5 後）
- `facing` 重複なし ✅

### テスト3: 鬼滅の刃風ゲーム
- player.png: `demon slayer boy...facing up` → テーマ忠実 ✅
- enemy.png: `japanese demon oni...facing down` → 縦スクロール対応 ✅
- 正方形パディング: `1024x1024 → trimmed 601x904 → square 904x904` ✅
- specs フォールバック: 動作確認 ✅

### テスト4: キリン避けゲーム（アスペクト比最終検証）
- player（キリン）: 極端に縦長 → `286x857` trimmed → 潰れなし ✅
- enemy（ハンバーガー）: 横長 → `661x647` trimmed → 歪みなし ✅
- Gemini がスキルテンプレートの影響で `img.height/img.width` を自発的に使用 ✅
- 当たり判定: 円形判定 + 0.8 寛容度、透明余白に依存せず ✅
- `p.image(img, x, y, 50, 50)` は一箇所もなし ✅

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/claudeRunner.js` | analyzeImageDirection 簡素化、Sonnet 廃止、specs フォールバック、facing 正規表現拡張 |
| `server/geminiClient.js` | style パラメータ復活、正方形パディング追加→撤回（trim のみ） |
| `server/prompts/createPrompt.js` | アスペクト比維持指示追加 |
| `server/prompts/updatePrompt.js` | アスペクト比維持指示追加 |
| `.claude/skills/p5js-setup/SKILL.md` | drawSprite・画像描画例を比率計算パターンに変更 |

## コミット

- `68b0ff9` fix(image-gen): remove Sonnet override, trust Gemini's original prompts
- `bebf120` fix(image-gen): remove dead code in analyzeImageDirection case 3
- `aa97a41` fix(image-gen): don't replace Gemini's prompt with specs character appearance
- `a1a69a0` fix(image-gen): prioritize Gemini's facing direction over specs
- `0c58b01` fix(image-gen): preserve aspect ratio with square padding + code hints
- `a19b269` fix(skill): replace fixed 50x50 image drawing with aspect-ratio-preserving pattern in p5js-setup
- `fefa13f` fix(image): remove square padding — game code now handles aspect ratio

## 学び・注意点

- **AI の割り込みは最小限に**: Gemini のプロンプトは信頼し、向きだけ足す。上書きしない。
- **Sonnet は賢すぎる**: 「向きだけ判断して」と頼んでも、プロンプト全体を書き換える。
- **スキルテンプレートの影響力**: Gemini はスキルのサンプルコードをほぼそのままコピーする。テンプレートのコード品質 = 生成コードの品質。
- **応急処置と根本修正は矛盾しうる**: 正方形パディング（応急）と比率計算（根本）を両方入れると、パディングが比率を 1.0 にしてしまい無効化される。根本修正ができたら応急処置は外す。
- **テスト駆動**: 本番ログで実際のプロンプトを確認しながらバグを発見・修正した。
