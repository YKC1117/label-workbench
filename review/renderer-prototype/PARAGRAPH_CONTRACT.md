# RichText9／原生段落契約探勘（Run50 候選，2026-11-04）

僅限 YKC1117/label-workbench／experiment/com-renderer-prototype／Draft PR #35。
main、Pages、Release 未動。本文件只描述 **RichText9 契約探勘**，不接入正式 Renderer。

**固定框、原生左／中／右對齊、自動換行：一律 NOT CERTIFIED。**
Run45（19 物件 Text／barcode）與 Run49（7 物件混合）仍是唯一已驗證的 Renderer 證據；
本輪沒有修改任何 Renderer 核心或 Gate，因此不需重跑。

## 1. 執行狀態

| 項目 | 狀態 |
|---|---|
| 離線實作與檢查 | 完成（見第 6 節） |
| Windows 實機 Probe | **Run50 DISCOVERY_COMPLETE**：2026-11-04，[Windows Runner #41756559623](https://github.com/YKC1117/label-workbench/actions/runs/41756559623) |
| 原始證據 | Run #41756559623 artifact `bartender-renderer-evidence-41756559623`，包含 BTW、XML、BMP、報告、peer audit |

第 2～3 節記錄 Run50 前的既有依據；第 4 節是當時待驗證假設。Run50 實機結果與判讀限制見第 9 節。

## 2. 已查證事實（repo 實機證據）

- **E1** Run46／47 `creation-types.json`：已安裝 TypeLib 的 `BtObjectType` 含 `btObjectRichText=9`，
  另有 Ellipse8、Shape10、GridLayout12、Table13；**沒有 Paragraph 列舉**。
- **E2** Run46／47 `contract-report.json` 只建立 line／box／image；Run49 七物件無 type 9。
  **RichText9 在本 repo 從未被建立過**，其 XML／Value／幾何／渲染／持久化沒有任何實機資料。
- **E3** `native/.../evidence/installed-api.json`：`IBtDesignObject` 有 Width、Height、FontName、FontSize、
  FontBold、FontItalic、GetXML／SetXML、GetProperty／SetProperty；**沒有** Justification、Alignment、Wrap、
  TextType、RTF、Paragraph 類 typed 成員。`Value` 只有 PROPERTYGET。
- **E4** Run49 `hybrid-TITLE-presave.xml`（Text5）有 `Width="1.850 in"`、無 Height、無對齊屬性；
  同值 `Width="1.850 in"` 也出現在 Run47 Line 與 Code128 XML，**不能**當成固定文字框證據。
- **E5** GetXML 會省略預設值：HRI center 在 Run49 已實證，但 HRI XML 看不到 center／alignment 屬性。
  **XML 中缺少某欄位，不代表沒有該能力，也不能據此推回欄位名稱。**
- **E6** 舊 donor 條碼 `BarCodeTextData` 有 `ParagraphWidthMinimumSizeToBarCodeMode`；僅屬 HRI 範疇，
  不外推為 Text5／RichText9 欄位。
- **E7** `renderer/adapter.cjs` 遇 `frameMode==='fixed'` 拋 `CAPABILITY_UNSUPPORTED`；`text-layout.cjs` 把
  multiline 拆成獨立 Text；center／right 由 `HybridPool.psm1` 墨跡量測換算 X/Y。本輪不改。
- **E8** Run39 job log 記錄 BarTender 主機 runner 名稱為 `LWB-FTUSER5`。

## 3. 官方文件佐證（輔助，非實機證明）

- Height（**2022**）：rich text 的 Height 只在縮放方式為 Fixed Dimensions 或「自動縮放內容以符合物件尺寸」
  時有效；Text 不在 Height 適用清單。
  https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Height_Property(DesignObject).htm
- Width（11.8／2016 頁面；`SOURCES.md` 於 2026-10-01 引用 2022 同名頁，敘述一致）：適用 rich text；
  Text 只有格式化為段落時 Width 才適用。
  https://help.seagullscientific.com/11.8/en/Subsystems/ActiveX/Content/Width_Property(DesignObject).htm
- Word Processor 尺寸模式（**2022**）：自動調整高度／固定尺寸（超出部分隱藏）／縮放內容符合尺寸。
  https://help.seagullscientific.com/2022/en/Content/HIDD_RICHTEXT_PAGE.htm
- 文字物件類型（**2022**）：一般、一般換行（段落）、變形文字；另有 word processor（RTF）與 markup container。
  https://help.seagullscientific.com/2022/en/Content/Objects_TypesOfObjects.htm
- Text Format 的 Wrap 分頁（**2022**）：換行與對齊。
  https://help.seagullscientific.com/2022/en/Content/HIDD_TEXTPAGE.htm

## 4. 待驗證假設（全部 UNKNOWN）

- **H1** RichText9 對應 UI 的 Word Processor 物件，而非 markup container。
- **H2** RichText9 的 Value／資料來源為 RTF。
- **H3** 預設尺寸模式下 Height 會被拒絕或忽略。
- **H4** 「段落」是 Text5 的格式變體（一般換行文字），與 RichText9 是兩條不同路線；Text5 段落 XML 欄位未知。
- **H5** Fresh `Formats.Add` 下 setter 被拒的原因（文件脈絡 vs 重新 Find）仍未隔離；一律沿用已證實 recipe。

## 5. Probe 設計（`Probe-RichTextContract.ps1`）

Recipe（沿用 Run47／49）：固定 SHA `73E620EC…198B` Designer 基底 → 刪除全部未用物件 →
建立 Box3 peer 與 `proven-code128.btc` peer → `Create(enum RichText)` → 釋放並重新取得 Objects／Find。

| 階段 | 內容 |
|---|---|
| open | 自有 COM 程序（拒絕既有／重複 PID）、watchdog、runner 名稱核對 |
| enum | `ComMetadata.ReadEnums`；RichText 名稱須恰好一個且值為 9，Box 恰好一個且值為 3 |
| designer-base | 物化基底並核對 SHA、刪除全部物件、確認清空 |
| peers | Box3（Run47 已證實 setter）＋ Code128 BTC（插入差集須恰好一個、Type=4） |
| create | 建立前快照兩個 peer XML；Create(9)、重新 Find；保存 GetXML(true,true)／(false,false)、根節點與子節點名稱、DataSources、所有 getter（含錯誤 HRESULT）、Value 原文與十六進位前綴、資料來源匯出節點、600dpi BMP |
| setters | 只用文件化 typed setter：X、Y、Width、Height、FontName、FontSize、FontBold true→false；每筆保存 before／after XML、getter、Value 是否變動、BMP，並做 peer audit |
| value-model | 由 `richtext-contract-verdict.cjs --classify` 機械式分類 |
| payload | 僅在模型為「已確認 PLAIN」時執行；否則 NOT_RUN 並記錄理由 |
| save／cold | SaveAs→SHA→保存存檔後狀態→Quit→**不同 PID** 重開→XML／Value／物件 BMP／整頁 BMP／peer XML 逐一完全比較→SHA 前後比較 |

本輪明確**不做**：Create(5)、donor binary patching、BTC 掃描、任何 GetProperty／SetProperty 動態名稱、
任何對齊／換行／尺寸模式 XML 寫入、Run47 式「typed 失敗改用 SetProperty」回退。

### 判讀原則對應

- **A** 空白 → `EMPTY`；缺資料來源 → `UNKNOWN`；Getter 失敗 → `UNREADABLE`。
  Create(9) 產生的內容一律視為預設範例，最多只能是 `UNKNOWN`（`DEFAULT_CONTENT_ONLY_MODEL_UNCONFIRMED`）。
  **因此本輪 payload 按設計為 NOT_RUN**，原文完整保存。
- **B** 交叉比對 Value、物件 XML 中的資料來源值、`ExportDataSourceValuesToXML` 字面值；任何不一致、
  多個資料來源、存在 Transforms、或 typed setter 改動了 Value，都是 `UNKNOWN`。模型未確認前禁止覆寫。
- **C** 任一來源出現 RTF／markup 特徵即分類 `RTF`／`MARKUP`，保存證據並跳過 payload，不設計新格式。
- **D** Width／Height 軸最高只到 `READBACK_ONLY_NOT_FIXED_FRAME`；另記錄 FontSize 前後值、墨跡框、
  墨跡列帶，overflow／裁切／縮字列為 UNKNOWN。
- **E** 水平墨跡帶數只列為證據；`A6_wrap` 最高只到 `EVIDENCE_ONLY_NOT_CERTIFIED`。
- **F** 不存在 typed alignment setter 不代表只剩 XML／Value 兩條路；GetProperty／SetProperty 仍在，
  但本輪禁止猜名稱。`A9_alignment` 固定為 `UNKNOWN_NOT_ATTEMPTED`。
- **G** 保留 requested／actual／delta。容差只沿用既有依據：幾何 0.0254 mm（BarTender 以 0.001 in
  字面值儲存，`HybridPool.psm1` 記錄 Run43 mm setter 一 mil 截斷）；FontSize 0.02 pt（`HybridPool.psm1`
  既有 Text 讀回容差）。測試值選用 mil 可整除值（40.64／15.24／10.16 mm），避免量化與 API 行為混淆。
  超出容差標 `READBACK_MISMATCH`（記錄為 API 結果，不放寬）。

### FAIL CLOSED 條件

任一成立即 `DISCOVERY_FAILED_CLOSED`／verdict `FAIL_CLOSED`，BTW 改名 `.FAIL_CLOSED`：
peer XML 改變、零筆 peer audit、FontBold 或 payload 無法精確還原、非自有或重複 PID、
冷重開 PID 未變或原程序未結束、冷重開 XML／Value／物件 BMP／整頁 BMP／peer XML 任一不一致、
BTW SHA 改變、Designer 基底 SHA 不符、列舉不唯一、Actions 中 runner 不是 `LWB-FTUSER5`。

### 各軸輸出（`richtext-verdict.json`）

`A0_installedEnum`、`A1_create`、`A2_width`、`A3_height`、`A4_font`、`A5_valueModel`、`A6_wrap`、
`A7_restore`、`A7b_fontBoldRestore`、`A8_coldReopen`、`A9_alignment`、`peerIsolation`。
`capability.{fixedFrame,nativeJustification,wrap}` 永遠是 `NOT_CERTIFIED`；`productAcceptance` 永遠是 `NOT_COMPLETE`。

## 6. 離線檢查（非實機證據）

- `tests/richtext-contract-verdict-smoke.cjs`：26/26 PASS（含 A／B／C／E／G 與所有 FAIL CLOSED 負面案例）。
- `npm run test:renderer` 全部既有 regression 仍 PASS，並納入上項。
- PowerShell 7.4.6 parser：`Probe-RichTextContract.ps1`、`Invoke-ProbeDispatch.ps1`、`Run-PrimitiveCandidate.ps1`
  0 錯誤，且無 PS7 專屬語法（ternary、`??`、`?.`、pipeline chain）。**PS 5.1 parser 由 Runner 上的分派入口再檢一次。**
- `richtext-dryrun/`：以 **mock COM** 在 Linux pwsh 跑完整 Probe 流程。這只驗證腳本邏輯，**不代表 BarTender 行為**。
  六個情境：normal、height-refused、rtf、contaminate、bold-inexact、wrong-runner，結果皆符合設計。
  此 dry-run 抓到並修正兩個會在 Windows 實機發生的 bug：
  1. `return ,$names` 在空集合時讓 `@(Get-Names).Count` 變成 1，誤判基底未清空。
  2. 建立前 peer 快照誤用空的 peer 清單，導致零筆 audit（verdict 正確 FAIL_CLOSED）。

## 7. 觸發方式

`PROBE.cmd` → `Invoke-ProbeDispatch.ps1` 讀 `run-request.json` 的 `probe`：
缺欄位或 `primitive-candidate` → 原 `Run-PrimitiveCandidate.ps1`（行為不變）；
`richtext-contract` → `Probe-RichTextContract.ps1`；其他值直接失敗。

Workflow 只在 YKC1117 push 了 `run-request.json` 且 commit 訊息含 `[bartender-probe]` 時觸發。
證據輸出：`review/renderer-prototype/runner-evidence/richtext-contract/`（由既有 artifact 路徑
`review/renderer-prototype/runner-evidence/**` 上傳）。可重現的物化基底 BTW 不列入證據，只記錄 SHA。

## 8. 實機結果後的決策

| 觀察 | 下一步 |
|---|---|
| A1 FAIL 或 peer 污染 | RichText9 出局；改評估 Designer 製作的 Text5 段落 BTC（取得機制同 Code128 BTC） |
| A5 = RTF／MARKUP | 保存證據；RTF 路線需另行決定是否接受非純文字 payload 契約 |
| A5 = UNKNOWN（預設內容） | 依 XML 實際出現的欄位設計下一輪；仍不得猜名稱 |
| XML 出現可讀的尺寸模式／對齊屬性 | 下一輪只對「本輪實際讀到的屬性」做 challenge 與精確還原 |
| A3 = WRITE_REFUSED | 與文件預期一致；固定框需先取得尺寸模式契約 |

圖片、HRI、旋轉 primitive 的限定範圍見 `PRIMITIVE_RENDERER_HANDOFF.md`，本輪不變。
任意客戶標籤產品 **NOT COMPLETE**。


## 9. Run50 實機結果與離線判讀修正（2026-11-04）

- **實機 PASS 限於原生物件建立與持久化**：`Create(9)` 成功，XML 根節點 `RichText`，Type=9；原生物件可保存成 BTW 並由不同 PID（7300 → 2572）冷重開。BTW SHA 前後同為 `83A3D32709A488AD36DB214FC54A90516072F64E0B6099C9B9E0FC2F5FA4F068`，物件和整頁 hot/cold BMP 均逐位元組一致。Box3／Code128 兩個 peer 共 20 筆 audit 全部 `EXACT`。
- **實際 typed setter**：X／Y／Width 均寫入、讀回精確一致；Height 寫入被拒（`0x8000FFFF`）。FontName／FontSize／FontBold true／false 都被拒（`0x8000FFFF`）；`fontBoldRestore` 因兩次寫入被拒，結果為 `NOT_RUN`，不能標示 PASS。
- **實際 Value 訊號**：`Value` 與 DataMerge Export literal 都回傳 ``<RTF 資料>``，但 RichText 物件 XML **沒有 DataSources 子節點**。``<RTF 資料>`` 看起來是 BarTender 本地化的 RTF 佔位標示，**不能直接推論真正 RTF 位元內容或 markup 模型**。
- **判讀修正**：最初 Run50 工具把上述標示正規表示式命中為 `MARKUP`；此為 **format evidence 的誤分類**，已補回歸測試與保守規則：識別 ``<RTF 資料>``／``<RTF Data>`` 時回傳 `UNKNOWN`，記 `OPAQUE_RTF_PLACEHOLDER_NOT_FORMAT_EVIDENCE`，保留 `payloadPermitted=false`。既有 Run50 原始報告不改寫，修正只適用後續離線判讀或下一輪 Probe；本修正不需第二次 BarTender 實機操作。
- **能力界線不變**：固定框、換行、原生水平對齊、縮字、超框裁切仍 `NOT_CERTIFIED`。不可因 Run50 workflow `SUCCESS` 便聲稱可還原任意客戶段落標籤。


## 10. Run51 候選：Text5 原生段落路線（2026-11-04，尚未實機）

RichText9 在 Run50 中必要 setter 被拒、Value 為不透明佔位字串，沒有可驗證的寫入路線。下一輪改走 Text5：在已證實的 Designer Text pool 中，對真正的 Text5 寫入官方文件化的 typed `Width`，並以機械式條件判斷寬度是否真的控制原生換行。ROOT CAUSE、Probe 設計、判讀規則與決策表見 `NATIVE_PARAGRAPH_HANDOFF.md`。固定框、對齊、換行仍 NOT CERTIFIED。


## 11. Run51 Windows result (2026-11-04)

https://github.com/YKC1117/label-workbench/actions/runs/41760467332：DISCOVERY_FAILED_CLOSED. Existing single-line Text5 ignored typed Width (50.8 / 30.48 mm; getter 80.772 mm, 1 band), 27/27 peers EXACT. CRLF Value was Base64-encoded in GetXML, exposing a separate Test-CleanText parser limitation; save/cold NOT RUN. See NATIVE_PARAGRAPH_HANDOFF.md section 8. No native paragraph capability is certified.
