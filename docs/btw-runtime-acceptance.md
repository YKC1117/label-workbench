# BarTender 2022 native BTW runtime acceptance

This acceptance path is intentionally separate from normal Linux CI because GitHub-hosted QA does not have BarTender installed.

## What CI proves

`tests/runtime-fixture-smoke.cjs` generates a deterministic BarTender 2022 fixture from the sanitized single donor and reparses it. The fixture contains six independent native barcode objects:

- Code 128: `C128_ONE_111`
- Code 128: `C128_TWO_222`
- Code 128: `C128_THREE_333`
- Code 128: `C128_FOUR_444`
- Code 128: `C128_FIVE_555`
- Data Matrix: `DM_ONE_666`

It also contains six independent Text objects (`TEXT_EDIT_001` through `TEXT_EDIT_006`) at deterministic positions on a 100 x 65 mm template. The verifier rejects extra visible donor Text objects.

Each successful QA run publishes an artifact named `bartender-2022-runtime-acceptance`.

The artifact is a portable acceptance kit containing:

- `LabelWorkbench_Runtime_Acceptance.btw` — ready to open directly in BarTender 2022.
- `RUN_BARTENDER_2022_ACCEPTANCE.cmd` — double-click launcher for automated runtime acceptance.
- `RUN_BARTENDER_2022_MANUAL_EDIT_VERIFY.cmd` — double-click verifier for the final Designer UI edit test.
- `tools/` — fixture generator, post-save verifier, manual-edit verifier, and BarTender runtime PowerShell scripts.
- `assets/` — only the BTW parser/generator modules required by the acceptance suite.
- `SHA256SUMS.txt` — hashes for every packaged file.
- `README.md` — this guide.

If you only want to open the test BTW in BarTender manually, Node.js is not required. Node.js 22 or newer is required for the automated structural/runtime verifiers.

## Easiest automated Windows acceptance

1. Extract the downloaded artifact ZIP.
2. Save and close any currently open BarTender work.
3. Double-click `RUN_BARTENDER_2022_ACCEPTANCE.cmd`.
4. The launcher checks that Node.js is available, then runs the complete acceptance suite.
5. A successful run writes `runtime-acceptance-report.json` beside the launcher.

The launcher does **not** intentionally print a physical label.

## Equivalent PowerShell command

From the extracted kit or repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\verify-btw-runtime-suite.ps1 -ReportPath .\runtime-acceptance-report.json
```

The suite performs all of these steps automatically:

1. Generate the deterministic 5 Code128 + 1 Data Matrix + Text `.btw` fixture.
2. Reparse it before BarTender starts.
3. Launch the installed `bartend.exe` and force BarTender to open, save, close, and exit.
4. Verify the actual executable is BarTender 2022 by requiring ProductVersion `11.3.x`.
5. Reparse the file that BarTender actually saved and verify the six independent barcode values, exactly six visible Text objects, positions, template size, object count, and 2022 header.
6. Open the BarTender-saved file a second time, force another save, then reparse it again.
7. Write a JSON acceptance report containing the detected BarTender executable/product version, output paths, SHA-256 hashes, and PASS/FAIL state.

This is stronger than checking that `bartend.exe` returned exit code 0: the post-save bytes are parsed after each real BarTender save.

## Optional print-pipeline check without intentionally sending a physical label

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\verify-btw-runtime-suite.ps1 -PrintToFile -ReportPath .\runtime-acceptance-report.json
```

This adds a BarTender `/P /C=1 /PRNFILE=... /X` pass and requires a non-empty printer output file. It still depends on a usable printer driver being installed on that Windows machine.

## Final BarTender Designer UI acceptance

The last step proves that a human can select and edit each native object independently inside BarTender Designer, then save and reopen the document.

Open `LabelWorkbench_Runtime_Acceptance.btw` in BarTender 2022 and make **exactly these seven edits**:

| Object | Original value | Change to |
| --- | --- | --- |
| Text | `TEXT_EDIT_001` | `TEXT_MANUAL_OK_001` |
| Code 128 #1 | `C128_ONE_111` | `C128_OK_ONE_111` |
| Code 128 #2 | `C128_TWO_222` | `C128_OK_TWO_222` |
| Code 128 #3 | `C128_THREE_333` | `C128_OK_THREE_333` |
| Code 128 #4 | `C128_FOUR_444` | `C128_OK_FOUR_444` |
| Code 128 #5 | `C128_FIVE_555` | `C128_OK_FIVE_555` |
| Data Matrix | `DM_ONE_666` | `DM_OK_ONE_666` |

Do **not** change `TEXT_EDIT_002` through `TEXT_EDIT_006` or move any objects.

Then:

1. Save As `LabelWorkbench_Runtime_Acceptance_EDITED.btw` in the same folder as the kit.
2. Close the document and reopen `LabelWorkbench_Runtime_Acceptance_EDITED.btw` in BarTender 2022.
3. Confirm visually that the seven edits are still separate and no unused donor object appears on the normal 100 x 65 mm label canvas.
4. Close BarTender.
5. Double-click `RUN_BARTENDER_2022_MANUAL_EDIT_VERIFY.cmd`.

The manual-edit verifier reparses the BarTender-saved BTW and requires:

- exactly 6 visible Text objects;
- exactly 5 independent Code 128 objects;
- exactly 1 independent Data Matrix object;
- the seven requested edited values;
- unchanged object positions and 100 x 65 mm TemplateSize;
- the original seven visible values to be gone;
- BarTender 2022-compatible document headers to remain intact.

Only after both the automated runtime acceptance and this manual Designer edit verification pass should this acceptance layer be treated as complete and merge-ready.
