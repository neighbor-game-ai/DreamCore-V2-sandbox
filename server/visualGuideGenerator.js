/**
 * ビジュアルスタイルガイド動的生成モジュール
 * 汎用ガイドライン（参考画像ベース）× ゲーム内容をAIが組み合わせて
 * カスタマイズされたビジュアルガイドを生成
 */

const https = require('https');
require('dotenv').config();
const { getStyleById } = require('./stylePresets');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash';

/**
 * Gemini APIにリクエストを送信
 */
function callGeminiAPI(prompt) {
  return new Promise((resolve, reject) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    const url = new URL(endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
            resolve(json.candidates[0].content.parts[0].text);
          } else if (json.error) {
            reject(new Error(json.error.message));
          } else {
            reject(new Error('Unexpected API response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(requestBody);
    req.end();
  });
}

/**
 * ビジュアルスタイルガイドを動的生成
 * 汎用ガイドライン + ゲーム内容 → カスタマイズされたガイド
 * @param {string} gameDescription - ユーザーのゲーム説明
 * @param {string} dimension - '2d' または '3d'
 * @param {string} styleId - スタイルID
 * @returns {Promise<object>} 生成されたビジュアルガイド
 */
async function generateVisualGuide(gameDescription, dimension, styleId) {
  const style = getStyleById(dimension, styleId);

  if (!style) {
    console.error(`[VisualGuide] Style not found: ${dimension}/${styleId}`);
    return null;
  }

  // 汎用ガイドラインがある場合はAIでカスタマイズ
  if (style.guideline) {
    const prompt = buildCustomizationPrompt(gameDescription, dimension, style);

    try {
      const customization = await callGeminiAPI(prompt);
      console.log(`[VisualGuide] Generated customized guide for: ${style.name}`);

      return {
        styleName: style.name,
        styleId: style.id,
        dimension: dimension,
        baseGuideline: style.guideline,
        customization: customization,
        guide: `${style.guideline}\n\n【このゲーム向けのカスタマイズ】\n${customization}`
      };
    } catch (error) {
      console.error('[VisualGuide] Customization failed, using base guideline:', error.message);
      // フォールバック: 汎用ガイドラインをそのまま使用
      return {
        styleName: style.name,
        styleId: style.id,
        dimension: dimension,
        guide: style.guideline
      };
    }
  }

  // 汎用ガイドラインがない場合（フォールバック）
  return {
    styleName: style.name,
    styleId: style.id,
    dimension: dimension,
    guide: `【${style.name}スタイル】\nこのスタイルでゲームを作成してください。`
  };
}

/**
 * カスタマイズ用プロンプトを構築
 * 汎用ガイドラインをゲーム内容に合わせてカスタマイズ
 */
function buildCustomizationPrompt(gameDescription, dimension, style) {
  return `あなたはゲームビジュアルデザインの専門家です。

以下の「汎用ビジュアルガイドライン」を、ユーザーが作りたいゲームに合わせてカスタマイズしてください。

## ユーザーが作りたいゲーム
${gameDescription}

## 汎用ビジュアルガイドライン（このスタイルの基本）
${style.guideline}

## あなたのタスク
上記のガイドラインを「${gameDescription}」というゲームに適用する際の具体的なアドバイスを3-5項目で簡潔に書いてください。

例:
- このゲームの主人公は〇〇風のデザインが合う
- 背景は〇〇を意識すると良い
- エフェクトは〇〇を使うとこのスタイルらしくなる

汎用ガイドラインの内容は繰り返さず、このゲーム固有のカスタマイズのみ書いてください。`;
}

/**
 * ガイドをコード生成用のテキスト形式に変換
 */
function formatGuideForCodeGeneration(guide) {
  if (!guide) return '';

  return `
=== ビジュアルスタイルガイド（必ず従ってください）===
スタイル: ${guide.styleName}
次元: ${guide.dimension === '3d' ? '3D' : '2D'}

${guide.guide}

=== ガイド終了 ===

上記のビジュアルスタイルガイドに従って、ゲームのすべての視覚要素を設計してください：
- コードで描画するすべての要素（背景、キャラクター、オブジェクト、エフェクト、UI）
- 画像生成のプロンプト
- 色使い、形状、雰囲気を統一
`.trim();
}

module.exports = {
  generateVisualGuide,
  formatGuideForCodeGeneration
};
