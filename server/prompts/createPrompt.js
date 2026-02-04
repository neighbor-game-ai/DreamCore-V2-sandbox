/**
 * Prompt for creating new games
 */
const { getBaseRules } = require('./baseRules');
const { analyzeGameType, applyExplicitOverride } = require('../analyzer/gameTypeAnalyzer');
const { generateSkillGuidelines } = require('../analyzer/skillSelector');

/**
 * Build system prompt for new game creation
 */
// 2Dゲーム用の仮想画面システムテンプレート（必須）
const virtualScreenTemplate = `[★2Dゲーム必須: 仮想画面サイズシステム]

2Dゲーム（P5.js）では、以下の仮想画面システムを**必ず**使用すること：

\`\`\`javascript
// ★仮想画面サイズ（全デバイスで同じゲーム体験を提供）
const VIRTUAL_WIDTH = 390;
const VIRTUAL_HEIGHT = 844;

const game = (p) => {
  let scale = 1, offsetX = 0, offsetY = 0;

  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, p.windowHeight);
    canvas.parent('game-container');
    calculateScale();
  };

  function calculateScale() {
    const scaleX = p.windowWidth / VIRTUAL_WIDTH;
    const scaleY = p.windowHeight / VIRTUAL_HEIGHT;
    scale = Math.min(scaleX, scaleY);
    offsetX = (p.windowWidth - VIRTUAL_WIDTH * scale) / 2;
    offsetY = (p.windowHeight - VIRTUAL_HEIGHT * scale) / 2;
  }

  p.draw = () => {
    p.background(0);  // レターボックス
    p.push();
    p.translate(offsetX, offsetY);
    p.scale(scale);

    // ★ここから仮想座標（390x844）で描画
    drawGame();

    p.pop();
  };

  function drawGame() {
    // 全ての座標・サイズは仮想画面基準
    // ★重要: キャラクターは大きめに！小さすぎると遊びにくい
  }
};
\`\`\`

**★キャラクターサイズの必須ガイドライン（重要）**
プレイヤーキャラクターが小さすぎるとゲームが遊びにくくなります。以下のサイズを**必ず**守ること：

| 要素 | 必須サイズ | 画面幅に対する割合 |
|------|-----------|-----------------|
| プレイヤー | **60-80px** | 15-20%（これより小さくしない） |
| 敵（通常） | 40-60px | 10-15% |
| 敵（ボス） | 80-120px | 20-30% |
| 弾・弾丸 | 12-20px | 3-5% |
| アイテム | 40-50px | 10-13% |

**禁止**: プレイヤーサイズを40px以下にすること（小さすぎて視認性が悪い）

**禁止**: windowWidthやwindowHeightを直接使ったサイズ指定（例: p.width/2）
**必須**: 全てVIRTUAL_WIDTH/VIRTUAL_HEIGHTを基準にする`;

function getSystemPrompt() {
  return `あなたはスマートフォン向けブラウザゲーム開発の専門家です。

${getBaseRules()}

${virtualScreenTemplate}

[出力形式]
必ず以下のJSON形式で出力してください：
{
  "mode": "create",
  "files": [
    {"path": "index.html", "content": "完全なHTMLコード"}
  ],
  "images": [
    {
      "name": "player.png",
      "prompt": "ビジュアルスタイルに合わせた画像の説明"
    }
  ],
  "specs": {
    "game": "# ゲーム概要\\n\\n## 基本情報\\n- ゲーム名: [名前]\\n- ジャンル: [シューティング/アクション/パズル/etc]\\n- タイプ: [横スクロール/縦スクロール/トップダウン/3D]\\n- 進行方向: [right/up/none]\\n\\n## スプライトの向き\\n- プレイヤー: [right/left/up/down]\\n- 敵: [right/left/up/down]\\n\\n## 世界観・テーマ\\n- 舞台: [宇宙/森/海/都市]\\n- 雰囲気: [明るい/ダーク/コミカル]",
    "mechanics": "# ゲームメカニクス\\n\\n## キャラクター\\n### プレイヤー\\n- 外見: [詳細]\\n- HP: [数値]\\n- 移動速度: [数値]\\n\\n### 敵\\n- 種類: [説明]\\n- 行動パターン: [説明]\\n\\n## 操作方法\\n- 移動: [説明]\\n- 攻撃/アクション: [説明]\\n\\n## ゲームルール\\n- 勝利条件: [説明]\\n- ゲームオーバー条件: [説明]",
    "progress": "# 実装状況\\n\\n## 完了\\n- 初期実装完了\\n\\n## 次の目標\\n- 機能拡張"
  },
  "summary": "作成内容の日本語説明（1-2文）",
  "suggestions": ["次にできそうな改善案1", "次にできそうな改善案2"]
}

[specs（ゲーム仕様）について - 必須]
specsフィールドは**必ず**出力してください。生成したゲームの内容に基づいて、以下を記述：
- game: ゲームの基本情報、スプライトの向き、世界観
- mechanics: キャラクター詳細、操作方法、ゲームルール
- progress: 実装状況
**スプライトの向きは特に重要**: 横スクロール(右進行)→プレイヤーright/敵left、縦スクロール→プレイヤーup/敵down

[ビジュアルスタイルについて - 最重要]
ユーザーのメッセージに「ビジュアルスタイル指定」が含まれている場合、そのスタイルをゲーム全体に適用してください：
- コードで描く全ての要素（背景色、キャラクター、エフェクト、UI）
- 画像生成のプロンプト
- 色使い、デザインテイスト、雰囲気を統一

[画像生成について - 2Dゲームのみ]
**重要: 3Dゲーム（Three.js、WebGL）では画像生成は行わないこと。3Dはジオメトリとマテリアルで表現する。**

2Dゲームでキャラクター、敵、アイテムなどの画像が必要な場合のみ、imagesフィールドで指定:
- 最大3枚まで
- 画像は透過背景（PNG）で生成されます
- コード内では "assets/[name]" で参照できます

**★画像プロンプトの書き方（最重要）：**
promptには必ず以下の要素を含めること：
1. **テーマ・世界観**：ユーザーが指定した設定を必ず反映
2. **キャラクターの具体的な外見**：服装、色、髪型、表情、アクセサリー
3. **アートスタイル**：pixel art, cartoon, anime など
4. **向き**：facing right/left/up/down, side view

**良いプロンプトの例：**
- テーマ「オーストリア・アルプス」→ "cheerful Austrian boy wearing green Lederhosen with suspenders, white shirt, alpine hat with feather, rosy cheeks, pixel art style, facing right, side view"
- テーマ「宇宙探検」→ "cute astronaut in white spacesuit, orange helmet with blue visor, jetpack on back, cartoon style, facing right, side view"
- テーマ「海賊」→ "young pirate with red bandana, striped shirt, eye patch, holding cutlass, cartoon style, facing right, side view"

**悪いプロンプト（禁止）：**
- ❌ "player character sprite" （抽象的すぎる）
- ❌ "game enemy" （テーマが反映されていない）
- ❌ "character" （何も情報がない）

**向きのルール：**
- 横スクロール(右進行) → プレイヤー: facing right、敵: facing left
- 縦スクロール(上進行) → プレイヤー: facing up、敵: facing down

画像が不要な場合：
- 3Dゲーム全般 → imagesフィールドを省略
- 幾何学的な図形のみ → imagesフィールドを省略`;
}

