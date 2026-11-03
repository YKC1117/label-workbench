# General Renderer Candidate — 2026-11-03

Baseline: bbcaa6dcdc93249e1e9adb4730d636918619e05a, branch experiment/com-renderer-prototype, Draft PR #35.

## Root cause review (new capability gaps)

Verified in current source: Canonical text styles existed, but adapter and PowerShell input validator rejected bold/italic, non-left alignment and nonzero rotations. Hybrid explicitly wrote FontBold/FontItalic=false and reopen verification required both false. Simply accepting schema flags would therefore silently lose requested styles. The existing visual containment gate assumed upright left-aligned text; rotated AABB and right/center alignment require comparison in canonical local axes. Renderer B ink AABB must not be treated as Renderer A's text frame size.

Run #41 is authoritative for the unchanged upright 8 Text + two BTC path. Its completed peer-isolation fix is retained. No claim that its PASS covers these new capabilities.

## Candidate implementation

Explicit `candidate-general-v1` runtime profile; ordinary profile keeps unsupported features fail closed. Designer Text pool and deterministic BTC routes unchanged. Text bold/italic and requested fonts are written/read back; missing font families are rejected. Multiline expands into independently editable native Text lines with explicit mm pitch, through one shared expansion used by preview and native request. This is composite multiline, not a Paragraph/Rich Text object, and has no automatic wrapping.

Center/right alignment uses native upright ink width and an explicit canonical frame alignment equation; no font-size-derived box height. The measured shift, target coordinates and raster are recorded. Reopen verifies the resulting target anchor, not the unshifted frame. Visual QA separately checks canonical alignment and frame containment in unrotated local axes.

Orthogonal rotations retain explicit TopLeft and signed COM angle conversion. An independent upright per-object BMP is rotated in software and compared to actual native BMP with a separately reported optical pattern gate, no resize. API readback alone cannot accept rotated output. Runtime behavior of the BarTender anchor is still to be measured; errors fail closed rather than applying offsets.

Code128 explicit module/bar-height variations and canonical quiet-zone reservation; quiet-zone offset rotates with the object. Data Matrix footprint derives from encoded rows × columns × module, never independent width/height stretching. Reopen checks module/index, bar height and anchor in addition to existing payload/geometry/style gates.

Peer isolation remains exact for all retained objects, including parked slots. It now also surrounds Text style and barcode geometry writes. Candidate reopen performs challenge payload import and restore, requiring exact target XML restoration and strict peer isolation on both transactions. Candidate SHA remains protected by existing Save/Reopen and evidence capture gates.

## Consolidated Windows probe

`PROBE.cmd` → Run-GeneralRendererSuite.ps1, one workflow job with independent results:

- A-text: 8 native Text objects, 7/9/12/18/24 pt, Arial/Courier New/Times New Roman, bold/italic/both, left/center/right and two-line composition.
- B-barcode: 3 Code128 payloads, two module indices, 7/12/15 mm heights, quiet-zone reservations; three Data Matrix payload/module/square variations.
- C-rotation: Text 90/180/270, Code128 90, Data Matrix 270; independent optical pattern gate.

No replay of the old contamination diagnostic or old 8-Text acceptance run in the new profile. Every case requires Save/Close/Reopen, exact challenge restoration, 600dpi full/per-object BMP, unique page registration, unchanged .5 mm placement/size/edge tolerances, .1° angle tolerance, unexpected overlap threshold .25 mm², no out-of-bounds and stable BTW SHA. The original placement/size/peer/persistence gates remain unchanged. Optical comparability is specified below using the measured Run43 evidence. Batch continues after a failed case to retain useful evidence for all cases. Case-specific result ZIPs survive fixed output aliases being overwritten.

## Fail closed / unfinished

Built-in Code128 HumanReadable/caption geometry remains rejected. Image, Line and Box remain canonical/preview representations only and are rejected by the native adapter; no Designer-authored primitive contract is available in this branch. Arbitrary rotations, fixed/Paragraph/Rich Text, automatic line wrapping, GS1 and rectangular matrices remain rejected. These are not completed native capabilities. No website integration or product-acceptance claim.

Local Linux: BarTender runtime NOT RUN. Node/synthetic regression is offline evidence only. Windows result must be appended after the consolidated probe; never inferred from this document.


## Run #42 — actual Windows findings, consolidated correction

