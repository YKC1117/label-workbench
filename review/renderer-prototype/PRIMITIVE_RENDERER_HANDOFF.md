# Native mixed Renderer handoff — Run49 verified, 2026-11-03

Only YKC1117/label-workbench / experiment/com-renderer-prototype / Draft PR #35. Main/Pages/Release untouched. Latest remote HEAD is authoritative; do not roll back.

## Authoritative new candidate

**Run #49 / 41608415240: SUCCESS**, Renderer Candidate **f9ac4cb4ea1059e65641a2d55f4900a7f634c028**.
https://github.com/YKC1117/label-workbench/actions/runs/41608415240
Windows PowerShell 5.1, BarTender 2022 R2 / 11.3 Automation build 184527, Argox CP-3140 PPLA driver measured 300x300dpi.

Single mixed label: native Text5, Code128 BTC4, Data Matrix BTC4, native HRI Code1284, Picture6, Line2, Box3. All **7 native/editable objects**, **25 strict peer audits**, payload/stroke/image editability challenges and exact restoration, Save/Close/Reopen, source isolation, 600dpi whole/per-object QA, independent source-image/shape/HRI checks, zero unexpected overlap/out-of-bounds PASS.

Image gate requires a new COM process after hot build: PID **21964 → 16128**. Original source PNG and challenge sources hidden; **7/7 per-object BMPs and whole-format BMP byte hashes are exactly unchanged**. BTW bytes independently hash to **36199B11E3E05B6755E5BCD5460C7AAB4E6BCCD0AC35032D79E15CDBBC8C787E**; hot evidence before/after and cold before/after match. No accepted image output is published until this cold gate succeeds.

This does not replace Run45's 19-object / 3-case Text/barcode evidence at f610c62ddbdaaa627cb6d6f878991fadfa51a628. That runtime was not unnecessarily rerun; old Node regressions remain. Do not add 19+7 and claim 26 objects in one BTW.

## Verified recipe and root causes

Read primitive-candidate/ROOT_CAUSE.md for full facts/hypotheses and unmodified Run46/47/48 evidence.

- Actual installed TypeLib BtObjectType: Line2, Box3, Barcode4, Text5, Picture6, RichText9. No separate Paragraph enum. ComMetadata.ReadEnums captures constants without registering/changing the system.
- Run46 fresh Formats.Add returned native primitive roots, but setters refused 0x8000FFFF (even BTC Height). Discovery workflow SUCCESS was not a capability PASS.
- Run47 fixed-SHA Designer base + reacquired Find handles supports Line/Box/Picture setters and native HRI. Individual contributions of document context vs handle refresh are not isolated; use the **proven recipe**, not a generic claim about fresh formats. Existing Text pool primary and BTC routes retained. No Create5 retry or donor binary rewrite.
- Run48's seven native objects and all hot persistence/editability/peer gates passed, but exact raster-tile registration was unresolved across distinct native printer phases. It remains an original FAIL, cold NOT RUN. Reanalysis was labelled offline, never substituted for new runtime.
- New profile keeps exact registration first. When necessary, global bidirectional native raster registration permits **one measured 300dpi printer dot** (2 pixels at 600dpi), no expected-coordinate search window. Multiple candidate offsets must recover the **same exact actual ink bounding box**; distinct boxes remain ambiguity and reject. Physical .5mm placement/size/edge tolerances are unchanged. Duplicate/missing/damaged-pattern regressions retained.
- A hollow frame legally contains other objects. Only required border ink participates in global registration, with independent 4-edge/hollow-interior/actual-stroke validation. Filled or damaged boxes reject. Quiet-zone collision uses actual hollow stroke rather than treating the AABB interior as filled ink.
- A resampled/dithered image boundary pixel is not comparable to an ideal nearest-neighbor pixel. Blocking image identity uses **exact reconstruction of comparable constant-neighborhood source interiors**, not an arbitrary mismatch percentage. All 5776 comparable source cells match; four boundary cells remain diagnostic. Every source cell must have same-color interior support within one source cell, and >=2 output pixels per source cell. Thin/undersampled content rejects. Source SHA, actual image change/restore, geometry and cold identical rendering are additional gates. No offset, warp, rescale compensation or larger physical tolerance.

## Canonical and native contracts

`candidate-primitives-v1` only; ordinary profiles remain fail closed for these features.

- Text: existing Designer Text pool and measured ink-origin mapping, unchanged.
- Line: canonical x/y is start of unrotated local path; width/height endpoint vector. Native endpoint setters determine explicit **Center** anchor and absolute angle. Never mislabel Center X/Y as TopLeft. Expected ink uses butt-stroke footprint; actual stroke width/content checked.
- Box: canonical x/y/width/height is stroke centerline rectangle, ink extends half stroke on each side. Native TopLeft explicit or omitted-default plus unique visual proof. CornerRadius0, outline/stroke geometry and hollow interior required.
- Image: native Picture6, requested physical Width/Height, PreserveAspectRatio=false, literal PNG source hash. PNG is embedded (cold source-hidden proof). Picture peers additionally hash actual bitmap before/after every other-object transaction because image bytes are absent from GetXML. Target image challenge visibly changes raster, then restores exact XML AND bitmap.
- HRI: native Code128 caption, restricted explicit **Arial12, center, gap1.1mm, supplied caption-frame height**, upright. Main challenge/restore must also change/restore HumanReadableValue; font/visibility/payload persist. Native whole-page bitmap is segmented into stable bar band and caption ink; bar module/height/footprint and caption center/top/containment are gated separately. No independent width/height stretching. Do not infer arbitrary caption font/gap support.
- Source isolation is typed: Text/barcodes retain one independent EmbeddedDataSource/no transform contract; Line/Box/Picture must have exact matching native type/root and **zero DataSource nodes**. This is not an exemption for arbitrary unknown sources. All peers retain exact XML/COM protection; image peers additionally protect pixels.

