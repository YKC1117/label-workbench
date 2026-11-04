# Eight-Text payload transaction review

Base branch HEAD 59250ce. Read CODEX_MULTI_OBJECT_HANDOFF.md in full. Run #36 artifact ID 13208705232 was downloaded and its SHA-256 verified as 25c617279e225ce45cafeb9eceeba13d6be73cc165906fd6f4ccac63f2b4bb17.

Verified from the actual artifact: TEXT_3 target XML changes literal value from LWLWLWLWLWLW to EXP 2027-12-31 and retains source ID {3FA6A9C6-F049-4293-AAB2-CB190BB7ED0E}. Its submitted import contains all donor Object rows, including barcode 1 with four SubString entries. The repository's original barcode 1 XML contains two ObjectValueDataSource nodes and transforms. Unused donor deletion runs only after all eight text payloads are assigned. This combination unnecessarily exposes linked donor graphs to a global import operation. Source-ID uniqueness alone does not prove absence of ObjectValue dependencies.

Not established by Run #36: the exact peer XML/COM fields changed. That artifact lacks the rejected peer's before/after pair. Classification A (normalization) versus B/C/D (real change, link propagation, global import effects) must remain pending actual captured deltas. No normalization exception or tolerance was added to peer equality.

Consolidated change: delete unused donor graphs immediately after selecting clean text slots, before any anchor/payload writes. Keep the eight independent Text slots, then insert only proven BTC barcodes. Payload import is constrained to one Object/one SubString Position 0/one Value, preserving wrapper and encoding. Check target DataSources changed only the literal Value and target identity stayed constant; the target barcode may legitimately resize in response to its new payload. Check all retained peers including parked slots, strict full XML plus COM identity/geometry/style/printability and effective payload. On any mismatch save peer before/after XML and complete structured semantic diff, then fail closed.

The same single Windows run includes a bounded unsaved three-Text replay of the original full-import mechanism. It writes legacy-payload-diagnostic/ and records diffs even for parked donor peers; originalRetainedPeer marks whether the old assertion would have protected that peer. Diagnostic mismatches are recorded without certifying that temporary document, and it is always closed without SaveAs. The real stress candidate then uses only the corrected path and never bypasses strict isolation. This supplies missing root-cause evidence without a second speculative Windows job.

Local Node renderer tests and stress canonical conversion passed. Windows PowerShell XML helper tests are part of SELF_CHECK_NATIVE and will execute on the same runner before COM. The eight-Text runtime result remains pending until the triggered run is inspected. Product acceptance remains NOT RUN / NOT COMPLETE.

## Windows execution status

Run #39 at fix commit 64b76281d573cd9caedc9a0cd4cfc5925035c3c7 completed Node regression and Windows PowerShell 5.1 / COM registration preflight. At 06:28:33Z the runner received a shutdown signal during PROBE.cmd, and GitHub cancelled the renderer step. Evidence collection/upload were skipped and artifact count was zero. This is an infrastructure interruption; no semantic normalization, data-source link or sparse-import outcome can be inferred from it.

A single retry of the interrupted job, without code changes, was requested. Its job ID is 125764984249 and it is queued awaiting an eligible runner. See multi-object-evidence/run39-status.json and the saved first-attempt job log. No further speculative renderer run was requested.


## Offline handoff after runner shutdown

The user confirmed LWB-FTUSER5 is offline. Stop at runtime verification. The same-commit retry is still queued for 64b76281d573cd9caedc9a0cd4cfc5925035c3c7; it must not be confused with latest branch verification. Subsequent review tightened target datasource protection without incorrectly requiring the target barcode footprint to stay constant during its own payload edit. All peer XML/COM isolation checks stay exact.

Suggested single probe when an eligible Windows runner is available: run the latest branch's PROBE.cmd against canonical-stress-8text.json through the existing [bartender-probe] workflow trigger, first resolving the older queued attempt to avoid duplicate execution. PASS requires 8 independent Text plus Code128/Data Matrix, all target values correct, every protected peer transaction PASS, no unintended shared sources, Save/Close/Reopen, editability, stable SHA through capture and 600dpi dual-render QA PASS with no unexpected overlap. Any target/source/peer mutation, unresolved registration, size/placement error, persistence mismatch or absent runtime evidence is FAIL/NOT RUN as appropriate. Overall product remains NOT COMPLETE.
