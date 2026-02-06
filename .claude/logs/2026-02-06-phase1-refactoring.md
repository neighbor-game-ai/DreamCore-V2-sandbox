# Phase 1 リファクタリング: ナビゲーション共通化 + デッドコード削除

**日付:** 2026-02-06
**ブランチ:** refactor/phase1-navigation-deadcode → main にマージ済み

---

## セッション概要

Phase 1 リファクタリングとして、ナビゲーション共通化とデッドコード削除を実施。
CodeRabbit レビューから開始し、リファクタリング調査 → 実装 → CTO レビュー対応 → E2E テスト → マージの流れで完了。

---

## 実施内容

### 1. CodeRabbit によるコードベース分析

サーバーサイド (19,438行, 58ファイル) とフロントエンド (35,562行) を並列で調査。
HIGH/MEDIUM/LOW に分類した改善ポイントを特定。

### 2. ナビゲーション共通化 (commits: 3c4db21, 6ffe96a)

- **新ファイル:** `public/js/modules/navigation.js` (65行)
- mypage.js, notifications.js, profile.js から82行の重複コードを削除
- `setupBottomNav({ currentTab, onProfile })` API で統一
- 各ページの profile タブ挙動を維持:
  - **mypage:** no-op (`currentTab: 'profile'`)
  - **notifications:** デフォルト遷移 (`currentTab: 'notifications'`)
  - **profile:** カスタムハンドラ (`onProfile` callback)

### 3. CTO レビュー対応 (commit: 6ffe96a)

| 指摘 | 重要度 | 対応 |
|------|--------|------|
| notifications タブで再読み込み回帰 | Medium | `currentTab` パラメータ追加。`tab === currentTab` で早期 return |
| 現在タブ no-op の一般化 | Low | 同上で対応済み |

### 4. 回帰テスト追加 (commit: b20419d)

- `test-navigation.js`: 13テストケース
- カバレッジ: 4タブの no-op、onProfile 優先、currentTab なし時の遷移

### 5. デッドコード削除 (commit: 701a110)

- **public/app.js:** `initPage()`, `_legacyInitPage()`, `checkSession()` 削除 (-28行)
- **server/database-supabase.js:** 13関数削除 (-84行)
  - `getUserByVisitorId`
  - `getLoginUserByUsername` / `getLoginUserById` / `getLoginUserByUserId`
  - `createLoginUser`
  - `updateLoginUserLastLogin`
  - `getAllLoginUsers`
  - `createSession` / `getSessionById` / `deleteSession`
  - `deleteSessionsByLoginUserId`
  - `cleanupExpiredSessions`
  - `migrateFromJsonFiles`
- `rg` でリポジトリ全体の参照ゼロを確認
- `analytics/ingest.js` の `createSession`（同名別関数）は影響なし

### 6. E2E テスト (agent-browser, 2ラウンド)

| ラウンド | 対象 | テスト内容 | 結果 |
|----------|------|-----------|------|
| 1 (ナビ共通化後) | mypage, notifications, profile | タブ遷移、no-op 確認 | 全PASS |
| 2 (デッドコード削除後) | mypage, notifications, create | 機能動作、コンソール確認 | 全PASS |

- notifications no-op: `window.__marker` テストで実証
- create: コンソール191KB中、削除メソッド参照ゼロ

---

## 定量的成果

| 項目 | 行数 |
|------|------|
| 重複削除 (ナビゲーション) | -82行 |
| デッドコード (16関数) | -112行 |
| **合計削減** | **-194行** |
| 新規: navigation.js | +65行 |
| 新規: test-navigation.js | +199行 |

---

## 変更ファイル一覧

| ファイル | 変更種別 |
|----------|----------|
| `public/js/modules/navigation.js` | 新規 |
| `test-navigation.js` | 新規 |
| `public/mypage.js` | 修正 |
| `public/notifications.js` | 修正 |
| `public/profile.js` | 修正 |
| `public/mypage.html` | 修正 |
| `public/notifications.html` | 修正 |
| `public/user.html` | 修正 |
| `public/app.js` | 修正 |
| `server/database-supabase.js` | 修正 |

---

## CTO 判定

- `701a110` を基準に Phase 1 完了
- `test-navigation.js` を必須ゲートとして維持
- `preauth.js` と `navigation.js` は「単一ソース」方針を堅持

---

## 学び・注意点

- 共通化で「現在タブの no-op」を忘れると回帰を起こす → `currentTab` パラメータで一般化
- `createSession` の名前衝突 → 削除前に別モジュールの同名関数を確認
- git worktree + 独立ブランチでリファクタリングすると安全
