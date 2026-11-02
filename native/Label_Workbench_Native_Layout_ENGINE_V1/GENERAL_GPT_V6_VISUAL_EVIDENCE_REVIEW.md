# General GPT V6 — Visual / Anchor Evidence Layer

日期：2026-10-06。

## 核心原則

- Codex V5 FINAL 的 `NativeLayoutEngine.psm1`、`NativeReviewFixtures.cs`、23 個 Font regression、14 個 multi-object mock **不修改**。
- V6 只在 Windows one-shot 驗證入口增加診斷證據，不改 native BTW 生成演算法。
- 目的：下一次單次 Windows 驗證若核心通過，同時自動收集完整標籤與每個物件的 raster / ReferencePoint / X/Y / rotation，讓座標語意可由結果 ZIP 直接分析。

## 修改

1. `Build-NativeLayout.ps1`
   - 新增 `-CaptureVisualEvidence`。
   - 核心 `Invoke-NativeLayoutBuild` PASS 後、latest BTW 發佈前，重新開啟已驗證候選。
   - 使用既有 TypeLib 已存在的 `IBtFormat.ExportToFile` 與 `IBtDesignObject.ExportToFile` 匯出 600 DPI BMP。
   - 產生 `native-format-preview.bmp`、`visual-<id>.bmp`、`native-visual-evidence.json`。
   - 任一 preview / DPI / object count 證據失敗，one-shot exit 仍為 FAIL，且不發佈 `LATEST_NATIVE_OUTPUT.btw`。

2. `ONE_SHOT_NATIVE_TEST.cmd`
   - 固定傳入 `-CaptureVisualEvidence`。
   - `BUILD_NATIVE.cmd` 不變，避免改變一般核心入口行為。

3. `SELF_CHECK_NATIVE.ps1`
   - 新增 `IBtFormat.ExportToFile` 的 TypeLib signature gate。

## 不宣稱

- 不把 ReferencePoint absence 猜成 TopLeft。
- 不把 raster ink bounds 當成物件 anchor/bounds。
- 不宣稱圖片左上角 → BarTender 座標映射已完成。
- 不修改 V5 FontName / payload / sizing / SaveAs / reopen 核心。

## 下一個證據目標

一次 Windows one-shot 後，只回傳 `NATIVE_BUILD_RESULT.zip`。如果核心與 V6 診斷都 PASS，結果包將同時包含：
- 23 Font cases + 14 multi-object mock 結果
- native BTW 建立 / Save / Close / Reopen / editability
- 完整標籤預覽 BMP
- 每個 Text / Code128 / Data Matrix 的 600 DPI 物件 BMP
- 每個物件實際 ReferencePoint、X/Y、Rotation、native Type、XML root

這些資料用於下一步設計 image-top-left → anchor coordinate mapping，而不是要求使用者人工量圖。
