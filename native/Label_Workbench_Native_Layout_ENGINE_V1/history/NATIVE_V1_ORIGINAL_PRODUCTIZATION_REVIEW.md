# Native Layout Engine V1 — 施工與技術判定

## 1. 為什麼現在可以從 POC 轉成生成核心

V4 FINAL 回傳結果已把核心能力拆清楚：Text、Data Matrix 與 Code128 的原生內容/幾何/持久化主線都已取得真實 Windows 證據。Code128 唯一沒有精準命中的 32 mm，已證明是 XDimension 離散跳級問題，而不是 payload / SaveAs / editable object 失敗。因此產品規則改為 `nearest printable layout size`，不再把不可達的精準寬度當 fatal。

## 2. 新架構

舊產品分支需要 prepared BTW + fixed slots + named data sources，不符合「任意圖片/PDF」的核心目標。

V1 改成：

1. `Formats.Add()` 建立新 BTW。
2. PageSetup 設成分析出的標籤尺寸。
3. 每個 Text 直接 Create；每個 Code128/Data Matrix 由原生 component 插入。
4. 每個物件都驗證 native type/root + single EmbeddedDataSource，才允許寫 payload。
5. 條碼尺寸使用可信 BMP header DPI + ink bounds 做有限 XDimension 搜尋。
6. SaveAs，完全關閉 COM reference，再 reopen。
7. Reopen 驗證 payload、幾何、字型/高度、XDimension、HumanReadable、raster repeatability。
8. 輸出 BTW + JSON report + evidence ZIP。

## 3. 重要產品決策

### Code128 caption

built-in HumanReadable 固定 None。圖片若有條碼下方文字，分析層輸出獨立 Text。理由：

- 可以精準控制字型/位置。
- 不讓 caption 污染 barcode ink 寬度量測。
- 與 V4 FINAL 已驗證的 Code128 sizing 路徑一致。

### Barcode width

不使用 `DesignObject.Width` 控制 Code128，也不假設 `Index+1 = printer dots`。

輸出 report 需保留：target size、selected XDimension、actual raster ink、error mm、generation printer。改印表機後 XDimension 量化可能改變，因此 printer 也是版面產生條件的一部分。

## 4. 目前程式保守失敗條件

新引擎遇到下列情況不產出「看似成功」的 BTW：

- Formats.Add 不是空白文件。
- Create(5) 不是 Text / 非單一 Embedded source。
- Data Matrix component 不是乾淨原生 DataMatrix。
- barcode payload 在 XDimension 修改期間改變。
- BMP header DPI 不可信。
- SaveAs/reopen 後 object count、payload、幾何、XDimension、raster repeatability不一致。

這些都會回傳 evidence，不會偷偷降級成錯的版面。

## 5. 尚未納入

V1 先限定原生單行 Text、Code128、Data Matrix。圖片、線條、形狀、QR/GS1、段落文字、粗斜體、文字框自動換行仍未施工。這是刻意縮小範圍，不是宣稱完整產品已完成。
