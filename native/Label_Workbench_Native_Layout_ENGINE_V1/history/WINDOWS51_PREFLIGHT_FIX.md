# Windows PowerShell 5.1 preflight correction

This correction is limited to the target-machine launcher/preflight. BarTender core logic is unchanged.

Observed real-machine failure:
- BTW selection succeeded and the original SHA256 matched the known template.
- BarTender was not started.
- The preflight child emitted an `Add-Type` error before the parent could persist the full child log.

Corrections:
1. `Launch-Core.ps1` now captures child stdout/stderr with `Start-Process -RedirectStandardOutput/-RedirectStandardError`. A child error can no longer terminate the parent before `PREFLIGHT_LOG.txt` is written.
2. `SELF_CHECK.ps1` is now a target-runtime preflight. It compiles only real runtime helpers (`ComBridge.cs`, `ComMetadata.cs`, `RasterEvidence.cs`). `ReviewFixtures.cs` is developer-only mock code and no longer blocks the real Windows test.
3. `XmlCore.psm1` is imported during preflight to catch module-load failures before BarTender.
4. Existing developer mock tests remain in the package but are not counted as target-machine PASS.

Still NOT RUN until the next real test:
- BarTender COM component scan
- Code128 payload independence / sizing response
- Data Matrix sizing response
- SaveAs -> Close -> Reopen and second edit
- Designer visual / scanner acceptance
