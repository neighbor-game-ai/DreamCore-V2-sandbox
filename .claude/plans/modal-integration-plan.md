# Modal 統合実装プラン

**作成日**: 2026-01-27
**ステータス**: Phase 1-2 完了、Phase 3-4 残り
**最終更新**: 2026-01-27

---

## 概要

DreamCore-V2-sandbox の Express サーバーに Modal 統合を実装する。
Modal 側（app.py）は実装済み。Express 側の実装が必要。

---

## 設計原則

### UX 完全維持の原則
- **フロントエンドは一切変更しない**
- **WebSocket メッセージ形式は維持**
- **REST API エンドポイント・形式は維持**
- **DreamCore-V2 の全機能を継承（機能削減禁止）**
- **`USE_MODAL=false` で即ローカル実行にロールバック可能**

### DB 操作の集約原則
- **Modal に Supabase 認証情報を渡さない**
  - `SUPABASE_URL` は Modal に設定しない
  - `SUPABASE_SERVICE_ROLE_KEY` は Modal に設定しない
- **DB 操作は全て Express 側で実行**
  - projects, assets, jobs, chat_history テーブル
  - RLS ポリシーは Express 経由で適用
- **Modal は実行専用**
  - Claude CLI 実行
  - Gemini API 呼び出し
  - ファイル I/O（Modal Volume）
  - Git 操作

### Prompt 構築の責務（確定）
- **Express 側で確定**
  - `detectIntent()`: restore/chat/edit 判定
  - `detectSkillsWithAI()`: 最適スキル選択
  - `buildPrompt()`: skill summary + style 選択 + prompt 組み立て
- **Modal は実行のみ**
  - 完成した prompt を受け取り、Claude CLI / Gemini に渡す
- **理由**: UX 差分を避けるため、ロジックは Express 側に残す

### 現状
- Modal 側（app.py）: ✅ 実装済み・動作確認済み（8エンドポイント）
- Express 側: DreamCore-V2 の完全クローン状態（Modal 未実装）

---

## SSE イベント形式（厳密仕様）

### 形式ルール
- **`event:` 行は使用しない**
- **`data: {"type":"..."}` のみで統一**
- 各イベントは `\n\n` で終端

### イベント形式

```
data: {"type":"status","message":"Starting generation..."}

data: {"type":"stream","content":"生成されたコード..."}

data: {"type":"done","success":true,"exit_code":0}

data: {"type":"error","error":"エラーメッセージ"}
```

### SSE → WebSocket 変換マッピング

| SSE type | WS type | 用途 |
|----------|---------|------|
| `status` | `progress` | 進捗表示 |
| `stream` | `stream` | ストリーミング出力 |
| `done` | `completed` | 正常完了 |
| `error` | `failed` | エラー終了 |
| `result` | `result` | 結果データ |
| `log` | `log` | デバッグログ |
| `debug` | `debug` | デバッグ情報 |
| `warning` | `warning` | 警告 |

---

## UX 完全維持の必須機能一覧

### コード生成・編集（全て必須）

| 機能 | WS メッセージ | Modal 対応 | 備考 |
|------|--------------|-----------|------|
| **Create（新規作成）** | `geminiCode` | ✅ generate_game / generate_gemini | |
| **Edit（編集）** | `geminiCode` | ✅ generate_game / generate_gemini | |
| **Chat（チャット応答）** | `geminiChat` | ✅ Claude Haiku（Modal内） | |
| **Restore（復元）** | `geminiRestore` | ✅ detect_intent → Git操作 | |
| **autoFix（自動修正）** | `jobUpdate` | ✅ generate_game | debugOptions.useClaude=true |
| **Intent Detection** | 内部処理 | ✅ detect_intent | restore/chat/edit 判定 |
| **Skill Detection** | 内部処理 | ✅ detect_skills | 最適スキル自動選択 |

### ビジュアル・コンテンツ生成（全て必須）

