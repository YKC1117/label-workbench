# Label Workbench RC2 工程審查

基準 ZIP 已驗證 SHA-256 為 5194bca0ce4e295d4e9b61fa45b289499d99874d8c3578d71eed435da6888466。RC2 從該 ZIP 完整解壓製作。ROOT_CAUSE.md 保留 RC1 歷史紀錄。

## 決策與適用範圍

controlled donor 的 production ↔ review request parity 離線 PASS。正常 UI 先確認尺寸，安全篩選與選路後產生 BTW。planDonorEdits 集中處理 donor 配對、分割、文字位置與字型、X-dimension、停放物件及對應的具名 request。review 只消費 downloadGenerated 當次輸出的 request 與 bytes，因此 Native 不需重現 donor 的條碼高度、字型限縮、quiet zone 或編碼選擇。文字與條碼都使用實際寫入的 mil 轉為 mm。原來源框和最終 placementBox 分別保存。production 保留 donor 旋轉，rotationDeg 為 null，rotationMode 記錄 inherit-donor；沒有從二進位格式解出的角度數值。條碼高度同樣沿用 donor，已選 X-dimension 以百分之一 mil 保存；Data Matrix 的 sizing 決策就是其模組 X-dimension。Native 開啟網站產出的同一份 BTW，可以保留這些繼承值。

Native Windows runner 對 RC2 JSON 檢查 revision、物件識別及檔案雜湊，直接開啟內嵌的 production BTW。保留舊 Native 建檔工具供歷史輸入使用。RC1 review JSON 缺少身分資訊，拒絕作 RC2 驗證。其他 generator 路徑或缺乏來源框不能出具 controlled donor parity。覆蓋度、OCR 辨識正確性與紙張尺寸真實性須另外驗證。

## Render 指標政策

所有物件共用同一個頁面 mm 空間。原稿框和輸出黑色墨跡的原始 dx/dy/dw/dh 只有 DIAGNOSTIC_ONLY；缺值、未定位或不能獨立觀察的旋轉記 NOT_COMPARABLE。COM 旋轉讀值在原始 evidence 中保留。

placementX/Y 是 blocking 的 COMPARABLE 指標。對每一軸分別取兩框的中心差，扣除兩框尺寸差絕對值的一半，保留超出部分的方向。換句話說，先容許較短區間放在較長區間內的所有位置，再衡量超出範圍幾 mm。此量測只回答墨跡是否偏離來源位置包絡；兩區間同寬時等同原始 dx 或 dy。大框內的小幅位移無法辨別，不能據此宣稱 anchor 精確對齊。任何軸超過暫定 1 mm 會阻擋。原始 dw/dh 無論差距多少都不單獨阻擋。獨立的原稿 ink bounds 尚未導入，沒有針對條碼或文字套用固定補償。

找不到唯一墨跡、頁面尺度不符、缺少物件或版本/SHA 不符均不能發布實測成功結果。唯一逐像素匹配仍可能因抗鋸齒、重疊或重複圖樣而無解。Windows 上尚未確認 donor 名稱是否均能由 COM Find 對應；查找失敗會停止。

## 可重現驗證

見 REGRESSION.txt。rc2-parity.cjs 走 production safety gate、選路、正式下載、讀回 Blob、比較 SHA/bytes 與解析 BTW 原生物件。案例包含與條碼重疊且原始位置應保留的文字。三組尺寸均比對字型、字級、值、原生座標與兩種碼的 X-dimension。原有 smoke 中兩個固定 BUILD 斷言同步換成 RC2，其餘斷言保留。合成渲染測試檢查框語意、位移、歧義與頁面尺度。版本標記、loader cache key、JSON、Windows runtime 及 render report 共用 20261102-layout-rc2。

Windows PowerShell 5.1、BarTender 2022、正式瀏覽器 OCR、不同客戶原稿及旋轉可編輯性為 NOT RUN。產品驗收尚未完成。正式網站未部署。
