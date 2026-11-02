# V4 最終深度複查 — 2026-10-05

## 結論與範圍

原始 V4 不建議直接測。已修正可由原始碼和 V3 證據確認的缺陷；此包仍是診斷包，不是實機通過版。
本環境沒有 PowerShell、.NET/C# compiler 或 Windows/BarTender。因此不能聲稱「全部離線測試已 PASS」或「下次一定成功」。
沒有 GitHub、commit、push、PR、deploy、OCR/UI 修改或 BTW binary reverse engineering。未重新研發已通過的 Text/Data Matrix 功能。

## 證據

完整讀取 V4 入口與技術文件、program 原始碼；解析 evidence 的 JSON/XML 和內嵌 ZIP，閱讀 latest-real-v3-report.json 及 latest-real-v3-return.zip 的原始物件 XML。
V3 Code128 的直接子節點為 HumanReadable，沒有 Visibility 屬性；其下另有 caption 專用 EmbeddedDataSource，內容為「文字範例」。主 DataSources 仍只有一個 EmbeddedDataSource。兩者不可混為一談。
V3 的 Code128 失敗點確為 Width getter。Text/Data Matrix 的既有實機結果不撤回；30 個原始 evidence 檔案保持 byte-identical。

## 實際問題與修正

1. **Caption 污染**：V4 明確讓 Code128 在 HumanReadable 非 None 時照樣參加最佳 Index 選擇，且可得到 LAYOUT_INK_WIDTH_WITHIN_TOLERANCE。雖稱 layout-only，仍不足以支持使用者要求的條碼寬度。修正為 visible/empty/missing/ambiguous 一律禁止 raster width fitting；只有明確 None 才可進入。隱藏失敗但 rollback 成功時，仍做一次不使用 raster 的 Index XML 能力探測並恢復，再繼續 Height/SaveAs/reopen。不得以它宣稱寬度成立。
2. **缺少節點誤記 None**：原來 NO_HUMAN_READABLE_NODE 回傳 finalVisibility=None，與 getter 的 UNKNOWN 不一致。現在回報 UNKNOWN；不新增猜測節點。
3. **Hide rollback 不完整**：原来只核對 effective Value，沒有核對完整 XML；rollback 失敗也繼續測尺寸。現在先保存 baseline、驗證修改前後主來源及 effective payload；來源 ID/attributes/subtree 不得被 hide 改變。rollback 比較完整 XML 樹（忽略格式空白與屬性順序，保留值、結構、其他屬性）；失敗只隔離 Code128，不阻止其它物件。
4. **中途錯誤仍保留最佳值**：原 experiment catch/no-op 可能套回中途 best，且仍產生 inkTargetErrorMm。现在只有完整成功且最終回讀/可信 raster 重複性成立才保留 best；例外、no-op、DPI mismatch、caption 再出現都恢復 baseline，清空目標誤差。最終驗證失敗也嘗試 baseline rollback；rollback 無法確認則不繼續認可 Code128。
5. **每次探測與最終狀態驗證不足**：新增每次主來源不變、HumanReadable=None、payload 及 XDimension 回讀；保留 baseline/request/readback/final XML。最終 selected XML 必須與已觀測 sample 相同，ink dimensions 差異至多 1 pixel。沒有把 Index+1 當點數，也沒有 Width COM 呼叫。
6. **最終寬度使用舊量測**：原狀態依據 height/position 重設前的 experiment 誤差。現在完成 geometry 後重取 presave XML/BMP，寬度狀態只依此刻可信 ink、None 及成功 experiment。最終 DPI 不可信/匯出失敗時不得沿用舊的寬度達標狀態。
7. **Height 容差過寬**：原共用 0.85 mm，4.5 mm 目標可能接受 3.65 mm。現在另設 heightToleranceMm=0.10；width 0.85 保留為原診斷閾值，兩者均非使用者正式驗收標準。MeasurementUnits=3 開始及 reopen 都回讀；重開 Height 與實際保存值比較維持 0.02 mm。Height target 與 persistence 是不同結果，不互相冒充。
8. **Reopen challenge 隔離不足**：原一次 challenge 失敗就 break，且失敗後不一定還原 payload。改為各自捕捉，finally 嘗試還原並驗證 payload，再釋放物件。Code128 的 presave DataSources/XDimension XML 也與 reopen 比對；HumanReadable 成功隱藏者必須維持 None。
9. **測試過期**：Test-ReviewPersistence 還要求 report.output=null，但 V4 已寫 diagnostic.btw；no-component 測試只改候選路徑，實際 bundled component 會略過該設定。修正輸出存在斷言、mock insertion 失敗注入，以及 API mock 的 OrderedDictionary 形狀；增加 caption/height 重開損壞案例。
10. **回報一致性**：所有 experiment 分支預先定義 inkTargetErrorMm；Run summary 讀 optional 字段前檢查 Contains，並顯示最終 width/height 狀態。revision 更新以便辨認回傳版本。

