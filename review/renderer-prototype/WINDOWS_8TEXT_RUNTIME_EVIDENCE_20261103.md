# Windows BarTender 2022 — 8 Text Multi-Object Runtime Evidence

Date: 2026-11-03
Branch: `experiment/com-renderer-prototype`
PR: #35 (Draft)

## Verified run

- GitHub Actions Run: `#41`
- Run ID: `41592169109`
- Trigger commit: `54a57b8c11f490229df2ea7c05cdd45af3b32263`
- Windows runner: `LWB-FTUSER5`
- Fixture: `review/renderer-prototype/canonical-stress-8text.json`
- Fixture objects: 8 Text + Code128 + Data Matrix = 10 native objects
- Artifact: `bartender-renderer-evidence-41592169109`
- Artifact SHA-256: `ad00d7729c9f1f78c1dd8730e7e101db4e6fc18f7657515d266dbd40dab36d15`

## Runtime result

**PASS**

The real Windows + BarTender 2022 run completed the canonical COM renderer step with exit code 0.

Verified from the uploaded evidence:

- Input layout contains exactly 10 requested objects: `TEXT_1` through `TEXT_8`, `BARCODE_1`, `BARCODE_2`.
- Native build report contains exactly 10 native objects.
- All 10 objects report `PAYLOAD_GEOMETRY_STYLE_PERSISTED` after Save / Close / Reopen.
- `reopen = PASS`.
- Hybrid target path peer-isolation reports PASS for all 8 Text objects and both barcodes.
- Peer isolation policy is `ALL_RETAINED_PEERS_INCLUDING_PARKED`.
- 600 dpi native visual evidence status: `PASS`.
- Dual-render QA: `PASS_PLACEMENT_AND_SIZE`.
- All 10 visual-QA objects: PASS.
- Unexpected overlap: 0.
- Candidate SHA-256 before visual evidence: `45C1394FCCDB9B8185D438DBA7D7429206B111DB94DF2E42311CE8A873E73C0B`.
- Candidate SHA-256 after visual evidence: `45C1394FCCDB9B8185D438DBA7D7429206B111DB94DF2E42311CE8A873E73C0B`.
- Evidence capture therefore did not mutate the candidate BTW.

## Legacy diagnostic

The evidence intentionally includes a separate `legacy-payload-diagnostic` capture. It is marked:

- `diagnosticOnly = true`
- `candidatePublication = PROHIBITED`
- `status = DIAGNOSTIC_CAPTURED_NOT_ACCEPTANCE`

A legacy full-import mutation can still be observed there. This is not the accepted Hybrid candidate path. The accepted target-only / pre-pruned Hybrid path passed strict peer isolation.

## Scope / acceptance boundary

This run proves the current upright Hybrid route for a 10-object stress fixture (8 Text + Code128 + Data Matrix) on the real Windows + BarTender 2022 machine.

It does **not** change the existing overall product acceptance boundary. Unsupported / un-certified capabilities such as non-zero rotation, image / line / box, multiline / rich / paragraph text, other text alignment variants, additional barcode semantics, etc. remain outside this runtime gate and must continue to fail closed until separately certified.

Do not merge `main` or deploy Pages solely because of this engineering runtime PASS.
