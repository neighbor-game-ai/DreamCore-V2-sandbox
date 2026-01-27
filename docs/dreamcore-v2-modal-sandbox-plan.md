# DreamCore‑V2 Modal Sandbox移行計画（UX完全維持）

作成日: 2026-01-27
対象リポジトリ: `/Users/admin/DreamCore-V2-sandbox`
基準UX: **DreamCore‑V2 現行の画面・フロー・API契約**

参照ドキュメント:
- `/Users/admin/DreamCore-V2-sandbox/docs/ARCHITECTURE.md`
- `/Users/admin/DreamCore-V2-sandbox/docs/GAME_GENERATION_FLOW.md`
- `/Users/admin/DreamCore-V2-sandbox/docs/ASSET_MANAGEMENT.md`

---

## ゴール
- **UX完全維持**（画面/操作/レスポンス/エラー文言の挙動はDreamCore‑V2と同一）
- **裏側だけModal化**（生成/ファイルI/O/Git/画像生成/隔離）
- **Supabaseは継続利用**（既存DB/Storageを活かす）

> 重要: UI/UX・API契約は変更禁止。DreamCore‑V2が基準。

---

## アーキテクチャ方針（確定）

### 1) UI/画面は現状維持
- `public/app.js`, `public/publish.js`, `public/play.js` 等は変更最小
- 画面遷移・UI挙動は**DreamCore‑V2と同一**

### 2) API契約は現状維持
- `/api/assets/*`, `/api/publish/*`, `/api/projects/*` など
- レスポンス形式・エラー形式も**DreamCore‑V2互換**

### 3) 裏側のみModal化
- Claude CLI / Gemini / Python / Git は **Modal Sandbox内で実行**
- プロジェクトは**ユーザーごとにサンドボックス**
- Modal Volumeは**作業領域**、永続はSupabase

### 4) アセット管理は製品版仕様
- `assets` / `project_assets` テーブルはSupabaseで維持
- `/api/assets/:id` を維持
- `replaceAssetReferences()` を維持
- Supabase Storage へ保存

---

## 全体像

```
DreamCore‑V2 UX (維持)
  ├─ public/*.html / public/*.js
  └─ 既存の画面フロー / API契約

裏側のみ差し替え
  ├─ 生成: Modal Sandbox
  ├─ ファイルI/O: Modal Volume
  ├─ Git: Modal Volume
  └─ DB/Storage: Supabase
```

---

## 移行範囲（必須）

### 1. 生成パイプライン
- Claude CLI 実行
- Gemini 呼び出し
- autoFix / Remix / 更新系処理

### 2. アセット管理
- assets / project_assets テーブル
- `/api/assets/:id`
- `replaceAssetReferences()`
- Supabase Storage

### 3. Publish フロー
- サムネイル生成（nanobanana）
- タイトル/概要生成（Haiku）
- 動画生成（Remotion）
- PUBLISH.json / Draft / 公開

### 4. Remotion
- `game-video/` プロジェクト維持
- render をModal内で実行

### 5. 特殊機能
- autoFix
- バージョン履歴
- リミックス
- Discover

---

## 移行ステップ（段階的）

### Phase 0: 準備
- DreamCore‑V2現行挙動のスナップショット取得
- API契約の洗い出し（変更禁止）
- Modal Volume / Secret / Image 準備

### Phase 1: 生成のModal化
- Claude CLI / Gemini をModal内で実行
- 生成物はModal Volumeに保存

### Phase 2: GitのModal化
- Git操作をModal Volume上で実行
- commit / restore / history を維持

### Phase 3: アセット管理の統合
- Supabase assets / project_assets
- `/api/assets/:id` 配信
- replaceAssetReferences維持

### Phase 4: Publish / Remotion
- サムネ生成 / タイトル生成 / 動画生成
- Publish UXを維持

### Phase 5: E2E検証
- DreamCore‑V2と同一UXかを検証

---

## 成功基準
- 画面と操作フローがDreamCore‑V2と同じ
- APIレスポンスがDreamCore‑V2と一致
- 生成品質・挙動がDreamCore‑V2と同等
- Publish / Discover / Remix / autoFix が同じ

---

## 次のアクション
1. **Modal基盤準備**（Volume / Secret）
2. **Phase 1詳細タスクの分解**
3. **アセット/Publish/Remotionの移行設計**

