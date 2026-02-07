# クォータスキップ: スタイル選択ステップの無料化

**日付:** 2026-02-08
**作業者:** Claude
**計画書:** `/Users/admin/DreamCore-V2-sandbox/.claude/plans/binary-watching-globe.md`

## 背景

フリープラン（20メッセージ/日）で、1ゲーム作成に最大3クォータ消費されていた問題。
- 次元選択（2D/3D）→ 1クォータ
- スタイル選択 → 1クォータ
- AI ゲーム生成 → 1クォータ

**目標:** スタイル選択ステップのクォータ消費をスキップし、1ゲーム = 最小クォータ消費にする。

## 実施内容

### Phase 1: PATH A/B 実装 → 撤回

- 当初 PATH A（次元質問のサーバーインターセプト）+ PATH B（次元応答ハンドリング）を実装
- CTO から「ゲームロジックに関わる変更はしないで」と指摘 — AI が行う次元質問をサーバーが肩代わりしていた
- **PATH A/B を全削除**、PATH C/D（スタイル選択のみ）に絞る

### Phase 2: PATH C/D 実装 (`250a273`)

- PATH C: 次元指定済みゲーム作成 → styleOptions 送信 → return（クォータなし）
- PATH D: selectedStyle / skipStyleSelection の検証（observability + フラグクリア）
- セキュリティ: `awaitingStyleSelect` フラグ（projectId, dimension, TTL 5分, one-time use）
- 不正試行 → `[Quota Abuse]` ログ + 通常クォータ消費にフォールバック
- アンチスパム: `awaitingStyleSelect` 有効中の再送 → リマインダー返却 + return

### Phase 3: STYLE.md チェックに変更 (`fc592fa`)

- 問題: `isProjectInitialized()` が true（AI がファイル書き込み済み）で styleOptions が出ない
- フロー: 「ゲーム作って」→ AI がファイル書き込み → 2D/3D 質問 →「2Dで作成」→ initialized=true → スタイル選択スキップ
- 修正: `isProjectInitialized()` ではなく **STYLE.md の存在** で判定
- skipStyleSelection 時は STYLE.md に `# SKIPPED` マーカーを書き込み

### Phase 4: WS 再接続復旧 (`619c547`)

- 問題: styleOptions 表示後に WS 切断 → 再接続 → `projectSelected` が DOM クリア → スタイル選択 UI 消滅
- ブラウザコンソールで確認: `[WS Received] styleOptions` → `WebSocket closed: code=1006` → reconnect → `projectSelected` で DOM 全クリア
- 修正: `.style-pending.json` マーカーファイルで永続化
  1. styleOptions 送信時に `.style-pending.json` を書き込み
  2. `selectProject` ハンドラで STYLE.md 未存在 + `.style-pending.json` 存在 → styleOptions 再送信
  3. selectedStyle / skipStyleSelection で `.style-pending.json` をクリア

## エンジニアレビュー指摘と対応

| 指摘 | 対応 |
|------|------|
| Critical: 無限クォータバイパス（PATH C re-send） | `awaitingStyleSelect` 有効時はリマインダー返却 + return |
| Warning: fall through → style-less game generation | リマインダー `type: 'info'` に変更（AI処理に進まない） |
| Warning: `type: 'assistant'` が frontend で未ハンドル | `type: 'info'` に変更（`addMessage(data.message, 'system')` にマッピング） |
| Warning: `[Quota Abuse]` reason 不足 | 5段階: no_flag → project_mismatch → expired → dimension_mismatch → unknown |
| Info: WS rate limiter 未配線 | TODO.md に P1 として記録（`RATE_LIMIT.ws` は config.js に定義済み） |

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `server/index.js` | クォータスキップフラグ管理、PATH C/D、.style-pending.json 永続化/再送/クリア |
| `public/app.js` | `dimensionOptions` ハンドラ削除、`displayDimensionSelection()` 削除 |
| `public/editor.html` | app.js キャッシュバスター更新 (`?v=20260208a`) |
| `server/config.js` | `RATE_LIMIT.ws` 定義追加（未配線） |
| `TODO.md` | 作業記録 + P1 WS インフラガードレール追加 |

## コミット一覧

| コミット | 内容 |
|---------|------|
| `a805b82` | chore: bump app.js cache buster |
| `250a273` | fix(quota): remove PATH A/B, add anti-spam guard |
| `fc592fa` | fix(quota): check STYLE.md instead of isProjectInitialized |
| `619c547` | fix(quota): persist styleOptions state for WS reconnection recovery |
| `933b849` | chore: add WS rate limit config and update TODO |

## テスト結果

- プロジェクト `019c390f`: 「2Dパズルゲーム作って」→ styleOptions 表示 → レトロドット絵選択 → ゲーム生成 OK
- ログ確認: `[Quota Skip] styleOptions sent` + `[Selection] Style selected with valid flag`
- クォータ消費: 1回のみ（スタイル選択ステップ無料化確認済み）

## 残課題

| 優先度 | 内容 |
|--------|------|
| **P1** | WS レート制限の配線（`RATE_LIMIT.ws` → WebSocket ハンドラ） |
| **P1** | `maxPayload` を `WebSocket.Server` オプションに配線 |
| P2 | スタイル再選択 UI（SKIPPED からの復帰） |
| P2 | 次元未指定フロー（「ゲーム作って」→ AI 質問）は 2 クォータのまま（許容） |

## 学び・注意点

- `isProjectInitialized()` は AI がファイルを書いた時点で true になる — スタイル判定には使えない
- WS の `projectSelected` ハンドラが `innerHTML = ''` で DOM 全クリアする — transient な UI は再送が必要
- `type: 'info'` は frontend で `system` メッセージとして表示される — 新しい type を追加する前に既存のハンドリングを確認
- PATH A（サーバーが次元質問を肩代わり）は「ゲームロジック変更」に該当 — AI の役割を奪わない設計にする
