# Label Workbench｜標籤製作工作台

獨立於「維修工程師版」的標籤案件工作台，專門處理客戶原稿、條碼規則、BarTender 製作前置整理與案件追蹤。

## 核心定位

Label Workbench **不取代 BarTender**。

工作流程：

1. 客戶提供圖片 / PDF / Excel / Word / CSV / BarTender `.btw`
2. 在手機、平板、家裡電腦或公司電腦先整理需求
3. 確認標籤尺寸、印表機、DPI、固定/變動欄位、條碼種類與編碼規則
4. 整理缺少資料與客戶待確認事項
5. 回公司使用 BarTender 正式製作
6. 實機列印、掃描驗證、完成案件

## 已確認的 BarTender 環境

- BarTender Designer for Argox 2022 R2
- 版本 11.3 / 64-bit
- UltraLite 授權
- Windows 11

目前以「專業前置工作台 + BarTender 製作包」為主。若未來公司升級到支援正式自動化的 BarTender 授權，系統架構會保留 Connector / API 串接能力。

## 支援的客戶原稿

- JPG / JPEG / PNG / WEBP
- PDF
- Excel：XLS / XLSX
- Word：DOC / DOCX
- CSV
- BarTender：BTW

## 條碼原則

常用條碼優先：Code 39、Code 128、QR Code、Data Matrix、GS1-128、GS1 DataMatrix。

「實際編碼內容」與「人眼可讀顯示文字」必須分開管理。正式條碼不得使用生成式圖片重畫，最終 BarTender 版本必須使用真正的條碼物件並經實機掃描確認。

## 客戶資料與 GitHub

程式碼可以放 GitHub，但客戶原稿、內部料號、訂單、Excel、PDF、BTW 等資料**不提交到 Repository**。

## v0.3 已完成

- 正式拆分 `index.html`、`assets/app.css`、`assets/app.js`
- 新增 / 編輯標籤案件
- 客戶名稱、標籤名稱、尺寸、品牌、型號、DPI、列印方式、紙材、資料來源、需求與備註
- 案件狀態：新案件 → 待客戶確認 → 資料齊全 → 待 BarTender → 測試中 → 完成
- 案件搜尋與狀態篩選
- 儀表板案件統計
- 附件檔名 / 格式 / 大小 metadata 記錄
- `.labelcase` 單案匯出 / 匯入
- 手機 / 平板響應式操作
- 案件暫存在目前瀏覽器的 `localStorage`

## 下一個架構決策點

目前案件只存在「當前裝置」。若要達成公司電腦、家裡電腦、手機、平板都能接續同一案件，下一階段需要先決定跨裝置同步方式，再繼續做附件管理、原稿解析與 BarTender 製作包。