| 機能 | REST API | Modal 対応 | 備考 |
|------|----------|-----------|------|
| **Image Generation** | `POST /api/generate-image` | ✅ generate_gemini 内で実行 | Gemini Imagen |
| **Background Removal** | `POST /api/assets/remove-background` | Express 維持 | Replicate API |
| **Thumbnail Generation** | `POST /api/projects/:id/generate-thumbnail` | Express 維持 | Claude Haiku + Nano Banana |
| **Movie Generation** | `POST /api/projects/:id/generate-movie` | ⚠️ 要検討 | Remotion |

### プロジェクト管理（全て必須・Express 維持）

| 機能 | WS/REST | Modal 対応 | 備考 |
|------|---------|-----------|------|
| **Create Project** | WS `createProject` | Express 維持 | DB 操作 |
| **Delete Project** | WS `deleteProject` | Express 維持 | DB 操作 |
| **Rename Project** | WS `renameProject` | Express 維持 | DB 操作 |
| **List Projects** | REST `GET /api/projects` | Express 維持 | DB 操作 |
| **Get Project Info** | WS `getProjectInfo` | Express 維持 | DB 操作 |

### バージョン管理（全て必須）

| 機能 | WS メッセージ | Modal 対応 | 備考 |
|------|--------------|-----------|------|
| **Save Version** | 自動 | ✅ apply_files 内で git commit | |
| **Get Versions** | `versionsList` | ⚠️ 要追加 | git log |
| **Get Version Edits** | `versionEdits` | ⚠️ 要追加 | git diff |
| **Restore Version** | `versionRestored` | ⚠️ 要追加 | git checkout |

### アセット管理（全て必須）

| 機能 | REST API | Modal 対応 | 備考 |
|------|----------|-----------|------|
| **Upload Asset** | `POST /api/assets/upload` | Express 維持 | DB + ファイル保存 |
| **Search Assets** | `GET /api/assets/search` | Express 維持 | DB 検索 |
| **List Assets** | `GET /api/assets` | Express 維持 | DB 検索 |
| **Get Asset** | `GET /api/assets/:id` | Modal Volume 経由 | ファイル取得 |
| **Delete Asset** | `DELETE /api/assets/:id` | Express 維持 | DB 操作（soft delete） |
| **replaceAssetReferences()** | 内部処理 | Express 維持 | コード内アセット参照解決 |

### Publish 系（全て必須・Express 維持）

| 機能 | REST API | Modal 対応 | 備考 |
|------|----------|-----------|------|
| **Save Publish Draft** | `PUT /api/projects/:id/publish-draft` | Express 維持 | DB 操作 |
| **Get Publish Draft** | `GET /api/projects/:id/publish-draft` | Express 維持 | DB 操作 |
| **Generate Publish Info** | `POST /api/projects/:id/generate-publish-info` | Express 維持 | Claude Haiku |
| **Upload Thumbnail** | `POST /api/projects/:id/upload-thumbnail` | Express 維持 | ファイル保存 |
| **Get Thumbnail** | `GET /api/projects/:id/thumbnail` | Express 維持 | 公開アクセス |

### Phase 1 で意図的に無効化されている機能

**重要**: これらは DreamCore-V2 でも同様に無効化されているため、UX 完全維持の条件に矛盾しない。

| 機能 | DreamCore-V2 の現状 | sandbox での扱い | 備考 |
|------|---------------------|-----------------|------|
| `/api/public-games` | **削除済み** | 同様に削除 | Phase 1 は Owner-only 設計 |
| Discover 公開機能 | **API 削除済み**（UI は残存） | 同様に削除 | 公開ゲーム一覧は表示されない |
| Remix | **未実装**（コードなし） | 実装しない | DreamCore-V2 に存在しない機能 |
| Like/Share | **UI のみ**（バックエンド未実装） | 同様に UI のみ | ボタンはあるが機能しない |

**根拠**:
- DreamCore-V2 の `server/index.js` から `/api/public-games` エンドポイントは削除済み
- `docs/ARCHITECTURE-V2.md` に「Phase 1: Owner-only」と明記
- Remix 機能は DreamCore-V2 のコードベースに存在しない（計画のみ）
- Like/Share は UI コンポーネントのみで、バックエンド API は未実装

