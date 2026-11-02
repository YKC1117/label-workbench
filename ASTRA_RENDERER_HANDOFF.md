# Label Workbench｜BarTender 2022 Renderer 交接

基準 5ee1c6195d570e153e780573903f75c00452d8db。範圍為獨立工程原型，產品與 Windows 實測狀態均為 NOT RUN。

## 1　根因與證據層級

使用者在 Windows Designer 實際回報重疊、文字大小失控及條碼高度錯誤。正式 controlled donor 會為條碼寫 X/Y 與 X-dimension，條高沿用 donor；旋轉也是 inherit-donor，文字以寬高推算字級。這些欄位不構成完整的可視物件幾何。來源框左上直接映射到模板座標也不能通用。專案歷史 object-1-before.xml 明列 BottomLeft，官方 X 屬性明指 anchor。這證明存在兩種座標定義；缺少本次失敗檔的逐物件對照，無法把每一處重疊唯一歸因於 anchor。主線資產見 https://github.com/YKC1117/label-workbench/tree/5ee1c6195d570e153e780573903f75c00452d8db

歷史 Windows 報告記錄三種物件可 Save/Close/Reopen，Code128 的 Height 符合設定，寬度的最近墨跡誤差仍達 3.721 mm。Data Matrix 的模組索引變動會影響 raster，該例墨跡尺寸誤差 0.192 mm。這是舊案例，不能為本原型背書。證據位置為上述基準的 native/Label_Workbench_Native_Layout_ENGINE_V1/evidence/latest-v4-final-RUN_SUMMARY.txt。

## 2　API 能力與限制

| 路徑／物件 | 可用能力 | 限制與原型策略 |
|---|---|---|
| ActiveX Format / DesignObject | X/Y 是文件單位中的 anchor，RotationAngle 為角度。FontName、FontSize 能控制文字字體與點數。物件與整頁可匯出圖片。 | 2022 文件列 Automation、Enterprise。Designer for Argox 能開檔不能證明其授權可建立 Automation session。正向角度為逆時針；本原型只接受 0 度。 |
| 普通文字 | 字體、字級、位置與旋轉 | 單行文字無可任設的 Width/Height；段落文字支援 Width。普通文字的高由字型與內容產生。原型以寬高作左對齊容納框，檢查墨跡邊界，未強制字形拉伸。 |
| Rich Text | Width 與 Height 有條件可寫 | 高度需固定尺寸或指定自動縮放模式。字型／字級可能由內文格式控制。尚未證明可同時鎖框、字級、可編輯文字及對齊。不得視為已解。 |
| Code128 | 明確的 COM Height、X/Y、RotationAngle | 無直接條碼 Width setter。模組寬、payload 編碼與印表機決定條寬。HumanReadableValue 是讀值，不控制 caption 排版；本案用既有物件 XML 管道將 Visibility 設為 None 並回讀。 |
| Data Matrix | 位置與旋轉；本機 XML 的 XDimension 節點與單物件 raster | 無任意獨立 W/H。模組寬、矩陣行列與編碼共同決定尺寸。原型只測方形；模組 Index 不等於印表機點數，必須比對讀回的實際毫米。 |
| 建立與修改 | 安裝型別庫證據有 DesignObjects.Create、Format.InsertComponent、GetXML/SetXML；沿用專案 Create(5) 建立 Text、InsertComponent 放入真正原生條碼物件 | 公開 2022 DesignObject 頁未列這些版本相關 XML setter。這些屬安裝環境證據，不宣稱跨 SKU 的公開契約。ReferencePoint=TopLeft 也只當待證寫入；無法回讀立即阻擋。Alignment 無已查證的通用 COM setter；upright 左對齊由渲染檢查，沒有證明底層 Alignment 屬性。 |
| .NET Print SDK | 原廠描述可修改文字／條碼物件及資料來源 | 未取得足以證明 2022 SDK 可從零建立四物件並完整控制上述幾何的文件。此輪不另開 .NET 實作。 |
| BTXML Script | Print、FormatSetup、ExportPrintPreviewToImage | 2022 Command 文件沒有列出設計物件建立指令。物件 GetXML/SetXML 與 BTXML Script 是不同介面。 |

官方文件：

