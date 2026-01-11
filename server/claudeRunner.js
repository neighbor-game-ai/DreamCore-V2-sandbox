const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const userManager = require('./userManager');
const jobManager = require('./jobManager');
const db = require('./database');
const geminiClient = require('./geminiClient');

// Skills to exclude (causing errors or not ready)
const EXCLUDED_SKILLS = [
  'audio-mobile', 'audio-synth', 'game-audio',  // Audio issues
  'particles', 'particles-effects', 'particles-explosion', 'particles-setup',  // tsParticles API issues
  'sprite-sheet',  // Not working well yet
  'nanobanana',  // Internal/utility skill
  'kawaii-design',  // Deprecated (split into kawaii-colors, kawaii-3d, kawaii-ui)
  'p5js', 'threejs',  // Deprecated (split into granular skills)
];

class ClaudeRunner {
  constructor() {
    this.runningProcesses = new Map();
    this.skillsDir = path.join(__dirname, '..', '.claude', 'skills');
    this.skillMetadata = this.collectSkillMetadata();
  }

  // Collect skill metadata from all SKILL.md files (name + description)
  collectSkillMetadata() {
    const metadata = [];

    try {
      if (!fs.existsSync(this.skillsDir)) {
        console.log('Skills directory not found:', this.skillsDir);
        return metadata;
      }

      const skillFolders = fs.readdirSync(this.skillsDir).filter(f => {
        if (EXCLUDED_SKILLS.includes(f)) return false;
        const skillPath = path.join(this.skillsDir, f, 'SKILL.md');
        return fs.existsSync(skillPath);
      });

      for (const folder of skillFolders) {
        const skillPath = path.join(this.skillsDir, folder, 'SKILL.md');
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          // Extract frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const nameMatch = frontmatter.match(/name:\s*(.+)/);
            const descMatch = frontmatter.match(/description:\s*(.+)/);

            metadata.push({
              name: nameMatch ? nameMatch[1].trim() : folder,
              description: descMatch ? descMatch[1].trim() : folder
            });
          } else {
            metadata.push({ name: folder, description: folder });
          }
        } catch (e) {
          console.error(`Failed to read skill ${folder}:`, e.message);
        }
      }

