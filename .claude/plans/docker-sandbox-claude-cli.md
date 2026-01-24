# Claude CLI Docker Sandbox 計画

## 概要

**Web UI 以外の全て**を Docker コンテナ内で隔離し、サーバーへの影響を完全に防ぐ。

## 設計原則

**Claude CLI の全呼び出し（Haiku/Sonnet/Opus 問わず）をコンテナ化する**

理由：
- セキュリティに妥協しない
- 1つでも直接実行があれば、そこが攻撃ベクトルになる
- コンテナ起動オーバーヘッド（100-500ms）は許容範囲

---

## レビュー反映サマリー（2026-01-23）

### P0（必須）

| 項目 | 内容 |
|------|------|
| stdin入力 | promptは引数に含めず**stdin経由**で渡す |
| stream-jsonパース | onStream/onCompleteの扱いを明確に定義 |
| Subscribe→Start順序 | ストリーム取り逃し防止のため順序を厳守 |
| process.cwd()対応 | 必要ファイル（Skills等）をread-onlyマウント |

### P1（早期）

| 項目 | 内容 |
|------|------|
| APIキー | Phase 1は環境変数（P2でSecret Manager移行） |
| 入力検証 | sessionId/userId/projectIdの形式チェック |
| Dockerセキュリティ | `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit 100`, メタデータサーバー遮断 |
| SessionLogger | 非同期I/O化（同期I/Oはイベントループをブロック） |

### P2（将来）

| 項目 | 内容 |
|------|------|
| Secret Manager | Workload Identity への移行 |
| 外部状態管理 | Redis等（Main Server冗長化時） |
| コンテナプール | 事前起動で初回遅延削減 |
| Graceful shutdown | orphanコンテナ防止 |
| Mutex | コンテナ操作の競合状態対策 |

---

## 現状

### 現在の実装（危険）
```
┌─────────────────────────────────────────┐
│           GCE Instance                  │
│                                         │
│   Main Server (Node.js)                 │
│         │                               │
│         ├─ spawn('claude', [...])  ←── 直接実行（危険）
│         │                               │
│   /data/users/{userId}/projects/        │
└─────────────────────────────────────────┘
```

### 問題点
1. Claude CLI がサーバーのファイルシステムに直接アクセス可能
2. 悪意あるプロンプトで他ユーザーのファイルを読める可能性
3. サーバー設定ファイル（.env等）へのアクセスリスク

## 目標の構成

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCE Instance (Phase 1: シングルVM)               │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Main Server (Node.js) - Web UI のみ                            │   │
│   │  - Express / WebSocket                                          │   │
│   │  - 認証・セッション管理                                         │   │
│   │  - Container Manager（コンテナのライフサイクル管理）            │   │
│   │  - Session Logger（ログの記録・復元）                           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│         │                                                               │
│         │ セッション単位でコンテナを固定管理                            │
│         ▼                                                               │
│   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐   │
│   │ Container        │ │ Container        │ │ Container            │   │
│   │ (session-a)      │ │ (session-b)      │ │ (session-c)          │   │
│   │                  │ │                  │ │                      │   │
│   │ Claude CLI       │ │ Claude CLI       │ │ Claude CLI           │   │
│   │ /data/users/a/   │ │ /data/users/b/   │ │ /data/users/c/       │   │
│   │ /data/global/ RO │ │ /data/global/ RO │ │ /data/global/ RO     │   │
│   │ ~/.claude/ RO    │ │ ~/.claude/ RO    │ │ ~/.claude/ RO        │   │
│   └──────────────────┘ └──────────────────┘ └──────────────────────┘   │
│         │                     │                   │                     │
│         └─────────────────────┴───────────────────┘                     │
│                               │                                         │
│              GCP Filestore / NFS 共有ストレージ                         │
│              /data/users/  /data/assets/global/                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## インフラ構成

### Phase 1: シングルVM + 共有ストレージ

| コンポーネント | 説明 |
|---------------|------|
| VM インスタンス | 単一 GCE VM（Phase 1） |
| 共有ストレージ | GCP Filestore (NFS) |
| マウントパス | `/data` を同一パスでマウント |

**Filestoreマウント例:**
```bash
# VMでマウント
sudo mount 10.x.x.x:/vol1 /data
```

### ストレージ構造

```
/data/
├── users/{userId}/
│   ├── projects/{projectId}/
│   │   ├── index.html
│   │   └── specs/
│   ├── assets/
│   └── sessions/           ← セッションログ（コンテナ外に配置）
│       └── {sessionId}.jsonl
└── assets/global/          ← グローバルアセット（ROマウント）
    └── {category}/
```

## コンテナライフサイクル

### セッション単位での管理

```
ユーザーA WebSocket接続
    ↓
sessionId 発行 + コンテナ起動（claude-sandbox-{sessionId}）
    ↓
Claude CLI 実行（コンテナ内）
    ↓
セッション中はコンテナ維持（同一コンテナで実行）
    ↓
WebSocket切断
    ↓
10分間待機（再接続待ち）
    ↓
10分経過 → コンテナ削除
```

### タイムアウト設定

| 設定 | 値 | 説明 |
|------|-----|------|
| 切断後タイムアウト | 10分 | WebSocket切断から10分で自動削除 |
| 同時コンテナ上限 | 100 | システム全体で最大100コンテナ |
| 同一ユーザー制限 | 1 | ユーザーあたり1コンテナまで |

### 再接続フロー