**結論**: sandbox がこれらを実装しないのは「機能削減」ではなく「DreamCore-V2 との同一性維持」

---

## Modal app.py エンドポイント対応表

### 実装済みエンドポイント（8個）

| Modal Endpoint | HTTP | 用途 | DreamCore-V2 での使用箇所 |
|----------------|------|------|--------------------------|
| `/generate_game` | POST | Claude CLI 実行 | `claudeRunner.runClaude()` |
| `/generate_gemini` | POST | Gemini 生成 | `geminiClient.generateCode()` |
| `/get_file` | GET | ファイル取得 | `userManager.readProjectFile()` |
| `/list_files` | GET | ファイル一覧 | `userManager.listProjectFiles()` |
| `/apply_files` | POST | ファイル適用 | `userManager.writeProjectFile()` |
| `/detect_intent` | POST | 意図検出 | `claudeRunner.detectIntent()` |
| `/detect_skills` | POST | スキル検出 | `claudeRunner.detectSkillsWithAI()` |
| `/get_skill_content` | POST | スキル内容取得 | `claudeRunner.readSkillContents()` |

### Express 維持が適切な機能（Modal 不要の根拠）

| 機能 | 実行場所 | 権限 | I/O | Modal 不要の理由 |
|------|----------|------|-----|-----------------|
| **Remotion 動画生成** | Express サーバー | なし（外部 API） | HTTP のみ | ファイル I/O なし、外部サービス呼び出しのみ |
| **Replicate 背景除去** | Express サーバー | API キー | HTTP のみ | ファイル I/O なし、外部サービス呼び出しのみ |
| **Thumbnail 生成** | Express サーバー | Gemini API キー | HTTP + ローカル保存 | 結果は Supabase Storage に保存（Modal Volume 不要） |

**共通点**: これらは「外部 API 呼び出し → 結果を DB/Storage に保存」のパターンであり、
Modal Sandbox（隔離実行環境）を必要としない。Claude CLI のようなユーザーコード実行リスクがない。

**Secrets の分離（必須）**:

| Secret | 保管場所 | 用途 |
|--------|----------|------|
| `ANTHROPIC_API_KEY` | Modal Secrets | Claude CLI 実行 |
| `GEMINI_API_KEY` | Modal Secrets | Gemini 生成（Modal 内） |
| `MODAL_INTERNAL_SECRET` | 両方 | Express ↔ Modal 間認証 |
| `REPLICATE_API_TOKEN` | **Express のみ** | 背景除去（Modal に渡さない） |
| `REMOTION_API_KEY` | **Express のみ** | 動画生成（Modal に渡さない） |
| `SUPABASE_*` | **Express のみ** | DB 操作（Modal に渡さない） |

**原則**: Express 側で実行する外部 API の認証情報は Modal Secrets に含めない。

### Git 操作の設計方針（確定）

| 方針 | 採用 | 理由 |
|------|------|------|
| **Modal 側で実行** | ✅ 採用 | プロジェクトファイルは Modal Volume にあるため |
| Express 側で実行 | ❌ 不採用 | Express からは Modal Volume に直接アクセスできない |

**実装方針**（シニアエンジニア確定）:
- **`/apply_files` を拡張**（新規エンドポイントは追加しない）
- 理由: エンドポイント数を増やさず、既存の責務を拡張

**拡張仕様**:
```json
// Git log 取得
{ "action": "git_log", "user_id": "...", "project_id": "...", "limit": 50 }

// Git diff 取得
{ "action": "git_diff", "user_id": "...", "project_id": "...", "commit": "abc1234" }

// Git restore
{ "action": "git_restore", "user_id": "...", "project_id": "...", "commit": "abc1234" }
```

**必須要件**:
- UUID 検証: `user_id`, `project_id` は UUID 形式のみ許可
- パス検証: `..` や絶対パスを拒否（パストラバーサル防止）
- 排他制御: 同一プロジェクトへの同時 Git 操作を防止（ロック機構）

**対応表**:

