基準 main aff1168bdb93976e43ae2c859b22b5b96bf37767。修改前檢查結果

1. barcode-reader-core.scale 在倍率 <=1.05 時保留原畫布，scanCanvas 已附實際畫布正規化框。analysis-geometry.locateBarcodeBoxes 另以 scanScale 推算畫布。例如 3300px 原圖實際仍為 3300px，幾何層卻以 3400px 當分母。不是每張圖都會觸發。
2. btw-second-native 的 linked/free 文字路徑先避讓條碼再寫入。即使有實測 OCR 框也可能位移。round-trip 比較的是改過的位置。
3. PDF 經頁面點數與裁切比例求 mm；一般圖片在 geometry refine 沒有實體 mm。controlled donor 無實體尺寸時採 donor 尺寸。固定紙張長寬可能造成非等比變形。一般無比例尺圖片不能唯一反推實體尺寸。
4. V6 是獨立 Windows 工具，未出現在上述 main。它把 plan.xMm/yMm 直接當作 COM X/Y，重新開檔後量 per-object BMP，但未在整頁定位每個物件。Code128 寬度逼近與 DM 尺寸量測不能驗證位置，文字也沒有期望的墨跡框寬高。網站的 binary donor 與 COM 是不同路徑。
5. 未證實歷史堆疊案件是 baseline、Y 軸反向、ReferencePoint、旋轉或重新開檔造成。未觀察到該案件各階段的配對紀錄。不能根據猜測反轉 Y 或統一加偏移。

修改與限制
- 網頁沿用掃碼器的有效正規化框。controlled donor 的非語意拆分文字保留原框；拆分估算的 caption/value 仍走既有避讓。
- 快速分析完成後，每張標籤有自己的 Native 驗證 JSON 按鈕。期望墨跡框獨立於 Native 物件建立參數保留。如缺實體尺寸，要求輸入裁切後的實際寬高；無框及不支援碼制會停止。
- V6 runner 新增 review JSON 接口及整頁量測。量測只接受同方向、同像素墨跡遮罩的唯一匹配。頁面大小與指定 DPI 換算相差超過 2 px、無解、重複圖樣一律不發布最新 BTW。位置及可比較的尺寸暫定容差 1 mm；這是工程篩選值，未經使用者驗收。完整框包括 quiet zone 的原稿與不含 quiet zone 的輸出墨跡可能無法直接等價。相同局部圖樣、重疊、抗鋸齒差異可能導致無法定位。rendered rotation 未獨立解算；COM 角度差另列。
- NativeLayoutEngine.psm1 未修改。Native 建立前使用原本的尺寸、字型與物件契約。未取得實際 render，就不能證明 anchor 補償量；這版只偵測及阻擋超差，沒有自動校正 anchor。字級依來源框高估算，矩形 Data Matrix、不明物件方向及多語字型仍有限制。未修改正式網站。
- 測試結果見 REGRESSION.txt。尚未測 Windows PowerShell 5.1、BarTender 2022、瀏覽器即時 OCR、實際不同客戶原稿與可編輯性。Linux 沒有實機證據。原本歷史驗證報告只適用於各原始版本。
