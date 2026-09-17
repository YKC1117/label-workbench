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

It also contains six independent Text objects (`TEXT_EDIT_001` through `TEXT_EDIT_006`) at deterministic positions on a 100 x 65 mm template.

## What must be run on a Windows PC with BarTender installed

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\verify-btw-runtime-suite.ps1
```

The suite performs all of these steps automatically:

1. Generate the deterministic 5 Code128 + 1 Data Matrix + Text `.btw` fixture.
2. Reparse it before BarTender starts.
3. Launch the installed `bartend.exe` and force BarTender to open, save, close, and exit.
4. Reparse the file that BarTender actually saved and verify the six independent barcode values, Text values, positions, template size, object count, and 2022 header.
5. Open the BarTender-saved file a second time, force another save, then reparse it again.
6. Write a JSON acceptance report containing the detected BarTender executable/product version, output paths, SHA-256 hashes, and PASS/FAIL state.

This is stronger than checking that `bartend.exe` returned exit code 0: the post-save bytes are parsed after each real BarTender save.

## Optional print-pipeline check without intentionally sending a physical label

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\verify-btw-runtime-suite.ps1 -PrintToFile
```

This adds a BarTender `/P /C=1 /PRNFILE=... /X` pass and requires a non-empty printer output file. It still depends on a usable printer driver being installed on that Windows machine.

## Remaining manual UI acceptance

Automated open/save/reopen and optional print-to-file validation cannot prove that a human can select every template object with the BarTender designer UI. Before calling the feature completely finished, perform one final UI check in BarTender 2022: select and change one Text object, each of the five Code 128 objects, and the Data Matrix object; save; reopen; then confirm the edits remain independent.