| DreamCore-V2 機能 | Modal エンドポイント | action | 実装方式 |
|------------------|---------------------|--------|----------|
| `getVersions()` | `/apply_files` | `git_log` | `git log --oneline -n 50` |
| `getVersionEdits()` | `/apply_files` | `git_diff` | `git diff {commit}` |
| `restoreVersion()` | `/apply_files` | `git_restore` | `git checkout {commit} -- .` |

---

## 実装タスク

### 実装順序（シニアエンジニア確定）

```
1. Modal: /apply_files を Git 対応に拡張（git_log / git_diff / git_restore）
2. Express: config.js + modalClient.js + USE_MODAL 分岐
3. Express: versionsList / restoreVersion 対応
4. 以降の機能（生成フロー、アセット管理）
```

---

### Phase 1: 基盤実装（必須）

#### Task 1.0: Modal /apply_files の Git 拡張（先行タスク）
**ファイル**: `/Users/admin/DreamCore-V2-modal/modal/app.py`

**対応内容**:
- `action: "git_log"` サポート追加
- `action: "git_diff"` サポート追加
- `action: "git_restore"` サポート追加
- UUID 検証、パス検証、排他制御の実装

**注意**: このタスクは Modal 側の変更。Express 実装の前提条件。

---

#### Task 1.1: config.js に Modal 環境変数を追加
**ファイル**: `server/config.js`

追加する設定:
```javascript
// Modal 統合
USE_MODAL: process.env.USE_MODAL === 'true',
MODAL_ENDPOINT: process.env.MODAL_ENDPOINT,
MODAL_INTERNAL_SECRET: process.env.MODAL_INTERNAL_SECRET,

// Modal エンドポイント群（オプション）
MODAL_GET_FILE_ENDPOINT: process.env.MODAL_GET_FILE_ENDPOINT,
MODAL_LIST_FILES_ENDPOINT: process.env.MODAL_LIST_FILES_ENDPOINT,
MODAL_APPLY_FILES_ENDPOINT: process.env.MODAL_APPLY_FILES_ENDPOINT,
MODAL_DETECT_INTENT_ENDPOINT: process.env.MODAL_DETECT_INTENT_ENDPOINT,
MODAL_DETECT_SKILLS_ENDPOINT: process.env.MODAL_DETECT_SKILLS_ENDPOINT,
MODAL_GET_SKILL_CONTENT_ENDPOINT: process.env.MODAL_GET_SKILL_CONTENT_ENDPOINT,
MODAL_GEMINI_ENDPOINT: process.env.MODAL_GEMINI_ENDPOINT,
```

**注意**: USE_MODAL=true 時の検証は行わない（ローカル実行可能なため）

---

#### Task 1.2: modalClient.js を新規作成
**ファイル**: `server/modalClient.js`（新規）