      console.log(`Loaded ${metadata.length} skill(s): ${metadata.map(s => s.name).join(', ')}`);
      return metadata;
    } catch (error) {
      console.error('Error collecting skill metadata:', error);
      return metadata;
    }
  }

  // Get available skill names (for compatibility)
  get availableSkills() {
    return new Set(this.skillMetadata.map(s => s.name));
  }

  // Use Claude CLI to detect user intent (restore, chat, or edit)
  async detectIntent(userMessage) {
    return new Promise((resolve) => {
      const prompt = `ユーザーのメッセージの意図を判定してください。

メッセージ: "${userMessage}"

以下のいずれかを1単語で答えてください：
- restore: 元に戻したい、取り消したい、undoしたい場合
- chat: 質問、確認、相談の場合
- edit: コード変更・修正を求めている場合

回答:`;

      const claude = spawn('claude', [
        '--print',
        '--dangerously-skip-permissions'
      ], {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      // Write prompt to stdin to avoid shell escaping issues
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        const result = output.trim().toLowerCase();
        if (result.includes('restore')) {
          resolve('restore');
        } else if (result.includes('chat')) {
          resolve('chat');
        } else {
          resolve('edit');
        }
      });

      claude.on('error', () => {
        resolve('edit'); // Default to edit on error
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        claude.kill();
        resolve('edit');
      }, 5000);
    });
  }

  // Use Claude CLI (Haiku) to detect if request is 2D, 3D, or unclear
  // Only called for new projects where dimension is not specified
  async detectDimension(userMessage) {
    // Quick check for EXPLICIT "2D" or "3D" text only (half-width and full-width)
    // Everything else is delegated to Claude CLI (Haiku)

    // Only match explicit "3D" text (half-width: 3D, full-width: ３D)
    if (/3d|３d/i.test(userMessage)) {
      console.log('Dimension: 3D (explicit keyword detected)');
      return '3d';
    }

    // Only match explicit "2D" text (half-width: 2D, full-width: ２D)
    if (/2d|２d/i.test(userMessage)) {
      console.log('Dimension: 2D (explicit keyword detected)');
      return '2d';
    }

    // For everything else, default to unclear - user must specify
    // DO NOT use AI to guess - it causes unwanted 3D/2D auto-selection
    console.log('No explicit 2D/3D specified, returning unclear');
    return 'unclear';
  }

  // Guess image role from name and prompt
  guessImageRole(imageName, prompt) {
    const combined = (imageName + ' ' + prompt).toLowerCase();

    if (/player|プレイヤー|主人公|hero|character|キャラ/.test(combined)) {
      return 'プレイヤーキャラクター（右向きが基本）';
    }
    if (/enemy|敵|エネミー|monster|モンスター|boss|ボス/.test(combined)) {
      return '敵キャラクター（プレイヤーと対面＝左向きが基本）';
    }
    if (/bullet|弾|shot|ショット|missile|ミサイル/.test(combined)) {
      return '弾・発射物（進行方向向き）';
    }
    if (/item|アイテム|coin|コイン|power|パワー/.test(combined)) {
      return 'アイテム（向きは重要でない）';
    }
    if (/background|背景|bg/.test(combined)) {
      return '背景（向きは重要でない）';
    }

    return '不明（コードから判断してください）';
  }

  // Extract movement-related code patterns for direction analysis
  extractMovementPatterns(code) {
    if (!code) return '';

    const patterns = [];

    // Player movement patterns
    const movementMatches = code.match(/(player|プレイヤー)[\s\S]{0,100}(x\s*[+\-]=|\.x\s*[+\-]=|velocity\.x|vx\s*=)/gi);
    if (movementMatches) patterns.push('【プレイヤー移動】\n' + movementMatches.slice(0, 3).join('\n'));

    // Key input patterns
    const keyMatches = code.match(/.{0,30}(RIGHT|LEFT|UP|DOWN|ArrowRight|ArrowLeft|keyIsDown).{0,50}/gi);
    if (keyMatches) patterns.push('【キー入力】\n' + keyMatches.slice(0, 4).join('\n'));

    // Enemy spawn patterns
    const enemyMatches = code.match(/(enemy|敵|enemies)[\s\S]{0,80}(x\s*=|spawn|push|new)/gi);
    if (enemyMatches) patterns.push('【敵の生成】\n' + enemyMatches.slice(0, 3).join('\n'));

    // Scroll or camera patterns
    const scrollMatches = code.match(/.{0,20}(scroll|camera|背景).{0,50}/gi);
    if (scrollMatches) patterns.push('【スクロール】\n' + scrollMatches.slice(0, 2).join('\n'));

    // Game type hints
    const typeHints = [];
    if (/横スクロール|horizontal|side.?scroll/i.test(code)) typeHints.push('横スクロール');
    if (/縦スクロール|vertical|shooter/i.test(code)) typeHints.push('縦スクロール');
    if (/top.?down|見下ろし/i.test(code)) typeHints.push('トップダウン');
    if (typeHints.length > 0) patterns.push('【ゲームタイプヒント】' + typeHints.join(', '));

    return patterns.join('\n\n') || code.substring(0, 1500);
  }

  // Use SPEC.md to determine image direction (code analysis as fallback)
  async analyzeImageDirection(gameCode, gameSpec, imageName, originalPrompt) {
    console.log(`Analyzing image direction for: ${imageName}`);

    // First, try to get direction from SPEC.md (preferred method)
    const role = this.guessImageRole(imageName, originalPrompt);
    const specDirection = this.getDirectionFromSpec(gameSpec, role);

    if (specDirection) {
      const enhancedPrompt = `${originalPrompt}, facing ${specDirection}, side view, 2D game sprite`;
      console.log(`Direction from SPEC.md for ${imageName}: ${specDirection}`);
      console.log(`Enhanced prompt: ${enhancedPrompt}`);
      return enhancedPrompt;
    }

    // Fallback: Use AI to analyze (only if spec doesn't have direction info)
    console.log(`No direction in SPEC.md, using AI analysis for: ${imageName}`);

    return new Promise((resolve) => {
      const specContext = gameSpec ? gameSpec.substring(0, 800) : '';
      const movementContext = this.extractMovementPatterns(gameCode);

      const prompt = `ゲームの画像アセットの向きを決定してください。

${specContext ? `## ゲーム仕様書\n${specContext}\n` : ''}
${movementContext ? `## コードパターン\n${movementContext}\n` : ''}

## 生成する画像
- 名前: ${imageName}
- 元のプロンプト: ${originalPrompt}
- 役割推測: ${role}

## 判断ルール
- 横スクロール（右に進む）: プレイヤー=right, 敵=left
- 縦スクロール（上に進む）: プレイヤー=up, 敵=down
- 不明な場合: プレイヤー=right, 敵=left（デフォルト）

## 出力（1行のみ）
結果: [向き指定を追加した英語プロンプト]

例:
結果: cute cat character, game sprite, facing right, side view, 2D style`;

      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--dangerously-skip-permissions'
      ], {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      // Write prompt to stdin to avoid shell escaping issues
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        const result = output.trim();
        console.log(`Direction analysis raw output for ${imageName}:`, result);

        // Extract "結果:" line from structured output
        const resultMatch = result.match(/結果:\s*(.+)/);
        if (resultMatch) {
          const enhancedPrompt = resultMatch[1].trim();
          console.log(`Enhanced prompt for ${imageName}: ${enhancedPrompt}`);
          resolve(enhancedPrompt);
          return;
        }

        // Fallback: try to find any line that looks like a prompt (has "facing" or "view")
        const lines = result.split('\n').filter(line => line.trim());
        const promptLine = lines.find(line => /facing|view|向き/i.test(line));
        if (promptLine) {
          const cleaned = promptLine.replace(/^(思考|結果|output):\s*/i, '').trim();
          console.log(`Enhanced prompt (fallback) for ${imageName}: ${cleaned}`);
          resolve(cleaned);
          return;
        }

        // Last resort: use last non-empty line
        const lastLine = lines[lines.length - 1] || originalPrompt;
        console.log(`Enhanced prompt (last line) for ${imageName}: ${lastLine}`);
        resolve(lastLine);
      });

      claude.on('error', () => {
        console.log('Image direction analysis error, using original prompt');
        resolve(originalPrompt);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        claude.kill();
        console.log('Image direction analysis timeout');
        resolve(originalPrompt);
      }, 10000);
    });
  }

  // Get fallback skills based on framework, dimension, and message
  // Used when Claude CLI fails
  getFallbackSkills(framework, dimension, isNewProject) {
    const commonSkills = isNewProject ? ['kawaii-colors'] : [];

    // Priority 1: detected framework from existing code
    if (framework === 'threejs') {
      return ['threejs-setup', 'kawaii-3d', ...commonSkills];
    }
    if (framework === 'p5js') {
      return ['p5js-setup', ...commonSkills];
    }

    // Priority 2: detected dimension for new projects
    if (dimension === '3d') {
      return ['threejs-setup', 'kawaii-3d', ...commonSkills];
    }
    if (dimension === '2d') {
      return ['p5js-setup', ...commonSkills];
    }

    // Unknown - return minimal
    return isNewProject ? ['kawaii-colors'] : [];
  }

  // Detect framework from code (Three.js, P5.js, or unknown)
  detectFrameworkFromCode(code) {
    if (!code) return null;

    // Three.js detection - look for specific patterns
    const threePatterns = [
      /THREE\./,                           // THREE namespace
      /new\s+THREE\./,                     // THREE constructor
      /import.*from\s+['"]three['"]/,      // ES module import
      /WebGLRenderer/,                     // WebGL renderer
      /PerspectiveCamera|OrthographicCamera/, // Cameras
      /BoxGeometry|SphereGeometry|PlaneGeometry/, // Geometries
      /MeshBasicMaterial|MeshStandardMaterial|MeshPhongMaterial/, // Materials
      /Scene\(\)/,                         // Scene constructor
    ];

    // P5.js detection
    const p5Patterns = [
      /function\s+setup\s*\(\)/,           // setup function
      /function\s+draw\s*\(\)/,            // draw function
      /createCanvas\s*\(/,                 // createCanvas
      /p5\./,                              // p5 namespace
      /new\s+p5\s*\(/,                     // p5 instance
      /background\s*\(\s*\d/,              // background with color
      /ellipse\s*\(|rect\s*\(|line\s*\(/,  // 2D drawing functions
    ];

    const hasThree = threePatterns.some(p => p.test(code));
    const hasP5 = p5Patterns.some(p => p.test(code));

    if (hasThree && !hasP5) return 'threejs';
    if (hasP5 && !hasThree) return 'p5js';
    if (hasThree && hasP5) return 'mixed';  // Unusual but possible
    return null;
  }

  // AI-driven skill detection using Claude CLI
  // Returns a list of relevant skill names based on context analysis
  async detectSkillsWithAI(userMessage, currentCode = null, isNewProject = false, gameSpec = null, dimension = null) {
    // Build skill list for prompt
    const skillList = this.skillMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n');

    // Detect framework from current code
    const framework = this.detectFrameworkFromCode(currentCode);
    console.log(`Framework detection: ${framework || 'none'} (code length: ${currentCode?.length || 0})`);
    if (framework) {
      console.log(`Detected framework from code: ${framework}`);
    }

    // Build detailed context
    let contextInfo = '';
    if (framework) {
      const frameworkName = {
        'threejs': 'Three.js (3Dゲーム)',
        'p5js': 'P5.js (2Dゲーム)',
        'mixed': 'Three.js + P5.js'
      }[framework];
      contextInfo = `現在のフレームワーク: ${frameworkName}`;
    } else if (dimension) {
      // Use pre-detected dimension for new projects
      contextInfo = dimension === '3d' ? '新規3Dプロジェクト' : '新規2Dプロジェクト';
    } else {
      contextInfo = '新規プロジェクト';
    }

    // Include game spec if available
    let specSummary = '';
    if (gameSpec) {
      // Extract key info from SPEC.md (limit to 500 chars)
      specSummary = gameSpec.substring(0, 500);
      if (gameSpec.length > 500) specSummary += '...';
    }

    // Build prompt dynamically from loaded skills (skillList defined at line 361)
    const prompt = `ユーザーのリクエストに最適なスキルを選んでJSON配列で出力せよ。説明不要。

利用可能なスキル:
${skillList}

リクエスト: "${userMessage}"
コンテキスト: ${contextInfo}
${specSummary ? `現在のゲーム仕様:\n${specSummary}` : ''}

出力（JSON配列のみ）:`;

    return new Promise((resolve) => {
      // Use haiku model for fast skill detection
      // Pass prompt via stdin to avoid shell escaping issues
      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--dangerously-skip-permissions'
      ], {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        try {
          // Extract JSON array from response
          const jsonMatch = output.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const skills = JSON.parse(jsonMatch[0]);
            // Filter to only available skills
            const validSkills = skills.filter(s => this.availableSkills.has(s));
            console.log('AI selected skills:', validSkills.join(', ') || 'none');
            resolve(validSkills);
            return;
          }
        } catch (e) {
          console.error('Failed to parse AI skill response:', e.message);
        }

        // Fallback: use dimension-based selection
        console.log('AI skill detection failed, output was:', output.substring(0, 200));
        resolve(this.getFallbackSkills(framework, dimension, isNewProject));
      });

      claude.on('error', (err) => {
        console.log('AI skill detection error:', err.message);
        resolve(this.getFallbackSkills(framework, dimension, isNewProject));
      });

      // Timeout after 15 seconds (haiku is fast, but give it time)
      setTimeout(() => {
        claude.kill();
        console.log('AI skill detection timeout after 15s');
        resolve(this.getFallbackSkills(framework, dimension, isNewProject));
      }, 15000);
    });
  }

  // Sync version for backward compatibility (uses simple heuristics)
  detectSkills(userMessage, conversationHistory = [], isNewProject = false) {
    const messageLower = userMessage.toLowerCase();

    // Simple heuristic detection (fallback when async not available)
    // Include full-width numbers and physics/simulation terms that typically mean 3D
    const is3D = /3d|３d|３D|3次元|三次元|three|立体|webgl|球|ボール|ball|シミュレーション|simulation|物理/i.test(messageLower);
    const is2D = /2d|２d|２D|2次元|二次元|p5|canvas|キャンバス/i.test(messageLower);
    const isRacing = /車|car|レース|race|ドライブ|drive/i.test(messageLower);

    const skills = [];

    // Add default style for new projects
    if (isNewProject && !/(色を|色は|ダーク|dark|シンプル|simple|クール|cool)/i.test(messageLower)) {
      skills.push('kawaii-colors');
    }

    // Core framework
    if (is3D) {
      skills.push('threejs-setup', 'kawaii-3d');
    } else {
      skills.push('p5js-setup');
      // Image generation only for 2D
      if (/画像|キャラクター|敵|アイテム/i.test(messageLower)) {
        skills.push('image-generation');
      }
    }

    // Additional skills
    if (isRacing) skills.push('vehicle-physics');
    if (/アニメーション|animation|gsap/i.test(messageLower)) skills.push('tween-animation');
    if (/ai|敵|enemy|追いかけ|逃げる/i.test(messageLower)) skills.push('game-ai');

    const validSkills = skills.filter(s => this.availableSkills.has(s)).slice(0, 10);
    console.log('Detected skills (sync):', validSkills.join(', ') || 'none');
    return validSkills;
  }

  // Build mandatory skill reading instructions for Claude CLI
  getSkillInstructions(skillNames) {
    if (skillNames.length === 0) return '';

    const skillPaths = skillNames.map(name =>
      `- .claude/skills/${name}/SKILL.md を読む`
    ).join('\n');

    return `
【必須】以下のスキルファイルを必ず読んで、内容に従ってコードを生成してください：
${skillPaths}

スキルに書かれているCDNリンク、コードパターン、ベストプラクティスを必ず適用すること。`;
  }

  // Read raw skill contents (granular skills are small, no truncation needed)
  readSkillContents(skillNames) {
    const contents = [];
    for (const skillName of skillNames) {
      const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          // Granular skills should be under 1000 chars, warn if larger
          if (content.length > 1500) {
            console.warn(`Skill ${skillName} is ${content.length} chars - consider splitting`);
          }
          contents.push(`## ${skillName}\n${content}`);
        } catch (e) {
          console.error(`Failed to load skill ${skillName}:`, e.message);
        }
      }
    }
    return contents.join('\n\n');
  }

  // Get skill descriptions (from metadata)
  getSkillDescriptions() {
    return this.skillMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n');
  }

  // Get skill content for Gemini (prioritized, granular skills)
  getSkillContentForGemini(detectedSkills) {
    if (detectedSkills.length === 0) {
      return null;
    }

    // Prioritize: kawaii-colors first, then setup skills, then others
    const priorityOrder = [
      'kawaii-colors',      // Always first
      'threejs-setup',      // 3D setup
      'p5js-setup',         // 2D setup
      'kawaii-3d',          // 3D style
      'threejs-lighting',   // 3D lighting
      'p5js-input',         // 2D input
      'p5js-collision',     // 2D collision
      'audio-synth',        // Sound
      'audio-mobile',       // Mobile audio
      'kawaii-ui'           // UI
    ];

    const sortedSkills = [...detectedSkills].sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a);
      const bIndex = priorityOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // Take top 10 skills (granular skills are ~500 chars each)
    const selectedSkills = sortedSkills.slice(0, 10);
    console.log('Selected skills for Gemini:', selectedSkills);

    const rawContent = this.readSkillContents(selectedSkills);

    // Limit total to 15000 chars (10 granular skills)
    const limited = rawContent.substring(0, 15000);
    console.log(`Skill content: ${limited.length} chars (from ${selectedSkills.length} skills)`);

    return limited;
  }

  // Build prompt for Claude - with mandatory skill reading
  buildPrompt(visitorId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const history = userManager.getConversationHistory(visitorId, projectId);

    // Check if this is a new project
    const files = userManager.listProjectFiles(visitorId, projectId);
    let isNewProject = true;
    if (files.length > 0) {
      const indexContent = userManager.readProjectFile(visitorId, projectId, 'index.html');
      const isInitialWelcomePage = indexContent &&
        indexContent.length < 1000 &&
        indexContent.includes('Welcome to Game Creator');
      if (!isInitialWelcomePage) {
        isNewProject = false;
      }
    }

    const detectedSkills = this.detectSkills(userMessage, history, isNewProject);
    const skillInstructions = this.getSkillInstructions(detectedSkills);

    // Directive prompt - require Claude to read and apply skills
    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}
