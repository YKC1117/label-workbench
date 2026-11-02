# CODEX V5 最終差異複查

日期：2026-10-06。
輸入 SHA-256：26fe18c60b34398c10380098f3e9d0350e8720c1f1228651635650d76aceebd3，與交接文字一致。

## 結論

本輪 V5 差異審查未發現新的明確程式缺陷。保留 V5 的全部程式，核心/fixture/regression/CMD 修改數為 0；只新增本次複查結果及封包雜湊清單，避免增加尚未執行驗證的新程式。

V5 修正的是 V4 在「COM 字型已變、XML 未變」時停止後無法繼續 fallback 的可恢復性。V4 原本仍會阻止成功輸出，並非讓壞狀態通過。com-hidden-partial 是故障注入假設，不能宣稱已在真實 BarTender 2022 觀察到此行為。

## 已確認

- Engine 相對 Codex V4 的唯一邏輯差異，就是 COM 失敗後完整 baseline assertion 與 rollback 分支。FontSize、XML 接受條件、rollback、module scope、條碼與 persistence 路徑沒有變動。
- 新 fixture 分支只改 fontName 私有欄位，未改 XML，接著拋錯。
- Assert-NativeFontState 可透過 COM readback 發現該差異；還原完整 baseline 並驗證後，才允許 XML fallback。
- 第 23 個案例要求 1 次 COM setter、2 次 SetXML（1 次 restore + 1 次 fallback）及最終目標字型/XML 完整性。原 22 個案例全數保留。
- 14 個 multi-object regression 與 Codex V4 正規化換行後完全一致；精確負向原因、fallback 次數斷言、清除流程沒有退步。
- ONE_SHOT_NATIVE_TEST.cmd 使用完整引號路徑、固定 native-layout.multi.sample.json、保留 exit code，正常情況不會出現 JSON 選擇視窗。
- runner 在 SELF_CHECK_NATIVE 成功返回後才建立 BarTender COM；font test / multi-object test 模組移除後，production 重新載入自己的 NativeLayoutEngine。
- System.Xml 顯式參照、私有 module wrappers、ComBridge inner exception/HRESULT 均保留。

## 實際離線結果

18 項靜態/資料檢查 PASS。
本輪對原附件遞迴計數為 65 份 JSON（交接文字寫 63）、155 份 XML、7 個內嵌 ZIP；全部解析/CRC 通過。此處包含既有 validation JSON，並非 65 次 runtime 測試。
20 份 PowerShell、5 份 C# 通過 lexical/delimiter sanity，這不是 native parser 或 compiler。
33 份 evidence 與 Codex V4 byte-identical；proven-code128.btc SHA-256 不變。
原附件無混入舊 latest output 或 generated result ZIP。最終封包另外檢查 CRC 與逐檔 SHA-256。

詳見 validation/codex-v5-review.json。

## NOT RUN / readiness

PowerShell 原生 parser、C# compile、input regression、23 Font regressions、14 multi-object regressions、Windows PowerShell 5.1 session-state/RCW、BarTender 2022 Runtime/SaveAs-Close-Reopen、列印/掃碼均 NOT RUN。
目前環境仍沒有 pwsh/powershell/dotnet/csc/mcs/mono；無法用靜態審查取代這些執行結果。

READY FOR ONE-SHOT WINDOWS TEST 尚不能標示為已驗證的 YES；目前為 EXECUTABLE_VERIFICATION_PENDING。本輪不要求使用者執行測試，也不另造更多測試版本。
既有嚴格 XML canonical 比對可能拒絕正常欄位重算的限制仍存在；沒有真實 XML 往返證據前不猜測放寬。GetXML/rollback 若本身失敗，仍會安全停止，不保證每種 COM 例外都能恢復後繼續。

未動 GitHub/commit/push/PR/deploy；未改 OCR/UI/BTW binary。唯一最終封包：Label_Workbench_Native_Layout_ENGINE_V1_CODEX_V5_FINAL.zip。
