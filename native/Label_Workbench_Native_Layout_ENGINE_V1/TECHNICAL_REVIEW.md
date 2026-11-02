> 本文保留前一輪紀錄；本次權威結論與修正請讀 CODEX_V4_FINAL_REVIEW.md。READY 狀態為 NO，新增程式未執行驗證。

# Native Layout Engine V1 — Codex 最終複查

日期：2026-10-05。原始 V1 不建議直接測；本包為集中修正版，等待第二次交叉檢查。
**本環境仍沒有 PowerShell/C# compiler/Windows/BarTender。原生 parser、regression、compile 全部 NOT RUN。不能把本包称为全部離線測試已通過。**

## 範圍與證據

完整解壓並閱讀 CODEX_REVIEW_HANDOFF、入口/產品化/分析契約、NativeLayoutEngine、Build、SELF_CHECK、輸入測試與雙份 sample；檢查相依 ComBridge/Com/Raster/Watchdog；解壓 latest-v4-final-real-result.zip 並核對實機報告、XML。JSON/XML 與內嵌 ZIP 全部解析。
V4 真實 Text/Code128/Data Matrix PASS 直接承接，不重新研究 existing-BTW POC。本次沒有 GitHub、OCR/UI、BTW binary 操作。
原始 evidence/ 33 個檔案逐一 byte-identical。Code128 .btc hash 不變。

## A. 原始 V1 是否值得實機測

不建議。至少有確定的 cleanup 函式缺失、stale latest 輸出、尺寸前位置 gate、最終 DPI 信任缺口，以及無法證明多物件 isolation 的缺陷，會浪費使用者一次測試。
本修正版只具備靜態檢查證據；第二次交叉檢查及可用環境下的執行驗證尚待完成，本次不要求使用者測試。

## B. 實際問題與修正

1. **未定義 cleanup**：Build-NativeLayout 呼叫 Release-Com，但 Com.psm1 沒有定義/匯出它。finally 可因此拋例外，阻止後續 Quit。新增 runner 自有 cleanup，逐步捕捉並保存清理錯誤；只操作可確認新建的 BarTend process。
2. **失敗仍看到舊成功檔**：原版 preflight、選檔和早期錯誤不一定打包，也不移除 LATEST_NATIVE_OUTPUT/REPORT。現在選檔/preflight/core 共用同一 try/finally，先清理固定 generated latest aliases（歷史 run 資料夾保留）；各種早期失敗保留 error/runtime/preflight evidence。
3. **未驗證候選檔命名誤導**：原 SaveAs 立即命名 native-output.btw，重開失敗仍保留。現在先 candidate.unverified.btw，所有重開及再編輯檢查完成後才改名 native-output.btw。失敗在文件關閉後改成 FAILED_UNVERIFIED，report.output=null；不發佈 latest BTW。
4. **CMD 尾斜線**：原 -BaseDirectory "%~dp0" 會把以反斜線結尾的路徑交给 native argv quoting；改成 "%~dp0."。Preflight 移入 worker，失敗也進同一 evidence ZIP。
5. **尺寸前位置 gate 回歸**：原 Code128 先完整 Set-NativeGeometry，元件尚未縮小就可能因 X/Y clamp 而 fail。改為先 Rotation=0/Height，再做尺寸，最後才套 rotation/X/Y。Text 先字型/字級，再 rotation/位置，且全部 setter 完成後才整組 readback，避免後設屬性改變先驗證的值。
6. **旋轉污染 sizing**：原 Code128 先旋轉後用水平 ink width 配目標條寬，90° 時可量成高度。尺寸探測一律在 0°；完成後才旋轉，presave/reopen raster 比較的是最終方向。report.sizing 保留未旋轉的尺寸依據；旋轉後 ink bounds 不是條碼 local width。
7. **no-op 也選 nearest**：原完全沒有效 setter/raster response，仍把 baseline 當成功最佳尺寸。現在至少需要 Index+numeric XDimension+ink 反應；候選皆無效就 fail。只稱 BEST_OF_BOUNDED_SAMPLES，不保證全域最接近。
8. **最終 DPI 信任缺口**：原 fitting 的 DPI 可信，但 presave 可能不可信，reopen 只比較信任狀態相同，因此兩個 UNTRUSTED 也能通過。現在 selected、presave、reopen 各自必須 TRUSTED，並比對 ink repeatability；finite/NaN/Infinity 也直接拒絕。
9. **Caption/source/rollback 缺口**：Data Matrix 原來沒 gate caption；現在兩種條碼都要既有 HumanReadable 節點明確 None 才能 sizing。Hide、Index 寫入均驗 payload/source，保存 baseline/request/readback/selected；失敗嘗試完整 XML rollback 並回讀。無法隱藏或還原即整份新文件失敗，不產成功檔。
10. **多物件 source isolation**：新增主來源 ID 非空、不共享、拒絕 shared-source sentinel 異常；payload import 前後核對所有 peer XML，不能只驗當前物件。重複 Insert 後確認名稱不空不重複、所有舊名仍在，Create 回傳名必須就是唯一新名。
11. **[ref] stale 失敗路徑**：釋放 Objects 前先將呼叫端 ref 清成 null，再重取新集合並回填，避免重新取得失敗時留下已釋放 wrapper。正常 Create/Insert 都重新 Find；SaveAs/Close/Open 后使用全新文件/Objects/物件 references。
12. **重開不足**：原沒核對 native Type/來源 identity/完整 printer/page state，也沒做新文件多物件再次修改。新增 Type、canonical XML、完整名稱集合、printer、paper/label dimensions、margins/grid、payload、幾何/字型/高度/尺寸/可信 raster 核對；每個物件再寫第二 payload、檢查 peers、finally 還原並核對保存 XML。挑戰不另存，BTW hash 必須不變。
13. **輸入契約**：原 case-insensitive type/ID 驗證可容納不同大小寫，Windows 檔名又不區分大小寫；還有未知 top-level fields、numeric fontName、multiline text、互相矛盾的 Data Matrix size fields。改為嚴格型別/大小寫/唯一 ID、單行文字、數值有限及明確欄位集合；singleton array 有測試。
14. **Preflight 與執行上限**：API evidence 同時驗參數與 return signature，解析新 scripts、檢查三物件/六物件輸入。沿用 owned-process Watchdog，加 optional native result filename（舊 CORE_TEST 預設不變）。取得新的 BarTend PID 後，120 秒無進度/600 秒總上限會收集 timeout evidence；COM activation 之前無法確認 process ownership，因此 activation 本身尚無 watchdog 保證。