```javascript
/**
 * Modal API クライアント
 *
 * Modal Sandbox への HTTP リクエストと SSE パース機能を提供
 */

const config = require('./config');

class ModalClient {
  constructor() {
    this.endpoint = config.MODAL_ENDPOINT;
    this.secret = config.MODAL_INTERNAL_SECRET;
  }

  /**
   * SSE ストリームをパースするジェネレーター
   * @param {Response} response - fetch レスポンス
   * @yields {Object} パース済みイベントオブジェクト
   */
  async *parseSSEStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6));
          } catch (e) {
            // JSON パースエラーは無視
          }
        }
      }
    }
  }

  /**
   * SSE イベントを WebSocket 形式に変換
   * @param {Object} sseData - SSE イベントデータ
   * @returns {Object} WebSocket 形式のイベント
   */
  convertSseToWsEvent(sseData) {
    const mapping = {
      'status': 'progress',
      'stream': 'stream',
      'done': 'completed',
      'error': 'failed',
      'result': 'result',
      'log': 'log',
      'debug': 'debug',
      'warning': 'warning',
    };

    return {
      ...sseData,
      type: mapping[sseData.type] || sseData.type,
    };
  }

  /**
   * ゲーム生成（Claude CLI）
   * @param {Object} params - { user_id, project_id, prompt }
   * @yields {Object} WebSocket 形式のイベント
   */
  async *generateGame({ user_id, project_id, prompt }) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ user_id, project_id, prompt }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * ファイル取得
   */
  async getFile(user_id, project_id, path) {
    const url = new URL(config.MODAL_GET_FILE_ENDPOINT || this.endpoint.replace('/generate_game', '/get_file'));
    url.searchParams.set('user_id', user_id);
    url.searchParams.set('project_id', project_id);
    url.searchParams.set('path', path);

    const response = await fetch(url, {
      headers: { 'X-Modal-Secret': this.secret },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Modal API error: ${response.status}`);
    }

    // バイナリファイルの場合は Buffer を返す
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('text') && !contentType.includes('json')) {
      return Buffer.from(await response.arrayBuffer());
    }

    return await response.text();
  }

  /**
   * ファイル一覧
   */
  async listFiles(user_id, project_id) {
    const url = new URL(config.MODAL_LIST_FILES_ENDPOINT || this.endpoint.replace('/generate_game', '/list_files'));
    url.searchParams.set('user_id', user_id);
    url.searchParams.set('project_id', project_id);

    const response = await fetch(url, {
      headers: { 'X-Modal-Secret': this.secret },
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  /**
   * ファイル適用
   * @yields {Object} 進捗イベント
   */
  async *applyFiles({ user_id, project_id, files, commit_message }) {
    const url = config.MODAL_APPLY_FILES_ENDPOINT || this.endpoint.replace('/generate_game', '/apply_files');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ user_id, project_id, files, commit_message }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * 意図検出（Haiku）
   */
  async detectIntent(message) {
    const url = config.MODAL_DETECT_INTENT_ENDPOINT || this.endpoint.replace('/generate_game', '/detect_intent');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    const data = await response.json();
    return data.intent;
  }

  /**
   * スキル検出（Haiku）
   */
  async detectSkills(message, dimension = '2d', existing_code = '') {
    const url = config.MODAL_DETECT_SKILLS_ENDPOINT || this.endpoint.replace('/generate_game', '/detect_skills');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ message, dimension, existing_code }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    const data = await response.json();
    return data.skills || [];
  }

  /**
   * Gemini 生成（高速パス）
   * @yields {Object} WebSocket 形式のイベント
   */
  async *generateGemini({ user_id, project_id, prompt }) {
    const url = config.MODAL_GEMINI_ENDPOINT || this.endpoint.replace('/generate_game', '/generate_gemini');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ user_id, project_id, prompt }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    for await (const sseData of this.parseSSEStream(response)) {
      yield this.convertSseToWsEvent(sseData);
    }
  }

  /**
   * スキルコンテンツ取得
   */
  async getSkillContent(skill_names) {
    const url = config.MODAL_GET_SKILL_CONTENT_ENDPOINT || this.endpoint.replace('/generate_game', '/get_skill_content');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Modal-Secret': this.secret,
      },
      body: JSON.stringify({ skill_names }),
    });

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.status}`);
    }

    const data = await response.json();
    return data.skills || {};
  }
}

module.exports = new ModalClient();
```

---

#### Task 1.3: claudeRunner.js の修正
**ファイル**: `server/claudeRunner.js`

**変更箇所**:

1. **Modal クライアントのインポート追加**:
```javascript
const config = require('./config');
const modalClient = config.USE_MODAL ? require('./modalClient') : null;
```

2. **runClaudeOnModal() 関数の追加**:
```javascript
async function runClaudeOnModal(jobId, userId, projectId, prompt, options) {
  try {
    const stream = modalClient.generateGame({
      user_id: userId,
      project_id: projectId,
      prompt,
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'stream':
          jobManager.notifySubscribers(jobId, {
            type: 'stream',
            content: event.content
          });
          break;

        case 'progress':
          jobManager.updateProgress(jobId, event.progress, event.message);
          break;

        case 'completed':
          jobManager.completeJob(jobId, event);
          break;

        case 'failed':
          jobManager.failJob(jobId, event.error || event.message);
          break;

        default:
          // その他のイベントはそのまま通知
          jobManager.notifySubscribers(jobId, event);
      }
    }
  } catch (error) {
    jobManager.failJob(jobId, error.message);
  }
}
```

