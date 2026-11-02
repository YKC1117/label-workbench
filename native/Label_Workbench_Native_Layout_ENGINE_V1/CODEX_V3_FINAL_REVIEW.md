# V3 最終深度複查 — 2026-10-06

本文件是本次交接的權威結論；先前 validation 報告、manifest、patch 與 PASS 紀錄均為歷史資料，不代表本包已執行驗證。

## 結論

以 GENERAL_GPT_V3_FOR_CODEX_REVIEW 附件為基準完成靜態複查和必要修正。
遵守「這次先不要再執行任何檔案」：未啟動附件程式、測試、編譯器或 BarTender。
本包是下一次單次 Windows 驗證的候選，並非已證實能通過 preflight 的版本。不能保證第三次測試一定通過。

## 前兩次 preflight 問題

1. System.Xml：V3 已以 XmlDocument.Assembly.Location 明確傳入 Add-Type -ReferencedAssemblies；已核對程式碼並保留。NativeReviewFixtures.cs 使用的 XmlDocument/XmlElement/XmlNode 型別確實來自此依賴。C# 編譯 NOT RUN。
2. Read-Property 無法辨識：V3 已提供 module script scope 的三個 COM wrapper；mock Read/Write override 亦已改 script scope。靜態上直接處理了已回報原因，但實際 Windows 5.1 session-state 執行 NOT RUN。

## 實際修正

- NativeLayoutEngine.psm1：移除殘留的 nested Import-Module Com.psm1 -Force。模組自行確保 ComBridge 型別已載入，保留三個 private script-scope wrappers；避免依賴或重載呼叫端 Com 模組。
- Build-NativeLayout.ps1：runner 的橋接呼叫明確使用 Com\Read-Property、Com\Write-Property、Com\Invoke-ComMethod。傳入 runDir 保存 preflight mock 結果。
- Test-NativePersistence.ps1：在安裝 PageSetup mock 前核對三個函式的 ModuleName，實際 property/method/object return/空 enumerable collection identity 探針已編寫，尚未執行。
- 原 13 個負向情境會把任意 build 例外當預期攔截，可能誤判 PASS。現在每例核對特定錯誤、文件建立階段；reopen 情境須真的取得新實例。另檢查 reopened document 已 Close。
- 原 mock override 在測試拋錯時缺少 finally 清除；現在測試主體 finally 移除 mock module，並清除 fixture 的 Saved 快取。
- SELF_CHECK_NATIVE.ps1 / persistence：新增 optional 證據輸出，將 suite 狀態、每例實際/預期錯誤寫入 native-mock-results.json，保留在 NATIVE_BUILD_RESULT.zip。編譯期更早失敗仍由 PREFLIGHT_LOG.txt 記錄。

## 14 組 mock 靜態追蹤

| 情境 | 預期檢查 |
|---|---|
| none | 六物件成功、獨立 reopen 實例、每物件再次編輯、兩份文件 Close |
| wrong-create | Create(5) 返回 Type 不符 |
| duplicate-name | 名稱重複 |
| duplicate-source | EmbeddedDataSource ID 重複 |
| partial-insert | 插入後拋出的指定 fixture 例外 |
| peer-payload | 修改 payload 污染其他物件 |
| noop-index | XDimension 與 raster 無實際反應 |
| bad-dpi | baseline DPI 不可信 |
| reopen-type | reopen Type 不符 |
| reopen-payload | reopen payload 不符 |
| reopen-nan | XML canonical 比對先偵測 NaN X；此例不代表已直接覆蓋 finite guard |
| reopen-printer | printer 變動 |
| reopen-margin | MarginLeft 變動 |
| reopen-dpi | reopen raster DPI 不可信 |

這是 1 個健康情境 + 13 個 fault 情境。全數 NOT RUN，表格不是測試通過紀錄。Mock 不模擬真正 RCW 的生命週期，也不能證明 COM/列印驅動相容。

## 未擴大架構

保留原有新空白 BTW、多物件原生建立、單一 EmbeddedDataSource、HumanReadable=None gate、可信 ink bounds sizing、候選隔離、Save/Close/Reopen/逐物件再編輯流程。
未動 OCR、網站 UI、BTW binary、GitHub，也未把 existing-BTW V4 PASS 擴大為新引擎 PASS。
底層 ComBridge.cs、NativeReviewFixtures.cs、proven-code128.btc、原始 evidence 保持不變。

## 執行限制與下一次驗證範圍

本輪不要求使用者執行。後續決定做單次 Windows 驗證時，唯一入口仍為 program/BUILD_NATIVE.cmd，輸入 native-layout.multi.sample.json。
須先通過 Windows PowerShell 5.1 parser、C# Add-Type、input regression、bridge probes 和 14 mocks，才可啟動 BarTender。
再驗證新空白文件 + 2 Text + 2 Code128 + 2 Data Matrix、紙張/印表機、payload/source 隔離、尺寸、SaveAs/Close/Reopen 和每物件第二次編輯。證據為 NATIVE_BUILD_RESULT.zip。
仍須實機證明 Create(5)、新文件 DM component、COM cleanup/watchdog；COM activation 在 watchdog 前的既有邊界未改。
ReferencePoint 仍是原生錨點，不代表 OCR 左上角座標。尺寸是有限可信候選中的近似值，非 decoder/列印/掃碼驗收。仍標 productAcceptance=NOT_RUN。

## 離線結果

見 validation/codex-v3-final-offline.json：只記錄本輪實際完成的靜態/資料完整性檢查。
PowerShell 原生 parser、regression、14 mocks、C# compile、Windows 5.1、BarTender 2022 與實體列印均 NOT RUN。