```
WebSocket切断
    ↓
10分以内に再接続？
    ├─ YES → 既存コンテナに再接続（セッション復元）
    └─ NO  → コンテナ削除、次回は新規作成
```

## セッションログ（再接続復元）

### 概要

Claude CLI の入出力をJSONL形式でログに記録し、再接続時にセッションを復元する。

### ログ仕様

| 項目 | 値 |
|------|-----|
| フォーマット | JSONL（1行1イベント） |
| 保存場所 | `/data/users/{userId}/sessions/{sessionId}.jsonl` |
| 最大サイズ | 10MB / セッション |
| 保持期間 | 30日 |
| 復元サイズ | **最新1MB**（大きいログは末尾のみ復元） |

**重要**: セッションログはコンテナ**外**に配置（コンテナからアクセス不可）

### ログ構造

```jsonl
{"ts":1706000000000,"type":"input","data":"ゲームを作って"}
{"ts":1706000001000,"type":"output","data":"承知しました。どのようなゲームを..."}
{"ts":1706000010000,"type":"input","data":"シューティングゲーム"}
{"ts":1706000011000,"type":"output","data":"シューティングゲームを作成します..."}
```

### 復元フロー

```
再接続時
    ↓
sessionId からログファイル取得（最新1MB）
    ↓
ログをWebSocketでクライアントに送信（履歴復元）
    ↓
既存コンテナに接続して続行
```

## 調査結果サマリー

### Claude CLI 認証方法
| 方法 | Docker での使いやすさ | 推奨 |
|------|---------------------|------|
| `ANTHROPIC_API_KEY` 環境変数 | ◎ 簡単（docker inspect で露出） | **Phase 1 採用** |
| Secret Manager + Workload Identity | ◎ 安全（GCP連携） | **P2 移行予定** |
| `~/.claude/` マウント | × セキュリティリスク | 不採用 |
| OAuth トークン | × 短命（8-12時間） | 不採用 |

**Phase 1の方針**: 環境変数で渡す（docker inspect で見えるが、コンテナへのアクセスは制限されるため許容）

### claudeRunner.js の spawn 呼び出し（10箇所）

| # | メソッド | モデル | 作業ディレクトリ | 用途 |
|---|---------|--------|-----------------|------|
| 1 | detectIntent() | haiku | process.cwd() | 意図判定 |
| 2 | analyzeImageDirection() | sonnet | process.cwd() | 画像方向分析 |
| 3 | selectSkills() | haiku | process.cwd() | スキル選択 |
| 4 | runClaudeJob() | opus | projectDir | **コード生成** |
| 5 | runClaudeWeb() | opus | projectDir | **コード生成** |
| 6 | updateSpecFromDiff() | haiku | projectDir | Spec更新 |
| 7 | updateSpecFromCode() | haiku | projectDir | Spec更新 |
| 8 | generateInitialSpec() | haiku | projectDir | Spec生成 |
| 9 | generateInitialSpec() | sonnet | projectDir | Spec生成 |
| 10 | detectSpecTypes() | haiku | process.cwd() | Spec種類判定 |

**重要**: #4, #5 の Opus コード生成が最も危険（プロジェクトディレクトリで実行）

**process.cwd() 対応**: #1, #2, #3, #10 は Skills 等を参照するため、サーバー側の `.claude/` を read-only マウント

## 実装計画

### Phase 1: Docker イメージ作成

```dockerfile
# docker/claude-sandbox/Dockerfile
FROM node:20-slim

# stdbuf をインストール（ストリーム バッファリング制御用）
RUN apt-get update && \
    apt-get install -y --no-install-recommends coreutils && \
    rm -rf /var/lib/apt/lists/*

# Claude CLI インストール
RUN npm install -g @anthropic-ai/claude-code && \
    npm cache clean --force

# セキュリティ設定
RUN useradd -m -u 1000 -s /bin/bash claude && \
    mkdir -p /data/user /data/global && \
    chown -R claude:claude /data

USER claude
WORKDIR /data/user

# Claude CLI は ~/.claude (~=/home/claude) に書き込む可能性があるため
# /home/claude は tmpfs でマウントする（docker run時に指定）

# シグナルを適切に処理
CMD ["tail", "-f", "/dev/null"]
```

### Phase 2: claudeRunner.js の変更

**Before:**
```javascript
const claude = spawn('claude', [
  '--model', 'opus',
  '--output-format', 'stream-json',
  '--dangerously-skip-permissions'
], {
  cwd: projectDir,
  env: { ...process.env }
});
```

**After:**
```javascript
const containerManager = require('./containerManager');

// セッションのコンテナを取得（なければ自動作成）
await containerManager.getContainer(sessionId, userId);

// コンテナ内でClaude CLI実行（Subscribe後に呼び出す）
const { proc, startProcessing } = containerManager.execInContainer(sessionId, [
  '--model', 'opus',
  '--output-format', 'stream-json',
  '--dangerously-skip-permissions'
], {
  projectId,
  prompt,  // ★ stdin経由で渡す
  onStream: (text) => { /* ストリーム処理 */ },
  onComplete: (result) => { /* 完了処理 */ }
});

// Subscribe → Start 順序を厳守
jobManager.subscribe(jobId, callback);
startProcessing();  // ★ Subscribe後に開始
```

### Phase 3: Container Manager の作成

