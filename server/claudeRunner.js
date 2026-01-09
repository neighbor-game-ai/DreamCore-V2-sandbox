const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const userManager = require('./userManager');
const jobManager = require('./jobManager');
const db = require('./database');
const geminiClient = require('./geminiClient');

// Game type bundles - automatically include related skills (GRANULAR)
const GAME_TYPE_BUNDLES = {
  '2d': {
    keywords: ['2d', '2次元', '二次元', 'p5', 'canvas', 'キャンバス'],
    includeSkills: ['p5js-setup']
  },
  '3d': {
    keywords: ['3d', '3次元', '三次元', 'three', '立体', 'webgl'],
    includeSkills: ['threejs-setup', 'threejs-lighting', 'kawaii-3d']
  },
  'shooting': {
    keywords: ['シューティング', 'shooting', 'shooter', '弾', 'bullet', '撃つ', 'shoot'],
    includeSkills: ['p5js-collision', 'particles-setup', 'particles-explosion']
  },
  'racing': {
    keywords: ['レース', 'race', 'racing', 'ドライブ', 'drive', '車', 'car'],
    includeSkills: ['vehicle-physics']
  },
  'action': {
    keywords: ['アクション', 'action', 'ジャンプ', 'jump', '移動', 'move', '走る', 'run'],
    includeSkills: ['p5js-input', 'p5js-collision']
  }
};

// Skills configuration with keywords for auto-detection (GRANULAR SKILLS)
const SKILLS_CONFIG = {
  // === KAWAII (デフォルトスタイル、ユーザー指定時は除外) ===
  'kawaii-colors': {
    keywords: ['かわいい', 'kawaii', 'パステル', 'pastel', 'ピンク', 'pink', 'ポップ', 'pop'],
    priority: 0,
    isDefaultStyle: true,  // デフォルトで適用（ユーザーがデザイン指定時は除外）
    // Note: excludeIf is checked against user message only, not code
    excludeIf: ['色を', '色は', '色で', 'カラーは', 'ダーク', 'dark', 'シンプル', 'simple', 'クール', 'cool', 'リアル', 'real', 'モノクロ', '地味']
  },

  // === 3D (Three.js) ===
  'threejs-setup': {
    keywords: ['3d', '3次元', '三次元', 'three', '立体', 'キューブ', 'cube', '球', 'sphere',
      'カメラ', 'camera', 'メッシュ', 'mesh', 'シーン', 'scene', 'webgl', '3dゲーム', '立体的'],
    priority: 1,
    excludeIf: ['2d', '2次元', '二次元']
  },
  'threejs-lighting': {
    keywords: ['ライト', 'light', '影', 'shadow', '照明', 'lighting'],
    priority: 2,
    requiresAny: ['threejs-setup']  // threejs-setupがある時のみ
  },
  'kawaii-3d': {
    keywords: ['トゥーン', 'toon', 'かわいい', 'kawaii', 'マテリアル', 'material'],
    priority: 2,
    requiresAny: ['threejs-setup']
  },

  // === 2D (P5.js) ===
  'p5js-setup': {
    keywords: ['2d', '2次元', '二次元', 'p5', 'キャンバス', 'canvas', 'シューティング', 'shooting',
      'アクション', 'action', 'ブロック崩し', 'breakout', 'スプライト', 'sprite'],
    priority: 1,
    isDefault: true,
    excludeIf: ['3d', '3次元', '三次元', 'three', '立体', 'webgl']
  },
  'p5js-input': {
    keywords: ['キーボード', 'keyboard', 'マウス', 'mouse', 'タッチ', 'touch', '操作', 'control',
      '入力', 'input', 'クリック', 'click', 'タップ', 'tap', 'スワイプ', 'swipe'],
    priority: 3,
    requiresAny: ['p5js-setup']
  },
  'p5js-collision': {
    keywords: ['当たり判定', 'collision', '衝突', 'ぶつかる', 'hit', '接触', 'contact'],
    priority: 3,
    requiresAny: ['p5js-setup']
  },

  // === オーディオ（明示的にリクエストされた場合のみ） ===
  'audio-synth': {
    keywords: ['音', 'sound', 'サウンド', '効果音', 'se', 'bgm', '音楽', 'music',
      '鳴る', '鳴らす', 'ピコピコ', '爆発音', 'ジャンプ音', '音を出す', '音をつけ', '音付き'],
    priority: 4
  },
  'audio-mobile': {
    keywords: [],  // audio-synthが選ばれたら自動で追加
    priority: 5,
    requiresAny: ['audio-synth']
  },

  // === UI ===
  'kawaii-ui': {
    keywords: ['ui', 'ボタン', 'button', 'スコア', 'score', 'メニュー', 'menu', 'フォント', 'font',
      'テキスト', 'text', '表示', 'display'],
    priority: 4
  },

  // === 既存スキル（そのまま維持） ===
  'game-ai': {
    keywords: ['ai', '敵', 'enemy', 'npc', '追いかけ', 'chase', '逃げる', 'flee',
      'パスファインディング', 'pathfinding', 'ステートマシン', 'state machine', '巡回', 'patrol'],
    priority: 6
  },
  'tween-animation': {
    keywords: ['アニメーション', 'animation', 'tween', 'gsap', 'イージング', 'easing',
      'フェード', 'fade', 'スライド', 'slide', 'バウンス', 'bounce'],
    priority: 6
  },
  'particles-setup': {
    keywords: ['パーティクル', 'particle', 'エフェクト', 'effect', 'tsparticles'],
    priority: 6
  },
  'particles-explosion': {
    keywords: ['爆発', 'explosion', '撃破', 'destroy', 'シューティング', 'shooting', '衝突', 'hit'],
    priority: 6,
    requiresAny: ['particles-setup']
  },
  'particles-effects': {
    keywords: ['紙吹雪', 'confetti', '花火', 'firework', '雪', 'snow', '火', 'fire', '星', 'star', 'キラキラ', 'sparkle'],
    priority: 6,
    requiresAny: ['particles-setup']
  },
  'vehicle-physics': {
    keywords: ['車', 'car', '車両', 'vehicle', 'ドライブ', 'drive', 'レース', 'race', 'racing',
      'ハンドル', 'steering', 'アクセル', 'accelerate', 'ドリフト', 'drift'],
    priority: 7
  }
};

