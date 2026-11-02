# Label Workbench BarTender ONE-SHOT handoff

Purpose: stop the cycle of one-small-fix / one-user-test. This package is designed so one Windows + BarTender run gathers as many independent capabilities as possible.

Key changes in this handoff:

1. `ComBridge.cs` no longer has a compile-time dependency on `System.Management.Automation`; PSObject unwrapping is reflection-based. This targets Windows PowerShell 5.1 `Add-Type` compatibility without changing the COM call surface.
2. Target preflight only blocks on runtime PowerShell syntax/config and the mandatory COM bridge. Developer mock files no longer block a real-machine run.
3. `ComMetadata.cs` and `RasterEvidence.cs` are optional capabilities. If either cannot compile on the target, the run continues where technically possible.
4. If live TypeLib metadata cannot be read, the core may fall back to the packaged real-machine `evidence/installed-api.json` for contract checking instead of aborting all payload/SaveAs tests.
5. If raster evidence is unavailable, barcode sizing is explicitly NOT RUN while Code128/Data Matrix payload, geometry, SaveAs, close/reopen, and re-edit checks continue.
6. `RUN_SUMMARY.txt` is emitted into the return ZIP so one test exposes the status of each major capability without requiring another diagnostic-only round.

Still NOT claimed until the Windows run proves it:
- clean native Code128 component on the target install
- Code128 32 mm symbol-body sizing
- Data Matrix 12x12 mm symbol-body sizing
- save/close/reopen persistence on the real BarTender instance
- visual/print/scanner acceptance
