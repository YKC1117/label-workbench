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

其中 XLS / XLSX、CSV、DOCX 與有文字層的 PDF 可在瀏覽器本機做前置解析；舊版 DOC、掃描型 PDF、圖片中的文字 / 條碼，以及 BTW 物件內容不做不可靠的猜測。

## 條碼原則

常用條碼優先：Code 39、Code 128、QR Code、Data Matrix、GS1-128、GS1 DataMatrix。

「實際編碼內容」與「人眼可讀顯示文字」必須分開管理。正式條碼不得使用生成式圖片重畫，最終 BarTender 版本必須使用真正的條碼物件並經實機掃描確認。

## 客戶資料與 GitHub

程式碼可以放 GitHub，但客戶原稿、內部料號、訂單、Excel、PDF、BTW 等資料**不提交到 Repository**。

跨裝置案件使用 Supabase Auth + Row Level Security；客戶附件使用 private Storage bucket。瀏覽器只放 Supabase publishable key，不放 service-role / secret key。

## v0.8 已完成

- 新增 / 編輯標籤案件
- 案件搜尋、狀態篩選與完整度評分
- 工作台「需要注意」清單
- 標籤尺寸、品牌、型號、DPI、列印方式、紙材、資料來源、需求與備註
- 條碼規則編輯器：種類、資料來源、實際資料、顯示文字、前綴 / 後綴、GS1 AI 備註
- 自動整理缺件與產生可複製的客戶確認訊息
- BarTender 待製作佇列與 BarTender 製作包 HTML
- `.labelcase` 單案匯出 / 匯入
- Supabase Email 登入與案件同步程式
- 本機優先：雲端失敗不阻斷核心案件操作
- 私人附件 Storage：單檔 20 MB，登入後可上傳 / 下載 / 移除
- 舊案件附件 metadata 可用「補上傳」重新選原檔
- 快速分析：圖片尺寸、Excel 工作表 / 欄位 / 資料預覽、CSV 欄位 / 資料預覽、DOCX 文字擷取、PDF 文字層擷取
- 掃描型 PDF / 圖片 OCR / BTW 物件不亂猜
- 手機 / 平板響應式介面

## Supabase 架構

- `public.label_cases`：每位登入使用者自己的案件 JSON
- RLS：SELECT / INSERT / UPDATE / DELETE 均限制 `auth.uid() = user_id`
- private bucket：`label-attachments`
- Storage 路徑第一層固定使用登入者 UID，Storage RLS 僅允許本人操作
- 單檔附件限制：20 MB

## QA

每次 push 到 `main` 會自動檢查：

- JavaScript 語法
- HTML ID 與 JavaScript DOM 對應
- Supabase 前端設定不得包含 privileged secret
- Supabase URL / publishable key 格式
- 本機優先同步合併邏輯
- 私人附件 metadata / 路徑規則
- CSV 引號欄位解析、檔案分類、標籤常見欄位偵測
- 案件完整度、客戶訊息、BarTender 製作包等核心邏輯

## 尚未宣稱完成

- Email Magic Link 在所有手機 / 電腦瀏覽器的實際端到端登入驗證
- 圖片 / 掃描型 PDF 的 OCR 與 AI 視覺拆版
- 圖片條碼種類與內容可靠辨識
- BTW 物件內容解析
- BarTender API 自動建版（目前 UltraLite 不適合）

下一個主要階段會是「圖片 / 掃描型 PDF 的可靠分析」，但會維持免費優先，任何需要付費 API 的方案都不會自行啟用。
