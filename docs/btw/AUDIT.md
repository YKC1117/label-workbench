# BTW audit and architecture decision

Status: **NOT RELEASED / Windows Designer validation blocked**.
Base: `f977ab59a8418eec15f68248d3ce36d3478e3e87` (latest main at checkout and pre-commit check).
This PR is a containment and validation foundation, not completion of one-click editable BTW.

## Findings

| Area | Finding | Decision |
| --- | --- | --- |
| `assets/bt-native-primary.js` | Download depended on bridge `latestResult` AND live File metadata. No durable job; refresh removed availability. Async generation was coupled to download. A subtree observer repeatedly rewrote its own text and could self-trigger. UI promised editable documents without runtime evidence. | Replace with persistent, explicit review workflow; retain the requested download label with an actionable blocking reason. No native writer call. |
| `assets/bt-bridge.js` | Memory-only stage; multiple loaders could initialize it twice. | Singleton; persist and restore result plus source names/types. Raw PDF/images are not needed to restore a job and are not silently persisted. CSV/Excel pack route remains. |
| `assets/btw-native.js` | Fetches CEA 2022 R5 through existing seed proxy. Rewrites UTF-16 strings/coordinates and checks its own parser. All fields can become one `LW_FIELDS` summary; unused objects moved off canvas; CEA dimensions remain. | Remove generation body, return explicit `BTW_BINARY_EXPORT_DISABLED`; remove from production loader. Keep historical parsing/patch helpers for investigation only. |
| `assets/btw-format.js` | Container/header, PNG previews, compression and string handling. Does not validate proprietary serialization semantics. | Preserve read/diagnostic behavior; not a release gate. |
| `assets/btw-object-map.js` | Reverse-engineered markers, string ranges, offsets and coordinates. A successful self-round-trip proves only internal consistency. | Preserve BTW import/diagnostics. No new reverse engineering. |
| `assets/btw-layout-map.js` | Defaults to CEA 76.2 × 50.8 mm; normalizes/clamps geometry. Unknown physical size can become default geometry. | Preserve existing consumers; production job requires explicit physical dimensions/valid bounds/confirmed orientation. No default size in new path. |
| `assets/btw-rich-native.js` | GTL/Ford donors, up to 29 texts and restricted barcode counts. Unused roots moved to 50000 mil, NOT deleted. Searches and rewrites matching integer size pairs. Tests inspect the same decoder. | Retire production generation. Unrelated donor objects cannot be accepted as “removed.” |
| `assets/btw-rich-bridge.js` | Catches rich-generation errors then silently falls back to CEA summary output; slices to first 20 labels. | Remove fallback and export implementation. |
| `assets/btw-caption-adapter.js` | Optional captions expand the donor pool; overflow can revert to value-only. | Not loaded in production; diagnostic transformation test only. |
| `assets/btw-production-gate.js` | Confidence filter silently removes pending fields; barcode existence isn't proof of correctness. | Keep diagnostic classifier but stop installing exporter wrapper. New job requires explicit review, never silently drops pending/empty fields. |
| `tests/btw-*.cjs` | Synthetic parser/object/layout checks and live donor diagnostics; native/rich tests asserted strings/header/internal object count. No actual Designer edit/print proof. | Retain deterministic parser/layout/read regressions, replace retired writer tests with fail-closed regressions. Remote donor research stays in repo but is removed from default QA. Caption regression becomes data-transform-only. |
| `tools/verify-btw-runtime.ps1` | `/F /S /CLOSE /X`, process exit and changed mtime; no independent selection, editing, Save As, reopen or print checks. | Replace with human-observed Designer A/B/C protocol, artifacts, screenshots/photos, source/fixture SHA binding; nonzero on incomplete checks. |
| `.github/workflows/qa.yml` | Exact date/build/version grep unrelated to product behavior; unpinned remote donor tests mixed with product regressions. | Remove version greps, preserve deterministic product regressions, add missing/stale/tampered evidence negative tests plus explicitly blocking runtime-evidence job. |

## Official API findings

Sources checked in this task (2022 documentation, not current-edition marketing):

