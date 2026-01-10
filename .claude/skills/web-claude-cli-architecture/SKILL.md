---
name: web-claude-cli-architecture
description: WebベースのチャットUIからClaude Code CLIを操作するアーキテクチャ。WebSocket、Job Queue、stdin入力、ストリーミング出力。
---

# Web Chat UI → Claude Code CLI アーキテクチャ

## 概要

Webブラウザのチャット画面からNode.jsサーバー経由でClaude Code CLIを実行し、結果をリアルタイムでストリーミング表示するアーキテクチャ。

```
┌─────────────┐    WebSocket     ┌─────────────┐    spawn/stdin    ┌─────────────┐
│   Browser   │ ◄──────────────► │  Node.js    │ ◄───────────────► │ Claude CLI  │
│   (Chat)    │                  │   Server    │                   │  (claude)   │
└─────────────┘                  └─────────────┘                   └─────────────┘
      ▲                                │
      │                                ▼
      │                         ┌─────────────┐
      └─────────────────────────│  Job Queue  │
         進捗・ストリーム         │   (SQLite)  │
                                └─────────────┘
```

---

## コア技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | Vanilla JS, WebSocket API |
| Backend | Node.js, Express, ws (WebSocket) |
| Claude CLI実行 | child_process.spawn |
| 永続化 | better-sqlite3 |
| プロセス管理 | JobManager (EventEmitter) |

---

## 1. WebSocket接続管理

### サーバー側 (server/index.js)

```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// 接続追跡
const wsConnections = new Map(); // visitorId -> Set of WebSocket

wss.on('connection', (ws) => {
  let visitorId = null;
  let jobUnsubscribe = null;

  const safeSend = (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'init':
        visitorId = data.visitorId || generateId();
        wsConnections.get(visitorId)?.add(ws) || wsConnections.set(visitorId, new Set([ws]));
        safeSend({ type: 'init', visitorId });
        break;

      case 'message':
        // Claude CLI実行をトリガー
        const { job, startProcessing } = await claudeRunner.runClaudeAsJob(
          visitorId, projectId, data.content
        );

        // Job更新をSubscribe（処理開始前に！）
        jobUnsubscribe = jobManager.subscribe(job.id, (update) => {
          if (update.type === 'stream') {
            safeSend({ type: 'stream', content: update.content });
          } else {
            safeSend({ type: 'jobUpdate', ...update });
          }
        });

        safeSend({ type: 'jobStarted', job });
        startProcessing(); // Subscribe後に処理開始
        break;

      case 'cancel':
        claudeRunner.cancelJob(data.jobId);
        break;
    }
  });

  ws.on('close', () => {
    if (jobUnsubscribe) jobUnsubscribe();
    wsConnections.get(visitorId)?.delete(ws);
  });
});
```

### クライアント側 (public/app.js)

```javascript
class App {
  constructor() {
    this.ws = null;
    this.currentJobId = null;
  }

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'init',
        visitorId: localStorage.getItem('visitorId')
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 3000); // 自動再接続
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'stream':
        this.appendToOutput(data.content);
        break;
      case 'jobUpdate':
        if (data.type === 'completed') this.onComplete(data);
        if (data.type === 'failed') this.onError(data);
        break;
    }
  }

  sendMessage(content) {
    this.ws.send(JSON.stringify({ type: 'message', content }));
  }
}
```

---

## 2. Claude CLI実行（stdin入力）

### 重要: シェルエスケープ問題の回避

**絶対にやってはいけないこと:**
```javascript
// NG: コマンドライン引数にプロンプトを渡す
spawn('claude', [prompt]); // 特殊文字が壊れる
spawn('claude', [prompt], { shell: true }); // さらに危険
```

**正しい方法: stdin経由でプロンプトを渡す**
```javascript
const { spawn } = require('child_process');

async function runClaude(prompt, projectDir) {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '--print',                    // 非対話モード
      '--model', 'haiku',           // モデル指定（省略可）
      '--dangerously-skip-permissions'  // 確認スキップ
    ], {
      cwd: projectDir,
      env: { ...process.env }
      // shell: true は使わない！
    });

    // ★プロンプトはstdin経由で渡す
    claude.stdin.write(prompt);
    claude.stdin.end();

    let output = '';
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.on('close', (code) => {
      resolve({ code, output });
    });

    claude.on('error', reject);
  });
}
```

### ストリーミング出力 (stream-json形式)

```javascript
const claude = spawn('claude', [
  '--verbose',
  '--output-format', 'stream-json',  // JSON形式でストリーム
  '--dangerously-skip-permissions'
], {
  cwd: projectDir,
  stdio: ['pipe', 'pipe', 'pipe']
});

claude.stdin.write(prompt);
claude.stdin.end();

let buffer = '';

claude.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 不完全な行は保持

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const json = JSON.parse(line);

      // stream_eventラッパーを処理
      let event = json;
      if (json.type === 'stream_event' && json.event) {
        event = json.event;
      }

      // テキストストリーム
      if (event.type === 'content_block_delta' && event.delta?.text) {
        onStream(event.delta.text);
      }

      // ツール使用
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        onStream(`\n[${event.content_block.name}]\n`);
      }

      // 完了
      if (event.type === 'result') {
        onComplete(event.result);
      }
    } catch (e) {
      // JSON以外は無視
    }
  }
});
```

---

## 3. Job Queue（非同期処理管理）

### JobManager (server/jobManager.js)