${skillInstructions}

ユーザーの指示: ${userMessage}`;

    return { prompt, detectedSkills };
  }

  // Build prompt without skills (for debug mode)
  buildPromptWithoutSkills(visitorId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}

[DEBUG] スキル無効モード - スキルを参照せずに基本的な実装を行ってください。

ユーザーの指示: ${userMessage}`;

    return prompt;
  }

  // Determine the best style for image generation based on game content
  determineImageStyle(userMessage, currentCode, detectedSkills) {
    const lowerMessage = userMessage.toLowerCase();
    const lowerCode = (currentCode || '').toLowerCase();
    const combined = lowerMessage + ' ' + lowerCode;

    // Check for explicit style hints in user message
    if (/ピクセル|pixel|ドット|8bit|8ビット|レトロ|retro/i.test(lowerMessage)) {
      return 'pixel';
    }
    if (/アニメ|anime|漫画|manga/i.test(lowerMessage)) {
      return 'anime';
    }
    if (/かわいい|kawaii|キュート|cute|ポップ|pop/i.test(lowerMessage)) {
      return 'kawaii';
    }
    if (/リアル|real|写実|photo/i.test(lowerMessage)) {
      return 'realistic';
    }
    if (/水彩|watercolor|柔らか/i.test(lowerMessage)) {
      return 'watercolor';
    }
    if (/フラット|flat|シンプル|simple|ミニマル/i.test(lowerMessage)) {
      return 'flat';
    }

    // Infer from detected skills
    if (detectedSkills.includes('kawaii-colors') || detectedSkills.includes('kawaii-3d')) {
      return 'kawaii';
    }

    // Infer from game type in code
    if (/シューティング|shooting|shooter/i.test(combined)) {
      return 'pixel';  // Classic shooting games are often pixel art
    }
    if (/rpg|冒険|adventure/i.test(combined)) {
      return 'anime';
    }

    // Default to kawaii for GameCreator's aesthetic
    return 'kawaii';
  }

  // Generate images for the project and save them
  // gameCode and gameSpec are used by Haiku to determine image direction
  async generateProjectImages(visitorId, projectId, images, jobId, gameCode = null, gameSpec = null) {
    const generatedAssets = {};
    const maxImages = 3;  // Limit to 3 images per request

    const imagesToGenerate = images.slice(0, maxImages);
    const totalImages = imagesToGenerate.length;

    console.log(`Generating ${totalImages} image(s) for project...`);

    for (let i = 0; i < imagesToGenerate.length; i++) {
      const img = imagesToGenerate[i];

      try {
        // Use Claude CLI (Haiku) to analyze and determine image direction
        jobManager.updateProgress(
          jobId,
          55 + Math.floor((i / totalImages) * 10),
          `画像の向きを分析中: ${img.name} (${i + 1}/${totalImages})`
        );

        const enhancedPrompt = await this.analyzeImageDirection(
          gameCode,
          gameSpec,
          img.name,
          img.prompt
        );

        jobManager.updateProgress(
          jobId,
          60 + Math.floor((i / totalImages) * 15),
          `画像生成中: ${img.name} (${i + 1}/${totalImages})`
        );

        // Generate image with AI-determined direction
        const result = await geminiClient.generateImage({
          prompt: enhancedPrompt,
          style: img.style || 'kawaii',
          transparent: true
        });

        if (result.success && result.image) {
          // Save to project assets directory
          const assetPath = userManager.saveGeneratedImage(
            visitorId,
            projectId,
            img.name,
            result.image
          );

          generatedAssets[img.name] = assetPath;
          console.log(`Generated and saved: ${img.name} -> ${assetPath}`);
        }
      } catch (err) {
        console.error(`Failed to generate image ${img.name}:`, err.message);
        // Continue with other images even if one fails
      }
    }

    return generatedAssets;
  }

  // Try Gemini first for code generation
  async tryGeminiGeneration(visitorId, projectId, userMessage, jobId, debugOptions = {}) {
    if (!geminiClient.isAvailable()) {
      console.log('Gemini not available, using Claude Code');
      return null;
    }

    try {
      const history = userManager.getConversationHistory(visitorId, projectId);

      // Get current code (null for new projects)
      // Check if this is truly a new project (only has initial welcome page)
      const files = userManager.listProjectFiles(visitorId, projectId);
      let currentCode = null;
      let isNewProject = true;

      if (files.length > 0) {
        // Check if it's just the initial welcome page
        const indexContent = userManager.readProjectFile(visitorId, projectId, 'index.html');
        const isInitialWelcomePage = indexContent &&
          indexContent.length < 1000 &&
          indexContent.includes('Welcome to Game Creator');

        if (!isInitialWelcomePage) {
          // Real project with actual code
          isNewProject = false;
          currentCode = files.map(f => {
            const content = userManager.readProjectFile(visitorId, projectId, f);
            return `--- ${f} ---\n${content}`;
          }).join('\n\n');
        }
      }

      // For new projects, detect if 2D or 3D is specified
      let detectedDimension = null;
      let effectiveUserMessage = userMessage;

      if (isNewProject) {
        // First check if user is responding to dimension question
        const userMessageLower = userMessage.toLowerCase();
        const is2DSelection = userMessageLower.includes('2dで作成') || userMessageLower.includes('2dで') || userMessageLower === '2d';
        const is3DSelection = userMessageLower.includes('3dで作成') || userMessageLower.includes('3dで') || userMessageLower === '3d';

        if (is2DSelection || is3DSelection) {
          detectedDimension = is2DSelection ? '2d' : '3d';
          console.log(`User selected ${detectedDimension.toUpperCase()} from suggestion`);

          // Get original request from conversation history
          if (history && history.length > 0) {
            // Find the last user message that's not a dimension selection
            for (let i = history.length - 1; i >= 0; i--) {
              const msg = history[i];
              if (msg.role === 'user') {
                const msgLower = msg.content.toLowerCase();
                if (!msgLower.includes('2dで') && !msgLower.includes('3dで')) {
                  effectiveUserMessage = `${detectedDimension.toUpperCase()}で${msg.content}`;
                  console.log('Combined message:', effectiveUserMessage);
                  break;
                }
              }
            }
          }
        } else {
          // Use AI to detect dimension
          jobManager.updateProgress(jobId, 3, '2D/3D判定中...');
          detectedDimension = await this.detectDimension(userMessage);
          console.log('Detected dimension:', detectedDimension);

          if (detectedDimension === 'unclear') {
            // Store the original request in history before asking
            userManager.addToHistory(visitorId, projectId, 'user', userMessage);

            // Ask user to clarify
            jobManager.updateProgress(jobId, 100, '確認が必要です');
            jobManager.notifySubscribers(jobId, {
              type: 'geminiChat',
              mode: 'chat',
              message: '2Dゲームと3Dゲーム、どちらで作成しますか？',
              suggestions: ['2Dで作成', '3Dで作成']
            });
            return {
              mode: 'chat',
              message: '2Dゲームと3Dゲーム、どちらで作成しますか？',
              suggestions: ['2Dで作成', '3Dで作成']
            };
          }
        }
      }

      // For new projects: Create SPEC.md FIRST (before code generation)
      // For existing projects: Read existing SPEC.md
      let gameSpec = null;
      if (isNewProject && detectedDimension) {
        jobManager.updateProgress(jobId, 4, '仕様書を作成中...');
        gameSpec = await this.createInitialSpec(visitorId, projectId, effectiveUserMessage, detectedDimension);
        if (gameSpec) {
          console.log('Initial SPEC.md created with sprite directions');
        }
      } else if (!isNewProject) {
        gameSpec = this.readSpec(visitorId, projectId);
        if (gameSpec) {
          console.log('Including existing SPEC.md in code generation');
        }
      }

      // AI-driven skill detection (async) - now with game spec and dimension for better context
      jobManager.updateProgress(jobId, 5, 'スキルを分析中...');
      let detectedSkills = await this.detectSkillsWithAI(effectiveUserMessage, currentCode, isNewProject, gameSpec, detectedDimension);

      // Filter out kawaii skills if SPEC.md has explicit design style
      if (gameSpec && this.hasExplicitDesignStyle(gameSpec)) {
        const kawaiiSkills = ['kawaii-colors', 'kawaii-ui', 'kawaii-3d'];
        const originalCount = detectedSkills.length;
        detectedSkills = detectedSkills.filter(s => !kawaiiSkills.includes(s));
        if (detectedSkills.length < originalCount) {
          console.log('Kawaii skills removed due to explicit design style in SPEC.md');
        }
      }

      // Get skill content for Gemini (prioritized raw content)
      let skillSummary = null;
      if (detectedSkills.length > 0 && !debugOptions.disableSkills) {
        jobManager.updateProgress(jobId, 12, `スキル選択: ${detectedSkills.slice(0, 3).join(', ')}`);
        skillSummary = this.getSkillContentForGemini(detectedSkills);
      }

      jobManager.updateProgress(jobId, 20, 'Gemini APIでコード生成中...');
      console.log('Calling Gemini API for code generation...');

      let streamedChars = 0;

      // Call Gemini with streaming (include skill summary and game spec if available)
      const result = await geminiClient.generateCode({
        userMessage: effectiveUserMessage,
        currentCode,
        conversationHistory: history || [],
        skillSummary,
        gameSpec,  // Pass game spec to Gemini
        onStream: (chunk) => {
          if (chunk.type === 'text') {
            streamedChars += chunk.content.length;
            // Update progress based on streamed content (estimate ~15000 chars for full response)
            const progress = Math.min(20 + Math.floor((streamedChars / 15000) * 30), 50);
            jobManager.updateProgress(jobId, progress, 'コード生成中...');
            // Send streaming content to frontend
            jobManager.notifySubscribers(jobId, { type: 'stream', content: chunk.content });
          }
        }
      });

      // Handle chat mode (questions/confirmation - no code changes)
      if (result && result.mode === 'chat') {
        console.log('Gemini chat mode: responding to question');

        jobManager.updateProgress(jobId, 100, '回答完了');

        // Send chat response to frontend
        jobManager.notifySubscribers(jobId, {
          type: 'geminiChat',
          mode: 'chat',
          message: result.message,
          suggestions: result.suggestions || []
        });

        return result;
      }

      // Handle restore mode (undo request - ask for confirmation)
      if (result && result.mode === 'restore') {
        console.log('Gemini restore mode: asking for confirmation');

        jobManager.updateProgress(jobId, 100, 'リストア確認');

        // Send restore confirmation to frontend
        jobManager.notifySubscribers(jobId, {
          type: 'geminiRestore',
          mode: 'restore',
          message: result.message,
          confirmLabel: result.confirmLabel || '戻す',
          cancelLabel: result.cancelLabel || 'キャンセル'
        });

        return result;
      }

      if (result && (result.files || result.edits)) {
        const isEdit = result.mode === 'edit';
        const changeCount = isEdit ? result.edits?.length : result.files?.length;
        console.log(`Gemini ${isEdit ? 'edit' : 'create'} mode: ${changeCount} ${isEdit ? 'edit(s)' : 'file(s)'}`);

        jobManager.updateProgress(jobId, 50, `コード生成完了（${changeCount}件の変更）`);

        // Send generated code to frontend
        jobManager.notifySubscribers(jobId, {
          type: 'geminiCode',
          mode: result.mode || 'create',
          files: result.files,
          edits: result.edits,
          summary: result.summary
        });

        return result;
      }

      return null;
    } catch (error) {
      console.error('Gemini generation failed:', error.message);
      jobManager.updateProgress(jobId, 25, 'Gemini失敗、Claude Codeにフォールバック...');
      return null;
    }
  }

  // Apply Gemini-generated result (create or edit mode)
  // gameCode and gameSpec are used by Haiku to determine image direction
  async applyGeminiResult(visitorId, projectId, geminiResult, jobId, gameCode = null, gameSpec = null) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    try {
      // Generate images if requested by Gemini
      let generatedAssets = {};
      if (geminiResult.images && geminiResult.images.length > 0) {
        console.log(`Gemini requested ${geminiResult.images.length} image(s)`);
        jobManager.updateProgress(jobId, 52, `画像を生成中...`);

        // Pass gameCode and gameSpec for Haiku to analyze image direction
        generatedAssets = await this.generateProjectImages(
          visitorId,
          projectId,
          geminiResult.images,
          jobId,
          gameCode,
          gameSpec
        );

        // Notify frontend about generated images
        if (Object.keys(generatedAssets).length > 0) {
          const imageList = Object.entries(generatedAssets)
            .map(([name, path]) => `- ${name}: ${path}`)
            .join('\n');
          jobManager.notifySubscribers(jobId, {
            type: 'imagesGenerated',
            images: generatedAssets,
            message: `画像を生成しました:\n${imageList}`
          });
        }
      }

      if (geminiResult.mode === 'edit' && geminiResult.edits) {
        // Edit mode - apply diffs
        const totalEdits = geminiResult.edits.length;
        console.log(`Applying ${totalEdits} edit(s)...`);
        jobManager.updateProgress(jobId, 60, `${totalEdits}件の編集を適用中...`);

        for (let i = 0; i < geminiResult.edits.length; i++) {
          const edit = geminiResult.edits[i];
          const filePath = path.join(projectDir, edit.path);

          // Progress: 60% to 85%
          const progress = 60 + Math.floor((i / totalEdits) * 25);
          jobManager.updateProgress(jobId, progress, `編集中: ${edit.path}`);

          if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${edit.path}`);
            continue;
          }

          let content = fs.readFileSync(filePath, 'utf-8');

          if (!content.includes(edit.old_string)) {
            console.error(`old_string not found in ${edit.path}:`);
            console.error(`Looking for: "${edit.old_string.substring(0, 100)}..."`);
            // Try to continue with other edits
            continue;
          }

          content = content.replace(edit.old_string, edit.new_string);
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`Edited: ${edit.path}`);
        }
      } else {
        // Create mode - write full files
        const files = geminiResult.files || [];
        jobManager.updateProgress(jobId, 60, `${files.length}件のファイルを作成中...`);

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = path.join(projectDir, file.path);
          const dir = path.dirname(filePath);

          const progress = 60 + Math.floor((i / files.length) * 25);
          jobManager.updateProgress(jobId, progress, `作成中: ${file.path}`);

          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(filePath, file.content, 'utf-8');
          console.log('Written:', file.path);
        }
      }

      // Create git commit
      jobManager.updateProgress(jobId, 88, 'バージョン保存中...');
      userManager.createVersionSnapshot(visitorId, projectId, geminiResult.summary || 'Gemini generated code');

      jobManager.updateProgress(jobId, 95, 'ファイル適用完了');
      return true;
    } catch (error) {
      console.error('Failed to apply Gemini result:', error.message);
      return false;
    }
  }

  // Run Claude as an async job
  async runClaudeAsJob(visitorId, projectId, userMessage, debugOptions = {}) {
    // Get user from database
    const user = db.getUserByVisitorId(visitorId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check for existing active job
    const existingJob = jobManager.getActiveJob(projectId);
    if (existingJob) {
      return { job: existingJob, isExisting: true, startProcessing: () => {} };
    }

    // Create new job
    const job = jobManager.createJob(user.id, projectId);

    // Return job with a function to start processing (allows caller to subscribe first)
    return {
      job,
      isExisting: false,
      startProcessing: () => {
        this.processJob(job.id, visitorId, projectId, userMessage, debugOptions);
      }
    };
  }

  // Process job (runs in background)
  async processJob(jobId, visitorId, projectId, userMessage, debugOptions = {}) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    // Use Claude CLI to detect user intent
    jobManager.startJob(jobId);
    jobManager.updateProgress(jobId, 5, '意図を判定中...');

    const intent = await this.detectIntent(userMessage);
    console.log('Detected intent:', intent);

    // Handle restore intent
    if (intent === 'restore') {
      console.log('Restore intent detected by Claude');
      jobManager.updateProgress(jobId, 100, 'リストア確認');

      jobManager.notifySubscribers(jobId, {
        type: 'geminiRestore',
        mode: 'restore',
        message: '直前の変更を取り消して、前の状態に戻しますか？',
        confirmLabel: '戻す',
        cancelLabel: 'キャンセル'
      });

      jobManager.completeJob(jobId, {
        message: 'リストア確認',
        mode: 'restore',
        generator: 'claude'
      });

      return { success: true };
    }

    // Skip Gemini if useClaude is enabled
    if (!debugOptions.useClaude) {
      // Try Gemini first for code generation
      const geminiResult = await this.tryGeminiGeneration(visitorId, projectId, userMessage, jobId, debugOptions);

      if (geminiResult) {
        // Handle chat mode (no code changes, just conversation)
        if (geminiResult.mode === 'chat') {
          const responseMessage = geminiResult.message || '回答しました';
          // Include suggestions in saved message for history
          const historyMessage = geminiResult.suggestions?.length > 0
            ? `${responseMessage}\n\n提案: ${geminiResult.suggestions.join('、')}`
            : responseMessage;
          userManager.addToHistory(visitorId, projectId, 'assistant', historyMessage);

          jobManager.completeJob(jobId, {
            message: responseMessage,
            mode: 'chat',
            generator: 'gemini'
          });

          console.log('Job completed with Gemini (chat mode):', jobId);
          return { success: true };
        }

        // Gemini succeeded - apply the result
        // Get game code for Haiku to analyze image direction
        // For create mode: use generated code; for edit mode: use existing code
        let gameCodeForImages = null;
        if (geminiResult.mode === 'edit') {
          gameCodeForImages = userManager.readProjectFile(visitorId, projectId, 'index.html');
        } else if (geminiResult.files && geminiResult.files.length > 0) {
          const indexFile = geminiResult.files.find(f => f.path === 'index.html');
          gameCodeForImages = indexFile ? indexFile.content : geminiResult.files[0].content;
        }
        const gameSpec = this.readSpec(visitorId, projectId);
        const applied = await this.applyGeminiResult(visitorId, projectId, geminiResult, jobId, gameCodeForImages, gameSpec);

        if (applied) {
          const responseMessage = geminiResult.summary || 'Geminiでゲームを生成しました';
          userManager.addToHistory(visitorId, projectId, 'assistant', responseMessage);

          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');
          jobManager.completeJob(jobId, {
            message: responseMessage,
            html: currentHtml,
            generator: 'gemini'
          });

          console.log('Job completed with Gemini:', jobId);

          // Update specs asynchronously (don't wait) - pass userMessage for selective update
          this.updateSpec(visitorId, projectId, userMessage).catch(err => {
            console.error('Spec update error:', err.message);
          });

          return { success: true };
        }
      }
    } else {
      console.log('[DEBUG] Using Claude CLI (Gemini skipped)');
    }

    // Fall back to Claude Code CLI
    console.log('Using Claude Code CLI for job:', jobId, 'in:', projectDir);

    // Build prompt for Claude CLI (uses sync skill detection)
    let prompt, detectedSkills;
    if (debugOptions.disableSkills) {
      console.log('[DEBUG] Skills disabled');
      prompt = this.buildPromptWithoutSkills(visitorId, projectId, userMessage);
      detectedSkills = [];
    } else {
      const result = this.buildPrompt(visitorId, projectId, userMessage);
      prompt = result.prompt;
      detectedSkills = result.detectedSkills;
    }

    if (detectedSkills.length > 0) {
      jobManager.updateProgress(jobId, 10, `Claude CLI スキル: ${detectedSkills.join(', ')}`);
    }

    return new Promise((resolve) => {
      const claude = spawn('claude', [
        '--model', 'opus',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env, PATH: process.env.PATH },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Register process for cancellation
      jobManager.registerProcess(jobId, claude, () => claude.kill());

      // Write prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let errorOutput = '';
      let buffer = '';
      let progressEstimate = 20;
      let assistantText = '';  // Collect assistant's text response

      claude.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            let event = json;

            // Unwrap stream_event wrapper
            if (json.type === 'stream_event' && json.event) {
              event = json.event;
            }

            // Handle assistant message format: {"type":"assistant","message":{"content":[...]}}
            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text' && block.text) {
                  assistantText += block.text;  // Collect text
                  jobManager.notifySubscribers(jobId, { type: 'stream', content: block.text });
                } else if (block.type === 'tool_use') {
                  const toolName = block.name || 'unknown';
                  console.log('  Tool:', toolName);
                  progressEstimate = Math.min(progressEstimate + 15, 90);
                  jobManager.updateProgress(jobId, progressEstimate, `実行中: ${toolName}`);
                  jobManager.notifySubscribers(jobId, { type: 'stream', content: `\n[${toolName}]\n` });
                }
              }
            }

            // Tool usage - content_block_start
            if (event.type === 'content_block_start' && event.content_block) {
              if (event.content_block.type === 'tool_use') {
                const toolName = event.content_block.name;
                console.log('  Tool:', toolName);
                progressEstimate = Math.min(progressEstimate + 20, 90);
                jobManager.updateProgress(jobId, progressEstimate, `実行中: ${toolName}`);
                jobManager.notifySubscribers(jobId, { type: 'stream', content: `\n[${toolName}]\n` });
              } else if (event.content_block.type === 'text' && event.content_block.text) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.content_block.text });
              }
            }

            // Stream text/json content - content_block_delta
            if (event.type === 'content_block_delta' && event.delta) {
              if (event.delta.type === 'text_delta' && event.delta.text) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.delta.text });
              } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                jobManager.notifySubscribers(jobId, { type: 'stream', content: event.delta.partial_json });
              }
            }

            // Result
            if (event.type === 'result' && event.result) {
              output = event.result;
            } else if (json.type === 'result' && json.result) {
              output = json.result;
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        console.log('Claude job', jobId, 'exited with code:', code);

        if (code === 0) {
          // Read updated file
          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');

          // Extract HTML from response if present
          const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
          if (htmlMatch) {
            userManager.writeProjectFile(visitorId, projectId, 'index.html', htmlMatch[1]);
          }

          // Create version snapshot
          userManager.createVersionSnapshot(visitorId, projectId, userMessage.substring(0, 50));

          // Use collected assistant text or default message
          const responseMessage = assistantText.trim() || 'ゲームを更新しました';

          // Add to history
          userManager.addToHistory(visitorId, projectId, 'assistant', responseMessage);

          // Complete the job with the actual response
          jobManager.completeJob(jobId, {
            message: responseMessage,
            html: currentHtml
          });

          // Update specs asynchronously (don't wait) - pass userMessage for selective update
          this.updateSpec(visitorId, projectId, userMessage).catch(err => {
            console.error('Spec update error:', err.message);
          });

          resolve({ success: true });
        } else {
          const errorMsg = errorOutput || output || 'Unknown error';
          jobManager.failJob(jobId, errorMsg);
          resolve({ success: false, error: errorMsg });
        }
      });

      claude.on('error', (err) => {
        jobManager.failJob(jobId, err.message);
        resolve({ success: false, error: err.message });
      });
    });
  }

  // Legacy sync method (kept for backward compatibility)
  async runClaude(visitorId, projectId, userMessage, onProgress) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const { prompt, detectedSkills } = this.buildPrompt(visitorId, projectId, userMessage);

    if (detectedSkills.length > 0) {
      console.log('Detected skills:', detectedSkills.join(', '));
      onProgress({ type: 'info', message: `使用スキル: ${detectedSkills.join(', ')}` });
    }

    return new Promise((resolve, reject) => {
      onProgress({ type: 'status', message: 'Claude Codeを実行中...' });

      console.log('Running Claude in:', projectDir);
      console.log('Prompt length:', prompt.length);

      const claude = spawn('claude', [
        '--model', 'opus',
        '--verbose',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env, PATH: process.env.PATH },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let errorOutput = '';
      let buffer = '';

      claude.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            let event = json;

            if (json.type === 'stream_event' && json.event) {
              event = json.event;
              if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                console.log('  Tool:', event.content_block.name);
                onProgress({ type: 'stream', content: `\n[${event.content_block.name}]\n` });
              }
            }

            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text' && block.text) {
                  onProgress({ type: 'stream', content: block.text });
                } else if (block.type === 'tool_use') {
                  const toolName = block.name || 'unknown';
                  onProgress({ type: 'stream', content: `\n[${toolName}]\n` });
                }
              }
            } else if (event.type === 'content_block_delta' && event.delta) {
              if (event.delta.type === 'text_delta' && event.delta.text) {
                onProgress({ type: 'stream', content: event.delta.text });
              } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                onProgress({ type: 'stream', content: event.delta.partial_json });
              }
            } else if (event.type === 'content_block_start' && event.content_block) {
              if (event.content_block.type === 'text' && event.content_block.text) {
                onProgress({ type: 'stream', content: event.content_block.text });
              } else if (event.content_block.type === 'tool_use') {
                onProgress({ type: 'stream', content: `\n[${event.content_block.name || 'tool'}]\n` });
              }
            } else if (event.type === 'result' && event.result) {
              output = event.result;
            } else if (json.type === 'result' && json.result) {
              output = json.result;
            }
          } catch (e) {
            onProgress({ type: 'stream', content: line });
          }
        }
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('Claude stderr:', data.toString());
      });

      claude.on('close', (code) => {
        console.log('Claude exited with code:', code);

        const processKey = `${visitorId}-${projectId}`;
        this.runningProcesses.delete(processKey);

        if (code === 0) {
          const currentHtml = userManager.readProjectFile(visitorId, projectId, 'index.html');

          const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
          if (htmlMatch) {
            userManager.writeProjectFile(visitorId, projectId, 'index.html', htmlMatch[1]);
          }

          const responseMsg = output.trim() || 'ゲームを更新しました';
          onProgress({ type: 'complete', message: responseMsg });
          resolve({ success: true, output: currentHtml });
        } else {
          const errorMsg = errorOutput || output || 'Unknown error';
          onProgress({ type: 'error', message: `エラーが発生しました: ${errorMsg}` });
          reject(new Error(errorMsg));
        }
      });

      claude.on('error', (err) => {
        onProgress({ type: 'error', message: `プロセスエラー: ${err.message}` });
        reject(err);
      });

      this.runningProcesses.set(`${visitorId}-${projectId}`, claude);
    });
  }

  cancelRun(processKey) {
    const process = this.runningProcesses.get(processKey);
    if (process) {
      process.kill();
      this.runningProcesses.delete(processKey);
      return true;
    }
    return false;
  }

  cancelJob(jobId) {
    return jobManager.cancelJob(jobId);
  }

  // Update specs asynchronously after code generation (selective update)
  async updateSpec(visitorId, projectId, userMessage = '') {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const indexPath = path.join(projectDir, 'index.html');

    if (!fs.existsSync(indexPath)) {
      console.log('No index.html, skipping spec update');
      return;
    }

    const currentCode = fs.readFileSync(indexPath, 'utf-8');

    // Skip if it's just the welcome page
    if (currentCode.length < 1000 && currentCode.includes('Welcome to Game Creator')) {
      return;
    }

    // Detect which specs need updating
    const relevantSpecs = await this.detectRelevantSpecs(userMessage);
    console.log(`Updating specs: ${relevantSpecs.join(', ')}`);

    // Always ensure progress.md is updated
    if (!relevantSpecs.includes('progress')) {
      relevantSpecs.push('progress');
    }

    // Update each relevant spec file
    for (const specType of relevantSpecs) {
      await this.updateSingleSpec(visitorId, projectId, specType, currentCode);
    }
  }

  // Update a single spec file
  async updateSingleSpec(visitorId, projectId, specType, currentCode) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    // Ensure specs directory exists
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    const specPath = path.join(specsDir, `${specType}.md`);
    const currentSpec = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf-8') : '';

    const templates = {
      game: `# ゲーム概要

## 基本情報
- ゲーム名: [名前]
- ジャンル: [シューティング/アクション/パズル/etc]
- タイプ: [横スクロール/縦スクロール/トップダウン/3D]
- 進行方向: [right/up/none]

## デザインスタイル
- アートスタイル: [kawaii/pixel/anime/etc]
- カラーパレット: [パステル/ビビッド/ダーク]
- スプライトの向き:
  - プレイヤー: [right/left/up/down]
  - 敵: [right/left/up/down]

## 世界観・テーマ
- 舞台: [宇宙/森/海/都市]
- 雰囲気: [明るい/ダーク/コミカル]`,

      mechanics: `# ゲームメカニクス

## キャラクター
### プレイヤー
- 外見: [詳細]
- HP: [数値]
- 移動速度: [数値]

### 敵
- 種類: [説明]
- 行動パターン: [説明]

## アイテム・パワーアップ
- [なし/アイテム名: 効果]

## 操作方法
- 移動: [説明]
- 攻撃/アクション: [説明]

## ゲームルール
- 勝利条件: [説明]
- ゲームオーバー条件: [説明]
- スコア: [説明]`,

      progress: `# 実装状況

## 完了
- [実装済み機能のリスト]

## 次の目標
- [予定の機能]`
    };

    return new Promise((resolve) => {
      const prompt = `ゲームコードを分析し、${specType}.md を更新してください。

## 現在のコード（抜粋）
\`\`\`html
${currentCode.substring(0, 6000)}
\`\`\`

## 現在の${specType}.md
${currentSpec || '（なし）'}

## テンプレート
${templates[specType]}

## 指示
- コードから読み取れる情報で更新
- 既存の値は維持（コードで確認できるもののみ変更）
- マークダウン形式で出力のみ（説明不要）`;

      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env }
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0 && output.includes('#')) {
          // Extract markdown content
          const content = output.trim();
          fs.writeFileSync(specPath, content, 'utf-8');
          console.log(`Updated specs/${specType}.md`);
        } else {
          console.log(`Failed to update ${specType}.md`);
        }
        resolve();
      });

      claude.on('error', () => {
        resolve();
      });

      // Timeout after 15 seconds per file
      setTimeout(() => {
        claude.kill();
        resolve();
      }, 15000);
    });
  }

  // Create initial specs (3 files) BEFORE code generation (for new projects)
  async createInitialSpec(visitorId, projectId, userMessage, dimension) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    console.log('Creating initial specs (3 files) before code generation...');

    // Create specs directory
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    return new Promise((resolve) => {
      const prompt = `ユーザーのリクエストからゲーム仕様を3つのJSONオブジェクトで出力してください。

## ユーザーのリクエスト
「${userMessage}」

## 検出された次元
${dimension === '3d' ? '3D' : dimension === '2d' ? '2D' : '未指定'}

## 出力フォーマット（厳守・JSON形式）
\`\`\`json
{
  "game": "# ゲーム概要\\n\\n## 基本情報\\n- ゲーム名: [名前]\\n- ジャンル: [シューティング/アクション/パズル/etc]\\n- タイプ: [横スクロール/縦スクロール/トップダウン/3D]\\n- 進行方向: [right/up/none]\\n\\n## デザインスタイル\\n- アートスタイル: [kawaii/pixel/anime/etc]\\n- カラーパレット: [パステル/ビビッド/ダーク]\\n- スプライトの向き:\\n  - プレイヤー: [right/left/up/down]\\n  - 敵: [right/left/up/down]\\n\\n## 世界観・テーマ\\n- 舞台: [宇宙/森/海/都市]\\n- 雰囲気: [明るい/ダーク/コミカル]",
  "mechanics": "# ゲームメカニクス\\n\\n## キャラクター\\n### プレイヤー\\n- 外見: [詳細]\\n- HP: [数値]\\n- 移動速度: [数値]\\n\\n### 敵\\n- 種類: [説明]\\n- 行動パターン: [説明]\\n\\n## アイテム・パワーアップ\\n- [なし/アイテム名: 効果]\\n\\n## 操作方法\\n- 移動: [説明]\\n- 攻撃/アクション: [説明]\\n\\n## ゲームルール\\n- 勝利条件: [説明]\\n- ゲームオーバー条件: [説明]\\n- スコア: [説明]",
  "progress": "# 実装状況\\n\\n## 完了\\n- 初期セットアップ\\n\\n## 次の目標\\n- 基本ゲームプレイの実装"
}
\`\`\`

## 注意
- デザインスタイル未指定時は「kawaii」をデフォルト
- スプライト向き: 横スクロール(右進行)→プレイヤーright/敵left、縦スクロール→プレイヤーup/敵down
- JSON形式で出力すること`;

      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env }
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        try {
          // Extract JSON from response
          const jsonMatch = output.match(/\{[\s\S]*"game"[\s\S]*"mechanics"[\s\S]*"progress"[\s\S]*\}/);
          if (jsonMatch) {
            const specs = JSON.parse(jsonMatch[0]);

            // Write 3 separate files
            if (specs.game) {
              fs.writeFileSync(path.join(specsDir, 'game.md'), specs.game, 'utf-8');
            }
            if (specs.mechanics) {
              fs.writeFileSync(path.join(specsDir, 'mechanics.md'), specs.mechanics, 'utf-8');
            }
            if (specs.progress) {
              fs.writeFileSync(path.join(specsDir, 'progress.md'), specs.progress, 'utf-8');
            }

            console.log('Initial specs created: game.md, mechanics.md, progress.md');

            // Return combined for backward compatibility
            resolve([specs.game, specs.mechanics, specs.progress].filter(Boolean).join('\n\n---\n\n'));
            return;
          }
        } catch (e) {
          console.error('Failed to parse spec JSON:', e.message);
        }

        // Fallback: create minimal specs
        console.log('Spec creation failed, creating minimal defaults');
        const defaults = this.createDefaultSpecs(userMessage, dimension);
        fs.writeFileSync(path.join(specsDir, 'game.md'), defaults.game, 'utf-8');
        fs.writeFileSync(path.join(specsDir, 'mechanics.md'), defaults.mechanics, 'utf-8');
        fs.writeFileSync(path.join(specsDir, 'progress.md'), defaults.progress, 'utf-8');
        resolve([defaults.game, defaults.mechanics, defaults.progress].join('\n\n---\n\n'));
      });

      claude.on('error', () => {
        console.log('Initial spec creation error');
        const defaults = this.createDefaultSpecs(userMessage, dimension);
        fs.writeFileSync(path.join(specsDir, 'game.md'), defaults.game, 'utf-8');
        fs.writeFileSync(path.join(specsDir, 'mechanics.md'), defaults.mechanics, 'utf-8');
        fs.writeFileSync(path.join(specsDir, 'progress.md'), defaults.progress, 'utf-8');
        resolve([defaults.game, defaults.mechanics, defaults.progress].join('\n\n---\n\n'));
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        claude.kill();
        console.log('Initial spec creation timeout');
        resolve(null);
      }, 15000);
    });
  }

  // Create default specs when AI fails
  createDefaultSpecs(userMessage, dimension) {
    const is3D = dimension === '3d';
    return {
      game: `# ゲーム概要

## 基本情報
- ゲーム名: 新規ゲーム
- ジャンル: アクション
- タイプ: ${is3D ? '3D' : '横スクロール'}
- 進行方向: ${is3D ? 'none' : 'right'}

## デザインスタイル
- アートスタイル: kawaii
- カラーパレット: パステル
- スプライトの向き:
  - プレイヤー: right
  - 敵: left

## 世界観・テーマ
- 舞台: ファンタジー
- 雰囲気: 明るい`,

      mechanics: `# ゲームメカニクス

## キャラクター
### プレイヤー
- 外見: かわいいキャラクター
- HP: 3
- 移動速度: 5

### 敵
- 種類: 基本的な敵
- 行動パターン: 直進

## アイテム・パワーアップ
- なし

## 操作方法
- 移動: タッチ/キーボード
- 攻撃/アクション: タップ/スペース

## ゲームルール
- 勝利条件: スコアを稼ぐ
- ゲームオーバー条件: HPが0になる
- スコア: 敵を倒すと加算`,

      progress: `# 実装状況

## 完了
- 初期セットアップ

## 次の目標
- 基本ゲームプレイの実装`
    };
  }

  // Check if SPEC.md has explicit design style (non-kawaii)
  hasExplicitDesignStyle(spec) {
    if (!spec) return false;

    // Look for design style section
    const designSection = spec.match(/## デザインスタイル[\s\S]*?(?=##|$)/i);
    if (!designSection) return false;

    const section = designSection[0].toLowerCase();

    // Check for non-kawaii styles explicitly specified
    const nonKawaiiStyles = [
      'pixel', 'ピクセル', 'ドット',
      'realistic', 'リアル', '写実',
      'dark', 'ダーク', '暗い',
      'retro', 'レトロ',
      'minimalist', 'ミニマル', 'シンプル',
      'anime', 'アニメ',
      'sci-fi', 'sf', 'サイファイ',
      'horror', 'ホラー',
      'military', 'ミリタリー',
      'cyberpunk', 'サイバーパンク',
      'steampunk', 'スチームパンク'
    ];

    for (const style of nonKawaiiStyles) {
      if (section.includes(style)) {
        console.log(`Explicit design style detected: ${style}`);
        return true;
      }
    }

    return false;
  }

  // Get design style from SPEC.md for image generation
  getDesignStyleFromSpec(spec) {
    if (!spec) return null;

    const designSection = spec.match(/## デザインスタイル[\s\S]*?(?=##|$)/i);
    if (!designSection) return null;

    const section = designSection[0];

    // Extract art style
    const artStyleMatch = section.match(/アートスタイル[:\s]+([^\n]+)/i);
    if (artStyleMatch) {
      return artStyleMatch[1].trim();
    }

    return null;
  }

  // Extract sprite direction from SPEC.md
  getDirectionFromSpec(spec, role) {
    if (!spec) return null;

    // Look for direction in "スプライトの向き" section or "デザインスタイル" section
    const directionSection = spec.match(/スプライトの向き[\s\S]*?(?=##|$)/i) ||
                             spec.match(/## デザインスタイル[\s\S]*?(?=##|$)/i);
    if (!directionSection) return null;

    const section = directionSection[0];
    const roleLower = role.toLowerCase();

    // Match patterns like "プレイヤー: right" or "- プレイヤー: facing right"
    let pattern;
    if (/player|プレイヤー/.test(roleLower)) {
      pattern = /プレイヤー[:\s]+.*?(right|left|up|down)/i;
    } else if (/enemy|敵/.test(roleLower)) {
      pattern = /敵[:\s]+.*?(right|left|up|down)/i;
    } else if (/bullet|弾/.test(roleLower)) {
      pattern = /弾[:\s]+.*?(right|left|up|down)/i;
    }

    if (pattern) {
      const match = section.match(pattern);
      if (match) {
        return match[1].toLowerCase();
      }
    }

    return null;
  }

  // Read SPEC.md for a project (legacy - reads old format or combines new format)
  readSpec(visitorId, projectId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const legacySpecPath = path.join(projectDir, 'SPEC.md');

    // Check for new 3-file format first
    if (fs.existsSync(specsDir)) {
      return this.readSpecs(visitorId, projectId);
    }

    // Fall back to legacy single file
    if (fs.existsSync(legacySpecPath)) {
      return fs.readFileSync(legacySpecPath, 'utf-8');
    }
    return null;
  }

  // Read new 3-file spec format and combine
  readSpecs(visitorId, projectId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    const specs = {
      game: this.readSpecFile(specsDir, 'game.md'),
      mechanics: this.readSpecFile(specsDir, 'mechanics.md'),
      progress: this.readSpecFile(specsDir, 'progress.md')
    };

    // Combine for backward compatibility with code generation
    const combined = [];
    if (specs.game) combined.push(specs.game);
    if (specs.mechanics) combined.push(specs.mechanics);
    if (specs.progress) combined.push(specs.progress);

    return combined.join('\n\n---\n\n') || null;
  }

  // Read a single spec file
  readSpecFile(specsDir, filename) {
    const filePath = path.join(specsDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  // Read specific spec file for targeted updates
  readSpecByType(visitorId, projectId, specType) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const filename = `${specType}.md`;
    return this.readSpecFile(specsDir, filename);
  }

  // Write a single spec file
  writeSpecFile(visitorId, projectId, specType, content) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    const filePath = path.join(specsDir, `${specType}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Wrote specs/${specType}.md`);
  }

  // Detect which spec files need updating based on user message
  async detectRelevantSpecs(userMessage) {
    return new Promise((resolve) => {
      const prompt = `ユーザーのメッセージから、更新が必要な仕様ファイルを判定してください。

## 仕様ファイルの種類
- game: 見た目・世界観に関する変更（色、スタイル、テーマ、雰囲気）
- mechanics: ゲームプレイに関する変更（キャラ、敵、アイテム、操作、ルール）
- progress: 何か実装したら常に更新

## ユーザーのメッセージ
「${userMessage}」

## 出力（JSON配列のみ）
例: ["mechanics", "progress"]`;

      const claude = spawn('claude', [
        '--print',
        '--model', 'haiku',
        '--dangerously-skip-permissions'
      ], {
        cwd: process.cwd(),
        env: { ...process.env }
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        try {
          const jsonMatch = output.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const specs = JSON.parse(jsonMatch[0]);
            const validSpecs = specs.filter(s => ['game', 'mechanics', 'progress'].includes(s));
            console.log('Relevant specs:', validSpecs.join(', '));
            resolve(validSpecs);
            return;
          }
        } catch (e) {
          console.error('Failed to parse spec detection:', e.message);
        }
        // Default: update mechanics and progress
        resolve(['mechanics', 'progress']);
      });

      claude.on('error', () => {
        resolve(['mechanics', 'progress']);
      });

      setTimeout(() => {
        claude.kill();
        resolve(['mechanics', 'progress']);
      }, 8000);
    });
  }
}

module.exports = {
  claudeRunner: new ClaudeRunner(),
  jobManager
};
