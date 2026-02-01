# DreamCore Modal - TODO

## 完了した作業

### 2026-01-29: Vertex AI 移行

**詳細:** `.claude/logs/2026-01-29-vertex-ai-migration.md`

- [x] Claude CLI を Vertex AI 経由に変更
- [x] Gemini コード生成を Vertex AI 経由に変更
- [x] Gemini 画像生成を Vertex AI 経由に変更
- [x] Gemini 3 モデルの global エンドポイント対応
- [x] role フィールド追加
- [x] レスポンス形式の柔軟化
- [x] 動作確認完了

**発見事項:**
- Gemini 3 モデルは `global` エンドポイントのみ（リージョナル非対応）
- Vertex AI Gemini では `role: "user"` が必須
- 画像生成では `responseMimeType` 非対応

---

## 今後の作業

- [ ] 本番環境での長期安定性確認
- [ ] エラーハンドリングの改善（Gemini レスポンス形式の変動対応）

---

## E2E テスト結果 (2026-01-29)

| テスト | 結果 |
|--------|------|
| detect_intent (Haiku) | ✅ |
| generate_gemini (Gemini) | ✅ |
| generate_publish_info (Haiku) | ✅ |
| Squid ログ確認 | ✅ oauth2 + aiplatform + us-east5 通過確認 |
| Web UI 動作確認 | ✅ ストリーミング動作 OK |

**Vertex AI 移行完了 - 本番稼働確認済み**
