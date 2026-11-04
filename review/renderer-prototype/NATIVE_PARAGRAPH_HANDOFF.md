# Run51 候選：Text5 原生段落契約 Probe（2026-11-04）

僅限 YKC1117/label-workbench／`experiment/com-renderer-prototype`／Draft PR #35。main、Pages、Release 未動。
施工基準 HEAD：`9d6f66357a30b6a7d3e8481923135088a021018f`（Run50 判讀修正後）。

**Run51 已實機執行：FAIL_CLOSED；見第 8 節。** 固定框、原生左／中／右對齊、自動換行、超框裁切、自動縮字：**全部 NOT CERTIFIED**。
Run45、Run49、Run50 證據與 Renderer 核心、所有 Gate 均未修改。

## 1. ROOT CAUSE REVIEW

### 1.1 為什麼至今沒有原生段落

| # | 事實 | 證據 |
|---|---|---|
| R1 | repo 內**沒有任何** Designer 製作的段落 Text5 實機 XML | 解開全部歷次實機 zip 與 Run49 封包，以 SHA-256 去重後共 75 份不同的 `<Text>` GetXML（含重複為 198 份）；欄位只有 `Name/Width/ConditionalPrintType/Position.X/Y`、偶見 `ReferencePoint`、`Rotation*`，子節點只有 `Tabs/Font/AutoFit/DataSources`；**零**個換行、段落、對齊欄位 |
| R2 | Text 根節點的 `Width="1.850 in"` 是無作用預設 | 去重後 75 份 Text、117 份 Code128、60 份 Data Matrix、5 份 Line 的 `Width` **全部**是 `1.850 in`；只有 Box、Picture 會變。統計見 `paragraph-root-cause/text-xml-census.json` |
| R3 | 沒有 typed 對齊或換行成員，也沒有公開物件 XML schema | `installed-api.json` 的 `IBtDesignObject`；官方 2022 DesignObject 頁面；社群貼文中的 BarTender 2019 Text XML 也無段落欄位 |
| R4 | 唯一「有文件、但 repo 從未實測」的槓桿是對 **Text5 寫 typed `Width`** | 官方 Width 頁：對文字物件只在格式化為段落時適用。`HybridPool.psm1` 從未寫過 Text 的 Width |
| R5 | RichText9 沒有可驗證的寫入路線 | Run50：Height、FontName、FontSize、FontBold 均被拒（`0x8000FFFF`）；Value 與匯出字面值是不透明佔位字串 `<RTF 資料>`；XML 無 DataSources。透過 DataMerge 寫入後，無法證明隱藏的 RTF 本體被精確還原 |
| R6 | 現有 multiline 是多個獨立 Text，center／right 是建立時換算座標 | `text-layout.cjs`、`HybridPool.psm1`；這兩者**不是**原生段落，本輪不改 |

### 1.2 被排除的路線與理由

- **SetXML 寫入段落、對齊或尺寸模式欄位**：這些欄位從未在實機 XML 中出現，寫入即猜測。
- **GetProperty／SetProperty 動態名稱**：名稱未知。
- **Create(5)**：已否決的路線。
- **donor binary patching、BTC 掃描**：禁止。
- **RichText9 DataMerge 寫入**：見 R5，還原無法驗證。
- **以多個 Text 模擬換行**：不是原生 Paragraph，不得宣稱。

## 2. 採用路線

**在已證實的 Designer Text pool 基底中，對真正的 Designer Text5 寫入官方文件化的 typed `Width`，並以機械式條件判斷寬度是否真的控制原生換行。**

這條路線：
- 沿用已證實的 Text pool、typed 字型 setter、sparse payload import，物件仍是原生可編輯的 Text5。
- 不寫任何未觀察過的欄位；若 BarTender 因寫入 Width 自行產生新欄位，會被逐欄記錄為「實機觀察欄位」，供下一輪合法使用。
- 若 Width 被拒或無效，結果本身就是重要證據：代表 Text5 段落無法從單行 Text 以 COM 轉換，下一步必須取得 Designer 製作的段落樣本（見第 6 節）。

## 3. Probe 設計（`Probe-NativeParagraph.ps1`）

分派：`run-request.json` 的 `"probe":"native-paragraph"`。輸出：`review/renderer-prototype/runner-evidence/native-paragraph/`。

