# Release Manifest — 2026-02-07 V1 Cleanup

| 項目 | 値 |
|------|-----|
| アプリ SHA | `10bc8134fe1267a6b0a0e4abe0138acf1bfcf2b7` |
| 復元タグ | `restore-point/20260207-pre-v1-cleanup` |
| ブランチ | `main` |
| package-lock.json SHA256 | `1c2993286fde8715d81ed5820cd4413eb1a75703a75168ce97aa4e86d9e3ca07` |
| Node.js | `20.20.0` |
| PM2 プロセス | `dreamcore-sandbox` → `server/index.js` |
| Modal App ID | `ap-ZhFgtA0skfJDwXFDEzvuD4` |
| Supabase Project | `tcynrijrovktirsvwiqb` |
| 有効マイグレーション | 001 〜 20260206100900（26 本） |

## 復元手順

```bash
git checkout restore-point/20260207-pre-v1-cleanup
# GCE deploy from this tag
```
