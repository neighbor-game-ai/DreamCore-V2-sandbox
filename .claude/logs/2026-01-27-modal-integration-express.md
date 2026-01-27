# Modal 統合実装（Express側 Phase 1）

**日付:** 2026-01-27
**作業者:** Claude
**ブランチ:** docs/modal-migration-v2

## 概要

DreamCore-V2-sandbox の Express サーバーに Modal Sandbox 統合を実装。
`USE_MODAL=true` 環境変数で Modal 経由の実行、`false` でローカル実行にフォールバック可能。

---

## 実施内容

### Task 1.1: config.js に Modal 環境変数を追加

Modal 関連の設定項目を追加:
- `USE_MODAL` - Modal 実行の有効/無効フラグ
- `MODAL_ENDPOINT` - メインエンドポイント URL
- `MODAL_INTERNAL_SECRET` - Express ↔ Modal 間の認証シークレット
- 個別エンドポイントのオーバーライド設定（オプション）

### Task 1.2: modalClient.js を新規作成

Modal API クライアントを実装:

| メソッド | 用途 |
|---------|------|
| `parseSSEStream()` | Modal からの SSE レスポンスをパース |
| `convertSseToWsEvent()` | SSE イベントを WebSocket 形式に変換 |
| `generateGame()` | Claude CLI 実行（SSE ストリーミング） |
| `getFile()` | Modal Volume からファイル取得 |
| `listFiles()` | プロジェクトファイル一覧 |
| `applyFiles()` | ファイル書き込み + Git コミット |
| `detectIntent()` | ユーザー意図判定（Haiku） |
| `detectSkills()` | 最適スキル検出（Haiku） |
| `generateGemini()` | Gemini 生成（高速パス） |
| `gitLog()` | バージョン履歴取得 |
| `gitDiff()` | コミット差分取得 |
| `gitRestore()` | バージョン復元 |

### Task 1.3: claudeRunner.js の修正

USE_MODAL 分岐を追加:

| 関数 | Modal時 | ローカル時 |
|------|---------|-----------|
| `detectIntent()` | `modalClient.detectIntent()` | `_detectIntentLocal()` |
| `detectSkillsWithAI()` | `modalClient.detectSkills()` | `_detectSkillsWithAILocal()` |
| Claude CLI 実行 | `_runClaudeOnModal()` | `_runClaudeLocal()` |

### Task 1.4: userManager.js のファイル操作

Modal 対応を追加:

| 関数 | Modal時 | ローカル時 |
|------|---------|-----------|
| `readProjectFile()` | `readProjectFileModal()` | `readProjectFileLocal()` |
| `writeProjectFile()` | `writeProjectFileModal()` | `writeProjectFileLocal()` |
| `listProjectFiles()` | `listProjectFilesModal()` | `listProjectFilesLocal()` |

### Task 1.5: userManager.js の Git 操作

Modal 対応を追加:

| 関数 | Modal時 | ローカル時 |
|------|---------|-----------|
| `getVersions()` | `getVersionsModal()` | `getVersionsLocal()` |
| `restoreVersion()` | `restoreVersionModal()` | `restoreVersionLocal()` |
| `getVersionEdits()` | `getVersionEditsModal()` | ローカル `getAIContextForCommit()` |

---

## 設計原則の遵守

| 原則 | 対応状況 |
|------|----------|
| **UX 完全維持** | ✅ フロントエンド変更なし、WS/API 形式維持 |
| **DB 操作は Express 集約** | ✅ Modal に Supabase 情報を渡さない |
| **ロールバック可能** | ✅ `USE_MODAL=false` で即座にローカル実行 |
| **遅延読み込み** | ✅ Modal クライアントは必要時のみロード |

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/config.js` | Modal 環境変数追加 |
| `server/modalClient.js` | 新規作成 - Modal API クライアント |
| `server/claudeRunner.js` | USE_MODAL 分岐追加、`_runClaudeOnModal()` 追加 |
| `server/userManager.js` | ファイル操作・Git 操作の Modal 対応 |

---

## 構文チェック結果

```
node --check server/config.js      → OK
node --check server/modalClient.js → OK
node --check server/claudeRunner.js → OK
node --check server/userManager.js  → OK
```

---

## 必要な環境変数（Modal 有効化時）

```bash
USE_MODAL=true
MODAL_ENDPOINT=https://YOUR_APP--dreamcore-generate-game.modal.run
MODAL_INTERNAL_SECRET=your-shared-secret-64-chars

# オプション: 個別エンドポイント
# MODAL_GET_FILE_ENDPOINT=...
# MODAL_LIST_FILES_ENDPOINT=...
# MODAL_APPLY_FILES_ENDPOINT=...
```

---

## 依存タスク（未完了）

### Task 1.0: Modal 側 Git 拡張

Modal の `/apply_files` エンドポイントに以下のアクションを追加する必要あり:

| アクション | 用途 |
|-----------|------|
| `git_log` | バージョン履歴取得 |
| `git_diff` | コミット差分取得 |
| `git_restore` | バージョン復元 |

**ファイル:** `/Users/admin/DreamCore-V2-modal/modal/app.py`

Express 側のコードはこれらのエンドポイントを呼び出す準備ができている。

---

## SSE → WebSocket イベント変換マッピング

| SSE type | WS type | 用途 |
|----------|---------|------|
| `status` | `progress` | 進捗表示 |
| `stream` | `stream` | ストリーミング出力 |
| `done` | `completed` | 正常完了 |
| `error` | `failed` | エラー終了 |
| `result` | `result` | 結果データ |
| `log` | `log` | デバッグログ |

---

## 次のステップ

1. Modal 側の Git 拡張実装（Task 1.0）
2. 統合テスト（`USE_MODAL=true` での E2E テスト）
3. Phase 2: Gemini 生成フローの Modal 対応
4. Phase 3: アセット管理の Modal 対応

---

## 参照ドキュメント

- `.claude/plans/modal-integration-plan.md` - 詳細計画書
- `docs/ENGINEER-HANDOFF.md` - 引き継ぎ文書
- `docs/MODAL-MIGRATION-PLAN.md` - 移行計画
- `docs/MODAL-DESIGN.md` - 技術設計
