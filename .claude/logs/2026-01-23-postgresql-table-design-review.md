# PostgreSQL Table Design レビュー対応

**日付:** 2026-01-23
**参照スキル:** wshobson/agents postgresql-table-design

---

## 実施内容

### 1. スキーマレビュー実施

wshobson の postgresql-table-design スキル（GitHub）を使用して現行スキーマをレビュー。

**良い点:**
- TIMESTAMPTZ 使用 ✓
- TEXT 使用（VARCHAR不使用）✓
- FK インデックス完備 ✓
- RLS 最適化済み ✓
- 部分インデックス活用 ✓

**改善点:**
- NOT NULL 制約の欠落
- INTEGER → BIGINT（size, play_count, like_count）
- users.updated_at 欠落
- games FK インデックス欠落

### 2. マイグレーション作成・適用

`supabase/migrations/004_schema_improvements.sql` を作成。

**変更内容:**
- profiles テーブル削除（技術的負債除去）
- NOT NULL 制約追加（projects, assets, games, users）
- INTEGER → BIGINT（assets.size, games.play_count/like_count）
- users.updated_at 追加 + トリガー
- games FK インデックス追加

### 3. 関連ファイル更新

- `supabase/rls-policies.sql` - profiles 参照削除、users ポリシー追加
- `.claude/docs/database-schema.md` - スキーマ定義更新
- `CLAUDE.md` - ローンチ前ポリシー追記

---

## 専門家レビュー対応

| 指摘 | 内容 | 対応 |
|------|------|------|
| P0 | users.updated_at の WHERE 条件が危険 | `WHERE updated_at IS NULL` に修正 |
| P1 | games.visibility のデフォルト値 | 製品方針に合わせ 'public' に |
| P1 | updated_at カラム存在チェック | ローンチ前のためガード削除（Clean版） |

---

## 本番適用結果

```
Success. No rows returned
```

**検証:**
- `to_regclass('public.profiles')` → NULL（削除確認）
- `pg_policies ... LIKE '%profiles%'` → 0件（参照なし確認）
- テーブル数 9個 = 設計通り

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `supabase/migrations/004_schema_improvements.sql` | 新規作成 |
| `supabase/rls-policies.sql` | profiles削除、users追加 |
| `.claude/docs/database-schema.md` | NOT NULL/BIGINT反映 |
| `CLAUDE.md` | ローンチ前ポリシー追記 |

---

## 学び・注意点

1. **ローンチ前はClean版が正解** - ガードを入れすぎると可読性が下がる
2. **製品方針の確認が重要** - visibility のデフォルト値は方針次第
3. **CASCADE の前に参照確認** - FK/VIEW/ポリシーを事前チェック
4. **NOT NULL + DEFAULT はセット** - 三値論理を避ける

---

## 次のステップ

- Phase 2 準備時に games/publish_drafts を活用
- ローンチ後は安全版マイグレーションに切り替え
