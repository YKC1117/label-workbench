V4 FontName 最終深度複查候選 — 2026-10-06

請先讀 CODEX_V4_FINAL_REVIEW.md。
READY FOR ONE-SHOT WINDOWS TEST：NO（修改後 PowerShell/C# 尚未執行驗證）。
本輪不要求使用者測試。未宣稱 Runtime FontName 錯誤已在實機排除。
已修正 pre-COM baseline、partial SetXML rollback、完整狀態回讀、字型最後驗證與 mock 路徑斷言。
原 14 組 multi-object mock 保留；新增 22 個 font cases；兩組執行均 NOT RUN。
原生 parser、C# compile、Windows PowerShell 5.1、BarTender Runtime 均 NOT RUN。
後續入口仍為 program/BUILD_NATIVE.cmd，輸入 native-layout.multi.sample.json；此處僅說明入口，不要求現在執行。
歷史 manifest/validation/PASS 不可當作本包執行證據。