Real host LWB-FTUSER5; Windows PowerShell 5.1; BarTender 2022 R2 / 11.3 Automation build 184527. Run 41594235119 at 5022c891b9ad2064e6a237c87f059b358b24ac51: FAIL in all three cases, before Save/Reopen/Visual QA. Evidence under general-candidate/evidence/run42; artifact digest recorded there.

Verified: A Text X write 5 mm read back 4.9784 mm (=0.196 in), outside unchanged .02 mm Text COM gate; object XML uses inch coordinates at 0.001 in precision. C requested -90° read back 270° (equivalent angle, not a rotation error). B ExportToFile produced no BMP at its 266-character path; no barcode visual result exists. Long Windows paths were also explicitly reported by checkout. Path length is the leading explanation for B, to be tested by shortened paths, not a proven barcode capability failure.

Correction: canonical clockwise angles convert to equivalent COM [0,360) values; no anchor compensation. Candidate Text writes select the nearest serialized 0.001 inch coordinate quantum (0.0254 mm), and must pass BOTH unchanged .02 mm readback versus that native target AND .02 mm versus the original unquantized canonical/alignment target. There is no larger tolerance or empirical offset. The measured requested/actual/unquantized values are saved. Whether this explicit representable-unit write resolves BarTender's conversion remains a runtime hypothesis until the retry. Result directories use short UUID identifiers and a single-character case folder; no long-path support assumption. Runtime report now identifies request revision/profile.

A single consolidated retry runs all three cases, not individual field probes. Original failed results remain evidence; they are not overwritten or called PASS.


## Run #43 — additional real capability evidence and remaining failures

Run 41594937167 at 3268680cdb7c51eb0dc3f41860be26446597aa46, same actual 2022 R2 runtime. Three-case suite FAIL; detailed reports, peer XML before/after and semantic delta are committed under evidence/run43.

A: first three fonts/styles passed; center coordinate 81.4578 mm (an exact serialized mil target) read 81.4324 mm, one mil lower. The mm COM setter still truncates some representable coordinates. Correction uses native GetXML's proven `Position.X/Y` inch literal attributes, written at three decimals, preserving every DataSources node and strict peer snapshots. Both original-target and native-target .02 mm checks stay unchanged. This is unit representation, not empirical offset compensation.

B: all six barcode creations/modules completed and saved/reopened. Challenge on CODE_SHORT changed peer CODE_NUM's only XML delta `/root/1/@|Density` 6.818 → 13.636; no COM property change. Source payload/IDs remained unchanged. This is a NEW numeric Code128 multi-instance transaction failure; no field is exempted from strict XML. Hypothesis: derived encoding density was not settled before Save/Reopen. Add full-format real render before Save and before reopen transactions, then take the same strict snapshots. A repeated Density change still hard-fails; rendering is not allowed as a post-transaction normalization workaround.

C: all five objects passed Save/Close/Reopen, challenge+restore exact target XML and strict peer isolation; BTW A1CD0C9F742545BBF7FBB4F73A664DDE3974C2E0C1A301377F87CD3395CE26B8 unchanged by evidence capture. All five canonical placement/size/alignment/rotation readback checks passed with zero unexpected overlap. Code128 and Data Matrix optical rotations matched exactly. Text masks differed by 1/3/5 pixels respectively, with identical ink extents and every difference within one pixel of the counterpart ink. Original suite remains FAIL because the initial experimental comparator demanded bit identity.

The new optical comparison distinguishes **bit equality** from **physical ink geometry**. Barcode masks remain exact. Text at 600dpi must have identical extents, bidirectional ink distance ≤1 pixel (0.042333 mm), and exactly one matching orthogonal angle. The one-pixel radius accounts for two raster boundaries rounded onto the pixel grid; it does not change the original .5 mm placement/size/edge, .1° COM angle, .25 mm² overlap or any persistence/peer gate. Wrong angles, missing counterpart ink, extent mismatch or ambiguous symmetric patterns fail. Exact pixel mismatch count remains visible as a diagnostic. No font substitution or rescaling is permitted. New regression includes asymmetric wrong-angle and symmetric ambiguity rejection.

One final combined retry is limited to these evidence-backed corrections. Native paragraph justification is not certified: center/right here are canonical frame positioning of single native lines; editing text manually does not provide persistent paragraph reflow/alignment semantics. The ordinary profile continues to reject these experimental features.
