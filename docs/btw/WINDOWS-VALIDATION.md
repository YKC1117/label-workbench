# Windows BarTender 2022 acceptance

This procedure is pending. No successful Windows run is claimed.

## 1. Prepare the host and three clean templates

Use Windows, the actually licensed BarTender 2022 Automation/Enterprise installation, its matching ActiveX interop assembly, Windows PowerShell and Node.js 22. Save and close current BarTender work first. Record Help → About (edition, release/build, license state). Do not use a seed file's edition as evidence. If the helper cannot recognize the version/edition or interop API, stop and record the exact error; do not edit the gate to accept it blindly.

In Designer create **three blank documents**, using `tests/fixtures/btw/{A,B,C}.btjob.json` as the full object inventory. All are 80 × 50 mm, landscape. Make all anchors top-left; no external images, database connections, serialization, scripts, shared data values or default donor content. Each named native object must have one independently named embedded data source with the same ID. Object ID is not the same thing as a named data source: set BOTH.

- A: two independent Text objects.
- B: two Text objects + one genuine Code 128.
- C: two Text objects + genuine Data Matrix + genuine Code 128.

Copy coordinates/sizes/initial values from the fixture. Check barcode symbology in Designer and scan output; the generic ActiveX Barcode type alone cannot distinguish Code 128 from Data Matrix. Do not use bitmap barcodes. Save each template and reopen it. No extra hidden/off-canvas objects or additional templates.

Copy the corresponding `.template-manifest.example.json` outside the repo as an actual manifest and replace `templateSha256` with `Get-FileHash -Algorithm SHA256` (lowercase). Example manifests are intentionally invalid until real templates exist. Keep templates, completed manifests and About screenshots for review. Templates are unverified until the following regression succeeds.

## 2. Produce candidates through the official runtime

From repo root (repeat for B/C, changing paths):

```powershell
powershell.exe -NoProfile -File tools/btw/New-BtwCandidate.ps1 `
  -JobPath tests/fixtures/btw/A.btjob.json `
  -TemplatePath C:\BT-Test\A.btw `
  -ManifestPath C:\BT-Test\A.template-manifest.json `
  -InteropPath C:\BT-Test\Interop.BarTender.dll `
  -OutputDirectory C:\BT-Test\Candidates
```

`InteropPath` must point to the vendor interop assembly from the installed SDK, not an arbitrary downloaded DLL. The example path is a placeholder, not a claim about the install location. Confirm the installed SDK/bitness before running. This legacy API helper is for testing only. Output goes into a unique folder; no original template overwrite, no auto-print. It validates the exact manifest match and API-level count/native type/geometry/named values; saves and reopens. It reports **candidate-only**, never release-approved. `UNSUPPORTED_LAYOUT` means author a matching clean template in Designer; no arbitrary resize or silent fallback.

For a browser-confirmed JSON job, this helper currently handles one label per job. Multi-label jobs must use a future reviewed companion; the helper rejects them explicitly. The website's direct BTW button remains blocked; this offline workflow is not presented as fulfilling one-click download.

## 3. Observe Designer behavior and physical print

Repeat this command for each candidate A/B/C; replace placeholders:

```powershell
powershell.exe -NoProfile -File tools/verify-btw-runtime.ps1 `
  -BtwPath C:\BT-Test\Candidates\RUN-ID\candidate.btw `
  -Fixture A `
  -BarTenderExe 'C:\Program Files\Seagull\BarTender 2022\bartend.exe' `
  -Operator 'Actual tester name' -Edition Automation
```

The script binds evidence to the source fingerprint and fixture SHA. It launches an isolated copy, then requests explicit observations:

1. Correct 2022 licensed edition; no trial, corruption/repair/compatibility warning.
2. Exact object inventory, types, initial contents, page size/orientation/positions; no seed residue.
3. Select each object independently; change its value to `EDIT-TEXT_1`, `EDIT-BARCODE_1`, etc.; move its X and Y by +1 mm. Confirm others did not change.
4. Save, then Save As to the exact displayed path. Close normally.
5. Reopen the saved copy; all edited values and positions remain correct; select again.
6. Manually print one label, record printer/driver/DPI/stock, scan every barcode and compare exact value/symbology. A requires printed-text inspection.
7. Supply About, object inventory, reopened document screenshots and printed-label photo.

Any missing observation, unchanged saved file, bad process exit, timeout or missing evidence means failure. The script does not kill an operator's Designer process on timeout. Do not automate YES responses. Reports distinguish human observations from machine hash checks; screenshots need independent review.

## 4. Check the release gate

Only synthetic fixtures belong in repo evidence; never upload customer labels.

```powershell
node tools/btw-release-gate.cjs
```

Requires `runtime-evidence/A`, `B`, `C`, each with report, original/working/Save As BTW and four evidence images. All source/fixture/artifact hashes must match. Source changes invalidate previous observations. Preserve each prior run elsewhere; the verifier refuses to overwrite a run directory.

After an independent reviewer accepts actual artifacts and screenshots, require `BTW release — Windows Designer evidence required` in repository branch protection. Evidence validation in Ubuntu **does not run BarTender** and does not prove a future companion/browser download transport. Those require separate implementation, Windows tests and browser download/re-download tests before the one-click feature can be declared complete.
