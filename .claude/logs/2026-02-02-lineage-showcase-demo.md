# 系譜デモページ作成

**日付:** 2026-02-02
**作業者:** Claude

## 実施内容

### 系譜デモページ作成

`public/demo/lineage-showcase.html` に複雑な系譜ツリーのデモページを作成:

**表示内容:**
- 5世代にわたる系譜ツリー
- 非公開ルート（🔒マーク、UUID/名前非表示）
- 複数の分岐（スターブラスター系3件、アーケードシューター系5件）
- 子孫の入れ子構造（3レベルの深さ）
- 深さ制限インジケータ（「さらに24件のリミックスがあります」）
- 世代別の色分け凡例
- モバイルレスポンシブ対応

**確認URL:** http://localhost:3000/demo/lineage-showcase.html

### 深さ制限の調査

現在の実装を確認:

| 用途 | 深さ制限 | 実装箇所 |
|------|---------|----------|
| 表示用 `getVisibleDescendants` | 10世代 | `remixService.js:198` |
| カウント用 `countAllRemixes` | なし（RPC） | DB側で効率的に計算 |
| フォールバック | 100世代 | `FALLBACK_MAX_DEPTH` |

**制限理由:**
- 再帰クエリが世代ごとに増える（N+1問題）
- レスポンスサイズの肥大化リスク
- タイムアウトリスク

**拡張可能性:**
- 50世代に緩和すれば実質無制限
- `visited` Set で無限ループ対策済み
- TODO.md に将来の拡張として記載

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|----------|
| `public/demo/lineage-showcase.html` | 新規作成 - 系譜デモページ |
| `TODO.md` | 将来の機能拡張に深さ制限緩和を追加 |

## 既存の系譜サンプル

本番環境で確認可能な系譜:

```
Neon Striker (g_Hzk8XETcS3)
└── ネオンストライカー (g_r3mOx77Tnq)
```

- ルートから見た系譜: https://v2.dreamcore.gg/game/g_Hzk8XETcS3?view=lineage
- リミックスから見た系譜: https://v2.dreamcore.gg/game/g_r3mOx77Tnq?view=lineage

統計: totalRemixes=8（非公開含む）、visibleRemixes=1（公開のみ）

## 学び・注意点

- 深さ制限は現状10世代で十分（実用上の問題なし）
- RPC `count_all_remixes` は無制限でカウント可能
- 表示制限と総数カウントは別々の制限値を持つ
