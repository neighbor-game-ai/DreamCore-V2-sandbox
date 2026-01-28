const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const userManager = require('./userManager');
const jobManager = require('./jobManager');
const db = require('./database-supabase');
const { supabaseAdmin } = require('./supabaseClient');
const geminiClient = require('./geminiClient');
const claudeChat = require('./claudeChat');
const config = require('./config');

// Modal client for remote execution (lazy-loaded when USE_MODAL=true)
let modalClient = null;
function getModalClient() {
  if (!modalClient && config.USE_MODAL) {
    modalClient = require('./modalClient');
  }
  return modalClient;
}

// Sandbox runtime for secure Claude CLI execution
const USE_SANDBOX = process.env.USE_SANDBOX === 'true';
let SandboxManager = null;
let sandboxInitialized = false;
let sandboxInitPromise = null;
let sandboxInitFailed = false;
let sandboxConfig = null;

// Initialize sandbox-runtime if enabled
async function initSandbox() {
  if (!USE_SANDBOX || sandboxInitialized) return;
  if (sandboxInitPromise) return sandboxInitPromise;

  sandboxInitPromise = (async () => {
    try {
      const sandboxModule = await import('@anthropic-ai/sandbox-runtime');
      SandboxManager = sandboxModule.SandboxManager;

      // Load config from file or use defaults
      let config;
      const configPath = path.join(__dirname, 'sandbox-config.json');

      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log('[sandbox-runtime] Loaded config from sandbox-config.json');
      } else {
        config = {
          network: {
            allowedDomains: [
              'api.anthropic.com',
              '*.anthropic.com',
              'registry.npmjs.org',
              'cdn.jsdelivr.net',
              'cdnjs.cloudflare.com',
            ],
            deniedDomains: [],
            allowLocalBinding: false,
          },
          filesystem: {
            denyRead: ['~/.ssh', '~/.aws'],
            allowWrite: [process.env.DATA_DIR || './data', '/tmp'],
            denyWrite: ['.env', '*.pem', '*.key'],
          },
        };
      }

      // Normalize config shape
      config.network = config.network || {};
      config.filesystem = config.filesystem || {};
      config.network.allowedDomains = Array.isArray(config.network.allowedDomains) ? config.network.allowedDomains : [];
      config.network.deniedDomains = Array.isArray(config.network.deniedDomains) ? config.network.deniedDomains : [];
      config.filesystem.allowWrite = Array.isArray(config.filesystem.allowWrite) ? config.filesystem.allowWrite : [];
      config.filesystem.denyRead = Array.isArray(config.filesystem.denyRead) ? config.filesystem.denyRead : [];
      config.filesystem.denyWrite = Array.isArray(config.filesystem.denyWrite) ? config.filesystem.denyWrite : [];

      // Ensure DATA_DIR is writable
      const dataDir = process.env.DATA_DIR || './data';
      if (!config.filesystem.allowWrite.includes(dataDir)) {
        config.filesystem.allowWrite.push(dataDir);
      }

      sandboxConfig = config;

      await SandboxManager.initialize(config);
      sandboxInitialized = true;
      console.log('[sandbox-runtime] Initialized with secure configuration');
    } catch (e) {
      sandboxInitFailed = true;
      console.error('[sandbox-runtime] Failed to initialize:', e.message);
      console.log('[sandbox-runtime] Falling back to non-sandboxed execution');
    }
  })();

  return sandboxInitPromise;
}