```javascript
const EventEmitter = require('events');

class JobManager extends EventEmitter {
  constructor() {
    super();
    this.runningJobs = new Map();   // jobId -> { process, cancel }
    this.subscribers = new Map();   // jobId -> Set of callbacks
  }

  createJob(userId, projectId) {
    // SQLiteにJob作成
    return db.createJob(userId, projectId);
  }

  startJob(jobId) {
    db.updateJobStatus(jobId, 'processing');
    this.notifySubscribers(jobId, { type: 'started' });
  }

  updateProgress(jobId, progress, message) {
    db.updateJobProgress(jobId, progress, message);
    this.notifySubscribers(jobId, { type: 'progress', progress, message });
  }

  completeJob(jobId, result) {
    db.completeJob(jobId, result);
    this.runningJobs.delete(jobId);
    this.notifySubscribers(jobId, { type: 'completed', result });
  }

  // プロセス登録（キャンセル用）
  registerProcess(jobId, process, cancelFn) {
    this.runningJobs.set(jobId, { process, cancel: cancelFn });
  }

  cancelJob(jobId) {
    const job = this.runningJobs.get(jobId);
    if (job?.cancel) job.cancel();
    this.runningJobs.delete(jobId);
    this.notifySubscribers(jobId, { type: 'cancelled' });
  }

  // Pub/Subパターン
  subscribe(jobId, callback) {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId).add(callback);

    return () => {
      this.subscribers.get(jobId)?.delete(callback);
    };
  }

  notifySubscribers(jobId, data) {
    this.subscribers.get(jobId)?.forEach(cb => cb(data));
  }
}

module.exports = new JobManager();
```

### ストリームを直接WebSocketに流す

```javascript
// claudeRunner.js
async processJob(jobId, visitorId, projectId, prompt) {
  jobManager.startJob(jobId);

  const claude = spawn('claude', [...args], { cwd: projectDir });
  jobManager.registerProcess(jobId, claude, () => claude.kill());

  claude.stdin.write(prompt);
  claude.stdin.end();

  claude.stdout.on('data', (data) => {
    // ストリームを直接サブスクライバーに通知
    jobManager.notifySubscribers(jobId, {
      type: 'stream',
      content: data.toString()
    });
  });

  claude.on('close', (code) => {
    if (code === 0) {
      jobManager.completeJob(jobId, { success: true });
    } else {
      jobManager.failJob(jobId, 'Process exited with code ' + code);
    }
  });
}
```

---

## 4. Subscribe→Start順序（重要）

**WebSocket切断からの復帰を考慮した設計:**

```javascript
// server/index.js
case 'message':
  // 1. Job作成（まだ処理は開始しない）
  const { job, isExisting, startProcessing } = await claudeRunner.runClaudeAsJob(
    visitorId, projectId, userMessage
  );

  // 2. まずSubscribeを設定
  jobUnsubscribe = jobManager.subscribe(job.id, (update) => {
    safeSend({ type: 'jobUpdate', ...update });
  });

  // 3. クライアントにJob開始を通知
  safeSend({ type: 'jobStarted', job, isExisting });

  // 4. 最後に処理を開始（これでストリームを逃さない）
  startProcessing();
  break;
```

```javascript
// claudeRunner.js
async runClaudeAsJob(visitorId, projectId, userMessage) {
  const job = jobManager.createJob(userId, projectId);

  return {
    job,
    isExisting: false,
    startProcessing: () => {
      // この関数が呼ばれるまで処理は始まらない
      this.processJob(job.id, visitorId, projectId, userMessage);
    }
  };
}
```

---

## 5. キャンセル処理

```javascript
// フロントエンド
stopButton.addEventListener('click', () => {
  ws.send(JSON.stringify({
    type: 'cancel',
    jobId: currentJobId
  }));
});

// バックエンド
case 'cancel':
  claudeRunner.cancelJob(data.jobId);
  safeSend({ type: 'cancelled', jobId: data.jobId });
  break;

// claudeRunner.js
cancelJob(jobId) {
  const job = this.runningJobs.get(jobId);
  if (job) {
    job.kill('SIGTERM');
  }
  jobManager.cancelJob(jobId);
}
```

---

## 6. データベーススキーマ (SQLite)

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed, cancelled
  progress INTEGER DEFAULT 0,
  progress_message TEXT,
  result TEXT,  -- JSON
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_project ON jobs(project_id, status);
```

---

## ファイル構成

```
project/
├── server/
│   ├── index.js         # Express + WebSocket サーバー
│   ├── claudeRunner.js  # Claude CLI実行ロジック
│   ├── jobManager.js    # Job Queue管理
│   ├── database.js      # SQLiteラッパー
│   └── userManager.js   # ユーザー・プロジェクト管理
├── public/
│   ├── index.html       # チャットUI
│   ├── app.js           # WebSocketクライアント
│   └── style.css        # スタイル
└── package.json
```

---

## 必要なnpmパッケージ

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "better-sqlite3": "^9.2.2",
    "uuid": "^9.0.0"
  }
}
```

---

## チェックリスト

- [ ] Claude CLIへのプロンプトはstdin経由で渡す（コマンドライン引数NG）
- [ ] `shell: true` は使わない
- [ ] Job Subscribe後にprocessing開始
- [ ] WebSocket再接続時にactive jobを復帰
- [ ] ストリームはバッファリングして行単位で処理
- [ ] キャンセル時はSIGTERM送信

---

## 禁止

- `spawn('claude', [prompt])` - 特殊文字が壊れる
- `spawn(..., { shell: true })` - シェルエスケープ問題
- Subscribe前にprocessing開始 - ストリームを逃す
- WebSocket.send without readyState check - 切断時エラー