// Keywords that indicate a game creation request (triggers default skill)
const GAME_KEYWORDS = ['ゲーム', 'game', '作って', '作成', 'create', 'make', '開発', 'develop', '遊べる', 'playable'];

class ClaudeRunner {
  constructor() {
    this.runningProcesses = new Map();
    this.skillsDir = path.join(__dirname, '..', '.claude', 'skills');
    this.availableSkills = this.listAvailableSkills();
  }

  // List available skills (for detection purposes only - CLI reads content)
  listAvailableSkills() {
    try {
      if (!fs.existsSync(this.skillsDir)) {
        console.log('Skills directory not found:', this.skillsDir);
        return new Set();
      }

      const skillFolders = fs.readdirSync(this.skillsDir).filter(f => {
        const skillPath = path.join(this.skillsDir, f, 'SKILL.md');
        return fs.existsSync(skillPath);
      });

      console.log(`Available skills: ${skillFolders.join(', ')}`);
      console.log('(Claude Code CLI will read skill content as needed)');
      return new Set(skillFolders);
    } catch (error) {
      console.error('Error listing skills:', error);
      return new Set();
    }
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
        '--dangerously-skip-permissions',
        prompt
      ], {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: true
      });

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

  // Auto-detect which skills to use based on user message
  // isNewProject: only apply default styles (kawaii-colors) for new projects
  detectSkills(userMessage, conversationHistory = [], isNewProject = false) {
    const detectedSkills = [];
    const bundledSkills = new Set();  // Track skills added via bundles
    const messageLower = userMessage.toLowerCase();

    // Also check recent conversation history
    const recentHistory = conversationHistory.slice(-5).map(h => h.content.toLowerCase()).join(' ');
    const fullContext = messageLower + ' ' + recentHistory;

    // Check if this is a game creation request
    const isGameRequest = GAME_KEYWORDS.some(keyword => fullContext.includes(keyword.toLowerCase()));

    // First, add skills with alwaysInclude flag (e.g., kawaii-design)
    for (const [skillName, config] of Object.entries(SKILLS_CONFIG)) {
      if (config.alwaysInclude && this.availableSkills.has(skillName)) {
        detectedSkills.push({
          name: skillName,
          matchCount: 100,  // High match count to ensure it's included
          priority: config.priority,
          isDefault: false
        });
        console.log(`Always including skill: ${skillName}`);
      }
    }

    // Then, check game type bundles to auto-include related skills
    for (const [bundleName, bundle] of Object.entries(GAME_TYPE_BUNDLES)) {
      const matchesBundle = bundle.keywords.some(keyword =>
        fullContext.includes(keyword.toLowerCase())
      );
      if (matchesBundle) {
        console.log(`Game type detected: ${bundleName}, auto-including: ${bundle.includeSkills.join(', ')}`);
        for (const skillName of bundle.includeSkills) {
          bundledSkills.add(skillName);
        }
      }
    }

    for (const [skillName, config] of Object.entries(SKILLS_CONFIG)) {
      if (!this.availableSkills.has(skillName)) continue;

      // Check if this skill should be excluded based on context
      if (config.excludeIf) {
        // For design/style skills, check only user message (not code history)
        const contextToCheck = config.isDefaultStyle ? messageLower : fullContext;
        const shouldExclude = config.excludeIf.some(keyword =>
          contextToCheck.includes(keyword.toLowerCase())
        );
        if (shouldExclude) {
          console.log(`Excluding ${skillName} due to exclusion keywords`);
          continue;
        }
      }

      const matchCount = config.keywords.filter(keyword =>
        fullContext.includes(keyword.toLowerCase())
      ).length;

      // Include if matched by keywords OR included via bundle
      if (matchCount > 0 || bundledSkills.has(skillName)) {
        detectedSkills.push({
          name: skillName,
          matchCount: matchCount + (bundledSkills.has(skillName) ? 10 : 0),  // Boost bundled skills
          priority: config.priority,
          isDefault: config.isDefault || false
        });
      }
    }

    // Sort by priority (asc) first, then match count (desc)
    // This ensures 3D gets priority when explicitly requested
    detectedSkills.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.matchCount - a.matchCount;
    });

    // If game request but no specific skills detected, use default
    const is3DRequest = ['3d', '3次元', '三次元', 'three', '立体'].some(k => fullContext.includes(k));

    if (isGameRequest && detectedSkills.length === 0) {
      if (is3DRequest && this.availableSkills.has('threejs-setup')) {
        detectedSkills.push({
          name: 'threejs-setup',
          matchCount: 1,
          priority: 1,
          isDefault: false
        });
        console.log('Using threejs-setup for 3D game request');
      } else if (this.availableSkills.has('p5js-setup')) {
        detectedSkills.push({
          name: 'p5js-setup',
          matchCount: 1,
          priority: 1,
          isDefault: true
        });
        console.log('Using p5js-setup as default for game request');
      }
    }

    // Remove duplicates
    let uniqueSkills = [...new Set(detectedSkills.map(s => s.name))];

    // Add default style (kawaii-colors) ONLY for new projects
    // Don't change the style of existing projects unless explicitly requested
    if (isNewProject) {
      const hasDesignKeywords = SKILLS_CONFIG['kawaii-colors']?.excludeIf?.some(k =>
        messageLower.includes(k.toLowerCase())
      );
      if (isGameRequest && !hasDesignKeywords && !uniqueSkills.includes('kawaii-colors')) {
        uniqueSkills.unshift('kawaii-colors');  // Add at beginning (highest priority)
        console.log('Adding default kawaii-colors style (new project)');
      }
    }

    // Add dependent skills (requiresAny)
    for (const [skillName, config] of Object.entries(SKILLS_CONFIG)) {
      if (config.requiresAny && !uniqueSkills.includes(skillName)) {
        const hasRequired = config.requiresAny.some(req => uniqueSkills.includes(req));
        if (hasRequired && this.availableSkills.has(skillName)) {
          uniqueSkills.push(skillName);
          console.log(`Adding ${skillName} (required by ${config.requiresAny.join('/')})`);
        }
      }
    }

    // Limit to 6 skills (granular skills are smaller, so we can include more)
    const limitedSkills = uniqueSkills.slice(0, 6);
    console.log('Detected skills:', limitedSkills.length > 0 ? limitedSkills.join(', ') : 'none');
    return limitedSkills;
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

  // Get skill descriptions (from frontmatter) for Stage 1
  getSkillDescriptions() {
    const descriptions = [];
    for (const skillName of this.availableSkills) {
      const config = SKILLS_CONFIG[skillName];
      if (config) {
        // Use description from SKILLS_CONFIG or read from file
        const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, 'utf-8');
            // Extract description from frontmatter
            const match = content.match(/description:\s*(.+)/);
            const desc = match ? match[1].trim() : skillName;
            descriptions.push(`- ${skillName}: ${desc}`);
          } catch (e) {
            descriptions.push(`- ${skillName}`);
          }
        }
      }
    }
    return descriptions.join('\n');
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

    // Take top 6 skills (granular skills are ~500 chars each)
    const selectedSkills = sortedSkills.slice(0, 6);
    console.log('Selected skills for Gemini:', selectedSkills);

    const rawContent = this.readSkillContents(selectedSkills);

    // Limit total to 8000 chars (6 granular skills)
    const limited = rawContent.substring(0, 8000);
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

      // Detect skills based on user message (pass isNewProject for default styles)
      const detectedSkills = this.detectSkills(userMessage, history, isNewProject);

      // Get skill content for Gemini (prioritized raw content)
      let skillSummary = null;
      if (detectedSkills.length > 0 && !debugOptions.disableSkills) {
        jobManager.updateProgress(jobId, 10, `スキル準備中: ${detectedSkills.slice(0, 3).join(', ')}`);
        skillSummary = this.getSkillContentForGemini(detectedSkills);
      }

      // Read SPEC.md for existing projects (to preserve specs)
      const gameSpec = !isNewProject ? this.readSpec(visitorId, projectId) : null;
      if (gameSpec) {
        console.log('Including SPEC.md in prompt to preserve existing specs');
      }

      jobManager.updateProgress(jobId, 20, 'Gemini APIでコード生成中...');
      console.log('Calling Gemini API for code generation...');

      let streamedChars = 0;

      // Call Gemini with streaming (include skill summary and game spec if available)
      const result = await geminiClient.generateCode({
        userMessage,
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
  async applyGeminiResult(visitorId, projectId, geminiResult, jobId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);

    try {
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

    // Build prompt (optionally disable skills)
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
      jobManager.updateProgress(jobId, 10, `使用スキル: ${detectedSkills.join(', ')}`);
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
        const applied = await this.applyGeminiResult(visitorId, projectId, geminiResult, jobId);

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

          // Update SPEC.md asynchronously (don't wait)
          this.updateSpec(visitorId, projectId).catch(err => {
            console.error('SPEC.md update error:', err.message);
          });

          return { success: true };
        }
      }
    } else {
      console.log('[DEBUG] Using Claude CLI (Gemini skipped)');
    }

    // Fall back to Claude Code CLI
    console.log('Using Claude Code CLI for job:', jobId, 'in:', projectDir);

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

          // Update SPEC.md asynchronously (don't wait)
          this.updateSpec(visitorId, projectId).catch(err => {
            console.error('SPEC.md update error:', err.message);
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

  // Update SPEC.md asynchronously after code generation
  async updateSpec(visitorId, projectId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specPath = path.join(projectDir, 'SPEC.md');
    const indexPath = path.join(projectDir, 'index.html');

    if (!fs.existsSync(indexPath)) {
      console.log('No index.html, skipping SPEC.md update');
      return;
    }

    const currentCode = fs.readFileSync(indexPath, 'utf-8');

    // Skip if it's just the welcome page
    if (currentCode.length < 1000 && currentCode.includes('Welcome to Game Creator')) {
      return;
    }

    console.log('Updating SPEC.md...');

    const prompt = `以下のゲームコードを分析し、SPEC.md を更新してください。

## 現在のコード
\`\`\`html
${currentCode}
\`\`\`

## SPEC.md のフォーマット（厳守）
\`\`\`markdown
# ゲーム仕様

## デザイン
- 背景色: [色]
- プレイヤー: [外見の説明]
- 敵: [外見の説明]
- UI: [スタイルの説明]

## 操作方法
- 移動: [操作方法]
- アクション: [操作方法]

## ゲームルール
- [ルール1]
- [ルール2]

## 現在の機能
- [機能1]
- [機能2]
\`\`\`

重要:
- 現在のコードから読み取れる仕様のみ記載
- 推測や提案は含めない
- シンプルに箇条書き

${specPath} を直接編集してください。`;

    return new Promise((resolve) => {
      const claude = spawn('claude', [
        '--print',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectDir,
        env: { ...process.env, HOME: process.env.HOME }
      });

      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          console.log('SPEC.md updated successfully');
        } else {
          console.log('SPEC.md update failed, code:', code);
        }
        resolve();
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        claude.kill();
        resolve();
      }, 30000);
    });
  }

  // Read SPEC.md for a project
  readSpec(visitorId, projectId) {
    const projectDir = userManager.getProjectDir(visitorId, projectId);
    const specPath = path.join(projectDir, 'SPEC.md');

    if (fs.existsSync(specPath)) {
      return fs.readFileSync(specPath, 'utf-8');
    }
    return null;
  }
}

module.exports = {
  claudeRunner: new ClaudeRunner(),
  jobManager
};