```javascript
// server/containerManager.js

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const DOCKER_IMAGE = 'claude-sandbox';
const DISCONNECT_TIMEOUT = 10 * 60 * 1000;  // 切断後10分
const MAX_CONTAINERS = 100;

// 入力検証用正規表現（P1）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

class ContainerManager {
  constructor() {
    this.containers = new Map();  // sessionId -> containerInfo
    this.userSessions = new Map(); // userId -> sessionId（1ユーザー1コンテナ制限）
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * 入力検証（P1）
   */
  validateInputs(sessionId, userId, projectId) {
    if (!SESSION_ID_REGEX.test(sessionId)) {
      throw new Error('Invalid sessionId format');
    }
    if (!UUID_REGEX.test(userId)) {
      throw new Error('Invalid userId format');
    }
    if (projectId && !UUID_REGEX.test(projectId)) {
      throw new Error('Invalid projectId format');
    }
  }

  /**
   * セッションのコンテナを取得（なければ作成）
   */
  async getContainer(sessionId, userId) {
    this.validateInputs(sessionId, userId);

    // 既存セッションがあれば再利用
    let container = this.containers.get(sessionId);
    if (container && await this.isContainerRunning(container.id)) {
      // セッションハイジャック防止
      if (container.userId !== userId) {
        throw new Error('Session does not belong to this user');
      }
      container.disconnectedAt = null;  // 再接続
      return container;
    }

    // 同一ユーザーの既存セッションがあれば削除
    const existingSessionId = this.userSessions.get(userId);
    if (existingSessionId && existingSessionId !== sessionId) {
      await this.removeContainer(existingSessionId);
    }

    // 上限チェック
    if (this.containers.size >= MAX_CONTAINERS) {
      await this.evictOldestContainer();
    }

    // 新規コンテナ作成
    container = await this.createContainer(sessionId, userId);
    this.containers.set(sessionId, container);
    this.userSessions.set(userId, sessionId);
    return container;
  }

  /**
   * コンテナ作成（セキュリティ強化版）
   */
  async createContainer(sessionId, userId) {
    const containerName = `claude-sandbox-${sessionId}`;
    const userDir = `/data/users/${userId}`;
    const globalDir = `/data/assets/global`;
    const claudeDir = `${process.cwd()}/.claude`;  // Skills等

    const args = [
      'run', '-d',
      '--name', containerName,

      // セキュリティオプション（P1）
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', '100',
      '--read-only',
      '--tmpfs', '/tmp:size=100M,noexec,nosuid,nodev',
      '--tmpfs', '/home/claude:size=50M,noexec,nosuid,nodev',  // CLI書き込み用

      // リソース制限
      '--memory', '2g',
      '--cpus', '1',
      '--user', '1000:1000',

      // メタデータサーバー遮断（P1）
      // 注意: --add-host はDNS解決のみ。IP直アクセスはホストのiptablesで遮断
      '--add-host', 'metadata.google.internal:127.0.0.1',
      '--add-host', '169.254.169.254:127.0.0.1',

      // APIキー（環境変数として直接渡す - Phase 1）
      // 注意: docker inspect で見えるが、Phase 1では許容
      // P2でSecret Manager/Workload Identity に移行予定
      '-e', `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,

      // ボリュームマウント
      '-v', `${userDir}/projects:/data/user/projects:rw`,
      '-v', `${userDir}/assets:/data/user/assets:rw`,
      '-v', `${globalDir}:/data/global:ro`,
      '-v', `${claudeDir}:/home/claude/.claude:ro`,  // Skills等（~/.claude として参照される）

      '-w', '/data/user',
      DOCKER_IMAGE,
      'tail', '-f', '/dev/null'
    ];

    // execFile を使用（shell経由しない = インジェクション防止）
    await execFileAsync('docker', args);

    return {
      id: containerName,
      sessionId,
      userId,
      createdAt: Date.now(),
      disconnectedAt: null
    };
  }

  /**
   * コンテナ内でコマンド実行（stdin入力 + ストリーム処理対応）
   */
  execInContainer(sessionId, args, options = {}) {
    const container = this.containers.get(sessionId);
    if (!container) {
      throw new Error('Container not found');
    }

    const { projectId, prompt, onStream, onComplete, onError, timeout = 10 * 60 * 1000 } = options;

    if (projectId) {
      this.validateInputs(sessionId, container.userId, projectId);
    }

    const workDir = projectId
      ? `/data/user/projects/${projectId}`
      : '/data/user';

    const dockerArgs = [
      'exec', '-i',
      '-w', workDir,
      container.id,
      'stdbuf', '-oL', '-eL',  // Line buffering強制
      'claude',
      ...args
    ];

    // spawn も配列形式で shell 回避
    const proc = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // タイムアウト設定
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, timeout);

    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGKILL') {
        onError?.({ type: 'timeout', message: 'Process killed due to timeout' });
      } else if (code === 137) {
        onError?.({ type: 'oom', message: 'Process killed due to memory limit' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      onError?.({ type: 'spawn_error', message: err.message });
    });

    // stream-json パース処理
    if (onStream) {
      let buffer = '';
      proc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();  // 不完全な行を保持

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            let event = json;

            // stream_event ラッパーを処理
            if (json.type === 'stream_event' && json.event) {
              event = json.event;
            }

            // テキストストリーム
            if (event.type === 'content_block_delta' && event.delta?.text) {
              onStream(event.delta.text);
            }

            // 完了イベント
            if (event.type === 'result') {
              onComplete?.(event.result);
            }
          } catch (e) {
            // JSON以外は無視（進捗表示など）
          }
        }
      });
    }

    return {
      proc,
      // Subscribe→Start順序のためのラッパー
      startProcessing: () => {
        if (prompt) {
          proc.stdin.write(prompt);
          proc.stdin.end();
        }
      }
    };
  }

  /**
   * WebSocket切断時に呼び出し
   */
  onDisconnect(sessionId) {
    const container = this.containers.get(sessionId);
    if (container) {
      container.disconnectedAt = Date.now();
    }
  }

  /**
   * 切断後タイムアウトしたコンテナの削除
   */
  async cleanup() {
    const now = Date.now();
    const toRemove = [];

    for (const [sessionId, container] of this.containers) {
      if (container.disconnectedAt) {
        const disconnectedTime = now - container.disconnectedAt;
        if (disconnectedTime > DISCONNECT_TIMEOUT) {
          toRemove.push(sessionId);
        }
      }
    }

    // 順次削除（Map mutation 回避）
    for (const sessionId of toRemove) {
      await this.removeContainer(sessionId);
    }
  }

  /**
   * コンテナ削除
   */
  async removeContainer(sessionId) {
    const container = this.containers.get(sessionId);
    if (container) {
      try {
        await execFileAsync('docker', ['rm', '-f', container.id]);
      } catch (e) {
        console.error(`Failed to remove container: ${container.id}`, e.message);
      }
      this.containers.delete(sessionId);
      this.userSessions.delete(container.userId);
    }
  }

  /**
   * 最も古いコンテナを削除（上限到達時）
   */
  async evictOldestContainer() {
    let oldest = null;
    for (const [sessionId, container] of this.containers) {
      if (!oldest || container.createdAt < oldest.createdAt) {
        oldest = { sessionId, container };
      }
    }
    if (oldest) {
      await this.removeContainer(oldest.sessionId);
    }
  }

  /**
   * コンテナ稼働確認（非同期版）
   */
  async isContainerRunning(containerId) {
    try {
      const { stdout } = await execFileAsync('docker', [
        'inspect', '-f', '{{.State.Running}}', containerId
      ]);
      return stdout.trim() === 'true';
    } catch (e) {
      return false;
    }
  }
}

