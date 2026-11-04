# COM Renderer Prototype

Status: ENGINEERING PROTOTYPE / NOT PRODUCT ACCEPTANCE

Base main commit: `5ee1c6195d570e153e780573903f75c00452d8db`

Architecture decision: **RETIRE AS PRIMARY RENDERER** for generic donor binary patching. The proposed direction is a canonical layout model consumed by a Windows BarTender 2022 COM / Format API renderer.

Recovered prototype package SHA-256:

`9d40b13861bf6d900a9ed7615b48d262cac12a6674322454f66904ba05b61d5e`

Offline checks re-run by GPT:

- `fixture.json -> canonical.json`: PASS
- four canonical objects present: PASS
- synthetic render placement / displacement / size / duplicate-pattern checks: PASS
- `probe-render.cjs` syntax: PASS
- obvious PowerShell 7-only operators in modified probe scripts: none found

Still **NOT RUN**:

- Windows PowerShell 5.1 parser/runtime
- BarTender 2022 COM session
- OEM / Designer for Argox Automation licensing capability
- real four-object `.btw` generation
- real BarTender whole-format render evidence
- edit / save / reopen acceptance

Do not merge this experiment into production until the Windows + BarTender runtime gate is proven.
