# 注意：此文件保留 Deep Review 歷史設計。最新執行策略請以 `ONE_SHOT_V2_HANDOFF.md` 為準。

# Label Workbench BarTender 2022 Automation POC 深度技術複查

依據：使用者指定的 `Label_Workbench_BarTender_POC_component_insert_17c_reviewed.zip`。未使用 GitHub 作為最新版本；未 commit、push、PR、部署或修改網站；未進行 BTW binary reverse engineering。

## 本次交叉複查封裝狀態

後續收到的 `Label_Workbench_BarTender_Deep_Review.zip` 仍是前一輪 Deep Review 基線，**沒有包含口頭回報的 IDEAL/FALLBACK 與 Raster DPI sanity check 最終修正版**。本次只補這兩項，不重寫 InsertComponent／payload／SaveAs 架構。

已補：

1. `Find-CleanComponent` 會記錄 `humanReadableVisibility`。`None` 為 IDEAL 並停止；visible/unknown 為 FALLBACK，繼續掃描至 IDEAL 或時間預算結束。只有 FALLBACK 時仍可驗證 payload／persistence，但 `Measure-XDimensionExperiment` 回報 `SKIPPED_CAPTION`、`execution=NOT_RUN`。
2. `Export-ObjectMeasurement` 同時記錄 requested/header DPI 與 trust 狀態。有效 header DPI 與 requested DPI 超過 `max(1 DPI, 1%)` 時，physical-mm 欄位為 null 並標 `UNTRUSTED`；baseline mismatch 不啟動 Index probe，中途 mismatch 會將 slope 標為 `UNTRUSTED_DPI_MISMATCH`、抑制最佳 Index 選擇並還原基線。
3. `Test-XmlCore.ps1` 新增三類回歸情境：visible→None 必須選 IDEAL、visible-only 必須 fallback 且 sizing NOT RUN、DPI match／baseline mismatch／mid-probe mismatch。`ReviewFixtures.cs` 增加 HumanReadable 與可控 BMP header DPI fixture。

本輪執行環境為 Debian GNU/Linux 13.3；沒有 `pwsh`／Windows PowerShell、`dotnet`／`csc`／`mcs`，因此本輪 PowerShell parser、實際 PowerShell regression、C# compile 都明確 **NOT RUN**。本輪有執行 JSON/XML 解析、原始 evidence byte-for-byte 比對、程式必要標記/測試案例靜態核對與最終 ZIP integrity；詳見 `validation/final-handoff-validation.json`。包內舊 validation logs 保留，但不當成本輪測試證據。

## A. 17c 是否值得實機測

**原始 17c 不建議直接測。** 陣列修正方向正確，但尚有可離線確認的流程／驗證缺陷。先排除它們才值得消耗一次 Windows 測試。

本包是修正後的**單次診斷包**：值得一次收集完整實機證據，但不是保證成功的完成版。若使用者目前只要求技術複查，不需立刻執行。

## B. 原始 17c 的真正問題

| 項目 | 原始碼與證據 | 結論／修正 |
|---|---|---|
| flat-array | Get-ObjectNames/Get-NameDelta 改成平坦 pipeline，再由呼叫端 `@(...)` 收集，方向正確 | 補上真正經過 ComBridge 的 0／1／41→42 測試，而非只測手工 string array |
| scalar 風險 | `$probeList=if(...) {...}` 外沒有 `@(...)`，候選只剩一個时會成 scalar；PS5.1 的 PSCustomObject.Count 不應依赖 | 新流程所有候選／名稱集合在賦值端使用 `@(...)`；不把 typed string[] 當防止巢狀輸入的驗證 |
| 身分識別 | 原版只依名稱差集，回滾後多處只比 Count，可能漏掉既有名稱消失／同數量替换 | 比較雙向名稱集合、數量、唯一性，Find 後再核對實際 Name；空白掃描文件每次必須還原 Count=0 |
| 部分插入 | InsertComponent=false 路徑直接 continue，未取得可能已產生的物件；例外回滾未完整驗證 | false／exception 都清空獨立掃描文件，清理失敗立即停止掃描，不能帶著污染繼續 |
| 空 transform 容器 | Test-CleanLiteralBarcodeObject 接受 `<Transforms/>`，Assert-SingleEmbeddedDataSource 卻拒絕任何 Transforms 元素 | 統一為拒絕實際 transform 子節點；空容器不等於 PrefixSuffix/DataEntry 生效 |
| 候選排序 | Circular Code128 和普通 Code128 同分；父路徑含 barcode 也會加分 | 只以 basename 評分；普通 Code128 優先，明示 circular/GS1 等變體排除 |
| 掃描完整性 | 有任一 score>0 就只測前40，不會再掃其餘；無強匹配只測80 | 一次去重排序，逐一處理全部符合篩選的候選，受180秒預算限制；沒掃完回報 INCOMPLETE，而非 NO CLEAN DONOR |
| 狀態收集 | Code128 失敗就使 DM／SaveAs 全部 NOT RUN | 三個物件各自記錄，DM 和文字不依賴 Code128 成功 |
| 尺寸 | ExportToFile 只讀整張 BMP Width/Height，命名成 barcode bounds 並可報 PASS | 分離 canvas、ink；真正 symbol bounds 未經 decoder／模組驗證，永不冒稱 PASS |
| X-dimension | 直接把 Index+1 視為點數，重寫 Index/Mils/Millimeters/Density；若基線已達容差甚至沒有證明 setter 有效 | 移除點數假設及 Density 改寫；Index-only 是明確標示的實驗，以數值＋raster 反應驗證，不預設支援 |
| 保存驗證 | 原版 Code128 有 root/source 驗證，但 DM 的 root/source/native Type 重開驗證不足；沒有重開後再寫 payload | 兩種 barcode 重開後都檢查 Type/root/source/value/幾何/XDimension/raster，且改成第二值再還原並確認其他測試物件不受影響 |
| 回傳／watchdog | SELF_CHECK 失敗未保證產生回傳 ZIP；watchdog 僅看 PID，且可能和主程式同时壓縮 | 新入口打包 preflight 失敗；排除既有 BarTender process，檢查啟動時間，先停 owned runner 再壓縮 |