module.exports = new ContainerManager();
```

### Phase 4: Session Logger の作成（非同期I/O版）

```javascript
// server/sessionLogger.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const readline = require('readline');
const { getUserPath } = require('./config');

const MAX_LOG_SIZE = 10 * 1024 * 1024;  // 10MB
const RESTORE_SIZE = 1 * 1024 * 1024;   // 復元時は最新1MB
const LOG_RETENTION_DAYS = 30;

class SessionLogger {
  constructor() {
    this.streams = new Map();  // sessionId -> { stream, size }
  }

  getLogPath(userId, sessionId) {
    // セッションログはコンテナ外に配置
    return path.join(getUserPath(userId), 'sessions', `${sessionId}.jsonl`);
  }

  /**
   * WriteStreamを取得または作成
   */
  getOrCreateStream(userId, sessionId) {
    const key = sessionId;
    if (this.streams.has(key)) {
      return this.streams.get(key);
    }

    const logPath = this.getLogPath(userId, sessionId);
    const dir = path.dirname(logPath);

    // ディレクトリ作成（初回のみ同期）
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }

    const stream = fsSync.createWriteStream(logPath, {
      flags: 'a',
      encoding: 'utf8',
      highWaterMark: 16384  // 16KB buffer
    });

    let size = 0;
    try {
      size = fsSync.statSync(logPath).size;
    } catch {}

    stream.on('error', (err) => {
      console.error(`Log stream error for session ${sessionId}:`, err);
      this.streams.delete(key);
    });

    const streamInfo = { stream, size, userId };
    this.streams.set(key, streamInfo);
    return streamInfo;
  }

  /**
   * ログ記録（非同期）
   */
  async log(userId, sessionId, type, data) {
    const streamInfo = this.getOrCreateStream(userId, sessionId);

    if (streamInfo.size >= MAX_LOG_SIZE) {
      return;  // 上限到達
    }

    const entry = JSON.stringify({ ts: Date.now(), type, data }) + '\n';

    return new Promise((resolve, reject) => {
      const ok = streamInfo.stream.write(entry, (err) => {
        if (err) reject(err);
        else {
          streamInfo.size += Buffer.byteLength(entry);
          resolve();
        }
      });

      if (!ok) {
        // Backpressure - wait for drain
        streamInfo.stream.once('drain', resolve);
      }
    });
  }

  /**
   * ログ読み込み（再接続時の復元用、最新1MB）
   */
  async getLog(userId, sessionId) {
    const logPath = this.getLogPath(userId, sessionId);

    try {
      await fs.access(logPath);
    } catch {
      return [];
    }

    const stats = await fs.stat(logPath);
    const entries = [];

    // 大きいファイルは末尾から読む
    let startPosition = 0;
    if (stats.size > RESTORE_SIZE) {
      startPosition = stats.size - RESTORE_SIZE;
    }

    const rl = readline.createInterface({
      input: fsSync.createReadStream(logPath, {
        encoding: 'utf8',
        start: startPosition
      }),
      crlfDelay: Infinity
    });

    let isFirstLine = startPosition > 0;
    for await (const line of rl) {
      // 途中から読み始めた場合、最初の行は不完全なので捨てる
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }

      if (line.trim()) {
        try {
          entries.push(JSON.parse(line));
        } catch (e) {
          console.warn(`Malformed log entry in ${sessionId}`);
        }
      }
    }

    return entries;
  }

  /**
   * ストリームを閉じる
   */
  closeStream(sessionId) {
    const streamInfo = this.streams.get(sessionId);
    if (streamInfo) {
      streamInfo.stream.end();
      this.streams.delete(sessionId);
    }
  }

  /**
   * 古いログの削除（定期実行）
   */
  async cleanupOldLogs() {
    // 実装: 30日以上経過したログファイルを削除
    // バッチ処理として実装
  }
}

