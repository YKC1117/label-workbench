# Label Workbench Native Layout Engine V1

這一包不是再做單點 BarTender POC，而是把已取得的 V4 FINAL 實機能力收斂成「原生 BTW 生成核心」候選。

## 這次真正往產品前進的地方

輸入不再是假設已有客戶 BTW donor。新路徑設計為：

`normalized layout JSON -> Formats.Add() 新空白 BarTender 文件 -> 建立原生 Text / 插入原生 Code128 / 插入原生 Data Matrix -> 設定內容/位置/尺寸 -> SaveAs BTW -> Close/Reopen 驗證`

也就是網站/OCR 只需要輸出標準化版面 JSON；Windows + BarTender 端負責產生原生可編輯 BTW。

## 已由 V4 FINAL 真實 Windows 證據確認，可直接沿用、不重測研究

- 原生乾淨 Code128 component 可 InsertComponent。
- Code128 單一 EmbeddedDataSource，payload 可寫入/回讀。
- Code128 HumanReadable 可設為 None。
- Code128 Height 4.5 mm 可寫入、保存、重開。
- Code128 XDimension 會產生可信 raster ink 寬度反應；32 mm 可能因離散 XDimension 無法精準到達，因此產品規則改為「最近可列印尺寸」。
- Data Matrix payload / XDimension / 約 12 x 12 mm raster / SaveAs / reopen / 再次修改已實機通過。
- Text 內容 / X / Y / FontSize / SaveAs / reopen 已實機通過。

最新真實證據已新增：`evidence/latest-v4-final-real-result.zip`。

## 新增的產品核心（尚未 Windows 實機執行）

- `program/NativeLayoutEngine.psm1`
- `program/Build-NativeLayout.ps1`
- `program/BUILD_NATIVE.cmd`
- `program/SELF_CHECK_NATIVE.ps1`
- `program/native-layout.sample.json`
- `program/Test-NativeLayoutEngine.ps1`
- `ANALYZER_CONTRACT.md`

### V1 原生建立策略

- 文件：BarTender `Formats.Add()` 建立新文件，不再依賴客戶 BTW donor。
- Text：`DesignObjects.Create(5)`，之後必須實際 readback Type=5、XML root=`Text`、單一 EmbeddedDataSource 才接受。
- Code128：沿用已實機證明的 bundled `proven-code128.btc`。
- Data Matrix：只尋找安裝目錄標準 `Common Bar Codes/Data Matrix.btc`，插入後必須驗證 root=`BarCode-DataMatrix`、單一 EmbeddedDataSource、無 transforms。不是 mass scan。
- Code128 built-in HumanReadable 固定隱藏。若原圖需要條碼下方可讀文字，上游另外產生 Text 物件，讓尺寸與字型可分開控制。
- Code128 / Data Matrix 寬度採「最近可信 XDimension raster size」，不要求不可達的精準像素尺寸。

## 目前不要叫使用者測

本環境沒有 Windows PowerShell / BarTender，因此新路徑的以下關鍵點仍是 NOT RUN：

1. `Formats.Add()` 新空白文件在使用者 BarTender 2022 R2 實機。
2. `DesignObjects.Create(5)` 是否在該 build 產生乾淨單行 Text。
3. 標準 `Data Matrix.btc` 在該機器插入後是否符合乾淨單 Embedded source 契約。
4. 多個 Text / Code128 / Data Matrix 連續建立與 SaveAs/reopen。
5. 新文件 PageSetup 與 active printer 對 barcode quantization 的實際影響。

在下一次 Windows 測試前，建議先做一次 Codex/深度 code review，集中檢查 PowerShell 5.1、COM collection refresh、Formats.Add/Create/InsertComponent 的生命週期，以及 multi-object persistence。不要讓使用者現在直接測。
