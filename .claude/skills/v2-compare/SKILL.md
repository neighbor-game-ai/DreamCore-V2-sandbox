---
name: v2-compare
description: DreamCore-V2 オリジナルとの差分を確認するスキル。sandbox は V2 の完全クローンであるべきという原則に基づき、実装の一貫性を検証します。
---

# V2 Compare Skill

DreamCore-V2 オリジナルとの差分を確認するスキル。

## トリガー

以下のような依頼で実行:
- 「V2と比較して」
- 「オリジナルと同じか確認して」
- 「DreamCore-V2との差分を見て」
- 「実装が正しいか確認して」

## 根幹原則

**DreamCore-V2-sandbox は DreamCore-V2 の完全クローンです。**

変更してよいのは「実行基盤」のみ:
- Claude CLI の実行場所: ローカル → Modal Sandbox
- ファイルの保存場所: ローカル → Modal Volume

変更してはいけないもの:
- フロントエンドのコード
- WebSocket のメッセージ形式
- REST API のエンドポイント・形式
- ユーザーが目にする UI/UX
- 認証フロー
- アセット管理の仕組み

## 比較対象ディレクトリ

| 項目 | DreamCore-V2 | DreamCore-V2-sandbox |
|------|--------------|---------------------|
| パス | `/Users/admin/DreamCore-V2/` | `/Users/admin/DreamCore-V2-sandbox/` |

## 比較手順

### 1. フロントエンド比較（変更禁止）

```bash
diff -rq /Users/admin/DreamCore-V2/public /Users/admin/DreamCore-V2-sandbox/public
```

差分があれば **問題あり**（Modal統合に必要な最小限の変更を除く）

### 2. API エンドポイント比較

```bash
# ルート定義の比較
grep -r "app\.\(get\|post\|put\|delete\|patch\)" /Users/admin/DreamCore-V2/server/
grep -r "app\.\(get\|post\|delete\|put\|patch\)" /Users/admin/DreamCore-V2-sandbox/server/
```

エンドポイントの追加・削除・変更がないか確認。

### 3. WebSocket メッセージ形式比較

```bash
# メッセージタイプの確認
grep -r "type:" /Users/admin/DreamCore-V2/server/ | grep -E "(send|emit|message)"
grep -r "type:" /Users/admin/DreamCore-V2-sandbox/server/ | grep -E "(send|emit|message)"
```

### 4. 認証フロー比較

```bash
diff /Users/admin/DreamCore-V2/server/authMiddleware.js /Users/admin/DreamCore-V2-sandbox/server/authMiddleware.js
diff /Users/admin/DreamCore-V2/public/auth.js /Users/admin/DreamCore-V2-sandbox/public/auth.js
```

### 5. 機能の網羅性確認

DreamCore-V2 の機能一覧と sandbox を照合:

- [ ] プロジェクト作成
- [ ] プロジェクト一覧
- [ ] コード生成（Claude CLI）
- [ ] プレビュー
- [ ] アセット管理
- [ ] 認証（Google OAuth）

## 許容される差分

以下の差分は Modal 統合に必要なため許容:

1. **環境変数**: `USE_MODAL`, `MODAL_ENDPOINT`, `MODAL_INTERNAL_SECRET`
2. **Claude CLI 呼び出し部分**: Modal 経由に変更
3. **ファイルパス**: Modal Volume パスへの変更
4. **CLAUDE.md**: Modal 統合に関する記述追加

## 出力形式

比較結果は以下の形式で報告:

```markdown
## V2 比較結果

**比較日時:** YYYY-MM-DD HH:MM

### フロントエンド
- 状態: 一致 / 差分あり
- 差分ファイル: (あれば)

### API エンドポイント
- 状態: 一致 / 差分あり
- 変更点: (あれば)

### WebSocket
- 状態: 一致 / 差分あり

### 認証
- 状態: 一致 / 差分あり

### 総合判定
- OK: V2 と同等
- NG: 要修正（理由）
```

## 判断に迷ったら

「DreamCore-V2 ではどうなっているか？」を確認し、**それと完全に同じ動作**を実装してください。
