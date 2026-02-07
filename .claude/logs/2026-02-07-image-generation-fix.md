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

### Fix 6: 正方形パディング（geminiClient.js）

`trim()` 後に最大辺で正方形に透明パディング:
```
512x512 → trim → 601x904 → pad → 904x904（正方形）
```

### Fix 7: アスペクト比維持指示（createPrompt.js, updatePrompt.js）

Gemini にコード生成時「`p.image()` で元画像のアスペクト比を維持して描画」を指示。

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

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/claudeRunner.js` | analyzeImageDirection 簡素化、Sonnet 廃止、specs フォールバック、facing 正規表現拡張 |
| `server/geminiClient.js` | style パラメータ復活、trim 後の正方形パディング |
| `server/prompts/createPrompt.js` | アスペクト比維持指示追加 |
| `server/prompts/updatePrompt.js` | アスペクト比維持指示追加 |

## コミット

- `68b0ff9` fix(image-gen): remove Sonnet override, trust Gemini's original prompts
- `bebf120` fix(image-gen): remove dead code in analyzeImageDirection case 3
- `aa97a41` fix(image-gen): don't replace Gemini's prompt with specs character appearance
- `a1a69a0` fix(image-gen): prioritize Gemini's facing direction over specs
- `0c58b01` fix(image-gen): preserve aspect ratio with square padding + code hints

## 学び・注意点

- **AI の割り込みは最小限に**: Gemini のプロンプトは信頼し、向きだけ足す。上書きしない。
- **Sonnet は賢すぎる**: 「向きだけ判断して」と頼んでも、プロンプト全体を書き換える。
- **trim() は危険**: 透明部分の自動クロップでアスペクト比が変わる。正方形パディングで対策。
- **テスト駆動**: 本番ログで実際のプロンプトを確認しながらバグを発見・修正した。
