# Windows + BarTender 2022 Runtime Evidence — 2026-11-03

## Scope

This evidence certifies the current engineering prototype path only:

`lwb-canonical-v1 -> renderer-probe-v1 -> Build-NativeLayout.ps1 Auto/Hybrid -> Designer-authored Text Pool + BTC barcodes -> Save/Reopen -> 600 dpi BarTender BMP -> dual-render QA`.

It does **not** mark overall product acceptance complete.

## Environment

- GitHub self-hosted runner: `LWB-FTUSER5`
- Machine: `FTUSER5`
- Runner version: `2.338.2`
- Windows PowerShell: 5.1
- BarTender: 2022 R2 / 11.3 / build 184527 (Automation)
- Renderer branch: `experiment/com-renderer-prototype`

## Proven progression

### Run #32 — tracked Hybrid core

- Run ID: `41576339195`
- Head: `88cfe0718541580f6b6a5b1352a159c06a1a9378`
- Result: **SUCCESS**
- Purpose: prove the tracked Hybrid renderer core works without a runtime source patch.

### Run #33 — formal entry exposed stale gate

- Run ID: `41576678453`
- Head: `ec9b9b93c269905539f69464aa07ba7b12847d6a`
- Result: **FAILURE** before the Hybrid renderer.
- Root cause: the formal `Build-NativeLayout.ps1` route still ran the retired Create(5) Text font regression, although Hybrid Text does not use Create(5).
- Resolution: `SELF_CHECK_NATIVE.ps1` was split into `Hybrid` and `Legacy` profiles. `Auto` classifies canonical / renderer-probe inputs as Hybrid.

### Run #34 — formal Build-NativeLayout Hybrid route

- Run ID: `41585508983`
- Trigger commit: `4d9db019c3f874a88cdd4ec9296607be27a25031`
- Result: **SUCCESS**
- Artifact: `bartender-renderer-evidence-41585508983`
- Artifact ID: `13207094180`
- Artifact SHA-256: `1b64969949567809d8f13c76b8797e1a805e6082bc03ade336d8fecea8f4eb64`

All workflow stages passed:

1. exact checkout
2. isolated Node 22
3. locked npm dependencies
4. renderer offline regression
5. Windows / PowerShell 5.1 / BarTender COM preflight
6. canonical COM renderer probe
7. result summary
8. evidence upload

## Run #34 candidate evidence

- Renderer: `hybrid-text-pool-btc`
- Text pool SHA-256: `73E620EC2154D18AF3E279B4438A3775BE85D2A71F5BD8AFAAF664B31F03198B`
- Verified output SHA-256: `8B75BA94AC1EC5D25BD692CA2DA9278A6E49A7D34C98F9A7DA909DFE0D4F017C`
- Save/Reopen: **PASS**
- Candidate SHA before visual capture: `8B75BA94AC1EC5D25BD692CA2DA9278A6E49A7D34C98F9A7DA909DFE0D4F017C`
- Candidate SHA after visual capture: `8B75BA94AC1EC5D25BD692CA2DA9278A6E49A7D34C98F9A7DA909DFE0D4F017C`
- 600 dpi BarTender visual evidence: **PASS**
- Dual renderer QA: `PASS_PLACEMENT_AND_SIZE`
- Unexpected overlap pairs: **0**
- Four objects reopened with `PAYLOAD_GEOMETRY_STYLE_PERSISTED`.

### Object set

- `OBJECT_1`: native Text, Designer-authored pool slot
- `OBJECT_2`: native Text, Designer-authored pool slot
- `OBJECT_3`: native Code 128 BTC
- `OBJECT_4`: native Data Matrix BTC

Code 128 and Data Matrix placement/ink-size residuals were within the current runtime gates. Data Matrix used the installed fixed path `Barcodes\Common Bar Codes\Data Matrix.btc`.

## Important runtime conclusion

Real BarTender evidence showed that Text objects returned by hidden `DesignObjects.Create(5)` expose a restricted Automation view on this machine: direct Automation writes such as FontName / FontSize / X / Y / RotationAngle returned `0x8000FFFF`.

Therefore Create(5) Text is retired from the Hybrid primary path. Hybrid Text uses the fixed-SHA Designer-authored pool; barcodes use deterministic BTC insertion.

## Remaining unsupported / uncertified capabilities

The current canonical adapter still fails closed for:

- non-zero native rotation
- image objects
- line objects
- box objects
- fixed / paragraph / rich / multiline Text
- non-left Text alignment
- bold / italic Text pool variants
- Code 128 human-readable caption / non-zero quiet-zone anchor semantics
- GS1 Data Matrix
- rectangular Data Matrix

These must remain `CAPABILITY_UNSUPPORTED` until separately implemented and runtime-certified.

## Acceptance status

- Engineering four-object Hybrid runtime gate: **PASS**
- Formal `Build-NativeLayout.ps1` Auto/Hybrid route: **PASS**
- Save/Reopen/editability evidence: **PASS**
- BarTender 600 dpi visual evidence: **PASS**
- Dual-render placement/size QA: **PASS**
- Overall product acceptance: **NOT RUN / NOT COMPLETE**
- `main`: **not modified**
- Production GitHub Pages: **not deployed**
