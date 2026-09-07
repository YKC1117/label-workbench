# Label Workbench｜標籤製作工作台

獨立於「維修工程師版」的標籤案件工作台，專門處理客戶原稿、條碼規則、BarTender 製作前置整理與案件追蹤。

## 核心定位

Label Workbench **不取代 BarTender**。

工作流程：

1. 客戶提供圖片 / PDF / Excel / Word / CSV / BarTender `.btw`
2. 在手機、平板、家裡電腦或公司電腦先整理需求
3. 確認標籤尺寸、印表機、DPI、固定 / 變動欄位、條碼種類與編碼規則
4. 整理缺少資料與客戶待確認事項
5. 產生 BarTender 製作包
6. 回公司使用 BarTender 正式製作
7. 實機列印、掃描驗證、完成案件

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

## v0.5 已完成

- 新增 / 編輯標籤案件
- 案件搜尋、狀態篩選與完整度評分
- 工作台「需要注意」清單
- 標籤尺寸、品牌、型號、DPI、列印方式、紙材、資料來源、需求與備註
- 條碼規則編輯器：種類、資料來源、實際資料、顯示文字、前綴 / 後綴、GS1 AI 備註
- 常用與延伸條碼種類
- 自動整理「還缺什麼資料」
- 自動產生可複製的客戶確認訊息
- BarTender 待製作佇列
- 一鍵產生可列印 / 存 PDF 的 BarTender 製作包 HTML
- `.labelcase` 單案匯出 / 匯入
- 快速分析：檔案分類、圖片像素尺寸、CSV 第一列欄位
- 手機 / 平板響應式介面
- 案件暫存在目前瀏覽器的 `localStorage`

## QA

v0.5 上線前已做：

- JavaScript `node --check` 語法檢查
- HTML ID 與 JavaScript `getElementById` 對應檢查
- 純邏輯測試：檔案分類、案件完整度、客戶訊息、CSV 引號欄位解析、BarTender 製作包內容

目前仍未宣稱完成的項目：PDF / Word / Excel 內容深度解析、圖片中的文字與條碼 AI 分析、客戶附件跨裝置保存、案件跨裝置同步、BarTender API 自動建版。

## 下一個架構決策點

要進入「公司電腦、家裡電腦、手機、平板都能自動看到同一案件」以及真正的 AI 原稿分析，下一階段需要決定安全的雲端後端 / 同步方式。GitHub Pages 本身是靜態網站，不適合直接在前端放 API Key 或客戶機密檔案。
