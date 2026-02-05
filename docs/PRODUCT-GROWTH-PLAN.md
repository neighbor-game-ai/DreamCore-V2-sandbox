# DreamCore Growth Plan (Sean Ellis × Bozoma Saint John)

**作成日:** 2026-02-05
**目的:** 初回公開までの体験を短縮し、公開後の拡散と継続を最大化する。

---

## 1. ゴール

- **North Star:** Weekly Active Creators who Publish
- **最重要KPI:**
  - Activation率 = publish_success / onboarding_start
  - Time to First Publish（中央値）
  - Share率 = share_* / publish_success
  - Play率 = play_started / publish_success
  - Remix率 = remix_start / play_started

---

## 2. 追加する計測（Analytics拡張）

### 必須イベント
- `onboarding_start`
- `template_select` { template_id, category }
- `template_preview`
- `project_create` { project_id, template_id }
- `edit_session_start`
- `edit_session_end` { duration_sec }
- `publish_click`
- `publish_success` { project_id, time_to_publish_sec }
- `share_open`
- `share_copy_link`
- `share_post` { channel }
- `play_started`
- `play_completed` { completion_rate }
- `remix_click`
- `remix_start`
- `remix_publish`

### 自動集計（ダッシュボード）
- Activation率 / Time to First Publish
- Share率 / Play率 / Remix率
- Template別の完了率と初回公開速度

---

## 3. テンプレート（初回公開を最短化）

### 1) Playable Postcard
- **内容:** 1枚絵 + 1つの演出 + テキスト
- **体験:** 10秒で完結
- **価値:** “作った感”が即出る

### 2) One-Button Runner
- **内容:** タップでジャンプのみ、短距離ゴール
- **体験:** 30秒
- **価値:** 最短で「遊べるゲーム」になる

### 3) Choice Story (3 scenes)
- **内容:** 3枚画像 + 選択肢
- **体験:** 1分
- **価値:** 共有されやすい物語体験

---

## 4. 自動化（摩擦の最小化）

1. **初回公開フローを一本道化**
   - テンプレ選択 → 最低2つの編集 → 公開

2. **公開直後の共有ポップアップ**
   - publish_success 直後に必ず表示
   - 2分以内に共有がなければ再提示

3. **放置復帰の自動リマインド**
   - onboarding_start から24時間以内に publish_success が無い場合に通知

4. **自動タイトル・OG画像**
   - テンプレ特化の自動生成で公開時の品質を担保

---

## 5. 実装フェーズ

**Phase 1: 計測拡張**
- イベント追加・集計KPIのダッシュボード化

**Phase 2: テンプレ3種**
- Playable Postcard / Runner / Choice Story

**Phase 3: 自動化フロー**
- 一本道オンボーディング / 共有促進 / 放置復帰

**Phase 4: 実験と最適化**
- テンプレ改善、共有コピー、公開導線のA/B

---

## 6. 依存事項

- Analytics拡張（イベント＋集計）
- OG画像生成の安定稼働
- 共有導線（SNS/コピー/短縮URL）

---

## 7. リスクと対策

- **初回公開の負荷増大** → テンプレを固定・一本道にする
- **共有率が伸びない** → 公開直後に強制導線
- **テンプレの質が低い** → 週次でテンプレ改善

---

## 8. 成功条件

- Time to First Publish **10分以内**
- Activation率 **+30%以上**
- Share率 **+20%以上**
- Remix率 **+10%以上**

