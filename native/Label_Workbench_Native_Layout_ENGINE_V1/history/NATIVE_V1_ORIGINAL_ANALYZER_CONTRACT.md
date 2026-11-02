# Label Workbench → Native Layout Engine contract

此層不重做 OCR / 網站 UI。上游只需要輸出 `lwb-native-layout-v1` JSON，Windows + BarTender 端負責建立原生可編輯 BTW。

## 支援物件

- `text`：單行原生 Text；value、X/Y、rotation、fontSizePt、fontName。
- `code128`：原生 Code 128 component；EmbeddedDataSource；built-in HumanReadable 固定隱藏。若圖片上有條碼下方文字，請由上游額外輸出一個 `text` 物件，避免 caption 影響尺寸與版面。
- `datamatrix`：原生 Data Matrix component；EmbeddedDataSource；以 square `sizeMm` 表示目標。

## 尺寸政策

Code128 / Data Matrix 不把圖片像素寬度強迫成不可能的實體尺寸。引擎用 BarTender 可接受的 XDimension 候選做有限次實測，保留最接近目標的可信 raster ink size，並在 report 中記錄 target / actual / error。

這是「最近可列印尺寸」政策；不假設 `Index+1 = printer dots`。Raster ink 仍不是 decoder-confirmed symbol bounds。

## JSON 範例

見 `program/native-layout.sample.json`。

## 尚未納入 V1

多行段落、粗斜體、文字框寬度/自動換行、圖片物件、線條/形狀、QR、GS1、條碼 decoder 驗收、實體列印/掃碼。