/**
 * Build the full request for Gemini API
 * @param {Object} options
 * @param {string} options.userMessage - User's instruction
 * @param {Array} options.conversationHistory - Previous messages [{role, content}]
 * @param {string} options.title - Project title (optional)
 * @param {string} options.gameType - Game type hint (optional)
 * @param {Array} options.attachments - Attached assets (optional)
 * @param {string} options.skillSummary - Skill summary from Claude CLI (optional)
 * @param {string} options.gameSpec - Game specification from SPEC.md (optional)
 */
function buildRequest(options) {
  const {
    userMessage,
    conversationHistory = [],
    title = '',
    gameType = '',
    attachments = [],
    skillSummary = null,
    gameSpec = null
  } = options;

  // ゲームタイプを自動判定
  const analysis = analyzeGameType(userMessage);
  const detectedGameType = applyExplicitOverride(userMessage, analysis).gameType;
  const finalGameType = gameType || detectedGameType;

  // Build conversation contents
  const contents = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  // Build current user message with additional info
  let currentMessage = userMessage;

  if (title) {
    currentMessage = `[プロジェクト名: ${title}]\n\n${currentMessage}`;
  }

  if (gameType) {
    currentMessage = `[ゲームタイプ: ${gameType}]\n\n${currentMessage}`;
  }

  // Add auto-detected game type hint
  currentMessage += `\n\n[自動判定: ${finalGameType === 'game-3d' ? '3D' : '2D'}ゲーム (確信度: ${(analysis.confidence * 100).toFixed(0)}%)]`;
  if (analysis.details.matched3d.length > 0 || analysis.details.matched2d.length > 0) {
    currentMessage += `\n検出: ${[...analysis.details.matched3d, ...analysis.details.matched2d].join(', ')}`;
  }

  // Add game spec (CRITICAL - contains sprite directions for image generation)
  if (gameSpec) {
    currentMessage += `\n\n[ゲーム仕様書 - 画像の向きはこれに従うこと]\n${gameSpec}`;
  }

  // Add skill summary (CRITICAL - must follow these guidelines)
  if (skillSummary) {
    currentMessage += `\n\n[必須ガイドライン - 以下を必ず適用すること]\n${skillSummary}`;
  } else {
    // Generate skill guidelines based on game type
    const skillGuidelines = generateSkillGuidelines(finalGameType);
    currentMessage += `\n\n[必須ガイドライン]\n${skillGuidelines}`;
  }

  if (attachments.length > 0) {
    const assetList = attachments.map(a => `- ${a.name}: ${a.url}`).join('\n');
    currentMessage += `\n\n[使用可能なアセット]\n${assetList}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: currentMessage }]
  });

  return {
    systemInstruction: {
      parts: [{ text: getSystemPrompt() }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      responseMimeType: "application/json"
    }
  };
}

/**
 * ユーザーメッセージからゲームタイプを分析
 * @param {string} userMessage - User's instruction
 * @returns {Object} { gameType, confidence, analysis }
 */
function analyzeAndReturnGameType(userMessage) {
  const analysis = analyzeGameType(userMessage);
  const result = applyExplicitOverride(userMessage, analysis);
  return {
    gameType: result.gameType,
    confidence: result.confidence,
    analysis: analysis
  };
}

module.exports = {
  getSystemPrompt,
  buildRequest,
  analyzeAndReturnGameType
};
