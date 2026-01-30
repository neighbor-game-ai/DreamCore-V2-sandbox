# Git履歴表示問題の調査と自動初期化機能の実装

**日付:** 2026-01-30
**作業者:** Claude

## 背景

プロジェクト `80cfa10e-25cb-481d-8388-266f22e749e7` で変更履歴が表示されない問題が報告された。調査の結果、Modal移行初期に `applyFiles` の同期が失敗したプロジェクトで `.git` ディレクトリが作成されていないことが原因と判明。

## 実施内容

### 1. 問題の原因特定

- `claudeRunner.js` で Modal への `applyFiles` 呼び出しが失敗した場合、エラーがキャッチされて黙殺されていた
- これにより、プロジェクトファイルはローカルに存在するが、Modal Volume 上には `.git` が存在しない状態が発生

### 2. Modal側の自動初期化機能を実装

- `handle_git_log` 関数を修正
- プロジェクトディレクトリが存在するが `.git` がない場合、自動的に git init + 初期コミットを実行
- `autoInitialized: true` フラグを返すことでフロントエンドに通知

### 3. サーバー側のフラグ伝播

- `modalClient.gitLog()`: `autoInitialized` フラグを返すよう修正
- `userManager.getVersionsModal()`: フラグを伝播
- `index.js` WebSocketハンドラ: `versionsList` メッセージに `autoInitialized` を含める

### 4. フロントエンド通知UI

- `app.js` の `displayVersions()`: 自動初期化時に通知を表示
- `style.css`: `.version-notice` スタイルを追加

### 5. エラーログの改善

- `claudeRunner.js` で Modal sync 失敗時に CRITICAL ログを出力するよう改善
- ユーザーID、プロジェクトID、ファイル数、エラー詳細を記録

## 発見した問題と対応

| 問題 | 対応 |
|------|------|
| Modal warm container が新しいデプロイを反映しない | `modal app stop dreamcore` → `modal deploy` で強制コールドスタート |
| 間違ったユーザーIDでテスト | サーバーログから正しいユーザーID (`ed58dfd0-03c8-4617-ae86-f28df6f562ff`) を特定 |
| 古いプロジェクトで `.git` なし | 自動初期化機能で対応（ただしコミット履歴は復元不可） |

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `/Users/admin/DreamCore-V2-modal/modal/app.py` | `handle_git_log` に自動初期化ロジックと `autoInitialized` フラグ追加 |
| `/Users/admin/DreamCore-V2-sandbox/server/claudeRunner.js` | Modal sync 失敗時の CRITICAL ログ追加 |
| `/Users/admin/DreamCore-V2-sandbox/server/modalClient.js` | `gitLog()` が `autoInitialized` を返すよう修正 |
| `/Users/admin/DreamCore-V2-sandbox/server/userManager.js` | `getVersionsModal()` で `autoInitialized` を伝播 |
| `/Users/admin/DreamCore-V2-sandbox/server/index.js` | WebSocket `versionsList` に `autoInitialized` 追加 |
| `/Users/admin/DreamCore-V2-sandbox/public/app.js` | `displayVersions()` で通知表示 |
| `/Users/admin/DreamCore-V2-sandbox/public/style.css` | `.version-notice` スタイル追加 |

## 結果

- **新規プロジェクト**: 履歴が正常に表示される ✅
- **過去の問題プロジェクト**: 自動初期化されるが、過去のコミット履歴は復元不可
- **通知機能**: 実装済み（該当ケースが発生した場合に表示）

## 学び・注意点

1. **Modal warm container のキャッシュ**: デプロイ後すぐに反映されないことがある。`modal app stop` で強制的にコールドスタートさせる必要がある
2. **サイレントエラーの危険性**: エラーを黙殺すると問題の発見が遅れる。CRITICALログを追加して検知可能にした
3. **git 履歴は復元不可**: `.git` がない状態から復元しても、過去のコミットは戻らない。これは仕様として受け入れ

## 今後の改善案

- Modal sync 失敗時のアラート通知（Slack等）を検討
- 定期的な `.git` 存在チェックジョブの導入
