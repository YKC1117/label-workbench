# General Renderer handoff — 2026-11-03, Run45 verified

Only YKC1117/label-workbench / experiment/com-renderer-prototype / Draft PR #35. Main, Pages and Releases untouched. Preserve latest remote HEAD; no rollback.

## Current authoritative evidence

**Run #45 / 41598871444: SUCCESS**, code candidate **f610c62ddbdaaa627cb6d6f878991fadfa51a628**, Windows job 125792600726 on LWB-FTUSER5.
https://github.com/YKC1117/label-workbench/actions/runs/41598871444
Windows PowerShell 5.1, BarTender 2022 R2 / 11.3 Automation build 184527. The real COM renderer, not just CI/parser, produced and verified all three cases:

| Case | Scope | Native/editable | Reopen challenge + exact restore / peer | 600dpi Dual QA |
|---|---|---|---|---|
| A | Arial/Courier New/Times New Roman, 7/9/12/18/24 pt, bold/italic/both, left/center/right positioning, explicit two-line composition | 8 | PASS / 32 strict audits | PASS_PLACEMENT_AND_SIZE |
| B | 3 Code128 + 3 square DM, payload/module/size/bar-height variation, quiet-zone reservation | 6 | PASS / 24 strict audits | PASS_PLACEMENT_AND_SIZE |
| C | Text 90/180/270, Code12890, DM270 | 5 | PASS / 20 strict audits | PASS_PLACEMENT_AND_SIZE + independent optical orientation PASS |

Total: **19 native objects, 76 strict all-retained-peer audits PASS**, zero unexpected overlap/out-of-bounds. All 19 saved/closed/reopened, accepted exact payload challenge/restore with no peer change. Actual BTW SHA recomputed from artifact bytes equals both before/after evidence hashes and native build report. Details and three hashes in general-candidate/evidence/run45/summary.json.

## Root causes resolved

1. mm COM X/Y setter truncated some native inch coordinates. Candidate uses BarTender's GetXML native inch literals (3 decimals), preserving .02mm checks against both original unquantized native target and representable target.
2. Negative angles are normalized to equivalent COM [0,360), without source anchor compensation. Explicit TopLeft remains mandatory, and omitted defaults require unique real whole-page visual registration.
3. Long batch paths exceeded Win32 BMP path length. Short UUID/case paths fixed export; no system policy change required.
4. Numeric Code128 peer Density 6.818→13.636 appeared on Run43 challenge. Full-format real layout settlement **before Save and before reopen transactions** makes the strict snapshots stable; Run44 and Run45 B pass. There is no ignored Density field, post-mutation normalization or re-baselining.
5. Run44 A failed 24pt bold/italic x by .503333mm: native font glyph bearing was omitted by the adapter. Measured 600dpi BMP ink-left was 12px=.508mm. New shared pure renderer/text-placement.cjs maps frame origin through native measured ink offset and rotation. Run45 BOTH24 x residual is -.004667mm, y -.018667mm. No tolerance increase or empirical per-font offset.

Renderer conversion is explicit: nativeAnchor = canonicalFrameOrigin + R(alignmentShift - measuredInkLeft, -measuredInkTop). It uses actual native raster bounds at trusted 600dpi, not font-size guesses. Every candidate Text uses the same function. Visual QA also now checks ink-top alignment, an additional gate. Source frame remains authoritative.

## Current capability limits — do not claim full product completion

The `candidate-general-v1` profile is experimental; ordinary profile keeps unsupported capabilities blocked. Current runtime proof covers the listed fixtures/fonts, not arbitrary fonts/scripts/customers.

Multiline is explicit-pitch independently editable native lines, not Paragraph/Rich Text or automatic wrapping. Center/right are **single-line frame positioning** at build time; native paragraph justification/reflow after manual text edits is not certified. Fixed text boxes remain unsupported. HRI/caption, Image/Line/Box, arbitrary angles, GS1 and rectangular DM remain blocked by native adapter. Canonical/preview support alone does not certify native output. Overall image/PDF-to-editable-BTW product acceptance is **NOT COMPLETE**. Do not integrate the website or claim general customer acceptance from these synthetic runtime fixtures.

## Regression / comparability

14/14 offline regression (13 retained + general suite), 15/15 Node syntax PASS. Windows Node regression and PS5.1 parser/self checks PASS in Run45. Real Run44 ledger regression proves measured offset transformation, and remains labelled offline reprojection, separate from Run45 runtime proof. Ledger source BMP SHA/file identities are corrected in the evidence follow-up; renderer code is identical to the proven candidate.

Existing .5mm placement/size/edge, .1° angle, .25mm² overlap and strict peer/persistence/SHA gates remain. Text frame sizes are not ink sizes; validate ink alignment/containment. Barcode dimensions compare actual symbol ink to encoder footprint. Rotated text requires identical extents, bidirectional ink distance <=1px at 600dpi, unique angle; barcode rotated masks are exact. Raw bit differences remain visible. No independent font-shape or barcode decoder acceptance claim.

## Saved evidence

GENERAL_RENDERER_REVIEW.md retains the original facts/hypotheses and failures (Run42/43/44 are never relabelled). general-candidate/evidence/run45/verified-runtime-evidence.zip contains each generated BTW, whole/per-object/upright BMP, canonical/request/preview, native XML/readbacks, exact edit challenge/restores, all strict peer audits and runtime reports. Only reproducible unchanged materialized source Text pool omitted; its fixed SHA is in native reports. ZIP SHA in summary.json. Evidence is committed to this branch, not only a temporary Actions artifact. Optional human-readable page thumbnails are stored alongside it; they are derived actual BMPs, not mock previews.

## Next bounded engineering task

1. Fetch latest branch; use Run45 as authoritative Text/barcode baseline. Do not rerun or re-investigate solved 8-Text Run41, Create(5) primary, or donor binary patching. No user manual BTW tests requested.
2. Highest remaining semantic gap: obtain a deterministic native **paragraph/fixed Text alignment** contract and native **HRI caption** contract. Existing center/right positioning must not be advertised as persistent paragraph justification. Preserve all new ink-origin/peer/editability gates.
3. For Image/Line/Box, first retrieve installed TypeLib enum values/object XML using a bounded capability probe or existing Designer-authored native components. The repository's installed-api.json proves Create exists but does not enumerate the object-type constants. Do not guess enum numbers or silently rasterize a vector/label to bypass native editability. No mass BTC scan; source contracts must be deterministic.
4. Implement supported primitives as separate adapter branches in the same Canonical mm model; extend native validator, source-isolation semantics for non-payload primitives, persistence and dual-render QA together. Images must survive without external file dependencies. Keep unsupported cases fail closed.
5. Consolidate those new contracts into a single mixed-case runtime probe; avoid one Windows run per property. Keep main and Pages unchanged, Draft PR #35 only.

Normal GPT can continue directly from this branch/evidence. No architecture restart or manual user testing is needed to read the next real capability contracts.
