# is_initialized バックフィル実行ログ

作成日: 2026-02-05

## 目的

`projects.is_initialized` を唯一の真実（Single Source of Truth）として確立するため、過去データの初期値を正確に設定。

## 判定ルール

1. **DB確定（Modal I/O不要）**
   - `published_games` が存在 → `true`
   - `activity_log` に update/remix/restore → `true`

2. **Modal判定（DBで確定できない場合のみ）**
   - git コミット数 >= 2 → `true`
   - git コミット数 = 0 → `false`
   - git コミット数 = 1 → index.html 内容で判定
     - 初期テンプレート一致 → `false`
     - 異なる → `true`

## 実行結果

```
Total processed:     178
DB determined true:  37   (published_games / activity_log)
Modal true:          33   (git_commits_2+ / modified_content)
Modal false:         108  (git_no_commits / no_index_html)
Updated true:        70
Updated false:       108
Errors:              0
```

## スクリプト

`/Users/admin/DreamCore-V2-sandbox/scripts/backfill-is-initialized.js`

```bash
# dry-run
node scripts/backfill-is-initialized.js

# 実行
node scripts/backfill-is-initialized.js --execute

# オプション
--limit=N          # 処理件数制限
--offset=N         # 開始位置
--batch-size=N     # DBバッチサイズ（デフォルト: 100）
--concurrency=N    # Modal同時実行数（デフォルト: 5）
```

## 今後の運用

- `is_initialized` は claudeRunner.js で生成完了時に自動更新される
- 新規プロジェクト作成時は `false`（デフォルト）
- 再バックフィルは不要（フロー内で担保）
