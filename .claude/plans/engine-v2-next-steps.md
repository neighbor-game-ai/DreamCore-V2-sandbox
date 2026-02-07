# Engine V2 — 次にやること

作成日: 2026-02-07
更新日: 2026-02-07（CTO レビュー反映）
前提: M1（設計）、M2（実装）、M3インフラ（Shadow Mode 基盤）完了

---

## 現在の状態

Shadow Mode のインフラは動作確認済み:
- GCE → Supabase Pooler 経由で `engine_v2.*` テーブルへの読み書きが成功
- DAG ワークフロー（タスク作成 → 実行 → 失敗伝播 → 完了）が正常動作
- `job_runs` に shadow 実行が `succeeded` で記録されている

**ただし、V2 agent は実質スタブ状態:**
- `intent` タスク → Modal の `v2DetectIntent` が 404（エンドポイント未デプロイ or ルーティング不一致）
- `plan`, `asset`, `qa_review`, `fix`, `publish_prep` → コード内スタブ（Modal 呼び出しなし）
- `codegen` → Modal の `v2GenerateCode` を呼ぶが、intent が先に失敗するため到達しない

つまり「パイプラインの配管は通った」が「水はまだ流れていない」状態。

---

## 今週のタスク（最短パス）

### 1. Modal v2DetectIntent の 404 解消

**問題:** `modalClient.v2DetectIntent()` が Modal で 404 を返す。

**やること:**
1. `modal/app.py` の `v2_detect_intent` エンドポイントが正しくデプロイされているか確認
2. `server/modalClient.js` の V2 メソッドが正しい URL パスを呼んでいるか確認
3. 必要なら Modal を再デプロイ (`cd modal && modal deploy app.py`)
4. ローカルで `modal serve app.py` + curl でエンドポイント単体テスト

**契約テスト（CTO 指示）:**
起動時ヘルスチェックで `v2_detect_intent` / `v2_generate_code` を必須確認する。
エンドポイントが応答しなければ `ENGINE_V2_ENABLED` を自動で無効化。

```javascript
// 起動時 or 初回呼び出し時にヘルスチェック
async function checkV2Endpoints() {
  const endpoints = ['v2/detect-intent', 'v2/generate-code'];
  for (const ep of endpoints) {
    const ok = await modalClient.healthCheck(ep);
    if (!ok) {
      console.error(`[EngineV2] Endpoint ${ep} not available, disabling v2`);
      return false;
    }
  }
  return true;
}
```

### 2. intent / codegen 実接続

`server/engine-v2/taskRunner.js` の `callAgent()` で:

| task_key | 現状 | 今週の目標 |
|----------|------|-----------|
| `intent` | Modal 404 | **修正して実接続** |
| `codegen` | Modal 呼び出し（到達しない） | **intent 修正後に動作確認** |
| `plan` | スタブ `{ plan: 'auto' }` | そのまま（パススルーで十分） |
| `asset` | スタブ `{ images: [] }` | 後段 |
| `qa_review` | スタブ `{ issues: 0 }` | 後段 |
| `fix` | スタブ `{ files: [] }` | 後段 |
| `publish_prep` | スタブ `{ ready: true }` | 後段 |

**最低限 `intent` + `codegen` が動けば Shadow の計測が意味を持つ。**

### 3. スタッフ限定 shadow を 3-5 日再収集

intent / codegen が動くようになったら、有意なデータを収集:

```bash
# GCE .env
ENGINE_V2_ENABLED=true
ENGINE_V2_MODE=shadow
ENGINE_V2_ALLOWLIST_ONLY=true
ENGINE_V2_ALLOWLIST=notef@neighbor.gg   # 内部テスターを追加
```

### 4. M4a（internal live）へ進む判断

3-5 日の shadow データでロールアウトゲートを確認（後述）。
合格なら `ENGINE_V2_MODE=live`（スタッフ限定）に切り替え。

---

## Step 3: Shadow 計測（M3 本格運用）

### 観測項目
| 項目 | 合格基準 |
|------|----------|
| v2 成功率 | ≥ 80% |
| フォールバック後 v1 成功率 | ≥ 95% |
| v2 レイテンシ（v1 比） | ≤ 120% |
| DAG デッドロック | 0件 |
| v1 巻き添え障害 | 0件 |

### 観測クエリ
```sql
-- 成功率
SELECT status, count(*) FROM engine_v2.job_runs
WHERE mode = 'shadow' GROUP BY status;

-- タスク別レイテンシ
SELECT task_key, avg(latency_ms)::int, max(latency_ms)
FROM engine_v2.job_task_attempts
GROUP BY task_key;
```

### 期間
- 内部テスター 5-10 名で 3-5 日（最低限の有意データ）
- ロールアウトゲート判定後に M4a へ

---

## Step 4: M4 段階的ロールアウト（CTO レビュー済み）

### M4a: スタッフ限定 live

Shadow 計測で合格基準を満たしたら:

```bash
ENGINE_V2_ENABLED=true
ENGINE_V2_MODE=live              # v2 結果を実際に返す
ENGINE_V2_ALLOWLIST_ONLY=true    # スタッフのみ
ENGINE_V2_ALLOWLIST=notef@neighbor.gg,staff2@...
```

- スタッフが実際に v2 結果でゲームを作成
- v1 フォールバックは維持（v2 失敗時に自動切り替え）
- 1-2 週間運用

### M4b: 一般ユーザー canary

M4a で問題なければ段階的に拡大:

| フェーズ | 対象 | 期間 |
|---------|------|------|
| Canary 1% | 一般ユーザー 1% | 3日 |
| 5% | | 1週間 |
| 20% | | 1週間 |
| 50% | | 1週間 |
| 100% | 全ユーザー | — |

各フェーズでロールアウトゲートを再確認。

---

## ロールアウトゲート（CTO 承認済み）

M4a → M4b、および各 canary フェーズの進行条件:

| ゲート | 基準 |
|--------|------|
| v2 成功率 | ≥ 90% |
| フォールバック後 v1 成功率 | ≥ 99% |
| v2_output_invalid | < 5% |
| DAG デッドロック | 0件 |
| kill switch 切替訓練 | 済 |

**kill switch 切替訓練:**
```bash
# 本番で ENGINE_V2_ENABLED=false にして v1 に即座に戻れることを確認
# PM2 restart 後 30 秒以内に v1 のみで正常動作することを検証
```

異常検知 → 即座に `ENGINE_V2_ENABLED=false` でロールバック。

---

## Step 5: M5 本番最適化（M4 完了後）

- V1 フォールバックコードの削除
- DAG 並列実行の最適化（codegen + asset 同時実行の効果測定）
- コスト最適化（トークン使用量の削減）
- 監視ダッシュボード構築
- asset / qa_review / fix agent の本実装

---

## 参照ファイル

| ファイル | 内容 |
|---------|------|
| `.claude/plans/engine-v2-final.md` | 設計仕様（凍結版） |
| `.claude/plans/m3-shadow-observation.md` | M3 観測項目・クエリ |
| `.claude/plans/engine-v2-teardown.md` | 緊急撤去手順 |
| `server/engine-v2/taskRunner.js` | agent 呼び出しロジック（callAgent） |
| `server/modalClient.js` | Modal HTTP クライアント |
| `modal/app.py` | Modal V2 エンドポイント定義 |