3. **processJob() での分岐追加**:
```javascript
// 既存の processJob() 内
if (config.USE_MODAL) {
  await runClaudeOnModal(jobId, userId, projectId, prompt, options);
} else {
  // 既存のローカル実行コード
  await runClaudeLocal(jobId, userId, projectId, prompt, options);
}
```

**重要**: 既存のローカル実行コードは `runClaudeLocal()` として保持（フォールバック用）

---

### Phase 1.5: ファイル I/O の Modal 対応（必須・Phase 1 と密結合）

#### Task 1.4: userManager.js の修正
**ファイル**: `server/userManager.js`

**変更箇所**:

1. **Modal 対応のファイル読み込み**:
```javascript
async function readProjectFile(userId, projectId, filename) {
  if (config.USE_MODAL) {
    return modalClient.getFile(userId, projectId, filename);
  } else {
    // 既存のローカルI/O
    const filePath = path.join(getProjectPath(userId, projectId), filename);
    return fs.readFileSync(filePath, 'utf-8');
  }
}
```

2. **Modal 対応のファイル書き込み**:
```javascript
async function writeProjectFile(userId, projectId, filename, content) {
  if (config.USE_MODAL) {
    const result = await modalClient.applyFiles({
      user_id: userId,
      project_id: projectId,
      files: [{ path: filename, content }],
    });
    // SSE を消費して完了を待つ
    for await (const _ of result) {}
    return true;
  } else {
    // 既存のローカルI/O
    const filePath = path.join(getProjectPath(userId, projectId), filename);
    fs.writeFileSync(filePath, content);
    return true;
  }
}
```

---

### Phase 2: 生成フローの Modal 対応（必須）

#### Task 2.1: 意図検出の Modal 対応
**ファイル**: `server/claudeRunner.js`

`detectIntent()` を修正:
```javascript
async detectIntent(message) {
  if (config.USE_MODAL) {
    return modalClient.detectIntent(message);
  } else {
    // 既存の Haiku 呼び出しコード
    return this._detectIntentLocal(message);
  }
}
```

#### Task 2.2: スキル検出の Modal 対応
**ファイル**: `server/claudeRunner.js`

`detectSkillsWithAI()` を修正:
```javascript
async detectSkillsWithAI(message, dimension, existingCode) {
  if (config.USE_MODAL) {
    return modalClient.detectSkills(message, dimension, existingCode);
  } else {
    // 既存の Haiku 呼び出しコード
    return this._detectSkillsLocal(message, dimension, existingCode);
  }
}
```

---

### Phase 3: アセット管理・バージョン管理の Modal 対応（必須）

#### Task 3.1: アセット API の Modal 対応
**ファイル**: `server/index.js`, `server/database-supabase.js`

**対応内容**:
- アセットファイルの保存先を Modal Volume に変更
- `GET /api/assets/:id`: Modal Volume からファイル取得
- `POST /api/assets/upload`: Modal Volume にファイル保存
- `replaceAssetReferences()`: 引き続き Express 側で実行

**注意**: メタデータは Supabase に保持（変更なし）

#### Task 3.2: バージョン管理の Modal 対応
**ファイル**: `server/userManager.js`

**対応内容**:
- `getVersions()`: Modal で `git log` 実行（新規エンドポイント or apply_files 拡張）
- `restoreVersion()`: Modal で `git checkout` 実行
- `getVersionEdits()`: Modal で `git diff` 実行

---

### Phase 4: 統合テスト（必須）

#### Task 4.1: SSE → WS 変換テスト
**ファイル**: `test-modal-client.js`（新規）

```javascript
// 単体テスト: modalClient の SSE パース
// 統合テスト: generateGame の E2E フロー
```

#### Task 4.2: 生成フロー E2E テスト
```bash
# 1. Modal デプロイ確認
modal deploy modal/app.py

# 2. Express 起動（USE_MODAL=true）
USE_MODAL=true npm run dev

# 3. WebSocket 接続 → generateCode → 応答確認
node test-ws-generate.js
```

---

## 環境変数テンプレート

