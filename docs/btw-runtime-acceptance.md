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

It also contains six independent Text objects (`TEXT_EDIT_001` through `TEXT_EDIT_006`) at deterministic positions on a 100 x 65 mm template. The verifier also rejects any extra visible donor Text object.

Each successful QA run publishes an artifact named `bartender-2022-runtime-acceptance`.

The artifact is a portable acceptance kit containing:

- `LabelWorkbench_Runtime_Acceptance.btw` — ready to open directly in BarTender 2022.
- `RUN_BARTENDER_2022_ACCEPTANCE.cmd` — double-click launcher for automated runtime acceptance.
- `tools/` — fixture generator, post-save verifier, and BarTender runtime PowerShell scripts.
- `assets/` — only the BTW parser/generator modules required by the acceptance suite.
- `SHA256SUMS.txt` — hashes for every packaged file.
- `README.md` — this guide.

If you only want to open the test BTW in BarTender manually, Node.js is not required. Node.js 22 or newer is required only for the automated open/save/reopen verification.

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

## Remaining manual UI acceptance

Automated open/save/reopen and optional print-to-file validation cannot prove that a human can select every template object with the BarTender designer UI. Before calling the feature completely finished, perform one final UI check in BarTender 2022:

1. Open `LabelWorkbench_Runtime_Acceptance.btw`.
2. Select one `TEXT_EDIT_00x` Text object and change its text.
3. Select each of the five Code 128 objects and change each value independently.
4. Select the Data Matrix object and change its value independently.
5. Save, close, and reopen the BTW.
6. Confirm every edit remains independent and no unused donor object appears on the normal 100 x 65 mm label canvas.

Only after this manual designer check and the automated runtime report both pass should this acceptance layer be treated as complete.
