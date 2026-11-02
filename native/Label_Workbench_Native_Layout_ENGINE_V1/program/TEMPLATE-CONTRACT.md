# 乾淨範本規格（開發端準備，使用者只執行測試）

目前沒有可交付且已驗證的 clean_template.btw。不可改副檔名、生成假 binary 或沿用 donor patch 冒充。

在 BarTender 2022 Designer 用原生介面建立並儲存一次：

- 140×38 mm，單頁單張，0 邊距，沒有裁切／旋轉／鏡射；使用已安装且可用的印表機驅動。
- 單一模板、沒有群組或子模板；所有物件 anchor 都是左上角，旋轉 0°。
- `TEXT_01`：Normal 一般單行文字，TrueType 字型，关闭 Auto Fit，不使用段落或富文字。唯一 Embedded Data source 命名 `TEXT_01`，沒有轉換、VBScript、序列化、資料庫或提示輸入。
- `C128_01`：原生 Code128，關閉 human readable（高度容易混淆），唯一 Embedded Data source 命名 `C128_01`。不要使用 GS1-128 代替。
- `DM_01`：原生 Data Matrix ECC200，關閉 human readable，唯一 Embedded Data source 命名 `DM_01`。
- 可增加 `TEXT_02` 作為未使用物件抑制驗證。不可讓不同物件共用資料來源。
- 物件名称與資料來源名稱是兩個不同設定，必須分別命名。Code128／DM 的初始尺寸只是範本固定值，不是本次已控制尺寸。
- 儲存為本目錄的 `clean_template.btw`，重新開啟檢查並留下截圖／版本／授權資訊。

實機驗收：跑 supported subset，開 output.btw，确认三个原生物件内容正确，可個別編輯，位置以左上角為準，字級5pt、Code128條高4mm；第二文字被抑制。再換另一份 payload/位置/字級 JSON 驗證不是寫死案例。完整驗收還必須補齊條碼尺寸 API、數值回讀與視覺／掃碼檢查。API 回讀不能證明 anchor、barcode symbology、碰撞／越界或 native 物件類型都正確。