## Publication and invocation

`PROBE.cmd` → Run-PrimitiveCandidate.ps1 → Build-NativeLayout.ps1 for mixed.json → Verify-PrimitiveColdReopen.ps1.

Hot image build writes `candidate.cold-pending.btw`, no LATEST accepted aliases. Cold proof uses a distinct owned process and absent original source paths; only then promotes native-output.btw and LATEST aliases. Failure quarantines BTW and repackages failed evidence. Use the wrapper for complete image verification; do not call hot build alone and relabel pending output as certified. Native tool retains ownership/watchdog/hash safeguards. No pre-existing user Designer process is killed.

## Files and durable evidence

- renderer/{image-raster,primitive-plan,primitive-qa,hri-qa,raster-registration}.cjs; existing canonical/adapter/preview/visual-qa/rotation-qa extended.
- NativeLayoutEngine.psm1 typed validation/source contract; HybridPool.psm1 native creation/persistence/peer/editability; Build-NativeLayout.ps1 printer evidence/caption evidence/cold-pending publication; compare-render.cjs/probe-render.cjs actual registration and content gates.
- Probe-NativeContracts.ps1; Run-PrimitiveCandidate.ps1; Verify-PrimitiveColdReopen.ps1; tests/renderer-primitives-smoke.cjs.
- primitive-candidate/evidence/run46/47/48 retain original contracts/failures. run49/verified-mixed-evidence.zip contains actual BTW/BMPs, all raw XML and peer audits, canonical/request/preview, hot/cold reports and hidden-source bytes (only reproducible materialized Text pool omitted). run49/summary.json records independently computed SHA and package digest. actual-page.png derives from real whole BMP.
- **Offline 15/15 regression and 21/21 Node syntax PASS**; report in primitive-candidate/offline-regression.json. Windows same-host offline/PS parser/native checks passed in Run49. These offline results do not replace runtime proof.

## Limits and next task

Overall arbitrary customer JPG/PNG/PDF → usable BTW product is **NOT COMPLETE**. Current new image proof covers monochrome, non-interlaced, 8-bit PNG, measured 300dpi driver, supported feature resolution; color/JPEG/indexed/interlaced/very thin or high-density images reject. Source alpha overlap is not certified. Rotated primitives remain rejected. Multiple identical visual patterns still reject if globally ambiguous. HRI arbitrary fonts/gaps/rotation remain rejected. Normal Text multiline is separate editable lines; native Paragraph/fixed box/justification/reflow is **not implemented**.

Next highest-value engineering task: a bounded **native RichText9 / paragraph contract probe in the proven Designer context**. Installed enum now proves RichText9 exists, but its XML/data source/value/RTF/geometry have not been read or tested. Do not guess RTF properties or reopen Create5 primary. Capture its true XML/value/Width/Height/alignment/readback/persistence/real BMP, then decide whether it can express fixed/multiline/native justification. Alternatively a deterministic Designer-authored Paragraph component contract; no mass BTC scan. Keep new image/line/box/HRI and old Text/barcode gates intact.

After native text semantics and broader image coverage converge, one mixed realistic customer fixture is worthwhile. No website integration, merge/deploy, or user manual BTW testing is requested in this handoff. Normal GPT can continue directly from the committed source and evidence without architecture restart.

## 2026-11-04 follow-up

RichText9 Run50 discovery was executed on Windows / BarTender 2022 R2: [Run #41756559623](https://github.com/YKC1117/label-workbench/actions/runs/41756559623) DISCOVERY_COMPLETE (NOT product acceptance). See `PARAGRAPH_CONTRACT.md` section 9 for the actual typed-setter limitations and the opaque `<RTF 資料>` placeholder reclassification. Fixed frame / native justification / wrap remain NOT CERTIFIED; Run45 and Run49 evidence is unchanged and authoritative.

Run51 candidate (not yet run): Text5 native paragraph probe via documented typed Width on a Designer Text slot. See `NATIVE_PARAGRAPH_HANDOFF.md`. Paragraph capabilities remain NOT CERTIFIED.

Run51: https://github.com/YKC1117/label-workbench/actions/runs/41760467332 FAIL_CLOSED. Existing Text5 typed Width did not establish wrap, and CRLF GetXML Value Base64 needs strict decoding in probe parser. Save/cold NOT RUN. Details in NATIVE_PARAGRAPH_HANDOFF.md section 8. Do not rerun identical width probe without a real Designer paragraph donor.

Run52 candidate (not yet run): Designer-authored multi-line Text alignment probe (`designer-multiline`) plus strict object-XML Base64 decoding and ordinal comparisons. See `NATIVE_PARAGRAPH_HANDOFF.md` section 9. Core HybridPool/NativeLayoutEngine/Build-NativeLayout/HybridPayload still use culture-sensitive -ceq/-cne (78/69/24/6 occurrences, a subset compare XML/Value content): open follow-up.
