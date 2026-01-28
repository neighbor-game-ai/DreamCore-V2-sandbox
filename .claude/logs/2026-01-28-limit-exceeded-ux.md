# 同時実行制限時の UX 改善

**日付:** 2026-01-28
**作業者:** Claude

## 実施内容

### 背景

- `maxConcurrentPerUser: 1` の制限により、複数プロジェクトで同時にAI生成ができなかった
- ユーザーが別プロジェクトで生成を開始しようとすると、単にエラーになるだけだった
- UX を改善し、実行中のジョブをキャンセルして新しい生成を開始する選択肢を提供

### 実装内容

#### 1. バックエンド: アクティブジョブ取得機能

**database-supabase.js:**
- `getActiveJobsForUser(userId)` 関数を追加
- jobs テーブルと projects テーブルを JOIN して、実行中ジョブのプロジェクト名を取得

```javascript
// 返り値の形式
[{
  jobId: 'uuid',
  projectId: 'uuid',
  projectName: 'プロジェクト名',
  status: 'processing',
  createdAt: '2026-01-28T...'
}]
```

#### 2. バックエンド: JobManager 拡張

**jobManager.js:**
- `getActiveJobsForUser()` メソッドを追加（DB 呼び出しのラッパー）
- `updateJobInfo()` メソッドを追加（ジョブ情報の更新用）
- `registerProcess()` を拡張して userId/projectId/projectName を追跡

#### 3. バックエンド: WebSocket ハンドラ

**index.js:**
- `USER_LIMIT_EXCEEDED` 発生時に `limitExceeded` イベントを送信
  - 実行中のジョブ一覧
  - 保留中のプロンプト情報
- `cancelJob` メッセージハンドラを追加
  - 所有権の検証
  - ジョブのキャンセル
  - スロットの解放
  - `jobCancelled` イベントの送信

#### 4. フロントエンド: 確認モーダル

**app.js:**
- `pendingLimitExceededPrompt` 状態を追加
- `handleLimitExceeded()` メソッドを追加
  - チャット内に確認メッセージを表示
  - 「OK」「キャンセル」ボタン
- `limitExceeded` と `jobCancelled` の WebSocket ハンドラを追加
- キャンセル成功後、保留中のプロンプトを自動再送信

### ユーザーフロー

```
1. プロジェクトAで生成中
2. プロジェクトBで新しい生成を開始しようとする
3. 確認メッセージが表示:
   『プロジェクトA』の生成を中断して、
   新しい生成を始めますか？
   [OK] [キャンセル]

4a. OKの場合:
   - プロジェクトAのジョブがキャンセルされる
   - プロジェクトBの生成が自動的に開始される

4b. キャンセルの場合:
   - 何も起こらない（プロジェクトAは継続）
```

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `server/database-supabase.js` | `getActiveJobsForUser()` 関数追加 |
| `server/jobManager.js` | `getActiveJobsForUser()`, `updateJobInfo()` 追加、`registerProcess()` 拡張 |
| `server/index.js` | `limitExceeded` イベント送信、`cancelJob` ハンドラ追加 |
| `public/app.js` | `handleLimitExceeded()` 追加、WebSocket ハンドラ追加 |

## テスト方法

1. プロジェクトAを開いて生成を開始
2. 別タブでプロジェクトBを開いて生成を開始
3. 確認メッセージが表示されることを確認
4. 「OK」を押してプロジェクトAがキャンセルされ、Bの生成が始まることを確認
5. 同じ流れで「キャンセル」を押して何も起こらないことを確認

## 学び・注意点

- WebSocket メッセージの型は DreamCore-V2 との互換性を維持
- `pendingPrompt` をサーバーからクライアントに渡すことで、クライアント側で再送信が容易に
- スロットの解放は `releaseSlot()` を明示的に呼び出す必要がある
