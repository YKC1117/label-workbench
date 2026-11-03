# General Renderer handoff — 2026-11-03

Repository YKC1117/label-workbench; only experiment/com-renderer-prototype, Draft PR #35. Main/Pages/Release untouched. Entry baseline bbcaa6dcdc93249e1e9adb4730d636918619e05a; no rollback.

## Current candidate and runtime state

Code candidate: **1447acdfb4e81666edb75532e2f2b07f920cf124**.
Latest requested Windows probe: **Run #44 / 41596108274**, job 125783723629.
https://github.com/YKC1117/label-workbench/actions/runs/41596108274
Observed 2026-11-03T07:28:12Z: **QUEUED**, no Windows steps or artifact. Cause of queue not established. Do not infer current runner Offline, do not claim this candidate runtime PASS, do not queue another copy. It will execute the exact candidate commit when scheduled; subsequent evidence-only commits do not change its source.

Previously completed real new-capability probes:

| Gate | Run42 | Run43 |
|---|---|---|
| Windows / PS5.1 / BarTender.Application | PASS | PASS |
| BarTender | 2022 R2 / 11.3 Automation build 184527 | same |
| A: 8 Text styles/fonts/lines/alignment | FAIL: 5 mm COM write -> 4.9784 | FAIL: center 81.4578 -> 81.4324 |
| B: 3 Code128 + 3 DM variants | FAIL: missing BMP at 266-char path | FAIL: peer Code128 Density 6.818 -> 13.636 during editability challenge |
| C: Text90/180/270 + Code12890 + DM270 | FAIL: equivalent -90/270 readback | FAIL: initial experimental exact Text pixel comparator |
| C Save/Close/Reopen/edit challenge/exact restore/peer | NOT RUN | PASS, all 5 |
| C canonical placement/size + actual 600dpi bitmap | NOT RUN | PASS, all 5; unexpected overlap 0 |
| C before/after evidence BTW SHA | NOT RUN | identical A1CD0C9F742545BBF7FBB4F73A664DDE3974C2E0C1A301377F87CD3395CE26B8 |
| Overall candidate / product acceptance | FAIL / NOT COMPLETE | FAIL / NOT COMPLETE |

Run41's previously proven 10-object upright Hybrid gate remains authoritative for that scope; do not redo its peer-contamination investigation. Run43's original FAIL report stays FAIL. Separate offline reanalysis of its actual BMP now passes the corrected optical-geometry comparator, and is explicitly labelled reanalysis, not a new runtime run.

## Changes and limits

- Candidate-only profile, ordinary profile fail-closed capabilities retained.
- Bold/italic + font family presence/readback, 7/9/12/18/24pt fixture.
- Shared explicit-mm multiline expansion for native request and preview; independently editable lines, no wrapping or Paragraph/Rich Text claim.
- Left/center/right single-line **frame positioning** from native ink measurement. Native paragraph justification and automatic realignment after manual value edits are **not certified**. Do not advertise those semantics as completed.
- Canonical TopLeft and mm remain unchanged; orthogonal COM angles normalized [0,360). TopLeft anchor passes real C visual geometry without empirical offsets.
- Run43 proves mm COM setter may truncate a whole mil despite representable input. Candidate now writes GetXML's native inch literals, keeps .02mm versus original AND native targets. This final write method awaits Run44.
- Strict peer XML/COM snapshots also surround style/geometry operations; reopen challenge/restore checks exact target XML and both peer transactions. No Density exemption.
- Before Save and reopen edits, perform whole-format render to settle layout. Whether this fixes numeric Code128 Density is an explicit **hypothesis**, awaiting Run44. No rendering/normalization after mutation to hide a peer delta.
- Code128 payload/module/bar-height/quiet-zone reservation and square Data Matrix payload/module variations. No symbol stretching.
- 600dpi exact barcode pattern comparison. Text optical orientation: identical ink extents, bidirectional ink distance <=1 pixel (0.042333 mm), unique angle, exact mismatches still recorded. Measured Run43 text differences: 1/3/5 pixels, all within this pixel radius. Original .5mm geometry, .1° angle, .25mm² overlap, strict peer, persistence and SHA gates unchanged. Reject wrong/ambiguous angles and geometric mismatch.
- Short UUID result directory and single-letter case subfolder avoid Win32 BMP long paths; suite continues to capture all three failures/passes in one job.
- Native HRI/caption, Image/Line/Box, fixed/Paragraph/Rich Text, arbitrary angle, GS1/rectangular DM still blocked. Existing canonical preview representations do not count as native implementations.

## Files / evidence

Core changes: renderer/{canonical,adapter,preview,text-layout,visual-qa,rotation-qa}.cjs; HybridPool.psm1; NativeLayoutEngine.psm1; Build-NativeLayout.ps1; probe-render.cjs; compare-render.cjs; PROBE.cmd; Run-GeneralRendererSuite.ps1; tests/renderer-general-smoke.cjs and test:renderer.

GENERAL_RENDERER_REVIEW.md contains root-cause facts vs hypotheses. general-candidate/evidence/run42 and run43 retain native readbacks, errors, raw peer before/after XML and Density diff, original comparison JSON and artifact IDs/digests. Run43 C-FAILED-runtime-evidence.zip preserves original failed BTW, whole/per-object/upright BMP, canonical/native request, preview, readbacks and original report. It is **failed evidence**, not a release or certified output. Package SHA in C-evidence-package.json.

Latest offline regression: **14/14 PASS** (13 prior + new candidate suite), **14/14 Node syntax PASS**. Offline report records exact outputs. Windows regression in completed Run43 also PASS; final PowerShell/native changes require Run44. No Playwright UI rebuild/test was needed for this renderer-only scope.

## Next agent: direct steps, no new architecture research

1. Fetch the remote branch, preserve latest HEAD. Read this handoff and latest Run44 job/artifact. Do not retrigger if it remains queued/running.
2. Download Run44 artifact. Read suite-report.json, each NATIVE_BUILD_ERROR/native-build-report/runtime, dual-render-qa, strict peer diffs; verify both SHA values against actual BTW bytes. Retain full package or compact actual BTW/BMP evidence in this branch.
3. If B still changes Density, keep FAIL CLOSED. Determine whether the import transaction invalidates another object's derived encoding state even after full pretransaction render. Do not ignore Density or re-baseline after mutation. Next narrow engineering task is a target-only native payload transaction with strict peer evidence (current Value is getter-only in installed TypeLib), or a deterministic Designer NamedSubString component contract. Do not re-open Create(5), donor patching, or the solved 8-Text bug.
4. If A still fails native position serialization, inspect saved position-request/readback XML and both unquantized/native targets. Fix actual unit conversion; don't raise .02mm or add empirical offsets.
5. If all A/B/C pass, update exact runtime evidence and capability coverage. Next expansion should obtain a deterministic Designer-authored native primitive contract for Image/Line/Box and native caption/paragraph alignment; keep them blocked until strict readback/reopen/render proof. Then construct one mixed case. No website integration yet.
6. Normal GPT can continue artifact review and the stated bounded tasks from this branch. The unresolved work requires actual BarTender behavior evidence, not another general architecture study. No manual user BTW test is requested.
