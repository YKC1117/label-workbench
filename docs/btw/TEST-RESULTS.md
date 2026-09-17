# Validation results for this draft

- All `assets/*.js` passed `node --check`.
- All 20 regression suites currently invoked by QA passed locally: persistent job/wiring, runtime evidence rejection, core logic, cloud merge, attachments, parsers, barcode reader, analysis accuracy/copy/cross-check/geometry, layout mapping, v15, optional table launch, object-map/read-slot/caption diagnostics, retired CEA/rich export rejection and confidence classification.
- `git diff --check` passed.
- `node tools/btw-release-gate.cjs` returned exit 1 as required: `A: Windows BarTender 2022 evidence missing. BTW RELEASE BLOCKED.` No pass report was fabricated.
- No Windows/PowerShell/BarTender runtime is available in this Linux session. Both PowerShell scripts remain unexecuted on their intended host; edition detection, interop binding and COM behavior are unverified.
- No physical printer/scanner test, native object edit/Save As/reopen proof, or A/B/C actual BTW output is available.
- Browser end-to-end/visual verification was not run: Playwright is installed but Chromium is absent; its browser download timed out. Local data/wiring tests do not prove browser download UX.
- One-click website → runtime → downloadable BTW transport is not implemented. JSON export is explicitly a Windows test job, not the final deliverable.
- No Supabase configuration, cloud functions, credentials, case schema or Pages deployment settings changed. This statement concerns code scope; it is not a claim of a full live-service E2E test.

The runtime gate validates human-observed evidence plus source/fixture/artifact hashes. It cannot verify the truth of screenshots or a physical print; independent review is mandatory. No completed release is claimed.
