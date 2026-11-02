# Native Layout Engine V1 — 技術複查

## 本輪不是再修 V4 診斷器

V4 FINAL 的真實 Windows 結果已收斂出可產品化能力。這次新增的是「從空白 BarTender 文件直接產生原生版面」候選，目標是讓上游 OCR/版面分析只輸出標準 JSON，不再要求客戶 BTW 具備 donor/slot。

## 依據

### 真實 V4 FINAL 證據

`evidence/latest-v4-final-real-result.zip` 顯示：

- Text payload / X / Y / FontSize / SaveAs / reopen 已工作。
- Code128：乾淨 component、single EmbeddedDataSource、payload、HumanReadable=None、Height、XDimension raster 反應、SaveAs/reopen、第二次 payload 修改已工作。
- Data Matrix：single EmbeddedDataSource、payload、XDimension、約 12.192 mm raster、SaveAs/reopen、第二次 payload 修改已工作。
- Code128 32 mm 不是任意連續可達：V4 實測最近值可落在約 28.279 mm，下一個離散級距約 42.418 mm。因此產品引擎採 nearest printable policy，而不是把 32.000 mm 當必要 PASS。

### 實機 TypeLib 證據

`evidence/installed-api.json` 已包含：

- `IBtFormats.Add()`：建立新 Format。
- `IBtDesignObjects.Create(objectType)`。
- `IBtFormat.InsertComponent(path, X, Y)`。
- Export/ImportDataSourceValuesToXML。
- DesignObject GetXML / SetXML / ExportToFile。

歷史真機 component scan 也曾列出標準：

`C:\Program Files\Seagull\BarTender 2022\Barcodes\Common Bar Codes\Data Matrix.btc`

因此 V1 Data Matrix 路線不是盲猜檔名；但「在新 blank Format 上插入後仍符合乾淨 single Embedded 契約」仍需下一次 Windows 實機證明。

## 新程式路徑

### `program/NativeLayoutEngine.psm1`

核心生成器：

1. 驗證 `lwb-native-layout-v1`。
2. `Formats.Add()` 建立新文件。
3. PageSetup 設定 label size；可選 printerName，否則記錄 BarTender active printer。
4. Text：`DesignObjects.Create(5)`，只在 readback `Type=5`、XML root=`Text`、single Embedded、無 transforms 後才接受。
5. Code128：重複插入已真機證實的 bundled component；每次都做 name-delta、native root、single Embedded readback。
6. Data Matrix：只解析 exact `Common Bar Codes\Data Matrix.btc`；同樣插入後驗證 native root / single Embedded。
7. payload 用 Export/Import data-source XML 寫入，不使用唯讀 Value setter。
8. Code128 built-in HumanReadable 隱藏。
9. Code128 Height 直接用已證實 setter；Code128/DM 尺寸走有限 XDimension + trusted BMP header DPI + ink bounds，保留最近可列印尺寸。
10. 尺寸完成後重設 X/Y/rotation/height，避免 bounds 變化影響位置。
11. SaveAs -> Close/release COM -> Open -> 驗證 object count、payload、root、幾何、Font/Height、XDimension、HumanReadable、raster repeatability。
12. 產生 `native-output.btw` + report + evidence ZIP。

## 保守條件

V1 不做以下危險降級：

- 不用 DesignObject.Width 強迫 Code128。
- 不假設 XDimension Index 的 dot 語意。
- 不把 canvas width 當 symbol width。
- DPI header 不可信時不選最佳尺寸。
- Insert/Create 後沒有 exactly one new object 就 fail。
- Fresh Text / DataMatrix component 不是 single Embedded literal 就 fail。
- New Format 若不是 blank，不自動刪未知物件，直接 fail。
- Reopen 任一核心狀態不一致，build report 直接 FAILED/BLOCKED。

## 目前離線檢查

見 `validation/native-engine-v1-static.json`。

完成：

- 原 V4 package 的 30 個 evidence 檔逐一 hash，全部未改。
- 新增 V4 FINAL 真實回傳作為 evidence。
- 26 份外層 JSON 可解析、14 份 XML 可解析（封包建立前統計；最終 manifest 會再更新）。
- `proven-code128.btc` SHA256 保持 `0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2`。
- 靜態確認新路徑不呼叫 barcode Width setter。
- 靜態 delimiter/string sanity 通過。

NOT RUN：

- 新檔案 Windows PowerShell 5.1 原生 parser。
- `SELF_CHECK_NATIVE.ps1` / `Test-NativeLayoutEngine.ps1` 真實執行。
- Windows C# Add-Type。
- BarTender `Formats.Add()` blank Format。
- `Create(5)` fresh Text。
- standard Data Matrix component on blank Format。
- 多個同型物件連續 Create/Insert + SaveAs/reopen。

## 下一步建議

**目前不要讓使用者直接測。**

因為這是從「已開 existing BTW 做 POC」跨到「新空白文件、多物件生成」的重要架構變更。下一步最划算的是先交 Codex 做一次深度 code review，集中查：

- PowerShell 5.1 parser / scalar-array / `[ref]` collection refresh。
- `Formats.Add()` / `Create(5)` / repeated InsertComponent 的 COM RCW 生命週期。
- 空白 Format PageSetup 與 printer 綁定。
- 2 Text + 2 Code128 + 2 DataMatrix 的 multi-object sample 是否一次能完整 save/reopen。

Codex 只需 review/修一包，不要叫使用者測。兩邊交叉確認後，才值得請使用者做下一次「一包一次」實機驗證。