- [REST API requirements](https://help.seagullscientific.com/2022/en/Content/API/API_BarTender.htm): Automation or Enterprise 2022, service/permissions and port 5159. REST does not remove the Windows runtime/license requirement.
- [REST action list](https://help.seagullscientific.com/2022/en/Content/API/API_BarTender_Actions.htm): print/actions/file operations; not evidence of arbitrary native document authoring.
- [BTXML and SDK routes](https://help.seagullscientific.com/2022/en/Subsystems/BTXML/Content/Overview.htm): .NET Print Scheduler/Engine and Integration Builder can run scripts/printing. No verified arbitrary-object authoring API established here. Installed SDK documentation must be checked on the actual host before implementing the production companion.
- [Format overview](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Using_Format_Object.htm): works with existing formats, not creation of arbitrary documents/templates.
- [DesignObject.X](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/X_Property.htm) and [PageSetup](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/PageSetup_Object.htm): specific existing-object/page properties are exposed despite the broad wording in the Format overview. This does not expose object creation/deletion. X/Y refer to the object's anchor, not necessarily its bounding-box top-left.
- [Named data mutation](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/SetNamedSubStringValue_Method.htm), [Save/Save As](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/saving_formats.htm), [Edition](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Edition_Property.htm): documented existing-template filling/saving with Automation/Enterprise.
- [ActiveX status](https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/BT_ActiveX.htm): legacy; vendor recommends testing/backward compatibility only. The included ActiveX candidate helper is deliberately a **runtime investigation tool**, not the released production companion.

**Actual installed edition: UNKNOWN.** Neither seed metadata, repository settings nor this Linux host establish the user's license. Helper refuses unrecognized editions/versions; no trial/OEM/Professional bypass. A failure may be a license, version-format, interop or API issue and must be investigated on Windows rather than weakening the check.

## Decision and scope

Use Designer-authored, clean, independently editable templates, matched by exact object IDs/types/count, page size, orientation and geometry. One native Text per text; one real Barcode per barcode; each binds a distinct named embedded data source. No summary object, background bitmap, donor pool or off-canvas leftovers. QR and unmatched objects/layouts are unsupported until separately validated.

The browser saves a versioned job, exposes review/edit, then exports **JSON test input**, not a disguised BTW. An offline Windows test helper calls official API on a copy of an explicitly selected template, checks edition/version/hash/count/data bindings, Save As and reopen. It never prints automatically and never writes proprietary bytes. This can produce candidate native BTW files on a properly configured licensed host, but is **untested here**.

A production .NET companion and its browser transport are **not implemented in this PR**. They require installed-SDK verification and successful clean-template regression first. Future one-click transport must return the actual runtime-created file, report structured job errors, persist artifact/job identity for re-download, and implement authenticated loopback access with explicit origin restrictions and safe file handling. Do not expose unauthenticated BarTender services to arbitrary websites. Do not enable the button simply because an API exists.

Without Automation/Enterprise: use Designer manually with the confirmed job and a matching clean template, or arrange appropriate licensed automation. This alternative has independent editable objects but is not one-click website authoring. No pure-browser replacement is claimed.

## Persistence contract

`labelworkbench.bt-job.v1`: one most recent media work item; 30-day expiry, 2 MB limit, no raw files. Status `review` or `confirmed`; every edit invalidates confirmation. Explicit unsupported/geometry/value errors prevent confirmed export. Quota failure keeps current memory work and removes stale saved work where storage permits; shows backup instruction. JSON backup/import is available; import returns to review. New >20-label work is rejected, never truncated. Storage is origin-local and not Supabase; existing cases and cloud functions are untouched. Local storage deletion/private mode/another browser cannot guarantee recovery; download the backup.

## Release constraints

There are no Designer-created A/B/C templates, no actual license probe results and no runtime reports checked in. The BTW release gate **must fail**. Web download remains blocked even if someone adds evidence; a separately reviewed production companion implementation is still required. Existing GitHub Pages deployment was not modified and this branch is not merged/deployed. Repository branch-protection settings are not changed; administrators must require the named runtime gate before approving future BTW releases. CI cannot inspect screenshot truth or printer output: a human reviewer must examine the attached evidence.
