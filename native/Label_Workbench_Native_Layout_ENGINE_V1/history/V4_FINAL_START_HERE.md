# Label Workbench BarTender ONE SHOT V4 — FINAL REVIEW

本包取代原始 V4 作為唯一修正交付。原版不要先測。

已修復可靜態確認的 Code128 caption/尺寸判定/rollback/reopen/回歸缺口。
**尚未執行 PowerShell parser、regression 或 C# compile**：本次環境沒有對應工具。
不得稱為「全部離線驗證通過」或「Windows 已完成」。詳見 TECHNICAL_REVIEW.md 和 validation/final-review-offline.json。

下一次 Windows 單次流程（本次尚未執行）：program/CORE_TEST.cmd → 選原始 BTW → 自動產生 program/RETURN_TO_CHATGPT.zip。
不需要先測原始 V4，不需要改用歷史入口。

Caption 未證實 None 時禁止用 ink bounds 選 32 mm；仍可驗證 XML 能力、Height、存檔與重開。
高度 4.5 ±0.10 mm、寬度 32 ±0.85 mm 為診斷閾值，非正式列印/解碼驗收。
原始 V3 真實證據與 proven-code128.btc 全部保留不改。