module.exports = new SessionLogger();
```

### Phase 5: 全 spawn 呼び出しの置換

全 10 箇所の `spawn('claude', ...)` を `containerManager.execInContainer(...)` に置換:

| # | メソッド | モデル | 対応 |
|---|---------|--------|------|
| 1 | detectIntent() | haiku | Docker化 + .claude/ ROマウント |
| 2 | analyzeImageDirection() | sonnet | Docker化 + .claude/ ROマウント |
| 3 | selectSkills() | haiku | Docker化 + .claude/ ROマウント |
| 4 | runClaudeJob() | opus | Docker化 |
| 5 | runClaudeWeb() | opus | Docker化 |
| 6 | updateSpecFromDiff() | haiku | Docker化 |
| 7 | updateSpecFromCode() | haiku | Docker化 |
| 8 | generateInitialSpec() | haiku | Docker化 |
| 9 | generateInitialSpec() | sonnet | Docker化 |
| 10 | detectSpecTypes() | haiku | Docker化 + .claude/ ROマウント |

## セキュリティ設定

### Docker run オプション（P1強化版）

| オプション | 効果 |
|-----------|------|
| `--cap-drop ALL` | 全Linux Capabilityを削除 |
| `--security-opt no-new-privileges` | 特権昇格を防止 |
| `--pids-limit 100` | Fork bomb対策 |
| `--read-only` | rootfs 読み取り専用 |
| `--tmpfs /tmp:noexec,nosuid,nodev` | tmp をメモリに（実行不可） |
| `--tmpfs /home/claude:noexec,nosuid,nodev` | CLI書き込み用（~/.config, ~/.claude） |
| `--user 1000:1000` | 非root実行 |
| `--memory 2g` | メモリ上限 |
| `--cpus 1` | CPU上限 |
| `--add-host 169.254.169.254:127.0.0.1` | GCPメタデータサーバー遮断（DNS解決のみ） |

**メタデータサーバー遮断の制限**: `--add-host` はDNS解決のみ影響。IP直アクセス（`curl 169.254.169.254`）は遮断できない。完全遮断にはホスト側 iptables が必要:
```bash
# ホスト側で実行（コンテナからのメタデータアクセスを遮断）
iptables -I DOCKER-USER -d 169.254.169.254 -j DROP
```

### ボリュームマウント

| マウント | モード | 用途 |
|---------|--------|------|
| `/data/user/projects` | rw | ユーザープロジェクト |
| `/data/user/assets` | rw | ユーザーアセット |
| `/data/global` | **ro** | グローバルアセット |
| `/home/claude/.claude` | **ro** | Skills等（~/.claude として参照） |

**APIキー**: 環境変数 `ANTHROPIC_API_KEY` として渡す（P2でSecret Manager移行）

### アクセス制限

| リソース | アクセス |
|---------|---------|
| `/data/users/{userId}/projects/` | ✅ 読み書き可 |
| `/data/users/{userId}/assets/` | ✅ 読み書き可 |
| `/data/users/{userId}/sessions/` | ❌ アクセス不可（コンテナ外） |
| `/data/assets/global/` | ✅ 読み取りのみ |
| `/data/users/{他userId}/` | ❌ アクセス不可 |
| サーバー `.env` | ❌ アクセス不可 |
| GCPメタデータサーバー | ❌ アクセス不可 |
| インターネット | ✅ 許可（将来制限予定） |

### 安全なDocker実行

**重要**: シェルインジェクション防止のため、`execFile`/`spawn` を配列引数で使用。

```javascript
// ❌ 危険（shell経由）
execSync(`docker rm -f ${containerId}`);

// ✅ 安全（shell回避）
execFile('docker', ['rm', '-f', containerId], callback);
```

## パフォーマンス考慮

### コンテナ起動オーバーヘッド

| 項目 | 時間 |
|------|------|
| Docker run（コールドスタート） | 〜500ms |
| Docker run（ウォームスタート） | 〜100ms |
| Claude CLI 初期化 | 〜1-2秒 |

**結論**: 初回のみオーバーヘッド発生。セッション中は既存コンテナを再利用するため影響なし。

---

## 詳細仕様

### 1. Docker 実行仕様

#### docker run 確定引数

```bash
docker run -d \
  --name claude-sandbox-${sessionId} \
  \
  # セキュリティ
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 100 \
  --read-only \
  --tmpfs /tmp:size=100M,noexec,nosuid,nodev \
  --tmpfs /home/claude:size=50M,noexec,nosuid,nodev \
  --user 1000:1000 \
  \
  # リソース制限
  --memory 2g \
  --cpus 1 \
  \
  # ネットワーク（外部通信許可、メタデータ遮断）
  # 注意: --add-hostはDNS解決のみ。IP直アクセスはホストiptablesで遮断
  --add-host metadata.google.internal:127.0.0.1 \
  --add-host 169.254.169.254:127.0.0.1 \
  \
  # 認証
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  \
  # マウント
  -v /data/users/${userId}/projects:/data/user/projects:rw \
  -v /data/users/${userId}/assets:/data/user/assets:rw \
  -v /data/assets/global:/data/global:ro \
  -v ${SERVER_ROOT}/.claude:/home/claude/.claude:ro \
  \
  -w /data/user \
  claude-sandbox \
  tail -f /dev/null
