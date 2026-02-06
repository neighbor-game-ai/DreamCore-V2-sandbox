# URL 構造リファクタリング計画

**日付**: 2026-02-06
**ステータス**: CTO レビュー待ち

---

## 背景

現在の URL 構造は一般的な Web アプリのパターンと異なり、UX 上の問題を引き起こしている。

### 現在の問題

1. **ログイン画面のフラッシュ**: ページ遷移時にログイン画面が一瞬表示される
2. **非標準的な URL**: ルート (`/`) がログイン画面、メインアプリが `/create.html`
3. **ユーザーの期待とのズレ**: X, TikTok 等の主要サービスはルートがホーム

### 現在の構造

```
/              → index.html (ログイン画面)
/create.html   → メインアプリ（ゲーム作成）
/mypage.html   → マイページ
/project/:id   → プロジェクト詳細
/discover.html → 発見
```

---

## 提案する構造

```
/              → ホーム（現在は create 機能、将来変更可能）
/login         → ログイン画面
/create        → ゲーム作成（現在は / と同じ）
/mypage        → マイページ
/project/:id   → プロジェクト詳細
/discover      → 発見
/notifications → 通知
```

### 認証フロー

```
未認証ユーザー:
  任意のページ → /login へリダイレクト → 認証成功 → 元のページへ

認証済みユーザー:
  /login → / へリダイレクト
```

---

## 設計方針

### 1. ホームページの柔軟性

現在のホームは「ゲーム作成」だが、将来的に変更される可能性を考慮。

**選択肢**:

| ホームの候補 | 説明 |
|-------------|------|
| ゲーム作成 (現在) | 新規ユーザーが即座に作成開始できる |
| ダッシュボード | プロジェクト一覧 + 統計 |
| フィード | 他ユーザーの作品を表示 |
| ハブ | 作成 / 発見 / マイページへの導線 |

**実装方針**:
- `index.html` はホームページとして機能
- 現在は create 機能を直接表示
- 将来変更時は `index.html` の内容を差し替え、create は `/create` で独立

### 2. .html 拡張子の廃止

```
現在: /mypage.html, /discover.html
変更後: /mypage, /discover
```

**理由**:
- モダンな URL パターン
- Express でクリーンな URL 処理が可能
- SEO 上も好ましい

### 3. 早期認証チェックの統一

すべてのページで統一された早期認証チェックを実装:

```javascript
// <head> 内で実行（ブロッキング）
(function() {
  // OAuth コールバック中はスキップ
  if (isOAuthCallback()) return;

  // セッション確認
  if (!hasSession()) {
    // 現在の URL を保存してログインへ
    sessionStorage.setItem('redirect_after_login', location.href);
    location.href = '/login';
  }
})();
```

---

## 実装計画

### Phase 1: ファイルリネーム

| 変更前 | 変更後 |
|--------|--------|
| `index.html` | `login.html` |
| `create.html` | `index.html` |

### Phase 2: サーバールーティング更新

```javascript
// server/index.js

// クリーン URL (拡張子なし)
app.get('/login', (req, res) => res.sendFile('login.html'));
app.get('/create', (req, res) => res.sendFile('index.html'));
app.get('/mypage', (req, res) => res.sendFile('mypage.html'));
app.get('/discover', (req, res) => res.sendFile('discover.html'));
app.get('/notifications', (req, res) => res.sendFile('notifications.html'));

// 後方互換性（旧 URL からのリダイレクト）
app.get('/create.html', (req, res) => res.redirect(301, '/'));
app.get('/mypage.html', (req, res) => res.redirect(301, '/mypage'));
```

### Phase 3: 参照更新

すべてのファイルで URL 参照を更新:

```javascript
// 変更前
window.location.href = '/create.html';
window.location.href = '/';  // ログインへ

// 変更後
window.location.href = '/';
window.location.href = '/login';
```

### Phase 4: 認証フロー更新

1. **login.html**: 認証済みなら `/` へリダイレクト
2. **その他のページ**: 未認証なら `/login` へリダイレクト
3. **ログイン後リダイレクト**: 元のページへ戻る

### Phase 5: PWA / 外部設定更新

| 設定 | 変更 |
|------|------|
| `manifest.json` の `start_url` | `/create.html` → `/` |
| Supabase OAuth Redirect URL | 変更不要（ドメインベース） |
| OGP / メタタグ | URL 参照を更新 |

---

## 影響範囲

### ファイル変更

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | `login.html` にリネーム |
| `public/create.html` | `index.html` にリネーム |
| `public/mypage.html` | 内部リンク更新 |
| `public/discover.html` | 内部リンク更新 |
| `public/notifications.html` | 内部リンク更新 |
| `public/app.js` | リダイレクト先更新 |
| `public/auth.js` | リダイレクト先更新 |
| `public/manifest.json` | `start_url` 更新 |
| `server/index.js` | ルーティング追加 |

### 外部連携

| サービス | 確認事項 |
|----------|----------|
| Supabase OAuth | リダイレクト URL (変更不要の見込み) |
| Google OAuth | 許可済み URL (確認必要) |
| Apple OAuth | 許可済み URL (確認必要) |

---

## リスクと対策

### 1. SEO への影響

**リスク**: URL 変更により検索ランキングに影響
**対策**: 301 リダイレクトで旧 URL を新 URL に転送

### 2. ブックマーク / 共有リンクの破損

**リスク**: 旧 URL (`/create.html`) が使えなくなる
**対策**: 301 リダイレクトで永続的に対応

### 3. OAuth 設定の不整合

**リスク**: コールバック URL が合わなくなる
**対策**: 事前に OAuth 設定を確認・更新

---

## 今後の拡張性

### ホームページの変更

将来ホームを別機能に変更する場合:

```
1. 新しいホームコンテンツを index.html に実装
2. create 機能を /create に分離（create.html を復活）
3. ルーティング更新
```

### 認証不要ページの追加

```
/          → 認証必要（ホーム）
/login     → 認証不要
/about     → 認証不要（将来追加）
/pricing   → 認証不要（将来追加）
/g/:id     → 認証不要（公開ゲーム）
```

---

## 確認事項（CTO へ）

1. **ホームの将来計画**: 現在は create でよいか、近い将来変更予定はあるか
2. **.html 拡張子廃止**: 進めてよいか
3. **後方互換性の期間**: 301 リダイレクトをいつまで維持するか
4. **OAuth 設定**: Google / Apple の設定変更が必要か確認

---

## タイムライン（案）

| フェーズ | 作業 | 所要時間 |
|---------|------|----------|
| 1 | ファイルリネーム + ルーティング | 1時間 |
| 2 | 参照更新（全ファイル） | 2時間 |
| 3 | 認証フロー統一 | 1時間 |
| 4 | テスト + 修正 | 1時間 |
| 5 | デプロイ + 確認 | 30分 |
