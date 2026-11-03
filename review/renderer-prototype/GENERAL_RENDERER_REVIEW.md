# General Renderer Candidate — 2026-11-03

Baseline: bbcaa6dcdc93249e1e9adb4730d636918619e05a, branch experiment/com-renderer-prototype, Draft PR #35.

## Root cause review (new capability gaps)

Verified in current source: Canonical text styles existed, but adapter and PowerShell input validator rejected bold/italic, non-left alignment and nonzero rotations. Hybrid explicitly wrote FontBold/FontItalic=false and reopen verification required both false. Simply accepting schema flags would therefore silently lose requested styles. The existing visual containment gate assumed upright left-aligned text; rotated AABB and right/center alignment require comparison in canonical local axes. Renderer B ink AABB must not be treated as Renderer A's text frame size.

Run #41 is authoritative for the unchanged upright 8 Text + two BTC path. Its completed peer-isolation fix is retained. No claim that its PASS covers these new capabilities.

## Candidate implementation

Explicit `candidate-general-v1` runtime profile; ordinary profile keeps unsupported features fail closed. Designer Text pool and deterministic BTC routes unchanged. Text bold/italic and requested fonts are written/read back; missing font families are rejected. Multiline expands into independently editable native Text lines with explicit mm pitch, through one shared expansion used by preview and native request. This is composite multiline, not a Paragraph/Rich Text object, and has no automatic wrapping.

Center/right alignment uses native upright ink width and an explicit canonical frame alignment equation; no font-size-derived box height. The measured shift, target coordinates and raster are recorded. Reopen verifies the resulting target anchor, not the unshifted frame. Visual QA separately checks canonical alignment and frame containment in unrotated local axes.

Orthogonal rotations retain explicit TopLeft and signed COM angle conversion. An independent upright per-object BMP is rotated in software and compared to actual native BMP with **exact binary dark-mask equality**, no resize. API readback alone cannot accept rotated output. Runtime behavior of the BarTender anchor is still to be measured; errors fail closed rather than applying offsets.

Code128 explicit module/bar-height variations and canonical quiet-zone reservation; quiet-zone offset rotates with the object. Data Matrix footprint derives from encoded rows × columns × module, never independent width/height stretching. Reopen checks module/index, bar height and anchor in addition to existing payload/geometry/style gates.

Peer isolation remains exact for all retained objects, including parked slots. It now also surrounds Text style and barcode geometry writes. Candidate reopen performs challenge payload import and restore, requiring exact target XML restoration and strict peer isolation on both transactions. Candidate SHA remains protected by existing Save/Reopen and evidence capture gates.

## Consolidated Windows probe

`PROBE.cmd` → Run-GeneralRendererSuite.ps1, one workflow job with independent results:

- A-text: 8 native Text objects, 7/9/12/18/24 pt, Arial/Courier New/Times New Roman, bold/italic/both, left/center/right and two-line composition.
- B-barcode: 3 Code128 payloads, two module indices, 7/12/15 mm heights, quiet-zone reservations; three Data Matrix payload/module/square variations.
- C-rotation: Text 90/180/270, Code128 90, Data Matrix 270; independent optical pattern gate.

No replay of the old contamination diagnostic or old 8-Text acceptance run in the new profile. Every case requires Save/Close/Reopen, exact challenge restoration, 600dpi full/per-object BMP, unique page registration, unchanged .5 mm placement/size/edge tolerances, .1° angle tolerance, unexpected overlap threshold .25 mm², no out-of-bounds and stable BTW SHA. The rotation comparison is exact; any mismatch is a measured FAIL, not permission to loosen it. Batch continues after a failed case to retain useful evidence for all cases. Case-specific result ZIPs survive fixed output aliases being overwritten.

## Fail closed / unfinished

Built-in Code128 HumanReadable/caption geometry remains rejected. Image, Line and Box remain canonical/preview representations only and are rejected by the native adapter; no Designer-authored primitive contract is available in this branch. Arbitrary rotations, fixed/Paragraph/Rich Text, automatic line wrapping, GS1 and rectangular matrices remain rejected. These are not completed native capabilities. No website integration or product-acceptance claim.

Local Linux: BarTender runtime NOT RUN. Node/synthetic regression is offline evidence only. Windows result must be appended after the consolidated probe; never inferred from this document.
