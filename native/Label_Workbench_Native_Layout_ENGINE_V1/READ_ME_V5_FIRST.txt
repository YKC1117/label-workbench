Label Workbench Native Layout — V5

目前先不要反覆實機測試。

V5 在 Codex V4 FINAL 上再補一個 COM FontName 失敗後的隱藏部分修改防護：
如果 COM 可讀狀態已改變、但 GetXML 尚未反映，會先完整回滾 baseline 並驗證，才允許 XML fallback。
另增加第 23 個 Font regression：com-hidden-partial。

未來真正做單次 Windows + BarTender 2022 驗證時，只執行：

program\ONE_SHOT_NATIVE_TEST.cmd

這個入口固定使用 native-layout.multi.sample.json，不需要手動選檔。
它會先執行 parser / C# helper / input regression / 23 Font cases / 14 multi-object mocks；全部通過後才啟動 BarTender。

成功或失敗都回傳：
program\NATIVE_BUILD_RESULT.zip

目前仍 NOT RUN：Windows PowerShell 5.1 原生 parser、C# 真正編譯、23+14 regressions、BarTender 2022 Runtime、實體列印/掃碼。


V6 diagnostic note: ONE_SHOT_NATIVE_TEST.cmd now captures full-format and per-object visual/anchor evidence after the unchanged V5 core passes. See GENERAL_GPT_V6_VISUAL_EVIDENCE_REVIEW.md.
