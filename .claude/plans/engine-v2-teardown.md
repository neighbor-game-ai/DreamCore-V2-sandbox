# Engine V2 完全削除マニュアル

**目的:** Engine V2 の全痕跡を安全に削除し、元の状態に完全復元する手順書

---

## Phase 0: 即時停止（数秒）

v2 を無効化するだけで、コード削除は不要。

```bash
# GCE で実行
ENGINE_V2_ENABLED=false pm2 restart dreamcore-sandbox
```

これだけで v2 トラフィックはゼロになる。以下の Phase は完全削除が必要な場合のみ。

---

## Phase 1: 実行中ジョブの確認

```sql
-- Supabase SQL Editor or psql
SELECT count(*) FROM engine_v2.job_runs WHERE status = 'running';
-- 0 であること。0 でなければ完了を待つか手動キャンセル
UPDATE engine_v2.job_runs SET status = 'cancelled' WHERE status = 'running';
```

---

## Phase 2: DB スキーマ削除

```sql
-- engine_v2 スキーマごと全テーブル・RLS・関数を削除
DROP SCHEMA IF EXISTS engine_v2 CASCADE;
```

**public スキーマに v2 の痕跡は一切ない**（設計原則）。

---

## Phase 3: Git ワークツリー削除

```bash
# 1. ワークツリー削除
git worktree remove /Users/admin/DreamCore-V2-engine-v2 --force

# 2. ブランチ削除（ローカル）
git branch -D feature/engine-v2

# 3. ブランチ削除（リモート — push 済みの場合のみ）
git push origin --delete feature/engine-v2

# 4. 確認
git worktree list   # sandbox のみ表示されること
git branch -a       # feature/engine-v2 がないこと
```

もしワークツリーのディレクトリが残っている場合:
```bash
rm -rf /Users/admin/DreamCore-V2-engine-v2
git worktree prune
```

---

## Phase 4: main ブランチからのコード削除

feature/engine-v2 を main にマージしていない場合 → **この Phase は不要**（main は汚れていない）。

マージ済みの場合は以下を削除:

```bash
# サーバーコード
rm -rf server/engine-v2/

# Modal v2 エンドポイント（app.py から v2_ 関数を手動削除）
# → v2_detect_intent, v2_chat_haiku, v2_generate_code を削除
# → modal deploy で反映

# claudeRunner.js の v2 分岐を削除（processJob 内の if engineV2.shouldUseV2 ブロック）
# index.js の userEmail 受け渡しを削除（不要になる）
# modalClient.js から v2 メソッドを削除

# 環境変数
# .env から ENGINE_V2_ENABLED, ENGINE_V2_ALLOWLIST_ONLY 等を削除
```

---

## Phase 5: Modal v2 エンドポイント削除

```bash
# modal/app.py から v2_ 関数を削除後
cd /Users/admin/DreamCore-V2-sandbox/modal
modal deploy app.py
```

---

## Phase 6: 設計書の処理（任意）

```bash
# 保存する場合（履歴として残す）
git mv .claude/plans/engine-v2-final.md .claude/plans/archive/engine-v2-final.md

# 完全削除する場合
rm .claude/plans/engine-v2-final.md
rm .claude/plans/engine-v2-teardown.md
```

---

## チェックリスト

| # | 項目 | コマンド | 確認 |
|---|------|---------|------|
| 1 | v2 無効化済み | `ENGINE_V2_ENABLED=false` | [ ] |
| 2 | 実行中ジョブ = 0 | SQL: `SELECT count(*)...` | [ ] |
| 3 | DB スキーマ削除 | `DROP SCHEMA engine_v2 CASCADE` | [ ] |
| 4 | ワークツリー削除 | `git worktree remove ...` | [ ] |
| 5 | ブランチ削除 | `git branch -D feature/engine-v2` | [ ] |
| 6 | main にマージ済みなら コード削除 | `rm -rf server/engine-v2/` 等 | [ ] |
| 7 | Modal 再デプロイ | `modal deploy app.py` | [ ] |
| 8 | PM2 再起動 | `pm2 restart dreamcore-sandbox` | [ ] |
| 9 | ヘルスチェック | `curl https://v2.dreamcore.gg/api/config` | [ ] |

---

## 重要な前提

- `public` スキーマには v2 由来の変更が**一切ない**
- v1 の Modal エンドポイントは v2 で**変更されない**
- v2 コードはすべて `server/engine-v2/` と `feature/engine-v2` ブランチに隔離
- ワークツリーを消すだけで main は完全にクリーンな状態を維持