名稱差集本身不是穩定的 native object GUID。現行架構用「獨立、起始為空、每次只接受一個 top-level barcode」降低風險；不把同名／group／多物件元件硬猜成目標。工作文件只插入一次選中的元件，再做完整雙向 delta 與 Find 身分核對。沒有宣稱能偵測所有不改名但改變內部內容的第三方 component 副作用。

## C. 實際修改檔案

- `program/XmlCore.psm1`：移除已退役的 feeder／donor 操作；重寫隔離掃描、literal payload、Index 實驗、独立結果與存檔驗證。
- `program/Test-XmlCore.ps1`：改成真正涵蓋 transport、array、rollback、transform、raster、no-op SetXML 的 mock regression。
- `program/Run.ps1`、`program/Watchdog.ps1`：程序 ownership／啟動時間、600秒總上限、超時回傳收斂。
- `program/SELF_CHECK.ps1`、`program/CORE_TEST.cmd`、`program/core-test.json`：整合單次入口、回歸與掃描預算。
- 新增 `program/Launch-Core.ps1`：清除舊回傳包，包裝 preflight／runner 失敗。
- 新增 `program/RasterEvidence.cs`：直接解析 ExportToFile 的 uncompressed BMP，保存 canvas、ink、DPI header；沒有改圖／重製條碼。
- 新增 `program/ReviewFixtures.cs`、`program/Test-ReviewPersistence.ps1`：純離線 fixture，涵蓋新 instance 重開與六種損壞拒絕、Code128 不可用仍測 DM。
- 更新入口說明、來源說明及本報告；保留未改動的原始 evidence。

`validation/change-manifest.json` 列出逐檔 SHA256 與新增／修改狀態。歷史 `Core.psm1` 等仍保留，但本次 CORE_TEST 不會走那些入口。

## D. 為何不再猜 API

已逐筆解析隨附 `installed-api.json` 的861個 members，並在真實執行時重新讀取安裝 TypeLib。主要合約：

| 介面／成員 | 真實 TypeLib 合約 | 用法 |
|---|---|---|
| IBtFormat.InsertComponent | BSTR,R8,R8 → BOOL | 插入本機元件 |
| IBtFormats.Add | 無參數 → Format pointer | 每段掃描只開一個空白臨時文件 |
| IBtDesignObjects.Delete | BSTR → BOOL | 清理此次插入物件，並驗證空集合 |
| ExportDataSourceValuesToXML | 無參數 → BSTR | 取得現有資料來源格式 |
| ImportDataSourceValuesFromXML | BSTR → BOOL | 只改 literal 值，不改來源型態／引用／transform |
| IBtDesignObject.Value | PROPERTYGET → BSTR；無 setter | 僅拿來核對 transforms 後的有效 payload |
| GetXML | BOOL,BOOL → BSTR | 取得 object root/source/XDimension 實際內容 |
| SetXML | BSTR → VOID | 限定用於尺寸實驗；呼叫沒有 exception 不代表節點生效 |

**「Value 可直接寫」要分兩件事：** COM `DesignObject.Value=` 不支援；乾淨 EmbeddedDataSource 的值能否透過已存在的匯入 API 修改，則用兩個不同字串與有效 Value 回讀驗證。這不會重試使用者禁止的「清空 ObjectValue 以移除引用」路線。