1. **基底**：自有 COM 程序、runner 必須為 `LWB-FTUSER5`、watchdog。物化 Designer 基底並核對 SHA `73E620EC…198B`。依文件順序保留**前兩個乾淨的 Designer Text 槽**（單一 EmbeddedDataSource、無 transform、非共用來源），其餘全部刪除。頁面使用已實證的 100×70 mm。
2. **Peers**：第二個 Text 槽（Text 對 Text 隔離）、Box3、`proven-code128.btc`。每次寫入後都比對三個 peer 的 XML 原文與 Value。
3. **字型**：typed FontName=Arial、FontSize=8、FontBold=false、FontItalic=false（Run45／49 已證實可用於 Text 槽）。
4. **單行參考**：sparse import 寫入約 46 字元的 ASCII 長字串（Arial 8 pt 約 80 mm），保存單行 BMP。
5. **寬度槓桿**：typed `Width` = 50.8 mm，再改為 30.48 mm。
6. **高度**：typed `Height` = 5.08 mm。官方說不適用於 Text，預期會被拒，僅記錄。
7. **編輯挑戰**（在最終寬高設定下）：改成短字串 → 改成含 CRLF 的兩段 → 還原原字串。還原後 GetXML 原文與 BMP SHA 必須和挑戰前完全一致。
8. **持久化**：SaveAs、計算 SHA、Quit，以**不同 PID** 重開，逐一比較目標 XML、Value、物件 BMP、整頁 BMP、peer XML 與 Value、BTW SHA。
9. **安裝範本清單**（唯讀）：只列出 BarTender 安裝目錄、`ProgramData\Seagull Scientific`、`Public\Documents\BarTender` 下的 `.btw/.btc` 路徑、大小與 SHA-256，最多 400 筆、雜湊上限 200 MB。**不開啟、不解析、不載入 BarTender**，供下一輪精確挑選單一 Designer 樣本。

每一步都保存 before／after XML、所有 getter（含 `FontScale`）、逐欄 XML 差異、600 dpi BMP。

### 3.1 CRLF 與已證實匯入函式

dry-run 發現：`HybridPayload.psm1` 以 `XmlReader.Create` 解析，會依 XML 規範把 raw CRLF 正規化為 LF；`LoadXml` 與 COM `Value` 則保留 CR。若 BarTender 匯出換行值時用 raw 而非 base64，還原會被拒。

處理方式（**不修改**已證實的核心函式）：
- 用同樣的讀取設定取出匯出字面值，交給該函式自己做一致性比對。
- 只有在差異**恰好**是 CRLF→LF 正規化時才放行，並記錄 `EXPORT_RAW_NEWLINE_NORMALIZED_BY_XML_PARSER`；其他任何不一致都 FAIL CLOSED。
- 挑戰讀回不一致時，先嘗試緊急還原再 FAIL CLOSED。
- 最終判準不變：GetXML 原文與 BMP SHA 完全一致。

## 4. 機械式判讀（`paragraph-contract-verdict.cjs`）

容差全部沿用既有依據：墨跡入框 0.5 mm（`renderer/visual-qa.cjs TOLERANCE.edgeMm`）、幾何 0.0254 mm（一個原生 mil）、字級 0.02 pt（`HybridPool` 讀回容差）。

**P3 寬度控制換行**：以下**全部**成立才是 `WIDTH_CONTROLLED_WRAP_EVIDENCED`，任一不成立即逐條列出原因。
- 兩次 Width 寫入成功且讀回在一個 mil 內。
- 寫入 Width 後 Value 仍等於原長字串（換行不是被寫進資料）。
- `FontSize` 與 `FontScale` 都沒變（排除自動縮字與水平壓縮）。
- 單行墨跡寬度大於 Width1（確實需要換行），且單行只有一個墨跡帶。
- Width1 有 2 個以上墨跡帶；Width2 的帶數多於 Width1。
- 兩種寬度下墨跡寬度都不超過 Width + 0.5 mm。
- 每一帶的高度不超過單行高度 + 0.5 mm，也不低於單行高度的一半（排除整體縮放）。

**其他軸**：
- **P4 對齊**：只能觀察**預設**對齊（比較各帶左緣、右緣、中心的離散度）。center／right 固定為 `UNKNOWN_NOT_ATTEMPTED`。
- **P5 固定高度**：分為被拒、未觸發、墨跡溢出、伴隨字級變化（屬自動縮字）、`FIXED_HEIGHT_CLIP_EVIDENCED`。
- **P6 編輯挑戰**：必須精確還原；另記錄短字串是否重新排成單列、CRLF 是否產生多列。
- **P7 冷重開**、**peer isolation**。