function shellEscape(arg) {
  const value = String(arg ?? '');
  if (value === '') return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildClaudeCommand(args) {
  return ['claude', ...args].map(shellEscape).join(' ');
}

function getSandboxOverrides(options = {}) {
  const allowWrite = new Set(sandboxConfig?.filesystem?.allowWrite || []);
  if (options.cwd) {
    allowWrite.add(path.resolve(options.cwd));
  }
  if (Array.isArray(options.allowWritePaths)) {
    for (const p of options.allowWritePaths) {
      if (!p) continue;
      allowWrite.add(path.resolve(p));
    }
  }
  if (process.env.DATA_DIR) {
    allowWrite.add(path.resolve(process.env.DATA_DIR));
  }
  if (allowWrite.size === 0) return undefined;
  return {
    filesystem: {
      allowWrite: Array.from(allowWrite),
    },
  };
}

// Spawn Claude CLI with optional sandbox wrapping
async function spawnClaudeAsync(args, options = {}) {
  if (USE_SANDBOX) {
    await initSandbox();
  }

  if (USE_SANDBOX && SandboxManager && sandboxInitialized) {
    try {
      // Build a shell-safe claude command string
      const claudeCmd = buildClaudeCommand(args);

      // wrapWithSandbox returns a shell command string
      const wrappedCommand = await SandboxManager.wrapWithSandbox(
        claudeCmd,
        undefined,
        getSandboxOverrides(options)
      );

      if (wrappedCommand) {
        console.log('[sandbox-runtime] Running Claude in sandbox');
        // Execute the wrapped command via shell
        return spawn(wrappedCommand, {
          ...options,
          env: { ...process.env, ...options.env },
          shell: true,
        });
      }
    } catch (e) {
      console.error('[sandbox-runtime] Wrap failed:', e.message);
      // Fall through to non-sandboxed execution
    }
  } else if (USE_SANDBOX && sandboxInitFailed) {
    console.log('[sandbox-runtime] Sandbox disabled due to init failure');
  }

  // Fallback: direct spawn
  return spawn('claude', args, options);
}

// Synchronous wrapper that returns spawn immediately
// The sandbox wrapping happens async but we can't await in all contexts
function spawnClaude(args, options = {}) {
  if (USE_SANDBOX && SandboxManager && sandboxInitialized) {
    // For sync contexts, we fall back to non-sandboxed
    // Use spawnClaudeAsync for proper sandboxing
    console.log('[sandbox-runtime] Note: Use spawnClaudeAsync for sandbox support');
  }

  // Direct spawn (sandboxing requires async)
  return spawn('claude', args, options);
}

// Initialize sandbox on module load (non-blocking)
if (USE_SANDBOX) {
  initSandbox().catch(e => console.error('[sandbox-runtime] Init error:', e));
}

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
    // Lazy initialization - don't block server startup
    this._skillMetadata = null;
    this._skillMetadataPromise = null;
  }

  // Lazy getter for skill metadata - loads on first access
  async getSkillMetadata() {
    // Return cached data if available
    if (this._skillMetadata !== null) {
      return this._skillMetadata;
    }

    // If already loading, wait for the existing promise
    if (this._skillMetadataPromise) {
      return this._skillMetadataPromise;
    }

    // Start loading asynchronously
    this._skillMetadataPromise = this.collectSkillMetadataAsync();
    this._skillMetadata = await this._skillMetadataPromise;
    this._skillMetadataPromise = null;
    return this._skillMetadata;
  }

  // Preload skill metadata in background (call after server starts)
  preloadSkillMetadata() {
    if (this._skillMetadata === null && !this._skillMetadataPromise) {
      this._skillMetadataPromise = this.collectSkillMetadataAsync().then(metadata => {
        this._skillMetadata = metadata;
        this._skillMetadataPromise = null;
        return metadata;
      });
    }
    return this._skillMetadataPromise || Promise.resolve(this._skillMetadata);
  }

  /**
   * Clear Claude CLI prompt cache for a specific project directory
   * This prevents cross-project data leakage via API prompt caching
   *
   * Cache directory pattern: ~/.claude/projects/-{cwd_escaped}/
   * Example: /home/user/project/abc → ~/.claude/projects/-home-user-project-abc/
   */
  clearClaudeCache(projectDir) {
    try {
      const homeDir = process.env.HOME || '/root';
      // Convert project path to Claude's cache directory format
      // /home/notef/GameCreatorMVP/users/abc/123 → -home-notef-GameCreatorMVP-users-abc-123
      const escapedPath = projectDir.replace(/\//g, '-').replace(/^-/, '');
      const cacheDir = path.join(homeDir, '.claude', 'projects', `-${escapedPath}`);

      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`Cleared Claude cache: ${cacheDir}`);
      }

      // Also clear the main GameCreatorMVP cache to prevent cross-project leakage
      const mainProjectDir = path.join(__dirname, '..');
      const mainEscapedPath = mainProjectDir.replace(/\//g, '-').replace(/^-/, '');
      const mainCacheDir = path.join(homeDir, '.claude', 'projects', `-${mainEscapedPath}`);

      if (fs.existsSync(mainCacheDir)) {
        fs.rmSync(mainCacheDir, { recursive: true, force: true });
        console.log(`Cleared main Claude cache: ${mainCacheDir}`);
      }
    } catch (e) {
      console.error('Failed to clear Claude cache:', e.message);
    }
  }

  // Collect skill metadata from all SKILL.md files (name + description) - async version
  async collectSkillMetadataAsync() {
    const metadata = [];
    const fsPromises = require('fs').promises;

    try {
      try {
        await fsPromises.access(this.skillsDir);
      } catch {
        console.log('Skills directory not found:', this.skillsDir);
        return metadata;
      }

      const entries = await fsPromises.readdir(this.skillsDir, { withFileTypes: true });
      const skillFolders = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (EXCLUDED_SKILLS.includes(entry.name)) continue;
        const skillPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
        try {
          await fsPromises.access(skillPath);
          skillFolders.push(entry.name);
        } catch {
          // SKILL.md doesn't exist, skip
        }
      }

      // Read all skill files in parallel for better performance
      const readPromises = skillFolders.map(async (folder) => {
        const skillPath = path.join(this.skillsDir, folder, 'SKILL.md');
        try {
          const content = await fsPromises.readFile(skillPath, 'utf-8');
          // Extract frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const nameMatch = frontmatter.match(/name:\s*(.+)/);
            const descMatch = frontmatter.match(/description:\s*(.+)/);

            return {
              name: nameMatch ? nameMatch[1].trim() : folder,
              description: descMatch ? descMatch[1].trim() : folder
            };
          } else {
            return { name: folder, description: folder };
          }
        } catch (e) {
          console.error(`Failed to read skill ${folder}:`, e.message);
          return null;
        }
      });

      const results = await Promise.all(readPromises);
      for (const result of results) {
        if (result) metadata.push(result);
      }

      console.log(`Loaded ${metadata.length} skill(s): ${metadata.map(s => s.name).join(', ')}`);
      return metadata;
    } catch (error) {
      console.error('Error collecting skill metadata:', error);
      return metadata;
    }
  }

  // Get available skill names (async method)
  async getAvailableSkills() {
    const metadata = await this.getSkillMetadata();
    return new Set(metadata.map(s => s.name));
  }

  // Use Claude CLI to detect user intent (restore, chat, or edit)
  async detectIntent(userMessage) {
    // Use Modal for intent detection if enabled
    if (config.USE_MODAL) {
      try {
        const client = getModalClient();
        const intent = await client.detectIntent(userMessage);
        console.log('[detectIntent] Modal result:', intent);
        return intent;
      } catch (err) {
        console.error('[detectIntent] Modal error, falling back to local:', err.message);
        // Fall through to local execution
      }
    }

    // Local execution (original code)
    return this._detectIntentLocal(userMessage);
  }

  // Local intent detection using Claude CLI Haiku
  async _detectIntentLocal(userMessage) {
    return new Promise(async (resolve) => {
      const prompt = `ユーザーのメッセージの意図を判定してください。

メッセージ: "${userMessage}"

以下のいずれかを1単語で答えてください：
- restore: 元に戻したい、取り消したい、undoしたい場合
- chat: 質問、確認、相談、アイデア出し、提案依頼の場合（例：「考えて」「提案して」「教えて」「どうすればいい」「何がいい」）
- edit: 具体的なコード変更・実装を求めている場合（例：「作って」「追加して」「修正して」「変えて」）

重要: 「考えて」「提案して」「アイデアを出して」などはchatです。実際にコードを変更する指示のみeditです。

回答:`;

      const claude = await spawnClaudeAsync([
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
        const result = output.trim().toLowerCase();
        console.log('[detectIntent] Raw output:', output.trim());
        if (result.includes('restore')) {
          console.log('[detectIntent] Result: restore');
          resolve('restore');
        } else if (result.includes('chat')) {
          console.log('[detectIntent] Result: chat');
          resolve('chat');
        } else {
          console.log('[detectIntent] Result: edit (default)');
          resolve('edit');
        }
      });

      claude.on('error', (err) => {
        console.log('[detectIntent] Error:', err.message);
        resolve('edit'); // Default to edit on error
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        console.log('[detectIntent] TIMEOUT - defaulting to edit');
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

    return new Promise(async (resolve) => {
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

      const claude = await spawnClaudeAsync([
        '--print',
        '--model', 'sonnet',  // Use Sonnet for better image direction analysis
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

  // Get fallback skills based on framework and dimension
  // Used when Claude CLI fails
  // Note: Visual style is now determined by user selection, not hardcoded skills
  getFallbackSkills(framework, dimension, isNewProject) {
    // Priority 1: detected framework from existing code
    if (framework === 'threejs') {
      return ['threejs-setup'];
    }
    if (framework === 'p5js') {
      return ['p5js-setup'];
    }

    // Priority 2: detected dimension for new projects
    if (dimension === '3d') {
      return ['threejs-setup'];
    }
    if (dimension === '2d') {
      return ['p5js-setup'];
    }

    // Unknown - return empty
    return [];
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
    // Detect framework from current code
    const framework = this.detectFrameworkFromCode(currentCode);
    console.log(`Framework detection: ${framework || 'none'} (code length: ${currentCode?.length || 0})`);
    if (framework) {
      console.log(`Detected framework from code: ${framework}`);
    }

    // Use Modal for skill detection if enabled
    if (config.USE_MODAL) {
      try {
        const client = getModalClient();
        const effectiveDimension = dimension || (framework === 'threejs' ? '3d' : '2d');
        const skills = await client.detectSkills(userMessage, effectiveDimension, currentCode || '');
        console.log('[detectSkillsWithAI] Modal result:', skills.join(', ') || 'none');
        return skills;
      } catch (err) {
        console.error('[detectSkillsWithAI] Modal error, falling back to local:', err.message);
        // Fall through to local execution
      }
    }

    // Local execution (original code)
    return this._detectSkillsWithAILocal(userMessage, currentCode, isNewProject, gameSpec, dimension, framework);
  }

  // Local skill detection using Claude CLI Haiku
  async _detectSkillsWithAILocal(userMessage, currentCode, isNewProject, gameSpec, dimension, framework) {
    // Build skill list for prompt (lazy loaded)
    const metadata = await this.getSkillMetadata();
    const skillList = metadata.map(s => `- ${s.name}: ${s.description}`).join('\n');

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

    // Build prompt dynamically from loaded skills
    const prompt = `ユーザーのリクエストに最適なスキルを選んでJSON配列で出力せよ。説明不要。

利用可能なスキル:
${skillList}

リクエスト: "${userMessage}"
コンテキスト: ${contextInfo}
${specSummary ? `現在のゲーム仕様:\n${specSummary}` : ''}

出力（JSON配列のみ）:`;

    return new Promise(async (resolve) => {
      // Use haiku model for fast skill detection
      // Pass prompt via stdin to avoid shell escaping issues
      const claude = await spawnClaudeAsync([
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

      claude.on('close', async (code) => {
        try {
          // Extract JSON array from response
          const jsonMatch = output.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const skills = JSON.parse(jsonMatch[0]);
            // Filter to only available skills (use cached metadata from earlier in this method)
            const availableSkillNames = new Set(metadata.map(s => s.name));
            const validSkills = skills.filter(s => availableSkillNames.has(s));
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

  // Heuristic-based skill detection (async, uses simple heuristics)
  async detectSkills(userMessage, conversationHistory = [], isNewProject = false) {
    const messageLower = userMessage.toLowerCase();

    // Simple heuristic detection (fallback when async not available)
    // Include full-width numbers and physics/simulation terms that typically mean 3D
    const is3D = /3d|３d|３D|3次元|三次元|three|立体|webgl|球|ボール|ball|シミュレーション|simulation|物理/i.test(messageLower);
    const is2D = /2d|２d|２D|2次元|二次元|p5|canvas|キャンバス/i.test(messageLower);
    const isRacing = /車|car|レース|race|ドライブ|drive/i.test(messageLower);

    const skills = [];

    // Note: Visual style is now determined by user selection via visual guideline
    // No default style skills are added here

    // Core framework
    if (is3D) {
      skills.push('threejs-setup');
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

    const availableSkillSet = await this.getAvailableSkills();
    const validSkills = skills.filter(s => availableSkillSet.has(s)).slice(0, 10);
    console.log('Detected skills (heuristic):', validSkills.join(', ') || 'none');
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

  // Get skill descriptions (from metadata) - async
  async getSkillDescriptions() {
    const metadata = await this.getSkillMetadata();
    return metadata.map(s => `- ${s.name}: ${s.description}`).join('\n');
  }

  // Get skill content for Gemini (prioritized, granular skills)
  getSkillContentForGemini(detectedSkills) {
    if (detectedSkills.length === 0) {
      return null;
    }

    // Prioritize: setup skills first, then feature skills
    // Note: Visual style is now determined by user selection, not skills
    const priorityOrder = [
      'threejs-setup',      // 3D setup
      'p5js-setup',         // 2D setup
      'threejs-lighting',   // 3D lighting
      'p5js-input',         // 2D input
      'p5js-collision',     // 2D collision
      'audio-synth',        // Sound
      'audio-mobile'        // Mobile audio
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
  async buildPrompt(userId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const history = await userManager.getConversationHistory(null, userId, projectId);

    // Check if this is a new project
    const files = await userManager.listProjectFiles(userId, projectId);
    let isNewProject = true;
    if (files.length > 0) {
      const indexContent = await userManager.readProjectFile(userId, projectId, 'index.html');
      const isInitialWelcomePage = indexContent &&
        indexContent.length < 2000 &&
        indexContent.includes('Welcome to Game Creator');
      if (!isInitialWelcomePage) {
        isNewProject = false;
      }
    }

    const detectedSkills = await this.detectSkills(userMessage, history, isNewProject);
    const skillInstructions = this.getSkillInstructions(detectedSkills);

    // Directive prompt - require Claude to read and apply skills
    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}
${skillInstructions}

ユーザーの指示: ${userMessage}`;

    return { prompt, detectedSkills };
  }

  // Build prompt without skills (for debug mode)
  buildPromptWithoutSkills(userId, projectId, userMessage) {
    const projectDir = userManager.getProjectDir(userId, projectId);

    const prompt = `スマートフォン向けブラウザゲームを作成してください。

作業ディレクトリ: ${projectDir}

[DEBUG] スキル無効モード - スキルを参照せずに基本的な実装を行ってください。

ユーザーの指示: ${userMessage}`;

    return prompt;
  }

  // Generate images for the project and save them
  // gameCode and gameSpec are used by Haiku to determine image direction
  async generateProjectImages(userId, projectId, images, jobId, gameCode = null, gameSpec = null) {
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

        // Generate image - style is determined by user's visual guideline in the prompt
        // AI will interpret the prompt based on the selected visual style
        const result = await geminiClient.generateImage({
          prompt: enhancedPrompt,
          transparent: true
        });

        if (result.success && result.image) {
          // Save to project assets directory
          const assetPath = await userManager.saveGeneratedImage(
            null,  // Use admin client for background job
            userId,
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
  async tryGeminiGeneration(userId, projectId, userMessage, jobId, debugOptions = {}) {
    if (!geminiClient.isAvailable()) {
      console.log('Gemini not available, using Claude Code');
      return null;
    }

    try {
      const history = await userManager.getConversationHistory(null, userId, projectId);

      // Get current code (null for new projects)
      // Check if this is truly a new project (only has initial welcome page)
      const files = await userManager.listProjectFiles(userId, projectId);
      let currentCode = null;
      let isNewProject = true;

      if (files.length > 0) {
        // Check if it's just the initial welcome page
        const indexContent = await userManager.readProjectFile(userId, projectId, 'index.html');
        const isInitialWelcomePage = indexContent &&
          indexContent.length < 2000 &&
          indexContent.includes('Welcome to Game Creator');

        if (!isInitialWelcomePage) {
          // Real project with actual code
          isNewProject = false;
          const fileContents = await Promise.all(files.map(async f => {
            const content = await userManager.readProjectFile(userId, projectId, f);
            return `--- ${f} ---\n${content}`;
          }));
          currentCode = fileContents.join('\n\n');
        }
      }

      // For new projects, detect if 2D or 3D is specified
      let detectedDimension = null;
      let effectiveUserMessage = userMessage;

      if (isNewProject) {
        // Clear Claude CLI cache to prevent cross-project data leakage
        const projectDir = userManager.getProjectDir(userId, projectId);
        this.clearClaudeCache(projectDir);

        // First check if user is responding to dimension question
        const userMessageLower = userMessage.toLowerCase();
        const is2DSelection = userMessageLower.includes('2dで作成') || userMessageLower.includes('2dで') || userMessageLower === '2d';
        const is3DSelection = userMessageLower.includes('3dで作成') || userMessageLower.includes('3dで') || userMessageLower === '3d';

        if (is2DSelection || is3DSelection) {
          detectedDimension = is2DSelection ? '2d' : '3d';
          console.log(`User selected ${detectedDimension.toUpperCase()} from suggestion`);

          // Preserve visual guide from current message before combining
          // Match both old format (ビジュアルスタイル指定:) and new format (=== ビジュアルスタイルガイド)
          const visualGuideMatch = userMessage.match(/\n\n(===\s*ビジュアルスタイルガイド[\s\S]+)$/) ||
                                   userMessage.match(/\n\n(\[ビジュアルスタイル:[\s\S]+)$/);
          const visualGuide = visualGuideMatch ? visualGuideMatch[1] : '';
          if (visualGuide) {
            console.log('Preserving visual guide during dimension selection');
          }

          // Get original request from conversation history
          if (history && history.length > 0) {
            // Find the last user message that's not a dimension selection
            for (let i = history.length - 1; i >= 0; i--) {
              const msg = history[i];
              if (msg.role === 'user') {
                const msgLower = msg.content.toLowerCase();
                if (!msgLower.includes('2dで') && !msgLower.includes('3dで')) {
                  // Combine dimension + original request + visual guide
                  effectiveUserMessage = `${detectedDimension.toUpperCase()}で${msg.content}`;
                  if (visualGuide) {
                    effectiveUserMessage += `\n\n${visualGuide}`;
                  }
                  console.log('Combined message:', effectiveUserMessage.substring(0, 200) + '...');
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
            await userManager.addToHistory(null, userId, projectId, 'user', userMessage);

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

      // For existing projects: Read existing SPEC.md
      // For new projects: Spec will be created AFTER code generation by Gemini
      let gameSpec = null;
      if (!isNewProject) {
        gameSpec = this.readSpec(userId, projectId);
        if (gameSpec) {
          console.log('Including existing SPEC.md in code generation');
        }
      }

      // Read STYLE.md for visual consistency across updates
      let visualStyle = null;
      if (!isNewProject) {
        visualStyle = this.readStyle(userId, projectId);
        if (visualStyle) {
          console.log('Including existing STYLE.md in code generation');
        }
      }

      // For existing projects: Check if this is a chat request (question/consultation)
      // Use Claude Haiku for chat (cheaper and better context understanding)
      if (!isNewProject && claudeChat.isAvailable() && claudeChat.isChatRequest(effectiveUserMessage)) {
        console.log('Detected chat request, using Claude Haiku...');
        jobManager.updateProgress(jobId, 10, 'Claude Haikuで回答中...');

        try {
          const projectDir = userManager.getProjectDir(userId, projectId);
          const chatResult = await claudeChat.handleChat({
            userMessage: effectiveUserMessage,
            projectDir,
            gameSpec,
            currentCode,
            conversationHistory: history || []
          });

          jobManager.updateProgress(jobId, 100, '回答完了');
          jobManager.notifySubscribers(jobId, {
            type: 'geminiChat',  // Use same type for frontend compatibility
            mode: 'chat',
            message: chatResult.message,
            suggestions: chatResult.suggestions || []
          });

          return {
            mode: 'chat',
            message: chatResult.message,
            suggestions: chatResult.suggestions || []
          };
        } catch (chatError) {
          console.error('Claude Haiku chat failed, falling back to Gemini:', chatError.message);
          // Fall through to Gemini
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

      // Call Gemini with streaming (include skill summary, game spec, and visual style if available)
      const result = await geminiClient.generateCode({
        userMessage: effectiveUserMessage,
        currentCode,
        conversationHistory: history || [],
        skillSummary,
        gameSpec,  // Pass game spec to Gemini
        visualStyle,  // Pass visual style for consistency
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
          summary: result.summary,
          suggestions: result.suggestions || []
        });

        // Add AI context info for traceability
        result.detectedSkills = detectedSkills;
        result.userPrompt = effectiveUserMessage;

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
  // aiContext contains prompt/skills info for traceability
  async applyGeminiResult(userId, projectId, geminiResult, jobId, gameCode = null, gameSpec = null, aiContext = null) {
    const projectDir = userManager.getProjectDir(userId, projectId);

    try {
      // Generate images if requested by Gemini
      let generatedAssets = {};
      if (geminiResult.images && geminiResult.images.length > 0) {
        console.log(`Gemini requested ${geminiResult.images.length} image(s)`);
        jobManager.updateProgress(jobId, 52, `画像を生成中...`);

        // Pass gameCode and gameSpec for Haiku to analyze image direction
        generatedAssets = await this.generateProjectImages(
          userId,
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

      // Helper function to replace asset references in content
      // Replaces "assets/[name]" with the actual API path "/api/assets/{assetId}"
      const replaceAssetReferences = (content) => {
        if (Object.keys(generatedAssets).length === 0) return content;

        let result = content;
        for (const [name, apiPath] of Object.entries(generatedAssets)) {
          // Escape special regex characters in filename
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match assets/filename pattern
          const pattern = new RegExp(`assets/${escapedName}`, 'g');

          const beforeLength = result.length;
          result = result.replace(pattern, apiPath);

          if (result.length !== beforeLength || result.includes(apiPath)) {
            console.log(`Replaced asset reference: assets/${name} -> ${apiPath}`);
          }
        }
        return result;
      };

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

          // Replace asset references in new_string before applying
          const newString = replaceAssetReferences(edit.new_string);
          content = content.replace(edit.old_string, newString);
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

          // Replace asset references before writing file
          const content = replaceAssetReferences(file.content);
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log('Written:', file.path);
        }
      }

      // Sync files to Modal Volume when USE_MODAL=true
      if (config.USE_MODAL) {
        jobManager.updateProgress(jobId, 88, 'Modal Volumeに同期中...');
        try {
          const client = getModalClient();
          const commitMessage = geminiResult.summary || 'Gemini generated code';

          // Collect files for Modal sync
          const filesToSync = [];
          if (geminiResult.mode === 'edit' && geminiResult.edits) {
            // For edit mode, re-read the edited files
            for (const edit of geminiResult.edits) {
              const filePath = path.join(projectDir, edit.path);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                filesToSync.push({ path: edit.path, content });
              }
            }
          } else if (geminiResult.files) {
            // For create mode, use the files from result (with asset replacements applied)
            for (const file of geminiResult.files) {
              const filePath = path.join(projectDir, file.path);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                filesToSync.push({ path: file.path, content });
              }
            }
          }

          if (filesToSync.length > 0) {
            // Call Modal's applyFiles (includes git commit)
            for await (const event of client.applyFiles({
              user_id: userId,
              project_id: projectId,
              files: filesToSync,
              commit_message: commitMessage
            })) {
              // Log Modal sync progress
              if (event.type === 'log') {
                console.log(`[Modal sync] ${event.content}`);
              }
            }
            console.log(`[Modal sync] Synced ${filesToSync.length} files to Modal Volume`);
          }
        } catch (modalErr) {
          console.error('[Modal sync] Failed to sync to Modal Volume:', modalErr.message);
          // Continue even if Modal sync fails - local files are still valid
        }
      } else {
        // Local mode: Create git commit with AI context
        jobManager.updateProgress(jobId, 88, 'バージョン保存中...');
        userManager.createVersionSnapshot(
          userId,
          projectId,
          geminiResult.summary || 'Gemini generated code',
          aiContext  // Pass AI context for traceability
        );
      }

      jobManager.updateProgress(jobId, 95, 'ファイル適用完了');
      return true;
    } catch (error) {
      console.error('Failed to apply Gemini result:', error.message);
      return false;
    }
  }

  // Run Claude as an async job
  async runClaudeAsJob(userId, projectId, userMessage, debugOptions = {}) {
    // userId comes from Supabase Auth JWT (already validated)

    // Check for existing active job
    const existingJob = await jobManager.getActiveJob(projectId);
    if (existingJob) {
      return { job: existingJob, isExisting: true, startProcessing: () => {} };
    }

    // Check slot availability before creating job (fail fast)
    // This throws if slot is not available
    jobManager.acquireSlot(userId);

    // Create new job (slot already acquired)
    const job = await jobManager.createJob(userId, projectId);

    // Return job with a function to start processing (allows caller to subscribe first)
    return {
      job,
      isExisting: false,
      startProcessing: () => {
        // Process job with slot management (slot already acquired)
        this.processJobWithSlot(job.id, userId, projectId, userMessage, debugOptions);
      }
    };
  }

  // Wrapper that ensures slot is released after job completion
  async processJobWithSlot(jobId, userId, projectId, userMessage, debugOptions = {}) {
    const config = require('./config');
    const timeout = config.RATE_LIMIT.cli.timeout;

    // Create timeout promise
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.log(`Job ${jobId} timed out after ${timeout}ms`);
        // Cancel the job
        this.cancelJob(jobId).catch(err => {
          console.error('Failed to cancel timed out job:', err.message);
        });
        reject(new Error('JOB_TIMEOUT'));
      }, timeout);
    });

    try {
      // Race between job completion and timeout
      await Promise.race([
        this.processJob(jobId, userId, projectId, userMessage, debugOptions),
        timeoutPromise
      ]);
    } catch (err) {
      if (err.message === 'JOB_TIMEOUT') {
        await jobManager.failJob(jobId, 'Job timed out after 5 minutes');
      }
      // Re-throw other errors (they're already handled in processJob)
    } finally {
      // Clear timeout and release slot
      clearTimeout(timeoutId);
      jobManager.releaseSlot(userId);
    }
  }

  // Process job (runs in background)
  async processJob(jobId, userId, projectId, userMessage, debugOptions = {}) {
    const projectDir = userManager.getProjectDir(userId, projectId);

    // Debug: Log the full user message to verify visual guideline is included
    console.log(`[ProcessJob] User message length: ${userMessage.length}`);
    console.log(`[ProcessJob] Has visual guideline: ${userMessage.includes('ビジュアルスタイル指定')}`);
    if (userMessage.includes('ビジュアルスタイル指定')) {
      const styleMatch = userMessage.match(/ビジュアルスタイル指定: (.+)/);
      console.log(`[ProcessJob] Style: ${styleMatch ? styleMatch[1] : 'unknown'}`);
    }

    // Use Claude CLI to detect user intent
    await jobManager.startJob(jobId);
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

      await jobManager.completeJob(jobId, {
        message: 'リストア確認',
        mode: 'restore',
        generator: 'claude'
      });

      return { success: true };
    }

    // Handle chat intent (question/consultation) - use Claude Haiku
    if (intent === 'chat') {
      console.log('Chat intent detected by Claude, using Haiku...');

      // Check if project exists (chat only makes sense for existing projects)
      const projectDir = userManager.getProjectDir(userId, projectId);
      const indexPath = require('path').join(projectDir, 'index.html');
      const projectExists = require('fs').existsSync(indexPath);

      if (projectExists && claudeChat.isAvailable()) {
        jobManager.updateProgress(jobId, 10, 'Claude Haikuで回答中...');

        try {
          const gameSpec = this.readSpec(userId, projectId);
          const history = await userManager.getConversationHistory(null, userId, projectId);
          const chatResult = await claudeChat.handleChat({
            userMessage,
            projectDir,
            gameSpec,
            conversationHistory: history || []
          });

          jobManager.updateProgress(jobId, 100, '回答完了');
          jobManager.notifySubscribers(jobId, {
            type: 'geminiChat',
            mode: 'chat',
            message: chatResult.message,
            suggestions: chatResult.suggestions || []
          });

          // Save to history
          const historyMessage = chatResult.suggestions?.length > 0
            ? `${chatResult.message}\n\n提案: ${chatResult.suggestions.join('、')}`
            : chatResult.message;
          await userManager.addToHistory(null, userId, projectId, 'assistant', historyMessage);

          await jobManager.completeJob(jobId, {
            message: chatResult.message,
            mode: 'chat',
            generator: 'haiku'
          });

          console.log('Job completed with Haiku (chat mode):', jobId);
          return { success: true };
        } catch (chatError) {
          console.error('Haiku chat failed, falling back to Gemini:', chatError.message);
          // Fall through to Gemini
        }
      } else {
        console.log('Project not found or Haiku unavailable, falling back to Gemini');
      }
    }

    // Skip Gemini if useClaude is enabled
    if (!debugOptions.useClaude) {
      // Try Gemini first for code generation
      const geminiResult = await this.tryGeminiGeneration(userId, projectId, userMessage, jobId, debugOptions);

      if (geminiResult) {
        // Handle chat mode (no code changes, just conversation)
        if (geminiResult.mode === 'chat') {
          const responseMessage = geminiResult.message || '回答しました';
          // Include suggestions in saved message for history
          const historyMessage = geminiResult.suggestions?.length > 0
            ? `${responseMessage}\n\n提案: ${geminiResult.suggestions.join('、')}`
            : responseMessage;
          await userManager.addToHistory(null, userId, projectId, 'assistant', historyMessage);

          await jobManager.completeJob(jobId, {
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
          gameCodeForImages = await userManager.readProjectFile(userId, projectId, 'index.html');
        } else if (geminiResult.files && geminiResult.files.length > 0) {
          const indexFile = geminiResult.files.find(f => f.path === 'index.html');
          gameCodeForImages = indexFile ? indexFile.content : geminiResult.files[0].content;
        }
        const gameSpec = this.readSpec(userId, projectId);

        // Build AI context for traceability
        const aiContext = {
          userPrompt: geminiResult.userPrompt || userMessage,
          aiSummary: geminiResult.summary || '',
          skills: geminiResult.detectedSkills || [],
          generator: 'gemini',
          edits: geminiResult.edits || []
        };

        const applied = await this.applyGeminiResult(userId, projectId, geminiResult, jobId, gameCodeForImages, gameSpec, aiContext);

        if (applied) {
          const responseMessage = geminiResult.summary || 'Geminiでゲームを生成しました';
          await userManager.addToHistory(null, userId, projectId, 'assistant', responseMessage);

          const currentHtml = await userManager.readProjectFile(userId, projectId, 'index.html');
          await jobManager.completeJob(jobId, {
            message: responseMessage,
            html: currentHtml,
            generator: 'gemini'
          });

          console.log('Job completed with Gemini:', jobId);

          // Create/Update specs asynchronously (don't wait)
          // For create mode: use specs from Gemini response (if available)
          // For edit mode: update existing spec
          if (geminiResult.mode === 'create') {
            // Use specs from Gemini response directly (saves Sonnet API call)
            if (geminiResult.specs) {
              this.saveSpecsFromGemini(userId, projectId, geminiResult.specs)
                .then(() => {
                  console.log('Specs saved from Gemini response');
                  return this.maybeAutoRenameProject(userId, projectId);
                })
                .then(renamed => {
                  if (renamed) {
                    jobManager.notifySubscribers(jobId, {
                      type: 'projectRenamed',
                      project: renamed
                    });
                  }
                })
                .catch(err => {
                  console.error('Spec save error:', err.message);
                });
            } else {
              // Fallback: create spec from code if Gemini didn't include specs
              console.log('No specs in Gemini response, using fallback');
              this.createInitialSpecFromCode(userId, projectId, userMessage, null, gameCodeForImages)
                .then(() => {
                  return this.maybeAutoRenameProject(userId, projectId);
                })
                .then(renamed => {
                  if (renamed) {
                    jobManager.notifySubscribers(jobId, {
                      type: 'projectRenamed',
                      project: renamed
                    });
                  }
                })
                .catch(err => {
                  console.error('Spec creation error:', err.message);
                });
            }
          } else {
            this.updateSpec(userId, projectId, userMessage)
              .then(() => {
                // Auto-rename after spec is updated
                return this.maybeAutoRenameProject(userId, projectId);
              })
              .then(renamed => {
                if (renamed) {
                  jobManager.notifySubscribers(jobId, {
                    type: 'projectRenamed',
                    project: renamed
                  });
                }
              })
              .catch(err => {
                console.error('Spec update error:', err.message);
              });
          }

          return { success: true };
        }
      }
    } else {
      console.log('[DEBUG] Using Claude CLI (Gemini skipped)');
    }

    // Build prompt for Claude CLI
    let prompt, detectedSkills;
    if (debugOptions.disableSkills) {
      console.log('[DEBUG] Skills disabled');
      prompt = this.buildPromptWithoutSkills(userId, projectId, userMessage);
      detectedSkills = [];
    } else {
      const result = await this.buildPrompt(userId, projectId, userMessage);
      prompt = result.prompt;
      detectedSkills = result.detectedSkills;
    }

    if (detectedSkills.length > 0) {
      jobManager.updateProgress(jobId, 10, `Claude CLI スキル: ${detectedSkills.join(', ')}`);
    }

    // Use Modal for Claude CLI execution if enabled
    if (config.USE_MODAL) {
      console.log('Using Claude CLI on Modal for job:', jobId);
      return this._runClaudeOnModal(jobId, userId, projectId, prompt, userMessage, detectedSkills);
    }

    // Fall back to local Claude Code CLI
    console.log('Using local Claude Code CLI for job:', jobId, 'in:', projectDir);
    return this._runClaudeLocal(jobId, userId, projectId, projectDir, prompt, userMessage, detectedSkills);
  }

  // Run Claude CLI on Modal (remote execution)
  async _runClaudeOnModal(jobId, userId, projectId, prompt, userMessage, detectedSkills) {
    try {
      const client = getModalClient();
      let assistantText = '';
      let progressEstimate = 20;
      let exitCode = null;

      jobManager.updateProgress(jobId, 15, 'Modal Sandbox 実行中...');

      for await (const event of client.generateGame({
        user_id: userId,
        project_id: projectId,
        prompt: prompt,
      })) {
        switch (event.type) {
          case 'stream':
            // Stream content to WebSocket subscribers
            if (event.content) {
              assistantText += event.content;
              jobManager.notifySubscribers(jobId, { type: 'stream', content: event.content });
            }
            break;

          case 'progress':
            // Update progress
            progressEstimate = Math.min(progressEstimate + 10, 90);
            jobManager.updateProgress(jobId, progressEstimate, event.message || '実行中...');
            break;

          case 'log':
            // Log messages from Modal (debug/verbose output)
            if (event.content) {
              console.log('[Modal log]', event.content);
              // Check for tool usage in log messages
              const toolMatch = event.content.match(/\[(\w+)\]/);
              if (toolMatch) {
                progressEstimate = Math.min(progressEstimate + 15, 90);
                jobManager.updateProgress(jobId, progressEstimate, `実行中: ${toolMatch[1]}`);
                jobManager.notifySubscribers(jobId, { type: 'stream', content: `\n[${toolMatch[1]}]\n` });
              }
            }
            break;

          case 'debug':
            // Debug info from Modal
            console.log('[Modal debug]', event);
            if (event.exit_code !== undefined) {
              exitCode = event.exit_code;
            }
            break;

          case 'completed':
            // Execution completed
            exitCode = event.exit_code !== undefined ? event.exit_code : 0;
            console.log('Claude job on Modal', jobId, 'completed with exit code:', exitCode);
            break;

          case 'failed':
            // Execution failed
            console.error('Claude job on Modal failed:', event.message || event.error);
            await jobManager.failJob(jobId, event.message || event.error || 'Modal execution failed');
            return { success: false, error: event.message || event.error };

          default:
            // Pass through other events
            console.log('[Modal event]', event.type, event);
        }
      }

      // Process result
      if (exitCode === 0 || exitCode === null) {
        // Read updated file from Modal
        const currentHtml = await userManager.readProjectFile(userId, projectId, 'index.html');

        // Use collected assistant text or default message
        const responseMessage = assistantText.trim() || 'ゲームを更新しました';

        // Build AI context for traceability
        const aiContext = {
          userPrompt: userMessage,
          aiSummary: responseMessage,
          skills: detectedSkills,
          generator: 'claude-modal'
        };

        // Note: Version snapshot is handled by Modal (git commit happens in apply_files)
        // We still log the AI context locally for Express-side tracking
        console.log('Modal job completed, response:', responseMessage.substring(0, 100));

        // Add to history
        await userManager.addToHistory(null, userId, projectId, 'assistant', responseMessage);

        // Complete the job with the actual response
        await jobManager.completeJob(jobId, {
          message: responseMessage,
          html: currentHtml
        });

        // Update specs asynchronously (don't wait)
        this.updateSpec(userId, projectId, userMessage).catch(err => {
          console.error('Spec update error:', err.message);
        });

        // Auto-rename project if it has default name
        this.maybeAutoRenameProject(userId, projectId).then(renamed => {
          if (renamed) {
            jobManager.notifySubscribers(jobId, {
              type: 'projectRenamed',
              project: renamed
            });
          }
        }).catch(err => {
          console.error('Auto-rename error:', err.message);
        });

        return { success: true };
      } else {
        const errorMsg = `Claude CLI exited with code ${exitCode}`;
        await jobManager.failJob(jobId, errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      console.error('Modal execution error:', err.message);
      await jobManager.failJob(jobId, err.message);
      return { success: false, error: err.message };
    }
  }

  // Run Claude CLI locally (original implementation)
  async _runClaudeLocal(jobId, userId, projectId, projectDir, prompt, userMessage, detectedSkills) {
    return new Promise(async (resolve) => {
      const claude = await spawnClaudeAsync([
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

      claude.on('close', async (code) => {
        try {
          console.log('Claude job', jobId, 'exited with code:', code);

          if (code === 0) {
            // Read updated file
            const currentHtml = await userManager.readProjectFile(userId, projectId, 'index.html');

            // Extract HTML from response if present
            const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
            if (htmlMatch) {
              await userManager.writeProjectFile(null, userId, projectId, 'index.html', htmlMatch[1]);
            }

            // Use collected assistant text or default message
            const responseMessage = assistantText.trim() || 'ゲームを更新しました';

            // Build AI context for traceability
            const aiContext = {
              userPrompt: userMessage,
              aiSummary: responseMessage,
              skills: detectedSkills,
              generator: 'claude'
            };

            // Create version snapshot with AI context
            userManager.createVersionSnapshot(userId, projectId, userMessage.substring(0, 50), aiContext);

            // Add to history
            await userManager.addToHistory(null, userId, projectId, 'assistant', responseMessage);

            // Complete the job with the actual response
            await jobManager.completeJob(jobId, {
              message: responseMessage,
              html: currentHtml
            });

            // Update specs asynchronously (don't wait) - pass userMessage for selective update
            this.updateSpec(userId, projectId, userMessage).catch(err => {
              console.error('Spec update error:', err.message);
            });

            // Auto-rename project if it has default name
            this.maybeAutoRenameProject(userId, projectId).then(renamed => {
              if (renamed) {
                jobManager.notifySubscribers(jobId, {
                  type: 'projectRenamed',
                  project: renamed
                });
              }
            }).catch(err => {
              console.error('Auto-rename error:', err.message);
            });

            resolve({ success: true });
          } else {
            const errorMsg = errorOutput || output || 'Unknown error';
            await jobManager.failJob(jobId, errorMsg);
            resolve({ success: false, error: errorMsg });
          }
        } catch (err) {
          console.error('Error in close handler:', err);
          resolve({ success: false, error: err.message });
        }
      });

      claude.on('error', async (err) => {
        try {
          await jobManager.failJob(jobId, err.message);
          resolve({ success: false, error: err.message });
        } catch (handlerErr) {
          console.error('Error in error handler:', handlerErr);
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  // Legacy sync method (kept for backward compatibility)
  async runClaude(userId, projectId, userMessage, onProgress) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const { prompt, detectedSkills } = await this.buildPrompt(userId, projectId, userMessage);

    if (detectedSkills.length > 0) {
      console.log('Detected skills:', detectedSkills.join(', '));
      onProgress({ type: 'info', message: `使用スキル: ${detectedSkills.join(', ')}` });
    }

    return new Promise(async (resolve, reject) => {
      onProgress({ type: 'status', message: 'Claude Codeを実行中...' });

      console.log('Running Claude in:', projectDir);
      console.log('Prompt length:', prompt.length);

      const claude = await spawnClaudeAsync([
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

      claude.on('close', async (code) => {
        try {
          console.log('Claude exited with code:', code);

          const processKey = `${userId}-${projectId}`;
          this.runningProcesses.delete(processKey);

          if (code === 0) {
            const currentHtml = await userManager.readProjectFile(userId, projectId, 'index.html');

            const htmlMatch = output.match(/```html\n([\s\S]*?)```/);
            if (htmlMatch) {
              await userManager.writeProjectFile(null, userId, projectId, 'index.html', htmlMatch[1]);
            }

            const responseMsg = output.trim() || 'ゲームを更新しました';
            onProgress({ type: 'complete', message: responseMsg });
            resolve({ success: true, output: currentHtml });
          } else {
            const errorMsg = errorOutput || output || 'Unknown error';
            onProgress({ type: 'error', message: `エラーが発生しました: ${errorMsg}` });
            reject(new Error(errorMsg));
          }
        } catch (err) {
          console.error('Error in close handler:', err);
          reject(err);
        }
      });

      claude.on('error', (err) => {
        onProgress({ type: 'error', message: `プロセスエラー: ${err.message}` });
        reject(err);
      });

      this.runningProcesses.set(`${userId}-${projectId}`, claude);
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

  async cancelJob(jobId) {
    return await jobManager.cancelJob(jobId);
  }

  // Update specs asynchronously after code generation (selective update)
  async updateSpec(userId, projectId, userMessage = '') {
    console.log('[updateSpec] Called for project:', projectId);
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const indexPath = path.join(projectDir, 'index.html');

    if (!fs.existsSync(indexPath)) {
      console.log('[updateSpec] No index.html, skipping');
      return;
    }

    // Skip if it's just the welcome page
    const currentCode = fs.readFileSync(indexPath, 'utf-8');
    if (currentCode.length < 2000 && currentCode.includes('Welcome to Game Creator')) {
      return;
    }

    // Get diff from git (last commit vs current)
    let diff = '';
    try {
      const { execFileSync } = require('child_process');
      // Try diff between last commit and current
      try {
        diff = execFileSync('git', ['diff', 'HEAD~1', 'HEAD', '--', 'index.html'], {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
      } catch {
        // Fallback: diff of staged/unstaged changes
        diff = execFileSync('git', ['diff', 'HEAD', '--', 'index.html'], {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
      }
    } catch (e) {
      console.log('[updateSpec] Could not get git diff:', e.message);
    }

    // Skip if no changes
    if (!diff) {
      console.log('[updateSpec] No diff found, skipping');
      return;
    }

    console.log(`[updateSpec] Diff size: ${diff.length} chars`);

    // Update specs with diff (not full code)
    await this.updateSpecsWithDiff(userId, projectId, userMessage, diff);
  }

  // Update specs using diff (not full code) - more efficient
  async updateSpecsWithDiff(userId, projectId, userMessage, diff) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    // Ensure specs directory exists
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    // Read current specs
    const currentSpecs = {};
    for (const specType of ['game', 'mechanics', 'progress']) {
      const specPath = path.join(specsDir, `${specType}.md`);
      currentSpecs[specType] = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf-8') : '';
    }

    const prompt = `ゲームコードの差分を分析し、仕様書を更新してください。

## ユーザーの変更リクエスト
「${userMessage}」

## コードの差分（git diff）
\`\`\`diff
${diff.substring(0, 4000)}
\`\`\`

## 現在の仕様書
### game.md
${currentSpecs.game || '（なし）'}

### mechanics.md
${currentSpecs.mechanics || '（なし）'}

### progress.md
${currentSpecs.progress || '（なし）'}

## 指示
- 差分から変更内容を読み取り、関連する仕様を更新
- 変更がない部分は維持
- 新しい画像アセットが追加された場合は「使用画像アセット」セクションに追加
- 画像の役割（プレイヤー、敵、背景、アイテム等）をコードの使われ方から推測して記載
- JSON形式で3つのファイル内容を出力

## 出力形式（厳守）
\`\`\`json
{
  "game": "更新後のgame.md内容（変更なければ現在のまま）",
  "mechanics": "更新後のmechanics.md内容（変更なければ現在のまま）",
  "progress": "更新後のprogress.md内容（今回の変更を追記）"
}
\`\`\``;

    return new Promise(async (resolve) => {
      const claude = await spawnClaudeAsync([
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
      let stderr = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      claude.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claude.on('close', async (code) => {
        if (stderr) {
          console.log('[updateSpec] stderr:', stderr.substring(0, 500));
        }
        console.log('[updateSpec] exit code:', code);
        try {
          console.log('[updateSpec] Haiku response length:', output.length);
          const jsonMatch = output.match(/\{[\s\S]*"game"[\s\S]*"mechanics"[\s\S]*"progress"[\s\S]*\}/);
          if (jsonMatch) {
            console.log('[updateSpec] JSON found, parsing...');
            const specs = JSON.parse(jsonMatch[0]);

            if (specs.game) {
              fs.writeFileSync(path.join(specsDir, 'game.md'), specs.game, 'utf-8');
            }
            if (specs.mechanics) {
              fs.writeFileSync(path.join(specsDir, 'mechanics.md'), specs.mechanics, 'utf-8');
            }
            if (specs.progress) {
              fs.writeFileSync(path.join(specsDir, 'progress.md'), specs.progress, 'utf-8');
            }
            console.log('[updateSpec] Specs updated with diff');
          } else {
            console.log('[updateSpec] Could not parse JSON from response');
          }
        } catch (e) {
          console.log('[updateSpec] Error parsing response:', e.message);
        }
        resolve();
      });

      claude.on('error', () => {
        resolve();
      });

      setTimeout(() => {
        console.log('[updateSpec] TIMEOUT after 45s');
        claude.kill();
        resolve();
      }, 45000);
    });
  }

  // Update a single spec file (legacy - kept for backward compatibility)
  async updateSingleSpec(userId, projectId, specType, currentCode) {
    const projectDir = userManager.getProjectDir(userId, projectId);
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

    return new Promise(async (resolve) => {
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

      const claude = await spawnClaudeAsync([
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

      claude.on('close', async (code) => {
        try {
          if (code === 0 && output.includes('#')) {
            // Extract markdown content
            const content = output.trim();
            fs.writeFileSync(specPath, content, 'utf-8');
            console.log(`Updated specs/${specType}.md`);
          } else {
            console.log(`Failed to update ${specType}.md`);
          }
        } catch (err) {
          console.error(`Error updating ${specType}.md:`, err.message);
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

  // Create initial specs from generated code using Gemini (AFTER code generation)
  async createInitialSpecFromCode(userId, projectId, userMessage, dimension, generatedCode) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    console.log('Creating specs from generated code using Gemini...');

    // Create specs directory
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    try {
      const prompt = `以下のゲームコードを分析し、ゲーム仕様を3つのJSONオブジェクトで出力してください。

## ユーザーのリクエスト
「${userMessage}」

## 生成されたコード
\`\`\`html
${generatedCode ? generatedCode.substring(0, 8000) : '(コードなし)'}
\`\`\`

## 出力フォーマット（厳守・JSON形式）
\`\`\`json
{
  "game": "# ゲーム概要\\n\\n## 基本情報\\n- ゲーム名: [コードから推測]\\n- ジャンル: [コードから推測]\\n- タイプ: [2D/3D]\\n- 進行方向: [right/up/none]\\n\\n## スプライトの向き\\n- プレイヤー: [right/left/up/down]\\n- 敵: [right/left/up/down]\\n\\n## 世界観・テーマ\\n- 舞台: [コードから推測]\\n- 雰囲気: [コードから推測]\\n\\n## 使用画像アセット\\n| ファイル名 | 役割 | 説明 |\\n|-----------|------|------|\\n| [画像ファイル名] | プレイヤー/敵/背景/アイテム/UI等 | [この画像が何を表しているか] |",
  "mechanics": "# ゲームメカニクス\\n\\n## キャラクター\\n### プレイヤー\\n- 外見: [コードから推測]\\n- HP: [数値]\\n- 移動速度: [数値]\\n\\n### 敵\\n- 種類: [コードから推測]\\n- 行動パターン: [コードから推測]\\n\\n## 操作方法\\n- 移動: [コードから推測]\\n- 攻撃/アクション: [コードから推測]\\n\\n## ゲームルール\\n- 勝利条件: [コードから推測]\\n- ゲームオーバー条件: [コードから推測]",
  "progress": "# 実装状況\\n\\n## 完了\\n- 初期実装完了\\n\\n## 次の目標\\n- 機能拡張"
}
\`\`\`

## 注意
- デザインスタイルはユーザーが明示的に指定した場合のみ記載（指定がなければ書かない）
- コードを分析して実際の実装内容を反映すること
- 画像アセット: コード内のloadImage、new Image()、src=などから画像ファイルを特定し、使われ方から役割を推測すること
- JSON形式で出力すること`;

      // Use Claude Haiku for spec generation
      const result = await new Promise(async (resolve) => {
        const claude = await spawnClaudeAsync([
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

        claude.on('close', () => {
          resolve(output.trim());
        });

        claude.on('error', () => {
          resolve(null);
        });

        setTimeout(() => {
          claude.kill();
          resolve(null);
        }, 30000);
      });

      if (result) {
        // Extract JSON from response
        const jsonMatch = result.match(/\{[\s\S]*"game"[\s\S]*"mechanics"[\s\S]*"progress"[\s\S]*\}/);
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

          console.log('Specs created from code: game.md, mechanics.md, progress.md');
          return [specs.game, specs.mechanics, specs.progress].filter(Boolean).join('\n\n---\n\n');
        }
      }
    } catch (e) {
      console.error('Failed to create specs from code:', e.message);
    }

    // Fallback: create minimal specs
    console.log('Spec creation from code failed, creating minimal defaults');
    const defaults = this.createDefaultSpecs(userMessage, dimension);
    fs.writeFileSync(path.join(specsDir, 'game.md'), defaults.game, 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'mechanics.md'), defaults.mechanics, 'utf-8');
    fs.writeFileSync(path.join(specsDir, 'progress.md'), defaults.progress, 'utf-8');
    return [defaults.game, defaults.mechanics, defaults.progress].join('\n\n---\n\n');
  }

  // Create initial specs (3 files) BEFORE code generation (for new projects) - DEPRECATED
  async createInitialSpec(userId, projectId, userMessage, dimension) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    console.log('Creating initial specs (3 files) before code generation...');

    // Create specs directory
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    return new Promise(async (resolve) => {
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

      const claude = await spawnClaudeAsync([
        '--print',
        '--model', 'sonnet',  // Use Sonnet for better game spec generation (prevents cross-project leakage)
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

      claude.on('close', async (code) => {
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

      // Timeout after 30 seconds (Sonnet is slower than Haiku)
      setTimeout(() => {
        claude.kill();
        console.log('Initial spec creation timeout');
        resolve(null);
      }, 30000);
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
  readSpec(userId, projectId) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const legacySpecPath = path.join(projectDir, 'SPEC.md');

    // Check for new 3-file format first
    if (fs.existsSync(specsDir)) {
      return this.readSpecs(userId, projectId);
    }

    // Fall back to legacy single file
    if (fs.existsSync(legacySpecPath)) {
      return fs.readFileSync(legacySpecPath, 'utf-8');
    }
    return null;
  }

  // Read STYLE.md for a project (visual style guideline)
  readStyle(userId, projectId) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const stylePath = path.join(projectDir, 'STYLE.md');

    if (fs.existsSync(stylePath)) {
      return fs.readFileSync(stylePath, 'utf-8');
    }
    return null;
  }

  // Read new 3-file spec format and combine
  readSpecs(userId, projectId) {
    const projectDir = userManager.getProjectDir(userId, projectId);
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
  readSpecByType(userId, projectId, specType) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');
    const filename = `${specType}.md`;
    return this.readSpecFile(specsDir, filename);
  }

  // Write a single spec file
  writeSpecFile(userId, projectId, specType, content) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    const filePath = path.join(specsDir, `${specType}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Wrote specs/${specType}.md`);
  }

  // Save specs from Gemini response (no additional API call needed)
  async saveSpecsFromGemini(userId, projectId, specs) {
    const projectDir = userManager.getProjectDir(userId, projectId);
    const specsDir = path.join(projectDir, 'specs');

    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
    }

    // Write each spec file
    if (specs.game) {
      fs.writeFileSync(path.join(specsDir, 'game.md'), specs.game, 'utf-8');
      console.log('Saved specs/game.md from Gemini');
    }
    if (specs.mechanics) {
      fs.writeFileSync(path.join(specsDir, 'mechanics.md'), specs.mechanics, 'utf-8');
      console.log('Saved specs/mechanics.md from Gemini');
    }
    if (specs.progress) {
      fs.writeFileSync(path.join(specsDir, 'progress.md'), specs.progress, 'utf-8');
      console.log('Saved specs/progress.md from Gemini');
    }

    console.log('All specs saved from Gemini response (Sonnet API call skipped)');
  }

  // Detect which spec files need updating based on user message
  async detectRelevantSpecs(userMessage) {
    return new Promise(async (resolve) => {
      const prompt = `ユーザーのメッセージから、更新が必要な仕様ファイルを判定してください。

## 仕様ファイルの種類
- game: 見た目・世界観に関する変更（色、スタイル、テーマ、雰囲気）
- mechanics: ゲームプレイに関する変更（キャラ、敵、アイテム、操作、ルール）
- progress: 何か実装したら常に更新

## ユーザーのメッセージ
「${userMessage}」

## 出力（JSON配列のみ）
例: ["mechanics", "progress"]`;

      const claude = await spawnClaudeAsync([
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

      claude.on('close', async (code) => {
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

  // Extract game title from game.md content
  extractGameTitle(gameSpecContent) {
    if (!gameSpecContent) return null;

    // Try to find "ゲーム名:" or "- ゲーム名:" pattern
    const patterns = [
      /ゲーム名[:：]\s*(.+)/,
      /-\s*ゲーム名[:：]\s*(.+)/,
      /##\s*(.+?)(?:\n|$)/,  // First heading as fallback
    ];

    for (const pattern of patterns) {
      const match = gameSpecContent.match(pattern);
      if (match && match[1]) {
        const title = match[1].trim();
        // Skip generic titles
        if (title && !title.includes('[') && title !== '新しいゲーム') {
          return title;
        }
      }
    }
    return null;
  }

  // Auto-rename project if it has default name and game.md has a title
  async maybeAutoRenameProject(userId, projectId) {
    try {
      // Get current project info (use admin client for background job)
      const project = await db.getProjectById(supabaseAdmin, projectId);
      if (!project) return null;

      // Only auto-rename if project has default name
      if (project.name !== '新しいゲーム') {
        return null;
      }

      // Read game.md and extract title
      const projectDir = userManager.getProjectDir(userId, projectId);
      const gameSpecPath = path.join(projectDir, 'specs', 'game.md');

      if (!fs.existsSync(gameSpecPath)) return null;

      const gameSpec = fs.readFileSync(gameSpecPath, 'utf-8');
      const title = this.extractGameTitle(gameSpec);

      if (!title) return null;

      // Rename project
      const renamed = await userManager.renameProject(null, userId, projectId, title);
      if (renamed) {
        console.log(`Auto-renamed project to: ${title}`);
        return renamed;
      }
      return null;
    } catch (err) {
      console.error('Auto-rename error:', err.message);
      return null;
    }
  }
}

module.exports = {
  claudeRunner: new ClaudeRunner(),
  jobManager,
  spawnClaudeAsync
};