```

#### docker exec 確定引数

```bash
docker exec -i \
  -w /data/user/projects/${projectId} \
  claude-sandbox-${sessionId} \
  stdbuf -oL -eL \
  claude \
    --model ${model} \
    --output-format stream-json \
    --dangerously-skip-permissions
```

**stdin**: プロンプトは `proc.stdin.write(prompt); proc.stdin.end();` で渡す

#### マウント対象一覧

| ホストパス | コンテナパス | モード | 用途 |
|-----------|-------------|--------|------|
| `/data/users/${userId}/projects` | `/data/user/projects` | rw | ユーザープロジェクト |
| `/data/users/${userId}/assets` | `/data/user/assets` | rw | ユーザーアセット |
| `/data/assets/global` | `/data/global` | ro | グローバルアセット |
| `${SERVER_ROOT}/.claude` | `/home/claude/.claude` | ro | Skills, 設定ファイル（~/.claude） |

**マウントしないもの**:
- `/data/users/${userId}/sessions/` - セッションログ（コンテナからアクセス不可）
- `${SERVER_ROOT}/.env` - 環境変数ファイル
- `${SERVER_ROOT}/node_modules/` - サーバー依存

---

### 2. SessionLogger 仕様

#### JSONL イベントフォーマット

```jsonl
{"ts":1706000000000,"type":"input","data":"ゲームを作って"}
{"ts":1706000001000,"type":"stream","data":"承"}
{"ts":1706000001050,"type":"stream","data":"知しました"}
{"ts":1706000002000,"type":"output","data":"承知しました。どのようなゲームを..."}
{"ts":1706000003000,"type":"tool","data":{"name":"Write","path":"index.html"}}
{"ts":1706000010000,"type":"complete","data":{"cost":0.05,"tokens":1500}}
{"ts":1706000015000,"type":"error","data":{"code":"timeout","message":"Process killed"}}
```

| type | 説明 | data |
|------|------|------|
| `input` | ユーザー入力 | プロンプト文字列 |
| `stream` | ストリーム断片 | テキスト断片 |
| `output` | 完了した出力 | 全文テキスト |
| `tool` | ツール使用 | `{name, path?, ...}` |
| `complete` | 正常終了 | `{cost?, tokens?}` |
| `error` | エラー | `{code, message}` |

#### ログ保存パス

```
/data/users/{userId}/sessions/{sessionId}.jsonl
/data/users/{userId}/sessions/{sessionId}.1.jsonl  ← ローテート時
```

**コンテナからアクセス不可**: `/data/users/{userId}/sessions/` はマウントしない

#### 10MB ローテーション

```javascript
const MAX_LOG_SIZE = 10 * 1024 * 1024;  // 10MB

async log(userId, sessionId, type, data) {
  const streamInfo = this.getOrCreateStream(userId, sessionId);

  // 10MB到達でローテート
  if (streamInfo.size >= MAX_LOG_SIZE) {
    await this.rotateLog(userId, sessionId);
  }

  const entry = JSON.stringify({ ts: Date.now(), type, data }) + '\n';
  streamInfo.stream.write(entry);
  streamInfo.size += Buffer.byteLength(entry);
}

async rotateLog(userId, sessionId) {
  const logPath = this.getLogPath(userId, sessionId);
  const rotatedPath = logPath.replace('.jsonl', '.1.jsonl');

  // 既存ストリームを閉じる
  this.closeStream(sessionId);

  // 古いローテートファイルがあれば削除
  await fs.unlink(rotatedPath).catch(() => {});

  // 現在のファイルをローテート
  await fs.rename(logPath, rotatedPath);

  // 新しいストリームは次回 log() で自動作成
}
```

**ローテート方式**:
- `{sessionId}.jsonl` → `{sessionId}.1.jsonl` にリネーム
- 新しい `{sessionId}.jsonl` に継続書き込み
- 復元時は最新の `{sessionId}.jsonl` のみ読む（`.1.jsonl` は無視）
- 30日後に両ファイルとも削除

#### 1MB 復元の読み込み方法

```javascript
async getLog(userId, sessionId) {
  const logPath = this.getLogPath(userId, sessionId);
  const stats = await fs.stat(logPath);

  // 1MB以下ならそのまま全部読む
  if (stats.size <= RESTORE_SIZE) {
    return this.readAllLines(logPath);
  }

  // 1MB超過の場合、末尾1MBから読む
  const startPosition = stats.size - RESTORE_SIZE;

  const rl = readline.createInterface({
    input: fsSync.createReadStream(logPath, {
      encoding: 'utf8',
      start: startPosition
    })
  });

  const entries = [];
  let isFirstLine = true;

  for await (const line of rl) {
    // 途中から読み始めた場合、最初の行は不完全なので捨てる
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // 破損行はスキップ
      }
    }
  }

  return entries;
}
```

---

### 3. CLI ストリーム処理

#### stream-json パース仕様

Claude CLI の `--output-format stream-json` 出力形式：

```jsonl
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"承知"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"しました"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01...","name":"Write","input":{}}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":1}}
{"type":"result","result":{"cost":{"input_tokens":100,"output_tokens":500},"duration_ms":5000}}
```

**パース実装**:

```javascript
// stdout バッファリング + 行単位パース
let buffer = '';

