# 向量 PDF → canonical → 原生 BTW（第一條端到端流程）

基準 `0d052ec`。PR #35 維持 Draft；未修改 main、Renderer 核心、COM 核心或任何既有 Gate。

## 流程
1. 網站「快速分析」選取 PDF → 「匯出 canonical JSON」（`assets/pdf-canonical-export.js`，獨立於 RC2，使用 pdf.js 6.3.289 **legacy** 建置）。
2. 共用核心 `assets/pdf-canonical.js`（瀏覽器與 Node 同一份規則）；Node 轉接器 `tools/pdf-to-canonical.cjs`。
3. Windows：`run-request.json` 設 `probe: canonical-build` → `Run-CanonicalBuild.ps1` → 既有 `Build-NativeLayout.ps1` + `Verify-PrimitiveColdReopen.ps1` → `tools/compare-source-native.cjs`（原稿 vs 冷重開整頁 BMP，容差 0.5 mm）。

## 已驗證（離線）
- Node regression `tests/pdf-canonical-smoke.cjs` 30/30：文字墨跡與 fontTools 獨立答案相差 ≤0.021 mm；條碼外框與模組與手算值完全一致；通過權威 `validate`／`nativeRequest`／`preview`；7 個負向樣本以正確原因拒絕。
- Playwright `tests/browser/pdf-canonical-export.spec.cjs` 2/2（沙盒用 `E2E_CHROMIUM` 指定 Chromium 131）。
- 原稿比對自我檢查 `tests/compare-source-native-smoke.cjs` 5/5（合成資料，非 BarTender 證據）。

## 需 ChatGPT 決定
- **一致性契約**：網站與 Node 的文字 `xMm`/`yMm` 在 Skia 反鋸齒邊緣可能差 1 個 600 dpi 像素（0.0423 mm），其他欄位完全相同；網站輸出另需獨立通過正確答案容差。
- 既有 `analysis-pdf-native.js` 使用 pdf.js 現代建置，需要 ES2025/2026 方法（`Uint8Array#toHex`、`Map#getOrInsertComputed`），舊瀏覽器會失敗；匯出已改用 legacy。

## 未驗證／限制
- V3/V4（Windows 建檔、冷重開、原稿比對）**NOT RUN**；`compare-source-native.cjs` 在 Windows 需 `npm ci` 安裝 `@napi-rs/canvas` 的 win32 套件，未實測。
- 支援範圍：單頁、未旋轉、水平單行文字（Arial/Courier New/Times New Roman 及 Liberation 度量相容替代）、Code128 0.254 mm、方形 DM 0.338582 mm；其他一律拒絕。
- V5 UltraLite 開啟一次：依 v2 第 6 節分類。