**能力標記**：最高只到 `CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED`，而且必須同時滿足整體無硬失敗、冷重開 PASS、編輯挑戰精確還原。`nativeJustification` 本輪一律 `NOT_CERTIFIED`，`rendererCertified` 永遠是 false。

**FAIL CLOSED**：
- peer 污染，或零筆 peer audit。
- 挑戰讀回或還原不精確。
- 非自有或重複的程序 PID；runner 不是 `LWB-FTUSER5`。
- 冷重開任一比對不一致，或 BTW SHA 改變。
- 基底 SHA 不符，或乾淨 Text 槽不足兩個。

失敗時 BTW 會改名為 `.FAIL_CLOSED`。

## 5. 離線驗證（不是實機證據）

- `tests/paragraph-contract-verdict-smoke.cjs`：36/36 PASS，涵蓋自動縮字、水平壓縮、單帶壓縮、Value 被改寫、墨跡超框、未觸發換行、帶數未增加、行高放大、三種預設對齊、等寬歧義、高度的五種結果、還原失敗、peer 污染、冷重開 SHA 與 PID、基底 SHA、非自有程序。
- `npm run test:renderer`：既有全部 PASS，另含 RichText 28/28 與 paragraph 36/36。
- PowerShell 7.4.6 parser 0 錯誤，並以自寫 AST 掃描確認沒有 5.1 不支援的語法或參數。另人工審查 5.1 語意差異，修正 hashtable 不分大小寫會合併 XML 欄位路徑的問題。
- `paragraph-dryrun/`：mock COM 六情境（normal、width-refused、autofit、height-clip、contaminate、restore-drift），結果皆符合設計。**mock 是模擬物件，不代表 BarTender 行為。**

## 6. 實機結果後的決策

| Run51 結果 | 下一步 |
|---|---|
| `WIDTH_CONTROLLED_WRAP_EVIDENCED`，且 XML 出現新欄位 | 這是第一個原生段落突破。記錄欄位名稱與值。下一輪設計 canonical `frameMode:'paragraph'` 加 `widthMm`，並在 Visual QA 新增多行墨跡 gate 後才可接入 Renderer。對齊仍只限觀察到的預設值 |
| `WIDTH_CONTROLLED_WRAP_EVIDENCED`，XML 無新欄位 | 換行狀態可能存在 BTW 中但不在 GetXML 裡。冷重開比對可證明它有被保存；再補 Designer 樣本確認欄位 |
| Width 被拒、讀回不符，或 `NOT_EVIDENCED` | 單行 Text5 無法用 COM 轉成段落。改取 Designer 製作的段落樣本：先從 Run51 的安裝範本清單**指定單一檔案（以 SHA 鎖定）**，唯讀開啟並收集 Text XML；若清單為空，需一次性將一個 Designer 製作的段落 `.btc`（同 `proven-code128.btc` 模式）以 SHA 鎖定提交。這是單次決策，不是反覆手動製作 |
| 冷重開、還原或 peer 失敗 | 依 FAIL CLOSED 保存證據，先排除該失敗再談能力 |

center／right 對齊只有在取得**實機觀察到的非預設欄位值**後才能嘗試。在那之前維持 `UNKNOWN_NOT_ATTEMPTED`。

## 7. 檔案

- 新增：`paragraph-root-cause/text-xml-census.json`、`Probe-NativeParagraph.ps1`、`paragraph-contract-verdict.cjs`、`paragraph-dryrun/{MockCom.psm1,Invoke-MockDryRun.ps1}`、`tests/paragraph-contract-verdict-smoke.cjs`、本文件。
- 修改：`Invoke-ProbeDispatch.ps1` 新增 `native-paragraph` 分派；`package.json` 的 `test:renderer` 加入新 regression。
- 觸發用 commit 只改 `run-request.json`（`probe: native-paragraph`），commit 訊息含 `[bartender-probe]`。


## 8. Run51 Windows actual result — 2026-11-04

**FAIL_CLOSED** — https://github.com/YKC1117/label-workbench/actions/runs/41760467332
Evidence artifact: bartender-renderer-evidence-41760467332. Runner renderer regression passed (paragraph 36/36 and RichText 28/28), but real BarTender COM probe ended DISCOVERY_FAILED_CLOSED. Do not treat CI green as paragraph acceptance.

