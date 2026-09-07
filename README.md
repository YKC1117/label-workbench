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

常用條碼優先：

- Code 39
- Code 128
- QR Code
- Data Matrix
- GS1-128
- GS1 DataMatrix

「實際編碼內容」與「人眼可讀顯示文字」必須分開管理。正式條碼不得使用生成式圖片重畫，最終 BarTender 版本必須使用真正的條碼物件並經實機掃描確認。

## 客戶資料與 GitHub

程式碼可以放 GitHub，但客戶原稿、內部料號、訂單、Excel、PDF、BTW 等資料**不提交到 Repository**。

目前網站僅在瀏覽器端讀取使用者選擇的檔案資訊；後續若加入案件同步，也會把「程式碼」與「客戶資料」分離設計。

## 目前版本

`v0.2`：建立正式 GitHub 專案骨架與第一個可操作網頁版本。

下一階段：案件資料模型、案件儲存/匯入匯出、原稿分析、缺件檢查、條碼規則編輯器、BarTender 製作包。