proc.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();  // 不完全な行を保持

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const json = JSON.parse(line);

      // stream_event ラッパーを展開
      const event = json.type === 'stream_event' ? json.event : json;

      switch (event.type) {
        case 'content_block_delta':
          if (event.delta?.text) {
            onStream(event.delta.text);
            sessionLogger.log(userId, sessionId, 'stream', event.delta.text);
          }
          break;

        case 'content_block_start':
          if (event.content_block?.type === 'tool_use') {
            onToolStart(event.content_block);
            sessionLogger.log(userId, sessionId, 'tool', {
              name: event.content_block.name,
              id: event.content_block.id
            });
          }
          break;

        case 'result':
          onComplete(event.result);
          sessionLogger.log(userId, sessionId, 'complete', event.result);
          break;
      }
    } catch (e) {
      // JSON以外の出力（進捗表示など）は無視
    }
  }
});
```

#### Subscribe → Start 実装手順

```javascript
// WebSocket handler (server/index.js)
case 'message':
  // 1. コンテナ準備（まだCLI実行しない）
  await containerManager.getContainer(sessionId, userId);

  // 2. 実行準備（プロセスは作るがstdinは送らない）
  const { proc, startProcessing } = containerManager.execInContainer(sessionId, [
    '--model', model,
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions'
  ], {
    projectId,
    prompt,
    onStream: (text) => safeSend({ type: 'stream', content: text }),
    onComplete: (result) => safeSend({ type: 'complete', result }),
    onError: (err) => safeSend({ type: 'error', error: err })
  });

  // 3. Subscribe を先に設定
  jobUnsubscribe = jobManager.subscribe(jobId, (update) => {
    safeSend({ type: 'jobUpdate', ...update });
  });

  // 4. クライアントに開始通知
  safeSend({ type: 'jobStarted', jobId });

  // 5. 最後に処理開始（ここでstdinにpromptが書き込まれる）
  startProcessing();
  break;
```

#### stdin 経由 prompt 渡し方式

```javascript
// containerManager.execInContainer() 内部
execInContainer(sessionId, args, options = {}) {
  const { prompt, onStream, onComplete, onError } = options;

  const proc = spawn('docker', dockerArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // ストリーム処理の設定（上記参照）
  setupStreamParsing(proc, onStream, onComplete, onError);

  return {
    proc,
    startProcessing: () => {
      if (prompt) {
        // UTF-8でプロンプトを書き込み
        proc.stdin.write(prompt, 'utf8');
        proc.stdin.end();
      }
    }
  };
}
```

---

### 4. 運用フロー

#### 10分TTL 再接続挙動

```
[WebSocket接続中]
    │
    ▼
[WebSocket切断]
    │
    ├─ containerManager.onDisconnect(sessionId)
    │   └─ container.disconnectedAt = Date.now()
    │   └─ ※ジョブ実行中でも継続（10分以内の再接続に備える）
    │
    ▼
[60秒ごとのcleanup()]
    │
    ├─ 10分未経過 → スキップ
    │
    └─ 10分経過
        ├─ 実行中ジョブがあれば停止（docker exec kill）
        ├─ sessionLogger.closeStream(sessionId)
        ├─ docker rm -f claude-sandbox-${sessionId}
        └─ containers.delete(sessionId)
```

**切断中のジョブ実行ポリシー**:
| 状態 | 挙動 |
|------|------|
| 切断後10分以内 | ジョブ継続（再接続時に結果を受け取れる） |
| 切断後10分超過 | **ジョブ停止** + コンテナ削除（無駄実行防止） |

```javascript
// cleanup() でのジョブ停止処理
async cleanup() {
  const now = Date.now();
  const toRemove = [];

  for (const [sessionId, container] of this.containers) {
    if (container.disconnectedAt) {
      const disconnectedTime = now - container.disconnectedAt;
      if (disconnectedTime > DISCONNECT_TIMEOUT) {
        toRemove.push(sessionId);
      }
    }
  }

  for (const sessionId of toRemove) {
    // 実行中のClaude CLIプロセスを停止
    try {
      await execFileAsync('docker', ['exec', `claude-sandbox-${sessionId}`, 'pkill', '-f', 'claude']);
    } catch {
      // プロセスがなければ無視
    }

    await this.removeContainer(sessionId);
  }
}
```

**再接続時**:
```javascript
// WebSocket 'init' メッセージ受信時
case 'init':
  const existingContainer = containerManager.containers.get(sessionId);

  if (existingContainer && await containerManager.isContainerRunning(existingContainer.id)) {
    // 再接続成功
    existingContainer.disconnectedAt = null;

    // セッションログを復元して送信
    const logs = await sessionLogger.getLog(userId, sessionId);
    safeSend({ type: 'sessionRestored', logs });
  } else {
    // コンテナなし → 新規セッション
    safeSend({ type: 'newSession' });
  }
  break;
```

#### 失敗時の復帰ルール

| 失敗パターン | 検知方法 | 復帰アクション |
|-------------|---------|--------------|
| コンテナ停止 | `isContainerRunning()` false | 自動再作成 |
| OOM Kill | exit code 137 | エラー通知、再試行可能 |
| タイムアウト | 10分タイマー | SIGTERM → SIGKILL、エラー通知 |
| Docker daemon応答なし | execFile timeout | エラー通知、手動リトライ |
| NFS マウント失敗 | container作成エラー | エラー通知、管理者対応 |

```javascript
// 失敗復帰の実装例
async execInContainer(sessionId, args, options = {}) {
  let container = this.containers.get(sessionId);

  // コンテナが死んでいたら再作成
  if (!container || !await this.isContainerRunning(container.id)) {
    const userId = container?.userId;
    if (!userId) {
      throw new Error('Session not found');
    }

    // 古いコンテナ情報を削除
    await this.removeContainer(sessionId);

    // 新規作成
    container = await this.createContainer(sessionId, userId);
    this.containers.set(sessionId, container);
    this.userSessions.set(userId, sessionId);
  }

  // 以下、通常の実行処理
  // ...
}
```

#### 30日削除バッチ

```javascript
// server/sessionLogger.js

/**
 * 30日以上経過したセッションログを削除（日次バッチ）
 */
async cleanupOldLogs() {
  const LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;  // 30日
  const now = Date.now();
  const usersDir = '/data/users';

  const userDirs = await fs.readdir(usersDir);

  for (const userId of userDirs) {
    const sessionsDir = path.join(usersDir, userId, 'sessions');

    try {
      const files = await fs.readdir(sessionsDir);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = path.join(sessionsDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > LOG_RETENTION_MS) {
          await fs.unlink(filePath);
          console.log(`Deleted old session log: ${filePath}`);
        }
      }
    } catch (e) {
      // sessions ディレクトリがないユーザーはスキップ
      if (e.code !== 'ENOENT') {
        console.error(`Error cleaning logs for ${userId}:`, e);
      }
    }
  }
}