```bash
# .env.example に追加

# Modal 統合（USE_MODAL=true 時に必要）
USE_MODAL=false
MODAL_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-generate-game.modal.run
MODAL_INTERNAL_SECRET=your-shared-secret-64-chars

# オプション: 個別エンドポイント（デフォルトは自動生成）
# MODAL_GET_FILE_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-get-file.modal.run
# MODAL_LIST_FILES_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-list-files.modal.run
# MODAL_APPLY_FILES_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-apply-files.modal.run
# MODAL_DETECT_INTENT_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-detect-intent.modal.run
# MODAL_DETECT_SKILLS_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-detect-skills.modal.run
# MODAL_GEMINI_ENDPOINT=https://YOUR_MODAL_APP--dreamcore-generate-gemini.modal.run
```

---

## ロールバック計画

### トリガー条件
- Modal 障害
- 重大なバグ発見
- パフォーマンス著しく低下

### 手順
1. `USE_MODAL=false` に変更
2. Express サーバー再起動
3. ローカル実行にフォールバック

### 前提
- ローカル実行コードは削除しない（条件分岐で保持）
- `sandbox-runtime` は引き続き使用可能

---

## 実装チェックリスト

### Phase 1: 基盤実装（必須）
- [x] **Task 1.0: Modal /apply_files の Git 拡張（先行・Modal側）** ✅ 2026-01-27
- [x] Task 1.1: config.js に Modal 環境変数を追加 ✅ 2026-01-27
- [x] Task 1.2: modalClient.js を新規作成 ✅ 2026-01-27
- [x] Task 1.3: claudeRunner.js の修正（USE_MODAL 分岐）✅ 2026-01-27
- [x] Task 1.4: userManager.js の修正（ファイル I/O）✅ 2026-01-27
- [x] **Task 1.5: versionsList / restoreVersion の Modal 対応** ✅ 2026-01-27（Express側完了、Modal側待ち）
  - 依存: Task 1.0（Git action 仕様確定が前提）

### タスク依存関係

```
Task 1.0 ──┬──▶ Task 1.1 ──▶ Task 1.2 ──▶ Task 1.3 ──▶ Task 1.4
           │
           └──▶ Task 1.5（Task 1.0 の Git action 仕様に依存）
```

**Task 1.5 の前提条件（Task 1.0 で確定すべき仕様）**:

| 項目 | 仕様 |
|------|------|
| **I/O パス** | `/data/users/{user_id}/projects/{project_id}/.git` |
| **git_log 形式** | `{ commits: [{ hash, message, date }] }` |
| **git_diff 形式** | `{ diff: "unified diff text" }` |
| **git_restore 形式** | `{ success: true, restored_files: [...] }` |
| **エラー形式** | `{ error: "message", code: "GIT_ERROR" }` |

### Phase 2: 生成フローの Modal 対応（必須）
- [x] Task 2.1: 意図検出の Modal 対応（detectIntent）✅ 2026-01-27（Task 1.3 に含む）
- [x] Task 2.2: スキル検出の Modal 対応（detectSkillsWithAI）✅ 2026-01-27（Task 1.3 に含む）

### Phase 3: アセット管理（必須）
- [ ] Task 3.1: アセット API の Modal 対応

### Phase 4: 統合テスト（必須）
- [ ] Task 4.1: SSE → WS 変換テスト
- [ ] Task 4.2: 生成フロー E2E テスト
- [ ] Task 4.3: アセット・バージョン管理テスト

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| Modal 障害時のダウンタイム | `USE_MODAL=false` で即座にフォールバック |
| SSE パースエラー | JSON パースエラーを無視、ログ出力 |
| レイテンシ増加 | Modal cold start の監視、warm 維持戦略 |
| 認証エラー | X-Modal-Secret の検証、401 時のリトライ不可 |

---

## 次のステップ

1. ~~このプランをレビュー・承認~~ ✅
2. ~~Phase 1 から順に実装開始~~ ✅ Express側完了
3. ~~Task 1.0: Modal /apply_files の Git 拡張を実装~~ ✅ 2026-01-27
4. **Phase 3: アセット API の Modal 対応**
5. **Phase 4: 統合テスト**
