# CODEX V4 FINAL — FontName Runtime 深度複查

日期：2026-10-06。基準附件：Label_Workbench_Native_Layout_ENGINE_V1_CODEX_V3_RUNTIME_FONT_FIX_V4(1).zip。

## 結論與 readiness

**READY FOR ONE-SHOT WINDOWS TEST：NO。**

本輪已完成程式深度複查、必要修正、可用的離線靜態與 XML 資料驗證；但環境沒有 PowerShell/C# 工具，無法完成修改後程式的 parser、compile、regression 執行。因此交付的是單一最終複查候選，不能保證下一次 preflight 已無執行期錯誤。本轮不要求使用者測試。

使用者回報 V3 已進入 BarTender Runtime 並遭遇 `COM FontName(System.String) failed`；此包沒有該次 Runtime 的完整回傳 ZIP 或新建 Text 初始 XML。這項進度視為使用者回報，不虛構 HRESULT、失敗字型名稱或根因。原始 evidence 均保留，既有 V4 existing-BTW PASS 不擴張為本輪新 Text fallback PASS。

## 找到並修正的問題

1. V4 在 COM FontName setter 失敗後才保存 XML baseline。例外不保證沒有副作用；新版本在任何寫入前保存完整 XML、effective payload、Object Name/Type、FontName、FontSize、X/Y/Rotation。
2. V4 只有 SetXML 正常返回後才設 xmlApplied=true；若先修改後拋錯，不會回滾。現在 mutationAttempted 在呼叫前設定，任何後續失敗都嘗試還原原 baseline。
3. V4 回滾例外被吞掉，也沒有回讀。現在完整 canonical XML、payload、字型和幾何回讀確認；回滾失敗明確記 ROLLBACK_FAILED 並阻止成功輸出。
4. V4 只比對 payload 和 EmbeddedDataSource ID，可能漏掉 Object ID、Name、Position、其他 source 屬性與必要節點變動。現在 request 由原始 GetXML 複製，只改既有直接 Font/@FontName；request 自我比對及回讀均核對完整 XML。
5. V4 fallback 只看 COM FontName readback，未驗證 XML FontName；也未在 FontSize/X/Y/Rotation 寫完後重新確認字型。現在 COM/XML 雙重回讀，加上 geometry 完成與 presave 的 requested-font guard。
6. V4 mock 雖強制一個不同字型，健康案例沒有明確斷言 fallback 路徑。保留 14 組及精確負向錯誤檢查，加入 COM setter / XML 字型變更次數與 writeMode 斷言，並新增 22 個針對字型的案例。
7. 新增 baseline、request、COM 失敗後 XML、成功 readback、失敗狀態、回滾 XML、transaction JSON；失敗實際字型未知時不再記成 baseline 字型。原 V4 ComBridge 的 inner exception/HRESULT 記錄原樣保留。

## 八項審查回答

| 問題 | 結論 |
|---|---|
| 1. Font XML 方法是否安全 | 既有實機 XML 有直接 Font/@FontName；TypeLib 有 GetXML/SetXML。不等於新建 Text 的 XML schema 與 SetXML 原子性已受官方保證。此路徑仍須 Runtime 驗證。 |
| 2. 是否覆蓋必要節點/ID/Position | SetXML 傳回整個物件 XML，可能影響完整狀態。修正版使用寫入前的原物件完整 XML，保留所有節點，回讀完整比對；不使用手工最小 Text XML 重建。 |
| 3. 是否只改 FontName | request 僅修改一個既有直接 Font/@FontName；將它還原後須與 baseline canonical key 相同。成功回讀也只允許此變動。 |
| 4. FontSize 是否改 XML | 不改。維持現有 COM FontSize double/points setter、readback 與 reopen 比對，避免把此次阻塞擴大。 |
| 5. Create(5) 一定有 Font 嗎 | 沒有此證据。需要變更字型時，缺 Font、重複 Font 或沒有既有 FontName 屬性均在 mutation 前停止，不猜造節點。即使字型已符合而跳過寫入，final geometry 的 XML 驗證仍須通過。 |
| 6. COM 失敗會留下半套狀態嗎 | 不能假設不會。先保存 baseline；失敗後記錄狀態，若不同先還原驗證，再嘗試 XML fallback。GetXML/SetXML/rollback 任何不可信結果都不得 PASS。 |
| 7. 14 mocks 是否覆蓋呼叫 | 已強化健康案例：第一個 Text 必須恰有 1 次拒絕的 COM font setter、1 次 XML font 變更，writeMode 為 fallback；第二個已符合的 Text 不可呼叫 font setter。新增 22 font probes。全數執行 NOT RUN。 |
| 8. V3 修正是否退步 | private module wrappers、無 nested Com force import、runner module-qualified 呼叫、System.Xml 顯式參照、精確負向原因、module/cache cleanup 均保留並靜態核對。 |