// 起動時にスケジュール設定
const scheduleLogCleanup = () => {
  // 毎日 AM 3:00 に実行
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) {
    next3am.setDate(next3am.getDate() + 1);
  }

  const msUntil3am = next3am - now;

  setTimeout(() => {
    sessionLogger.cleanupOldLogs();
    // 以降は24時間ごと
    setInterval(() => sessionLogger.cleanupOldLogs(), 24 * 60 * 60 * 1000);
  }, msUntil3am);
};
```

**実行タイミング**: 毎日 AM 3:00 JST

---

## 必要な作業

### 1. Docker イメージ作成
- [ ] `docker/claude-sandbox/Dockerfile` 作成
- [ ] stdbuf インストール（ストリームバッファリング制御）
- [ ] Claude CLI インストール確認
- [ ] イメージビルド・テスト

### 2. Container Manager 実装
- [ ] `server/containerManager.js` 作成
- [ ] 入力検証（sessionId/userId/projectId）
- [ ] セキュリティオプション追加（cap-drop, no-new-privileges等）
- [ ] APIキー環境変数方式（Phase 1）
- [ ] stdin入力 + stream-jsonパース処理
- [ ] Subscribe→Start順序対応
- [ ] セッション単位でのコンテナ管理
- [ ] 1ユーザー1コンテナ制限
- [ ] 切断後10分タイムアウト
- [ ] 同時コンテナ上限（100）

### 3. Session Logger 実装
- [ ] `server/sessionLogger.js` 作成
- [ ] **非同期I/O化**（WriteStream使用）
- [ ] JSONL形式でログ記録
- [ ] 再接続時の復元機能（最新1MB）
- [ ] 10MB/30日制限

### 4. claudeRunner.js 修正
- [ ] 全10箇所の spawn を containerManager.execInContainer に置換
- [ ] sessionId の受け渡し追加
- [ ] prompt を stdin 経由で渡す
- [ ] onStream/onComplete コールバック対応
- [ ] エラーハンドリング追加

### 5. WebSocket連携
- [ ] sessionId 発行・管理
- [ ] Subscribe→Start順序の実装
- [ ] 切断時の onDisconnect 呼び出し
- [ ] 再接続時のセッション復元

### 6. インフラ
- [ ] GCP Filestore セットアップ
- [ ] VMで `/data` マウント
- [ ] イメージを Artifact Registry にプッシュ
- [ ] docker-compose.yml 更新
- [ ] ホストiptablesでメタデータサーバー遮断（`iptables -I DOCKER-USER -d 169.254.169.254 -j DROP`）

### 7. テスト
- [ ] ローカルでの動作確認
- [ ] stdin入力テスト
- [ ] ストリーミング出力テスト
- [ ] タイムアウト動作確認
- [ ] 再接続・復元テスト
- [ ] セキュリティテスト（メタデータサーバー遮断等）
- [ ] パフォーマンス測定

## リスクと対策

| リスク | 対策 |
|--------|------|
| コンテナ起動遅延 | セッション中は再利用で軽減 |
| Docker 不具合 | ログ監視、アラート設定 |
| API キー漏洩 | 環境変数（Phase 1）、P2でSecret Manager移行、ログに出力しない |
| ディスク容量 | イメージサイズ最小化、ログローテーション |
| Filestore障害 | スナップショット、バックアップ |
| ネットワーク悪用 | 将来的にEgress制限/Allowlist導入 |
| GCPメタデータ漏洩 | --add-host + ホストiptablesで完全遮断 |
| Fork bomb | --pids-limit 100（P1対応済み） |

## 将来の改善（P2）

| 項目 | 説明 |
|------|------|
| Secret Manager | Workload Identity への移行 |
| 外部状態管理 | Redis等（Main Server冗長化時） |
| コンテナプール | 事前起動コンテナで初回遅延削減 |
| Graceful shutdown | orphanコンテナ防止 |
| Mutex | コンテナ操作の競合状態対策 |
| Egress制限 | 特定ドメインのみ許可（Allowlist） |
| オートスケール | コンテナ数に応じたVM追加 |

## 結論

**全 Claude CLI 呼び出しを Docker 化する**

理由:
1. セキュリティに妥協しない
2. 1つでも直接実行があれば攻撃ベクトルになる
3. セッション単位でコンテナを維持し、パフォーマンスも確保
4. Phase 1はシングルVM、将来マルチVM対応可能