- [2022 DesignObject 與授權](https://help.seagullscientific.com/2022/fr/Subsystems/ActiveX/Content/DesignObject_Object.htm)
- [2022 X 與 anchor](https://help.seagullscientific.com/2022/fr/Subsystems/ActiveX/Content/X_Property.htm)
- [2022 Width](https://help.seagullscientific.com/2022/fr/Subsystems/ActiveX/Content/Width_Property%28DesignObject%29.htm)
- [2022 Height](https://help.seagullscientific.com/2022/en/subsystems/activex/Content/Height_Property%28DesignObject%29.htm)
- [2022 BTXML Command](https://help.seagullscientific.com/2022/en/Subsystems/BTXML/Content/Command_Tag.htm)
- [原廠 Integration Methods，含 .NET SDK](https://www.seagullscientific.com/media/1371/bartender-integration-methods.pdf)

## 3　架構裁決

**RETIRE AS PRIMARY RENDERER**。原生 .btc 是透過 Format API 插入的元件，可保留。停用手改 BTW 位元組作為通用版面產生的預設技術路線，此次沒有改正式站。

## 4　單一 Layout Model

Quick Analysis 已完成裁切與方向正規化的 sourceBox × 標籤實際 mm → canonical.json。fixture.json 使用同形狀的 Quick Analysis 物件，另附已明定樣式與印表機模組規格。樣式依序對應四個 fixture 物件，這是受控實驗輸入；現階段不從圖片推斷字體或模組。座標原點是標籤左上，單位 mm。文字 W/H 是容納框；條碼 W/H 在本樣本明訂為不含 quiet zone 的符號墨跡尺寸。一般客戶偵測框的語意需要另行標註，不可直接套用 fixture 的墨跡容差。

Windows renderer 只消費 canonical.json。它不另算 font size、條高或模組。對明定 moduleIndex 寫入後以 Mils × 0.0254 核對 moduleMm（0.001 mm），不符即停，不重新搜尋「接近」的索引。若目標、payload 或印表機無法共存，應記錄無解。

## 5　已完成原型與驗證

100 × 50 mm 控制樣本，兩段 Arial 9 pt / 18 pt，Code128「AB12」設定高度 9 mm、模組 0.254 mm，Data Matrix「ABC」設定模組 0.338582 mm。完整可執行入口 PROBE.cmd。需求為 Windows PowerShell 5.1、Node 18+、可自動化的 BarTender 2022、可使用的印表機及標準 Data Matrix 元件。Code128 元件已隨包。

保存前後讀回 payload、物件型別、字型／字級、幾何與 XML；重開後輸出全頁與單物件 BMP，驗證 SHA 不變。用單物件墨跡在整頁唯一定位，儲存 prototype-render.json。四物件用 0.5 mm 作受控樣本實驗門檻；text 驗左側與是否溢出，條碼驗墨跡位置及寬高。無法辨認、參考點缺失、字體被替換、印表機量化不符或重開後不一致皆不能標記成功。

離線 PASS：fixture 轉模型、物件數與類型、9/18 pt 資料、缺尺寸與樣式拒絕、文字／條碼不同框政策、既有合成 BMP 位移與歧義檢查。Windows COM / PS5.1、此次四物件真實渲染、實際 .btw、編輯性、掃讀均 NOT RUN。現階段沒有可稱為已驗證還原成功的 BTW。

## 6　檔案

新增 layout.cjs、fixture.json、canonical.json、PROBE.cmd、program/probe-render.cjs、此交接檔。原型副本中的 NativeLayoutEngine.psm1 擴充 canonical 輸入、明定模組讀回、ReferencePoint 證據；Build-NativeLayout.ps1 對此 schema 強制捕捉渲染並使用原型檢查器。其餘 native 程式及型別庫紀錄從指定 main 複用。

## 7　未完成

真實 Windows 產檔與渲染、OEM 授權能力、文本寬高同時定值、alignment setter、非零旋轉及其視覺 anchor、帶 caption 條碼、一般原稿框語意與內容自動樣式決策。此模型不支援的方向與樣式須先拒絕。

## 8　下一位 GPT 的施工順序

1. 工程端先在具 Automation 授權的隔離 Windows runner 確認版本、授權、印表機、元件與 COM 型別。執行 PROBE.cmd 一次，保存 runtime.json、native-build-report.json、前後 XML、BMP 及 prototype-render.json。優先查看第一個失敗的 stage，維持未證實項目狀態。無該環境時暫停 Windows 結論。
2. 若 ReferencePoint 寫入未讀回，檢查不同物件的實際 XML 與原廠屬性語意；先釐清預設屬性被省略或 setter 被忽略。不能把字串缺席直接當作左上。
3. 若普通文字可定位但不能滿足固定框，單獨準備一個段落文字或已設定固定尺寸的 Rich Text 元件，只比較寬高讀回、換行、字級及編輯後重開。先取得該結果再決定一般文字的物件類型。
4. 對條碼分別保存實體 module、實際 symbol rows/columns、quiet zone 及 ink box；超差定位到來源框語意或印表機可實現的模組，勿對 X/Y 加經驗補償。四物件可視驗證通過後才有理由規劃網站與 Windows worker 串接。