## 保守比對的明確限制

成功回讀只允許 FontName 改變，未自行加入其他 XML 欄位白名單。若 BarTender 正常重算 FitWidth/FitHeight、font metrics 或重新正規化欄位，仍可能被保守拒絕；這是未有真實新 Text XML 往返證據前的限制，不能藉刪掉未知節點或放寬比對假裝成功。
回滾只能嘗試並驗證，無法保證失聯/失效 RCW 可恢復；失敗會阻止候選發布，由既有 new-document cleanup 關閉文件。

## 測試與證據

原 14 組：none、wrong-create、duplicate-name、duplicate-source、partial-insert、peer-payload、noop-index、bad-dpi、reopen-type、reopen-payload、reopen-nan、reopen-printer、reopen-margin、reopen-dpi。

新增 22 組：already-matched、com-success、xml-success、com-noop、com-partial、missing-font、duplicate-font、missing-attribute、xml-noop、xml-partial、xml-position、xml-name、xml-id、xml-payload、xml-source、xml-source-attribute、xml-fontsize、xml-font-readback、xml-other-node、xml-fit-bounds、rollback-failure、geometry-font-reset。

FontProbe 以附件既有實機 Text XML 為輸入資料，用 managed fixture 注入錯誤，不是模擬已證實的 BarTender 行為。它不證明 real RCW、printer font、字型可用性或版面視覺相容。兩組測試都連入 SELF_CHECK_NATIVE；新增結果檔 native-font-results.json，仍保留 native-mock-results.json。套件的正式入口及輸入 sample 不變。

實際完成：25 項靜態/資料檢查，61 份既有 JSON、155 份 XML、7 個內嵌 ZIP；20 份 PowerShell 和 5 份 C# lexical sanity；18 份 Text XML 的 FontName 單一屬性 Python 資料實驗；33 份 evidence 與 BTC byte/hash 保留。詳見 validation/codex-v4-final-offline.json。

**NOT RUN：PowerShell 原生 parser、C# compile、input regression、22 font cases、14 multi-object cases、Windows PowerShell 5.1 session-state/RCW、BarTender 2022 新 Text fallback/Save-Close-Reopen、列印/掃碼。**
Lexical sanity 和 Python XML 實驗不是 PowerShell parser、regression、SetXML 或編譯執行。

## 官方文件查核

- https://help.seagullscientific.com/12.0/en/Subsystems/ActiveX/Content/FontName_Property.htm ：官方 ActiveX 文件列明 FontName 可讀寫，適用文字/條碼。此頁版本路徑 12.0，不冒充 BarTender 2022 實測。
- https://help.seagullscientific.com/12.0/en/Subsystems/ActiveX/Content/FontSize_Property.htm ：官方 ActiveX 文件列明 FontSize 使用 points。
- 本輪無法取得 /2022/en/Subsystems/ActiveX 下相應頁面；未找到能證實新建 Text 的完整 SetXML schema/原子性/Font 必存在的官方保證。不能將 BTXML print script 文件當作 DesignObject.SetXML schema。
- 附件 evidence/installed-api.json 才是本機版本方法/參數的依據；已核對 FontName GET/PUT、FontSize GET/PUT、GetXML、SetXML 六個簽章。

## 範圍

沒有 GitHub/commit/push/PR/deploy，沒有 OCR/UI/BTW binary reverse engineering，也未重做已 PASS 的條碼路徑。
新包不重新要求使用者測試；先進行交叉複查。本次交付唯一檔名為 Label_Workbench_Native_Layout_ENGINE_V1_CODEX_V4_FINAL.zip。
所有舊 validation/manifest/PASS 文檔均屬各自歷史版本；本次以 CODEX_V4_FINAL_REVIEW.md 和 codex-v4-final-* 為準。
