# ONE_SHOT V4 handoff

## Real V3 result

The returned V3 run completed without a top-level exception and is preserved in `evidence/latest-real-v3-return.zip`.

Real PASS / strong evidence:
- Text: payload, X/Y, rotation, font size, SaveAs/Close/Reopen.
- Code128: one native `BarCode-Code-128`, exactly one main `EmbeddedDataSource`, no main source transforms, payload `LWB-C128-001` effective/readback OK.
- Data Matrix: one EmbeddedDataSource, payload effective/readback OK, target X/Y within tolerance, bounded XDimension response, trusted 600-DPI raster repeatability, SaveAs/Close/Reopen, and second payload editability.
- Data Matrix nearest/selected trusted raster at Index 8: ink about 12.192 x 12.192 mm for a 12 x 12 mm layout target.

Real V3 blocker:
- Code128 diagnostic stopped at generic COM `Width` getter. Therefore Code128 geometry, XDimension sizing and persistence were NOT RUN even though payload creation was already successful.

## V4 change

- Removed Width getter/setter from required review API signatures.
- Removed Width/Height reads from the generic single-step XDimension probe.
- Added bounded Code128 HumanReadable hide/readback/rollback capability.
- Code128 now runs bounded empirical XDimension raster sizing instead of stopping at the generic Width getter.
- If HumanReadable cannot be hidden, the run continues with a clearly labelled layout-only total-ink-width basis.
- Code128 Height 4.5 mm is still written/read with native Height.
- Reopen now also checks HumanReadable=None if that hide capability succeeded.
- `report.output` is populated with the diagnostic BTW path.

## User operation

`CORE_TEST.cmd` -> choose the same original BTW -> upload only `RETURN_TO_CHATGPT.zip`.

No GitHub work is required.

## Offline validation completed in this handoff

- Parsed all JSON files present after the V4 edits: PASS.
- Parsed all XML evidence files: PASS.
- PowerShell delimiter/structure sanity across `.ps1` / `.psm1`: PASS.
- Confirmed no remaining runtime `Width` getter/setter requirement in `XmlCore.psm1`: PASS.
- Confirmed all 28 evidence files inherited from V3 are byte-for-byte unchanged: PASS.
- Added the returned real V3 ZIP and extracted V3 report as new evidence.
- ZIP integrity: checked after final packaging.

Not available in this Linux environment and therefore still NOT RUN before the next user test: Windows PowerShell 5.1 execution, C# compile under Windows PowerShell, and real BarTender 2022 COM for the new V4 Code128 path.