- Text5 typed Width writes for 50.8 mm and 30.48 mm both reported WROTE but getter remained 80.772 mm; no new XML paragraph fields and raster remained one ink band at about 80.518 mm. The existing single-line Designer Text5 did NOT become native wrapped paragraph through this typed setter. This does not rule out a separately Designer-authored paragraph.
- Height 5.08 mm WRITE_REFUSED (getter 3.2004 mm); FontName, FontSize, FontBold, FontItalic writes passed. All 27 peer audits were EXACT; Designer base SHA passed and owned PID was 14160.
- CRLF edit readback in COM Value was correct. GetXML stored <Value Encoding="Base64"> with UTF-8 Base64 of FIRST PARAGRAPH LINE plus CRLF plus SECOND PARAGRAPH LINE. The local Test-CleanText logic compared the base64 text without decoding and triggered CHALLENGE_READBACK_MISMATCH:edit-two-paragraph. This is a probe parser bug separate from the Width limitation. Emergency restoration recorded restoreXmlExact=true; full bitmap restoration was not proven.
- Save and distinct-PID cold reopen were NOT RUN. Do not claim persistence success. Fail-closed output must remain quarantined.
- The installed template listing reached its 400 file cap entirely within barcode BTC files (400/400): NOT a valid paragraph donor search. Next discovery must use one bounded, named, SHA-locked Designer-authored paragraph candidate; do not repeat mass scanning.

**Decision:** do not rerun identical Text5 Width writes. Fix Test-CleanText only against observed Base64 UTF-8 XML semantics (strict decode; reject other encodings), and independently obtain one real Designer Normal Wrapped Text/Paragraph donor or a single constrained donor creation path before further BarTender probe. Fixed frame, native justification, wrap stay NOT_CERTIFIED.

## 9. Run52 候選：Designer 多行文字與原生對齊契約（2026-11-04，尚未實機）

基準 HEAD：`d4e91c788aa52923a8662a03e5c629ef7edec653`。本輪**沒有**重跑 Run51 的 Width 寫入。

### 9.1 Run51 Base64 判讀錯誤：已修正

- 兩種實機 Base64 契約**不可混用**：
  - 物件 `GetXML` 的 `<Value Encoding="Base64">`：UTF-8（Run51 實測）。
  - DataMerge 匯出的 `<Value Encoding="base64">`：UTF-16LE（repo 既有實機證據 `datasources-before.xml`，連單獨的 CR 也精確保留）。
- 新模組 `ParagraphXmlValue.psm1` 只接受前者的觀察格式。以下一律 FAIL CLOSED：小寫拼法、其他 Encoding、多餘屬性、空值、空白或換行、非法字元、非標準 padding、UTF-8 BOM、非法 UTF-8；並以 round-trip 驗證位元組一致。
- `Probe-NativeParagraph.ps1` 改用此模組。精確還原的判準不變（GetXML 原文加 BMP SHA）。
- `Test-ParagraphXmlValue.ps1`：37/37 PASS。分派入口會先在 Runner 的 PS 5.1 上執行，失敗就不啟動 BarTender。
- mock `run51-replay` 重現 Run51：Width 失效判為 `NOT_EVIDENCED`，CRLF 編輯挑戰精確通過，冷重開 PASS。

### 9.2 新發現：PowerShell `-ceq` 不是逐字元比較（高優先，核心未改）

`"A"+[char]0+"B" -ceq "AB"` 為 True；U+00AD、U+200B、U+200D、U+FEFF 也一樣。所有以 `-ceq`／`-cne` 判斷「精確一致」的 gate，都可能漏判只差在這些字元上的變更。

- 本輪自有的 Probe 層已全部改用 `Test-OrdinalEqual`（`[string]::Equals(...,Ordinal)`），並有 regression 覆蓋。這只會更嚴格。
- **核心未修改**（依指示）。`-ceq`／`-cne` 出現次數：`HybridPool.psm1` 78、`NativeLayoutEngine.psm1` 69、`Build-NativeLayout.ps1` 24、`HybridPayload.psm1` 6。其中只有一部分是 XML／Value 內容比較（例如 peer audit、還原、冷重開），其餘是 ASCII 常數比較，不受影響。建議另開一輪逐一審查內容比較並改為 ordinal，再重跑 Run45／49 確認不回歸。

### 9.3 ROOT CAUSE：真正的 Designer 多行物件一直就在基底裡

