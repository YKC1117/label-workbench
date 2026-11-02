# Label Workbench Native Layout Engine V1 — 第二次交叉複查

日期：2026-10-05

## 本輪結論

這一輪沒有改動 NativeLayoutEngine 的 BarTender 核心演算法，避免在沒有 Windows + BarTender 實機證據時引入新的 COM 風險。

本輪確認上一版集中修正確實存在，並補強「實機前置驗證」：

1. `SELF_CHECK_NATIVE.ps1` 現在會在啟動 BarTender 前，實際呼叫：
   - `Test-NativeLayoutEngine.ps1`
   - `Test-NativePersistence.ps1`
2. 因此下一次只要執行 `BUILD_NATIVE.cmd`，會先跑 parser / C# Add-Type / 輸入 regression / 14 種 native multi-object mock；任何一項失敗都不應進入 BarTender Automation。
3. `Test-NativePersistence.ps1` 的 Data Matrix mock resolver 改成 module script scope，避免 override 只存在子 scope 而意外碰 Windows Registry / 真實 BarTender 元件目錄。
4. fault case 額外確認不能殘留未隔離的 `candidate.unverified.btw`。

## 本環境實際執行結果

已執行並 PASS：

- 所有 JSON 解析
- 所有 XML 解析
- ZIP / nested ZIP integrity + 內嵌 JSON/XML 解析
- `proven-code128.btc` SHA-256
- 2 Text + 2 Code128 + 2 Data Matrix 六物件 sample 契約
- 14 種 mock fault scenario 宣告完整性
- preflight 已接上 persistence regression
- mock Data Matrix resolver module-scope override 靜態確認
- failed candidate fail-closed 靜態確認
- stale latest output / publication guard 靜態確認
- candidate 只有在 reopen + second edit 後才 promotion 的順序確認
- source ID isolation / DPI trust guard 靜態確認
- Native engine 沒有直接用 barcode `Width` setter
- 非 ASCII PowerShell UTF-8 BOM
- PowerShell delimiter/string 輕量 lexical sanity

完整機器產生報告：`validation/general-gpt-cross-review.json`

## 本環境仍 NOT RUN

目前 Linux 容器沒有 `pwsh` / `powershell` / `dotnet` / `csc` / `mcs`，因此以下不能冒稱 PASS：

- PowerShell native parser 真實執行
- C# `Add-Type` compiler 真實執行
- `Test-NativeLayoutEngine.ps1` 真實執行
- `Test-NativePersistence.ps1` 14 mocks 真實執行
- Windows PowerShell 5.1
- BarTender COM
- fresh blank BTW 多物件建立
- SaveAs -> Close -> Reopen -> second edit 真實 BarTender persistence
- 視覺 anchor / OCR 左上角座標映射
- decoder / 實體列印 / 掃碼驗收

這些 NOT RUN 不代表 FAIL；下一次 Windows 單次測試的 `BUILD_NATIVE.cmd` 已被改成先跑上述可離線驗證，再通過後才啟動 BarTender。

## 仍保留的產品邊界

- X/Y 現在仍是 BarTender native reference-point coordinates；不能直接說等同 OCR 圖片左上角座標。
- Code128 / Data Matrix 尺寸仍是有限候選中的可信近似值，不是已證明可任意寫入的 XDimension，也不是全域最佳列印尺寸。
- 成功狀態仍只應稱 `NATIVE_LAYOUT_CANDIDATE_REOPEN_OK`，不是「任意圖片/PDF完整還原產品 PASS」。

## 下一步

若要做下一次實機，只做一次：

`program\BUILD_NATIVE.cmd`

使用：

`program\native-layout.multi.sample.json`

回傳：

`program\NATIVE_BUILD_RESULT.zip`

不要另外跑舊 ONE_SHOT / CORE_TEST 來取代這條新架構驗證。


## Windows PowerShell 5.1 compatibility hotfix

- Test-NativePersistence.ps1 now explicitly references the installed `System.Xml` assembly by `[System.Xml.XmlDocument].Assembly.Location` when compiling `NativeReviewFixtures.cs`.
- This fixes the observed preflight error: namespace `System.Xml` not found.
- No BarTender production-engine logic was changed by this hotfix.
