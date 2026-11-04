> Historical snapshot. Run41 proves the upright 8-Text gate; Run45 proves the new 19-object A/B/C Text/barcode candidate. Read [GENERAL_RENDERER_HANDOFF.md](GENERAL_RENDERER_HANDOFF.md) for current evidence and remaining capabilities. Do not reopen solved primary-route issues.

# CODEX HANDOFF — Hybrid multi-object payload isolation blocker

Repository: `YKC1117/label-workbench`
Branch: `experiment/com-renderer-prototype`
PR: #35 (Draft)

## Do not
- Do not modify `main`.
- Do not deploy GitHub Pages.
- Do not ask the user to manually open/test BTW unless automated Windows evidence cannot answer the question.
- Do not regress or replace the already-passing Hybrid core without evidence.
- Do not disable/relax peer-isolation checks just to make the run green.
- Do not return to hidden `DesignObjects.Create(5)` as the primary Text renderer.

## Known-good milestone
Windows self-hosted runner: `LWB-FTUSER5`, Windows + PowerShell 5.1 + BarTender 2022 R2 Automation.

Run #34 / Run ID `41585508983`: **SUCCESS**.
Formal route passed end-to-end:

`lwb-canonical-v1 -> renderer-probe-v1 -> Build-NativeLayout.ps1 Auto/Hybrid -> Designer-authored Text Pool + BTC barcodes -> Save/Reopen -> 600dpi BarTender BMP -> dual-render QA`

Verified 2 Text + Code128 + Data Matrix:
- Save/Reopen PASS
- reopen editability PASS
- BarTender 600dpi visual evidence PASS
- dual-render QA `PASS_PLACEMENT_AND_SIZE`
- unexpected overlap 0
- candidate SHA stable across visual evidence
- candidate SHA256 `8B75BA94AC1EC5D25BD692CA2DA9278A6E49A7D34C98F9A7DA909DFE0D4F017C`

Fixed evidence report:
`review/renderer-prototype/WINDOWS_RUNTIME_EVIDENCE_20261103.md`

## Create(5) conclusion — frozen
Real-machine evidence proved hidden `DesignObjects.Create(5)` Text exposes a restricted Automation view on this machine. `FontName`, `FontSize`, `X`, `Y`, and `RotationAngle` fail with restricted-property `0x8000FFFF` behavior. Hybrid Text therefore uses the fixed-SHA Designer-authored Text pool. Do not reopen this route unless new evidence requires it.

## Current stress case
There is an 8-Text stress fixture:
`review/renderer-prototype/canonical-stress-8text.json`

It contains:
- 8 independent Text objects
- 1 Code128
- 1 Data Matrix

`PROBE.cmd` currently points to this stress fixture.

Run #36 / Run ID `41586576762`: **FAIL** in the real BarTender renderer after offline regression and COM preflight both PASS.

Exact runtime failure:
`Hybrid payload import modified peer XML: 條碼 1`

The failure occurs while assigning the third Text (`TEXT_3`). Evidence shows `TEXT_1` and `TEXT_2` completed successfully; `TEXT_3` payload readback itself succeeded, then peer-isolation verification detected that peer object `條碼 1` had changed XML.

Run #36 Artifact:
- Name: `bartender-renderer-evidence-41586576762`
- Artifact ID: `13208705232`
- Artifact SHA256: `25c617279e225ce45cafeb9eceeba13d6be73cc165906fd6f4ccac63f2b4bb17`

Relevant evidence files in the artifact / `NATIVE_BUILD_RESULT.zip`:
- `NATIVE_BUILD_ERROR.txt`
- `native-build-report.json`
- `hybrid-TEXT_1-*`
- `hybrid-TEXT_2-*`
- `hybrid-TEXT_3-payload-before.xml`
- `hybrid-TEXT_3-payload-import.xml`
- `hybrid-TEXT_3-payload-readback.xml`
- `hybrid-TEXT_3-anchor-*`
- `hybrid-text-pool.btw`

`native-build-report.json` confirms two Text objects completed; failure happened before SaveAs/Reopen.

## Important observation
This is **not proven to be Text Pool capacity failure**. There are many Designer-authored Text objects in the donor. The current blocker is the payload transaction mechanism.

Current `HybridPool.psm1` uses `ExportDataSourceValuesToXML` / modify target value / `ImportDataSourceValuesFromXML`, then snapshots peers and currently requires peer XML keys to remain byte-semantically unchanged (`Get-NativeXmlKey`). In the 8-Text case BarTender changes peer `條碼 1` XML during the third Text import.

Do not simply weaken `Assert-HybridPeerSnapshot`.

## Required root-cause review
Determine exactly what changed in peer `條碼 1` and classify it:

A. harmless BarTender normalization / serialization only, with semantic payload, source identity, object identity, geometry and barcode properties unchanged;

B. real peer payload / source / transform / symbology / geometry mutation;

C. shared/linked data-source behavior in the donor;

D. global side-effect of `ImportDataSourceValuesFromXML` that makes this API unsuitable for sequential per-object assignment at scale.

Because current evidence does not save the peer before/after XML that triggered the assertion, first add **diagnostic-only, fail-closed evidence** around the offending peer mutation. Save peer before/after XML and a structured semantic diff. Do not publish a candidate on failure.

At minimum compare for the peer:
- object Name and Type
- complete DataSources structure
- EmbeddedDataSource IDs
- effective `Value`
- transforms
- barcode symbology/root
- HumanReadable
- XDimension
- X/Y/Rotation/Height where applicable
- protected XML differences outside known harmless normalization

## Preferred solution criteria
If the peer change is serialization-only, replace whole-XML equality with a narrowly defined semantic-isolation contract backed by the captured real-machine evidence. The contract must still fail on payload/source/geometry/symbology/style changes.

If the peer change is real or global import is unsafe, redesign payload assignment rather than relaxing the gate. Investigate whether Designer-authored Text pool slots can receive literal payload through a more object-local Automation/API route while preserving source isolation. Reuse real installed TypeLib evidence in the repo; do not invent APIs.

## Validation target
After the fix, rerun the same 8-Text fixture on the connected Windows runner.

Required PASS conditions:
- all 8 Text + Code128 + Data Matrix created
- unique data-source identity / no unintended sharing
- each payload correct after assignment
- peer semantic isolation PASS after every mutation
- SaveAs / Close / Reopen PASS
- every object remains editable
- 600dpi BarTender full-format + per-object evidence PASS
- dual-render QA placement/containment PASS
- no unexpected overlap
- candidate SHA unchanged by evidence capture

Keep PR #35 Draft and product acceptance `NOT_RUN / NOT COMPLETE` even if the stress gate passes.

## User quota / execution rule
Codex quota is limited. Do a root-cause review first, then make one consolidated fix and one meaningful Windows run. Avoid many speculative iterations.