## PowerShell 5.1 / COM 靜態複查

集合仍由呼叫端 @() 固定為陣列；XML document/COM collection 維持 unary comma；SetXML 等輸出以 [void] 抑制。新增函式只回傳指定狀態或字串，沒有把 XML mutation 節點意外輸出到 pipeline。
新增 XML comparison 和 candidate/child collections 明確處理陣列；不依賴 PSCustomObject.Count。新修改的含中文字 PS/C# 檔使用 UTF-8 BOM，JSON 以明確 UTF8 讀取。
Objects 在 InsertComponent 後重新取得；SaveAs 後釋放 Objects、關閉/釋放 Format，再 Open 並 Find 新 instance；沒有把舊 object reference 帶到重開驗證。SetXML 是否會在該 BarTender build 使同一 RCW 失效，離線不能確認，保留為實機觀察項目，不推測性重寫 COM transport。
所有新增 rollback 都讀回；若完整狀態不相同就拒絕。精確樹比較可能保守拒絕 BarTender 正規化後的等價屬性值，會保存前後 XML 供分析，不會誤報成功。
原始輸入與保存檔案 hash 保護維持不變，沒有新增列印工作或修改原始 BTW。

## 修改檔案

程式/設定/回歸：program/XmlCore.psm1、Run.ps1、core-test.json、ReviewFixtures.cs、Test-XmlCore.ps1、Test-ReviewPersistence.ps1。
文件：START_HERE.md、TECHNICAL_REVIEW.md、ONE_SHOT_V4_HANDOFF.md、program/README.md。
新增：history/ORIGINAL_V4_* 原文件、validation/final-review-offline.json、final-review-manifest.json、final-review.patch、README_FINAL.md。
其它 runtime 架構與 evidence 不改。

## 離線結果

PASS：JSON/XML 解析、內嵌 ZIP integrity、30 個 evidence byte 比對、proven component hash、UTF-8/BOM、PS lexical delimiter sanity、caption/rollback/final-state 靜態契約。精確筆數見 validation/final-review-offline.json。
PS lexical delimiter sanity **不是** PowerShell parser。
NOT RUN：PowerShell 原生 parser（任何版本）、PowerShell regression、C# compile。此環境沒有 pwsh/powershell/dotnet/csc/mcs/mono。
新增故障注入涵蓋 missing/duplicate/empty/ignored/dirty HumanReadable、Index 部分寫入後例外、caption 中途再現、最終 DPI mismatch、no-op、重開 caption/height 損壞。測試已編寫但**沒有執行**，不計為 PASS。
歷史 validation logs 不當作本次結果。

## 下一次 Windows 單次證據清單（尚未執行）

唯一入口維持 program/CORE_TEST.cmd；原始 BTW 只複製不覆寫。收集同一個 RETURN_TO_CHATGPT.zip。

- 主物件仍原生 Code128、單一 Embedded source、effective/source payload 一致。
- HumanReadable 修改前/request/readback/必要 rollback；只有 None 才允許寬度 fitting。
- baseline、最多 5 個候選 Index（排除重複/越界）、實際 XDimension 變化與可信 BMP ink width；不使用 canvas width。
- 最近觀測到的 32 mm 附近值及差距；不保證離散可達尺寸恰為 32 mm。
- Height 4.5 mm 寫入/readback，報實際值與 0.10 mm 診斷容差。
- SaveAs/Close/Reopen 後 Type、root、DataSources XML、payload、Height、XDimension XML、HumanReadable、可信 raster repeatability。
- 再寫第二組 Code128 payload、確認其它測試物件不受影響，再 finally 還原；原始及保存檔案 hash 不變。
- 若 hide 不支援：寬度明確 NOT RUN；Height、payload、持久化仍可收集。若 rollback 不可靠：隔離該 Code128，保留失敗證據。

## 仍 NOT RUN / NOT VERIFIED

Windows 5.1 parser/行為、C# 在 Windows 編譯、BarTender 新 Code128 hide/XDimension/width/height/persistence/re-edit 路徑；Designer 視覺、真正 decoder symbol bounds、quiet zone、列印和掃碼。
None 只能排除 HumanReadable caption；ink 仍不是 decoder-confirmed bars，可能含其他裝飾。因此最終包不宣稱「32 mm 條碼本體已實機 PASS」。