**仍有待驗證的語意：** TypeLib 不保證 XDimension XML 的 Index 是可寫屬性。Index-only 試驗是受控、會保留原始 request/readback 的能力探測，不能聲稱已經是官方支持的尺寸 setter。若沒反應，本包明確記錄 INDEX_WRITE_NOT_PROVEN，不回到猜 BarcodeId／Symbology 或修改 composite sources。

### Circular Code 128 與一次掃描

官方把 Circular Code128 定義成環形變體，主要用途包括光碟。插入成功只證明 InsertComponent 會執行，不能證明插入的是一般直條碼，也不能證明其資料來源乾淨。

本 ZIP 沒有那798個 .btc，也沒有完整安裝目錄。不能離線宣稱已看過每個 .btc。現行程式會：一次列舉安裝／BarTender Components 目錄 → basename 排序 → SHA256 去重 → 同一個空白 Format 插入 → 檢查唯一 barcode、root、source、transforms → 兩值改寫 → 清理。找到即停止；不必每候選 SaveAs／Open／Close。

相同內容的 .btc 不會重複做 COM 檢查。每候選 Object enumeration 僅處理自己的0～少數物件，而非反覆列舉使用者的41個物件。選中的 .btc 與原始 XML、每次 rejected 原因、掃描覆蓋範圍都會包含在回傳包。

如果本機根本沒有合格單物件 Code128 component，不能保證程式憑空找到。較好的後續產品架構是開發端維護經驗證、版本化的 native template/component bank，而不是每張客戶 BTW 都重新找 donor；使用者無需自己建模板。沒有合格 component 時應由開發端有授權的 Designer 環境準備資產，不能再套用已失敗的 API 改碼制路線。

### 3.33 mil / dot 是否合理

在「Index 為零起算連續整數點數」假設下：10/3=3.3333 mil；13.33/4=3.3325 mil；接近300 dpi 的1000/300 mil。兩個相鄰觀測的差也約3.33 mil。因此**很合理的假設，但不是證明**。

官方說實際 X-dimension 取決於選定印表機與解析度，並量化到可用值；未保證 XML Index 的普遍映射。原 XML 10.000 mil 同時顯示0.250 mm，也說明它含顯示捨入（精確換算應是0.254 mm）。不能用它反推出適用所有 printer 的精確 dot pitch。

本版紀錄文件的 Printer 名稱，dot pitch 標為未驗證；不把600 DPI匯出解析度當印表機解析度。先試相鄰 Index，再僅依已觀察的局部寬度變化選少量候選；每次保留 XML/BMP，最後還原最佳**已觀測**狀態。不會為了湊32 mm而假裝物件 Width 支援 barcode，或設 DataMatrix.Height。

32 mm／12×12 mm 也不保證恰落在可用的 module／printer-dot 組合。必須用真實 payload 編碼後的模組數與實機渲染判斷最近可達尺寸；離線不能擅自把舊0.85 mm容差當使用者驗收標準。

### ExportToFile 到底量什麼

官方只承諾匯出「object image」，沒有承諾影像外框就是 symbol bounds。caption、quiet zone、padding、圓形或其他圖形皆可能影響画布。**原本整張 BMP 寬高不得報 actual barcode size PASS。**

新程式分開記錄 canvas pixels、黑色像素 bounding box、header DPI、requested DPI。Ink box仍可能包含 caption、外框或其他裝飾；因此本包永遠標記 `NOT_VERIFIED_NO_DECODER`。沒有 HumanReadable=None 證據時不做自動 Index 探測；不猜 XML 裡未出現的 caption setter。

真正32 mm／12×12 mm驗收需要：從輸出的真實 BMP 解碼並核對 payload，識別 Code128 bar region／DataMatrix finder+module grid，分開 quiet zone，確認匯出縮放與模組 pitch。可在收到 RETURN ZIP 後由開發端離線做，使用者不用量圖。此包沒有內建 decoder，不聲稱完成這一步；實際列印與掃碼也仍 NOT RUN。

### SaveAs → Close → Reopen

每次只 SaveAs 一次 diagnostic.btw，釋放 Objects、Close(DoNotSave)、釋放 Format，重新 Open 同一路徑。檢查：名稱集合、原生 Type、barcode XML root、單一 Embedded source、無 source transforms、payload、X/Y/rotation/字級/1D高度、XDimension與canvas/ink量測是否保持。另核對所有物件的 DoNotPrint。

重開後再改第二組 literal payload，確認其他測試物件 Value 未變，再還原並 Close(DoNotSave)。保存檔案 hash 前後必須相同，原始輸入 BTW hash 全程相同。

這能檢查磁碟重開與再編輯；**不是重新啟動 BarTender process 的 cold-start驗收**，也沒有證明 anchor 是左上角、視覺無重疊或列印可掃。status 明確保留這些限制。