## C. 修改與新增檔案

修改 program/NativeLayoutEngine.psm1、Build-NativeLayout.ps1、BUILD_NATIVE.cmd、SELF_CHECK_NATIVE.ps1、Test-NativeLayoutEngine.ps1、Watchdog.ps1。
新增 program/NativeReviewFixtures.cs、Test-NativePersistence.ps1。
更新 START_HERE、TECHNICAL_REVIEW、PRODUCTIZATION_REVIEW、ANALYZER_CONTRACT、program/README；原文件保存在 history/NATIVE_V1_ORIGINAL_*。
本輪差異/雜湊/檢查結果在 validation/native-final.patch、native-final-manifest.json、native-final-offline.json。舊 validation 不是本輪執行結果。

## D. 離線驗證

執行 PASS：JSON/XML 解析、內嵌 ZIP integrity、33 個 evidence byte identity、Code128 component hash、TypeLib 8 組參數/return signatures、UTF-8 BOM、PS/C# lexical structure、caption/DPI/no-op/發佈順序/[ref]/變數範圍等静態檢查。精確數量見 native-final-offline.json。
**PS lexical check 不是 PowerShell parser；C# lexical check 不是 compiler。**
NOT RUN：PowerShell parser、SELF_CHECK_NATIVE、Test-NativeLayoutEngine、Test-NativePersistence、C# compile。工具探測 pwsh/powershell/dotnet/csc/mcs/mono 全部不存在。
14 種 multi-object mock 已編寫：健康六物件、錯 Create type、重名、共享 source、部分插入後 exception、peer payload 污染、no-op XDimension、壞 DPI，以及 reopen type/payload/NaN/printer/margin/DPI 損壞。未執行，不冒稱 PASS。PageSetup indexed properties 由 fixture adapter 模擬，其餘 collection/object 經 ComBridge；mock 不證明 RCW 或 BarTender 實際行為。

## 尚未解決的產品邊界

- TypeLib 證明 Create(enum) 方法存在，但這份 metadata 沒有 enum constant table；5 的文字型別語意仍需新文件 runtime Type=5/root=Text/single literal/readback 核對，不能稱為已實機證實 fresh Text。
- XML root=Text 加單行 payload，不能證明所有字體/auto-fit/文字樣式都已符合圖片。完整視覺與排版驗收 NOT RUN。
- V4 Text 的 ReferencePoint=BottomLeft，因此不能把這次 X/Y API readback 說成上游圖片左上角定位已完成。每個新物件保存 referencePointXml（空值為未顯示預設，不能猜），report.coordinateSemantics 明確為 native reference point。沒有猜測 anchor setter。
- 這是可編輯 native generation 候選，不是任意圖片/PDF→完整還原產品。重疊、裁切、quiet zone、barcode decoder/印刷掃碼沒有通過。
- 「有限候選中最近的可信 ink size」可能仍遠離目標；report 保留 errorMm，不把它寫成準確命中目標或可列印驗收。
- 完整 XML rollback/reopen comparison 會保守拒絕 BarTender 正規化屬性的差異；保留 XML 便於定位。V4 Code128 presave/reopen canonical XML 實際相等，但不能推廣保證到新 blank format/Text/DM。

## E. 第二次交叉檢查後，下一次單次 Windows 應收集

入口 BUILD_NATIVE.cmd；使用未修改的 native-layout.multi.sample.json（2 Text＋2 Code128＋2 Data Matrix），只回傳 NATIVE_BUILD_RESULT.zip。
收集：Windows/PS/BarTender 版本；空白 Add/文字 Create 的 native XML、Type、source ID；重複 Insert 的六個唯一名稱與來源隔離；Data Matrix 元件檔/hash；generation printer/page readback；每個 barcode baseline/request/readback/selected/presave/reopen BMP/XML；實際 size/error；同一文件 SaveAs/Close/new-instance Open；六物件再次改 payload/還原/peer isolation；BTW hash；原生 ReferencePoint 與 Designer 視覺位置。
這裡是待驗證清單，**本次不要求使用者開始測試**。

## F. NOT RUN

Windows PS5.1 parser/執行、C# 編譯、Formats.Add blank format、Create(5) fresh Text、標準 Data Matrix component 新文件插入、同型元件連續插入、native COM RCW/ref refresh、page/printer constraints、六物件 save/reopen/editability、watchdog/launcher 真實 Windows 行為；視覺/anchor/decoder/實體列印與掃碼。