證據檔：`paragraph-root-cause/designer-multiline-candidates.json`。

1. repo 中可解析且 SHA 可驗證的 Designer 文件只有：controlled 基底 `73E6…`、`original-template.btw` `4CF9…`、second donor `5B06…`。`seed-2022r2` 的實際 SHA 與宣告不符、容器無法解析，**不可使用**（另附：網站端 `bytes()` 對陣列呼叫 `atob()` 會失敗）。
2. BTW 容器不含屬性名稱，**不從位元組推斷任何設定**。
3. 在 SHA 鎖定的 Designer 基底中，有兩個由 Designer 製作的**多行文字**物件，以往的 Probe 只取前兩個乾淨槽，所以從未讀過它們的 XML：
   - **文字 30**：DataMerge 實機有兩個子字串 `"RoHS\r"` + `"COMPLIANT"`。Designer 預覽實測兩行中心差 0.5 px（約 0.06 mm），左右緣差 6／7 px，**疑似原生置中**。
   - **文字 33**：單一子字串 `"            120824\rC.K.   QA  ACC"`。預覽實測右緣差 2 px（約 0.24 mm），左緣差 61 px，**疑似原生靠右**（前導空白在靠右時不可見）。網站端 `mapContainer` 只解析出 32 個文字物件，唯獨漏掉它，表示其記錄結構與一般單行文字不同。
4. 預覽來自 `original-template.btw`，**只是線索**；必須由 BarTender 實機 GetXML 與 BMP 證實。
5. 所有已提交的 donor 中都**沒有**依寬度自動換行的段落物件，所以自動換行本輪仍無法處理。

### 9.4 Probe：`Probe-DesignerMultiline.ps1`（`probe: designer-multiline`）

- **A. 唯讀收集**：對兩份 SHA 鎖定文件的副本，讀出每個物件的 GetXML、Value、資料來源數量，以及逐欄欄位表。目標與參照物件另取 getter 與 600 dpi BMP。前後全物件快照必須 ordinal 一致、檔案 SHA 不變，不存檔。
- **B. 改字挑戰**（只針對文字 33，且需通過 `Test-CleanTextXml`，否則記錄理由並跳過）：
  - 用已證實的 sparse import 依序寫入「短首行」「長首行」，最後還原原值。
  - 每步驟讀回需精確；對其餘全部物件做 XML＋Value 的 peer audit。
  - 還原後 GetXML 原文與 BMP SHA 必須和挑戰前完全一致。
  - Save 後以不同 PID 冷重開，比對目標、整頁、所有 peer 與 BTW SHA。
- **不使用**：SetXML、GetProperty／SetProperty、Text 的 typed Width／Height、Create(5)、binary patching、任何掃描。
- 可重現的輸入副本執行後即刪除，只保留 SHA。

### 9.5 判讀：`multiline-contract-verdict.cjs`

- **對齊分類**：用 BarTender 自己的物件 BMP 分出墨跡帶，比較左緣、右緣、中心的離散度（容差 0.5 mm，沿用 `visual-qa.cjs`）。兩行寬度差不超過容差時判為 `NOT_OBSERVABLE`；同時符合兩種以上分類時判為 `AMBIGUOUS`。
- **欄位對照**：列出「只在多行目標出現」與「參照都有、目標沒有」的欄位。只列差異，**不宣稱**哪個欄位代表對齊。
- **改字後保持**：基準狀態與兩次改字狀態必須是同一種對齊分類，且改字確實改變了行寬，才判為 `ALIGNMENT_PRESERVED_AFTER_EDIT:<類別>`。
- **能力標記**：只有在「無硬失敗、精確還原、冷重開 PASS、改字後保持」全部成立時，該類別才標為 `CONTRACT_EVIDENCED_NOT_RENDERER_CERTIFIED`。唯讀觀察到的置中只會列入 `observedReadOnlyAlignment`，**不認證**。自動換行與固定框一律 `NOT_CERTIFIED`。
- **FAIL CLOSED**：唯讀收集改動了文件、來源 SHA 不符、讀回或還原不精確、peer 污染、改字後零筆 audit、冷重開不一致、非自有程序、runner 不是 `LWB-FTUSER5`。

### 9.6 離線驗證（非實機證據）

