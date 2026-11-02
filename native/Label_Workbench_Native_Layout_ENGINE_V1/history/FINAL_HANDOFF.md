# Label Workbench BarTender Deep Review — final handoff

本次以使用者提供的 `Label_Workbench_BarTender_Deep_Review(1).zip` 為唯一基線，沒有讀寫 GitHub。

## 本次先核對到的事實

附件仍是前一輪 Deep Review 基線；程式內尚未包含後續口頭回報的兩項最終補強：

1. Code128 clean component 的 IDEAL／FALLBACK HumanReadable 選擇。
2. BMP requested DPI vs header DPI sanity check，以及中途 DPI 不一致時禁止最佳 Index 選擇。

因此本次只補上述兩項，其他 InsertComponent、payload、SaveAs／reopen 架構保留。

## 本次修改檔案

- `program/XmlCore.psm1`
  - `component-scan.json` 新增 `humanReadableVisibility`、`selectionClass`。
  - clean + `HumanReadable Visibility=None` → IDEAL，立即選用。
  - clean + visible/unknown → FALLBACK，繼續掃描；只有 fallback 時仍可進行 payload／persistence。
  - FALLBACK sizing → `status=SKIPPED_CAPTION`、`execution=NOT_RUN`。
  - BMP 紀錄 `requestedDpi`、`headerDpiX/Y`、`dpiTrust`、`physicalMmTrust`。
  - 有效 header DPI 與 requested DPI 超過 `max(1 DPI, 1%)` → physical-mm 欄位不計算，標記 UNTRUSTED。
  - baseline DPI mismatch 不進 Index probe；中途 mismatch 抑制整次最佳 Index 選擇、slope 標記 UNTRUSTED，還原基線。
  - reopen 驗證容許 sizing 被明確 skip，不會因此破壞 payload／SaveAs／reopen 診斷。
- `program/ReviewFixtures.cs`
  - 新增可控 HumanReadable visibility 與 BMP header DPI fixture。
- `program/Test-XmlCore.ps1`
  - 新增 visible clean → None clean 必選 IDEAL。
  - 新增 visible-only → FALLBACK，但 sizing NOT_RUN／SKIPPED_CAPTION。
  - 新增 DPI match、baseline mismatch、mid-probe mismatch 回歸案例。
- `START_HERE.md`、`TECHNICAL_REVIEW.md`、`program/README.md`
  - 更新本次交叉複查狀態與限制。
- `validation/final-handoff-validation.json`
  - 記錄本次實際執行環境及可／不可執行的驗證。

原始 `evidence/` 26 個檔案已與使用者提供 ZIP byte-for-byte SHA256 比對，全部未變更。

## 本次實際驗證

執行環境：Debian GNU/Linux 13.3。

PASS：

- 13 份 JSON 可解析。
- evidence 內 14 份 XML 可解析。
- 26 個 evidence 檔案與使用者提供 ZIP byte-for-byte 相同。
- 必要 source markers／新增 regression 情境存在。
- PowerShell／C# 做 gross delimiter static check，未發現括號結構破損；這不是正式 parser／compiler。

NOT RUN：

- PowerShell parser：環境沒有 `pwsh`／`powershell`。
- PowerShell mock regression：沒有 PowerShell runtime。
- C# compile：環境沒有 `dotnet`／`csc`／`mcs`。
- Windows PowerShell 5.1。
- 真實 BarTender 2022 COM／.btc scan。
- Code128 32 mm、Data Matrix 12×12 mm 本體尺寸。
- 真實 SaveAs → Close → Reopen 與重開後編輯。
- Designer 視覺、列印、掃碼。

包內較早的 PowerShell 7 validation logs 保留作歷史證據，但**沒有拿來冒充本次修改後的 PASS**。

## Windows 端未來唯一操作

仍維持：

`雙擊 program\CORE_TEST.cmd → 選原始 BTW → 回傳 program\RETURN_TO_CHATGPT.zip`

本包完成的是程式與封裝；目前仍不能宣稱產品 POC 或條碼尺寸已實機通過。

## Launcher correction after user dry-run

The prior FINAL launcher executed SELF_CHECK before displaying the BTW picker. Therefore any preflight failure could immediately create RETURN_TO_CHATGPT.zip without ever asking the user to select a BTW. This was a launcher/UX defect, not evidence that the BarTender core test ran.

Corrected behavior in this package:

1. `CORE_TEST.cmd` starts Windows PowerShell in STA mode.
2. `Launch-Core.ps1` displays the `.btw` picker **before** SELF_CHECK and before BarTender activation.
3. The selected path and SHA256 are written to `program/SELECTED_TEMPLATE.txt`.
4. SELF_CHECK then runs. On failure, the return ZIP contains `SELECTED_TEMPLATE.txt`, `PREFLIGHT_LOG.txt`, and `LAUNCH_ERROR.txt`.
5. On success, `Run.ps1` is invoked with an explicit `-TemplatePath`, so it does not need to show a second picker.
6. Core diagnostic logic was not otherwise rewritten in this correction.

Windows PowerShell 5.1 and real BarTender execution of this corrected launcher remain NOT RUN in the authoring environment.
