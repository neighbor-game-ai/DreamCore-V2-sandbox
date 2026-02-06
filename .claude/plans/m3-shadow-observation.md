# M3 Shadow Execution — Observation Items

Created: 2026-02-06
Status: Draft (CTO approval required)

## Shadow 実行とは

v2 エンジンを `ENGINE_V2_ENABLED=true` + `ENGINE_V2_ALLOWLIST_ONLY=true` で
許可リストユーザーのみに適用。v2 が失敗した場合は自動的に v1 にフォールバック。
ユーザーへの影響ゼロで v2 の実動作を観測する。

## 観測項目

### 1. 正常系メトリクス

| # | 項目 | 計測方法 | 合格基準 |
|---|------|----------|----------|
| 1.1 | v2 成功率 | `job_runs.status = 'succeeded'` / 全 v2 実行 | ≥ 80% (初期) |
| 1.2 | v2 レイテンシ | `job_runs.finished_at - created_at` | v1 比 ≤ 120% |
| 1.3 | タスク別レイテンシ | `job_task_attempts.latency_ms` | 各タスク < 60s |
| 1.4 | DAG 完走率 | 全タスク succeeded/skipped で完了 | ≥ 90% |

### 2. フォールバック観測

| # | 項目 | 計測方法 | 合格基準 |
|---|------|----------|----------|
| 2.1 | フォールバック率 | `job_runs.fallback_triggered = true` / 全 v2 実行 | ≤ 20% |
| 2.2 | フォールバック原因 | `job_runs.error_code` の分布 | 特定エラーが支配的でない |
| 2.3 | フォールバック後 v1 成功率 | v2 失敗 → v1 成功 / v2 失敗総数 | ≥ 95% |

### 3. タスク別観測

| # | 項目 | 計測方法 | 注目ポイント |
|---|------|----------|-------------|
| 3.1 | intent 判定精度 | `intent` タスク出力 vs 実際の操作 | chat/edit の誤分類 |
| 3.2 | codegen 品質 | `qa_review.issues` の分布 | issues=0 の割合 |
| 3.3 | リトライ率 | `max(attempt_count)` per task | 特定タスクでリトライ頻発? |
| 3.4 | conditional skip | `task_skipped` イベント数 | chat→全スキップが正常動作 |

### 4. リソース・コスト

| # | 項目 | 計測方法 | 合格基準 |
|---|------|----------|----------|
| 4.1 | トークン使用量 | `job_task_attempts.tokens_in + tokens_out` | v1 比 ≤ 110% |
| 4.2 | コスト | `job_task_attempts.cost_usd` 合計 | v1 比 ≤ 110% |
| 4.3 | DAG デッドロック | `DagDeadlockError` 発生回数 | 0 |

### 5. エラー安全性

| # | 項目 | 計測方法 | 合格基準 |
|---|------|----------|----------|
| 5.1 | v1 巻き添え障害 | v2 エラー時に v1 も失敗 | 0件 |
| 5.2 | DB 汚染 | `public.*` テーブルへの意図しない書き込み | 0件 |
| 5.3 | ステージングリーク | `/tmp/engine-v2-staging-*` 残留 | cleanup 確認 |

## 観測クエリ例

```sql
-- v2 成功率 + フォールバック率
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
  count(*) FILTER (WHERE fallback_triggered) AS fallback,
  round(100.0 * count(*) FILTER (WHERE status = 'succeeded') / count(*), 1) AS success_pct,
  round(100.0 * count(*) FILTER (WHERE fallback_triggered) / count(*), 1) AS fallback_pct
FROM engine_v2.job_runs;

-- タスク別レイテンシ
SELECT
  t.task_key,
  count(*) AS runs,
  round(avg(a.latency_ms)) AS avg_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.latency_ms)) AS p95_ms
FROM engine_v2.job_tasks t
JOIN engine_v2.job_task_attempts a ON a.task_id = t.id
WHERE a.status = 'succeeded'
GROUP BY t.task_key
ORDER BY t.task_key;

-- フォールバック原因分布
SELECT error_code, count(*) AS cnt
FROM engine_v2.job_runs
WHERE fallback_triggered
GROUP BY error_code
ORDER BY cnt DESC;
```

## M3 Go/No-Go 判定

Shadow 実行で以下をすべて満たしたら M4（段階的ロールアウト）に進む:

1. v2 成功率 ≥ 80%
2. フォールバック後 v1 成功率 ≥ 95%
3. DAG デッドロック = 0
4. v1 巻き添え障害 = 0
5. レイテンシ v1 比 ≤ 120%