## E. 下一次 Windows「一次」應收集的證據

1. Windows／PowerShell／BarTender版本與本機 TypeLib 合約。
2. 完整元件候選清單、排除理由、實際掃描範圍／是否逾時、合格 .btc 原檔/hash。
3. 插入前後名稱與物件數：原41→42時新增必須只有一個精確名称；不得空白串接全部名称。
4. 普通 Code128 的native Type/root、DataSources=1、Embedded=1、ObjectValue=0、PrefixSuffix=0、DataEntry=0；兩個不同payload精確回讀。
5. Code128／DataMatrix各自XDimension request/readback、基線／相鄰／候選／最終BMP；32 mm／12×12 mm先記觀測值，不以canvas當PASS。
6. 即使Code128無法成立，文字與DataMatrix仍完成各自驗證。
7. 一次SaveAs/Close/Reopen後的全部結構／值／幾何／raster、第二payload寫入、原始與保存檔hash。
8. 成功／失敗／preflight異常／COM逾時盡可能由同一入口產生RETURN_TO_CHATGPT.zip。若檔案系統禁止寫入或PowerShell根本不存在，無法保證生成ZIP。

## F. 執行結果與仍然 NOT RUN

已執行：Linux PowerShell 7.4.6；14個PS脚本／模組解析、4份設定JSON、C# helpers編譯、861-member TypeLib合約、陣列／反射transport／隔離scan／部分插入清理／source嚴格檢查／BMP palette與畫布分離／SetXML不生效拒絕、8種完整mock持久化情境。紀錄在validation/。

尚未執行：Windows PowerShell5.1原生parser/行為、BarTender COM、真正.btc來源內容、Index寫入是否真的生效、32 mm／12×12 mm條碼本體尺寸、真實BarTender存檔重開、Designer視覺、列印及掃碼。**全部明確NOT RUN／NOT VERIFIED，不能用mock替代。**

本環境没有Windows/BarTender；取得的是PowerShell7執行環境，仅用來跑離線測試。未要求使用者先測17c。

## 證據版本注意

ZIP內`latest-report.json`實為blockers-12，`latest-result/report.json`為blockers-10，另外有blockers-13／controlled-donor-14的原始回傳。17b插入成功／41→42的資訊來自使用者本次說明和START_HERE，而不是ZIP內獨立可重查的17b runtime report。尊重該實測結果，不將較舊檔名誤稱17b證據。所有原始evidence保持byte-identical。

## 官方來源

- [BarTender 2022 X Dimension](https://help.seagullscientific.com/2022/en/Content/HIDD_BC_XDIM.htm)
- [DesignObject.Value：read-only](https://help.seagullscientific.com/2016/en/Subsystems/ActiveX/Content/Value_Property%28DesignObject%29.htm)
- [DesignObject.ExportToFile：object image](https://help.seagullscientific.com/2021/fr/Subsystems/ActiveX/Content/ExportToFile_Method_%28DesignObject%29.htm)
- [Circular Code128](https://help.seagullscientific.com/2016/en/Subsystems/Symbology/Content/CircularCode128.htm)
- [PowerShell return／pipeline](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_return)

較早版的官方Value/ExportToFile說明與本包2022 R2 TypeLib相互核對；它們不能替代真正2022 runtime驗證。

## V4 cross-review after real V3 evidence

The V3 return is materially positive. The clean native Code128 creation/payload route is no longer the blocker. The real failure was `IBtDesignObject.Width` at runtime on `Bar Code 1` during a diagnostic probe even though TypeLib exposes a generic Width member. V4 therefore stops treating generic Width as a required barcode capability.

V4 changes only the remaining Code128 measurement/persistence path:
1. No Width getter/setter is used by the XDimension probe or required by the API gate.
2. One bounded HumanReadable hide experiment is attempted through the already-used object XML roundtrip. It must read back `Visibility=None` and preserve the main literal payload; otherwise the exact original XML is restored.
3. Code128 then uses the same bounded empirical XDimension sampling model already proven on Data Matrix. With hidden HumanReadable, raster ink width is layout evidence for the bars. If caption hiding is rejected, sizing continues but is explicitly labelled total-ink layout-only evidence.
4. Height remains the documented/read-write native property used for the 4.5 mm target.
5. SaveAs -> Close -> Reopen verifies payload, native type, literal single-source structure, Height, final XDimension and raster repeatability. If HumanReadable hiding succeeded, its hidden state must persist after reopen.

Still NOT RUN until another Windows execution: the V4 Code128 XDimension/raster-width path and Code128 persistence after that path. Scanner readability, quiet zone, decoder-confirmed symbol bounds and physical print remain outside this diagnostic acceptance.
