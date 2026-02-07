# Engine V2 — 次にやること

作成日: 2026-02-07
更新日: 2026-02-07（M3 クローズ、アクション#2 開始）
前提: M1（設計）、M2（実装）、M3（Shadow Mode 基盤 + 契約テスト + スケジューラ修正）完了

---

## M3 クローズ（CTO 承認済み 2026-02-07）

### PASS した内容: 配管と安定性

- 契約テスト: v2_detect_intent 200 + スキーマ検証、v2_generate_code 400 許容/5xx 不合格
- スケジューラ: 偽デッドロック検出バグを修正（3層防御: countStuckTasks改善 + リトライ + allSettled）
- Shadow 20ジョブ: **成功率 100%、デッドロック 0、5xx 0、V1 巻き添え 0**

### 未完了: 品質/速度の本番評価

- codegen はスタブ（`{ files: [], summary: "..." }`）
- 実際のコード生成品質・レイテンシは未計測
- → アクション#2 で解消

### コミット履歴

| コミット | 内容 |
|---------|------|
| `61a1e3c` | propagateFailure の未使用パラメータ修正 |
| `403d523` | 契約テスト初版 |
| `59bf352` | Modal V2 シークレット修正 + 契約テスト強化 |
| `9a89026` | スケジューラ偽デッドロック修正 |

---

## 現在の状態

| task_key | 状態 | 備考 |
|----------|------|------|
| `intent` | **実接続済み** | Modal v2_detect_intent → 200 + intent 判定 |
| `plan` | スタブ `{ plan: 'auto' }` | パススルー（後段） |
| `codegen` | **スタブ** `{ files: [] }` | ← **次に実装** |
| `asset` | スタブ `{ images: [] }` | 後段 |
| `qa_review` | スタブ `{ issues: 0 }` | 後段 |
| `fix` | スタブ（skipped） | qa_review.issues=0 で自動スキップ |
| `publish_prep` | スタブ `{ ready: true }` | 後段 |

---

## アクション#2: codegen 実エージェント接続（CTO 承認済み）

### 作業順序（固定）

1. **codegen を実エージェント化**（スタブ除去）
2. **Shadow で再度 20〜50 ジョブ計測**
3. **ゲート判定**（下記）
4. **合格後に M4a（staff live）**

### ゲート判定基準

| ゲート | 基準 |
|--------|------|
| v2 成功率 | ≥ 90% |
| v2_output_invalid | < 5% |
| fallback_triggered 内訳 | 想定内（既知エラーのみ） |
| P95 レイテンシ | v1 比 120% 以内（目安） |
| DAG デッドロック | 0件 |
| V1 巻き添え障害 | 0件 |

### codegen 実装方針

Modal `v2_generate_code` エンドポイントで:
- ユーザーメッセージ + プロンプトを受け取る
- Claude Haiku (proxy 経由) でゲームコードを生成
- `{ files: [{path, content}], summary: "..." }` 形式で返す

**注意:** Shadow モードでは codegen の出力はユーザーに返されない（計測のみ）。
品質評価は DB に記録された output を後から分析。

---

## Step 4: M4 段階的ロールアウト（CTO レビュー済み）

### M4a: スタッフ限定 live

```bash
ENGINE_V2_ENABLED=true
ENGINE_V2_MODE=live              # v2 結果を実際に返す
ENGINE_V2_ALLOWLIST_ONLY=true    # スタッフのみ
ENGINE_V2_ALLOWLIST=notef@neighbor.gg,staff2@...
```

### M4b: 一般ユーザー canary

| フェーズ | 対象 | 期間 |
|---------|------|------|
| Canary 1% | 一般ユーザー 1% | 3日 |
| 5% | | 1週間 |
| 20% | | 1週間 |
| 50% | | 1週間 |
| 100% | 全ユーザー | — |

### ロールアウトゲート（CTO 承認済み）

| ゲート | 基準 |
|--------|------|
| v2 成功率 | ≥ 90% |
| フォールバック後 v1 成功率 | ≥ 99% |
| v2_output_invalid | < 5% |
| DAG デッドロック | 0件 |
| kill switch 切替訓練 | 済 |

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
| `server/engine-v2/contractTest.js` | 契約テスト（M3 で実装） |
| `server/engine-v2/scheduler.js` | DAG スケジューラ（M3 で修正） |
| `server/modalClient.js` | Modal HTTP クライアント |
| `modal/app.py` | Modal V2 エンドポイント定義 |
| `test-shadow-20.js` | Shadow 20ジョブテストスクリプト |