- node regression：multiline 34/34、paragraph 36/36、RichText 28/28；完整 `test:renderer` PASS。
- multiline verdict 經 9 個刻意改壞的變異測試，全部被 regression 抓到。其中一個變異暴露了「兩行寬度只差略多於容差、同時符合兩種分類」的測試缺口，已補上。
- PowerShell：`Test-ParagraphXmlValue.ps1` 37/37；所有 PS 檔皆為純 ASCII，並通過 PS7 parser 加 5.1 AST 掃描。
- mock dry-run：
  - designer-multiline：normal、align-lost、contaminate、restore-drift、transform33、harvest-mutates、source-sha。
  - native-paragraph：8 情境，含 run51-replay、xml-base64-lower。
  - richtext 代表情境。
  - 全部符合設計。**mock 不代表 BarTender 行為。**

### 9.7 實機結果後的決策

| Run52 結果 | 意義與下一步 |
|---|---|
| 文字 33 為 `ALIGNMENT_PRESERVED_AFTER_EDIT:RIGHT`，冷重開 PASS | 第一個「改字後仍保持原生對齊」的實證（靠右）。下一步：設計以此 Designer 物件為 donor 的「多行靠右」原生元件契約，並在 Visual QA 新增多行對齊 gate，之後才接 Renderer |
| 文字 30 唯讀判為 CENTER，且欄位對照出現穩定的目標專屬欄位 | 置中欄位名稱與值已有**實機依據**。下一輪才可評估：在 Designer 文字上 SetXML 寫入「實機觀察到的」欄位與值，加上改字保持與精確還原 |
| 文字 33 不符合乾淨文字條件（例如有 transform） | 只保留唯讀證據。改字挑戰需要另一個單一子字串的 Designer 多行物件 |
| 判為 LEFT 或 AMBIGUOUS | 預覽線索不成立。保存證據；對齊仍未取得 |
| 任何 FAIL CLOSED | 保存並隔離證據，先排除失敗原因 |

**自動換行（Normal Wrapped／Paragraph）**：所有已提交的 donor 都沒有這類物件。最小方案是一次性取得一個 Designer 製作的段落樣本：在 LWB-FTUSER5 上，以 BarTender Designer 建立一個「Wrap to fit width」的文字物件（Arial 8 pt、固定寬度，左／中／右各一個），存成 `.btc`，以 SHA 鎖定後提交，用法比照 `proven-code128.btc`。**阻塞點**：目前的自動化環境只有 Automation COM，沒有任何不經猜測就能建立段落物件的介面；這一步需要有人操作一次 Designer。


## 10. Run52 Windows evidence and strictly diagnostic follow-up (2026-11-04)

Run52 actual [Windows workflow #41765633348](https://github.com/YKC1117/label-workbench/actions/runs/41765633348): **FAIL_CLOSED**. Artifact: `bartender-renderer-evidence-41765633348`.

- Windows PowerShell 5.1 `Test-ParagraphXmlValue.ps1` **37/37 PASS**; same-host renderer tests include multiline **34/34 PASS**, paragraph 36/36, RichText 28/28. These are not the native alignment contract.
- SHA-locked Designer base: **41 objects**, `shaBefore=shaAfter=73E620EC...198B`. Native `GetXML` harvest found `文字 33` Text5, one DataSource, Value with explicit CR, and a native two-band raster whose right edges differ about **0.2963 mm**; classification **RIGHT (read-only observation only)**. `文字 30` has two DataSources and one measured object ink band, so CENTER was **not observed**.
- **Blocking failure**: all-object in-memory `Snapshot` XML/Value before vs after harvest was **not identical**, despite unchanged source BTW file SHA. Original probe stored only the boolean `snapshotEqual=false` with no per-object before/after diff, making the exact cause unknowable from Run52's artifact. `READ_ONLY_HARVEST_NOT_PROVEN:designer-base` correctly stopped work. `original-template` harvest, edit, peer audits, SaveAs and different-PID cold reopen were **NOT RUN**.
- **Follow-up diagnostic**: `Probe-DesignerMultiline.ps1` now writes per-object ordinal XML/Value drift pairs, changed-field booleans, first differing UTF-16 index, and lengths into `integrity.drift` and separate `harvest-*-drift-*.xml/.txt` files. This performs no extra COM calls and **does not relax** `Snapshot` / SHA / peer / cold FAIL_CLOSED. It is intentionally a bounded diagnostic rerun, not a renewed claim of paragraph capability.

Do not call the observed RIGHT raster editable/persistent until the edit challenge and cold reopen actually pass. Native auto-wrap and fixed frame remain **NOT_CERTIFIED**.
