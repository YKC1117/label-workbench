# BTC Canonical Renderer core

本輪基準 experiment/com-renderer-prototype 的 22ef92e45095b2269e598c749034c1d1d3f9c303。Create 與 InsertComponent 的存在、Code128 BTC 的首次成功插入已由 repository 的 installed-api.json 及歷史 Windows evidence 證實。保留 Create(5) 建立 Text；Barcodes 以 BTC 插入，沒有使用 Create(4) 猜測 symbology。

## 已完成的資料路徑

fixture.json 的 Quick Analysis 形狀輸入 → layout.cjs → lwb-canonical-v1 → renderer/prepare.cjs。資料模型的 label 保存 widthMm/heightMm/dpi，各物件統一 mm，rotation 是畫面順時針角度，xMm/yMm 是未旋轉物件左上；旋轉中心也在該點。text 包含字體／點數／粗斜體／對齊／換行／printable，barcode1d 包含 module、barHeight、HRI、quietZone，barcode2d 包含 rows/columns、module、GS1。image、line、box 可在模型表示與 SVG 預覽；目前原生 adapter 明確拒絕這些未認證類型。

renderer/geometry.cjs 統一座標轉換、旋轉 AABB、anchors、交集及越界。renderer/barcode.cjs 使用鎖定 bwip-js 4.8.0 的 raw encoder 計算 footprint；Code128 會實際選擇編碼，沒有 payload 字數猜寬；Data Matrix 的列／行由 encoder 提供。詳見 third_party/zplab/NOTICE.md 及 MIT LICENSE。

兩份 Renderer 輸出是 preview.svg/preview.json 與 BarTender whole-format BMP/per-object BMP。Windows runner 自動生成 renderer-request.json，原型仍可經 PROBE.cmd 進入。依賴先由工程 runner 執行 npm ci。canonical Core 只做來源框與實際標籤尺寸轉換，字體、module profile 必須提供，未新增 OCR 或網頁 UI。

## BTC 原生路徑

Code128 固定使用 program/proven-code128.btc，驗 SHA-256 0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2。Data Matrix 只允許已註冊 BarTender 安裝目錄下 Barcodes/Common Bar Codes/Data Matrix.btc，缺少即發出能力不足，已移除遞迴／多候選掃描。兩者插入均沿用既有 exact-one object delta、Type/XML root、單一 EmbeddedDataSource、無 transform、payload isolation 及儲存重開檢查。

moduleIndex 與 moduleMm 成對指定，以實際讀回的 Mils × 0.0254 驗證印表機量化。Code128 的 barHeightMm 轉為 COM Height，Data Matrix 不寫任意 Width/Height。模組、符號 footprint 及來源目標框是不同欄位，渲染差異由 QA 揭露，不修改位置去抵銷。

TopLeft ReferencePoint 寫入後 GetXML 回讀，後續字型、幾何及 Save/Reopen 的 XML 全狀態比對保護該屬性。明確的 anchor adapter 把模型原點轉到同一 TopLeft reference，0 度時偏移為 0。其他 reference point 的旋轉數學有離線測試，但因 BarTender 尚未取得旋轉時的實際語意，原生 adapter 只接受 0 度，沒有套用未驗證的偏移。

普通 Text 的 W/H 是容納框，沒有以字級反推高度，也沒有假稱 normal text 能寫兩個尺寸。FontSize 直接消費模型，粗斜體會讀回。固定框、多行、非左對齊／Paragraph／Rich Text 已有模型欄位但會被 native adapter 標 CAPABILITY_UNSUPPORTED，須有真實元件及欄位證據後才能啟用。

## 最小 Pool fallback

renderer/pool-contract.cjs 驗證 Designer 模板的 SHA、slot/name/NamedSubString 唯一性、TopLeft 與容量；這是輸入聲明加 runtime readback，不聲稱僅憑 manifest 能證明 Designer 作者。program/ObjectPool.psm1 會開啟模板，先將全部 DoNotPrint 設 true；以 SetNamedSubStringValue 設值並讀回目標與所有 peer NamedSubString 值，驗證原生 Type/XML root/單一 embedded source/無 transform；活用槽才設回可列印；Save/Reopen 比較 XML、值、具名來源及未使用槽的 DoNotPrint。與主路徑共用同一幾何與模組 setter。

Windows runner 提供 RendererMode Auto/Btc/Pool 與 PoolManifestPath。Auto 僅在 Create/InsertComponent／元件能力失敗且提供 pool 時重試，保留 btc-attempt-report.json；幾何超差、模組不符或 visual QA 失敗不自動降級。Pool 模式需 canonical 輸入產生的 renderer-request.json。pool.example.json 是四個槽的合約範例，沒有偽造 Designer BTW。本 repository 尚無符合此 NamedSubString + TopLeft 契約的已認證實體模板，因此實際 fallback 執行仍為 NOT RUN。現有最小 fallback 僅涵蓋普通文字、Code128、Data Matrix，不會宣稱固定框／Rich Text 已支援。

## Visual QA 範圍與允差

probe-render.cjs 使用單物件 BMP 的唯一像素註冊在整頁定位；無解、重複圖樣、頁面尺度錯誤或缺物件都阻擋。原稿 canonical 與保存的 preview.json 會重新計算比對來源，避免換用過期預覽。

renderer/visual-qa.cjs 輸出 center X/Y、width/height、rotation API 差、越界、各 pair overlap，以及 barcode footprint。允差 center/size/edge 各 0.5 mm，角度讀回 0.1 度，新增重疊面積 0.25 mm²。Barcode 用獨立 encoder 的 symbol ink footprint；普通文字用左側位置與容納框，字型 ink 無法等同整框，center/size 差仍保留作診斷。預覽有 caption 但無認證 HRI 高度時記 DIAGNOSTIC_ONLY，不能通過原生入口。rotation 是 COM readback，尚無獨立光學角度估計；整體輸出只可標 PASS_PLACEMENT_AND_SIZE，productAcceptance 固定 NOT_RUN。

## 證據及交接

btc-core-evidence/ 含四物件 canonical、renderer request、真正 encoder 生成的 SVG、預覽 footprint、offline-report.json。13 項離線 regression、10 項 syntax PASS；包含 canonical round-trip、203/300/600 dpi 邊界、旋轉/anchor、數字 Code128 編碼縮短、Data Matrix dimensions、synthetic BMP 到 CLI、位移/尺寸/角度/overlap/越界/缺 readback/重複圖樣/頁面尺度/preview provenance、pool SHA/alias/容量反例。synthetic pool bytes 明確只在臨時目錄測契約，沒有當成真實 BTW。

本輪主機 Linux，Windows PowerShell 5.1 / BarTender 2022 runtime / COM / 真實 BMP / 生成 BTW / designer pool 驗證全部 NOT RUN。第一個工程端實際工作是用同分支 npm ci 後在具授權的 BarTender Windows runner 跑四物件 PROBE，取得第一次真實 ReferencePoint、字型、條高／module 及整頁對照。依第一個 capability/readback failure 修正。未有這批真實證據前，網站正式整合仍未達條件。
