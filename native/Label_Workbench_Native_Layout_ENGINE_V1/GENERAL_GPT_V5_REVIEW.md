# GENERAL GPT V5 — COM-only partial FontName rollback hardening

Date: 2026-10-06

## Purpose

V4 correctly snapshots before FontName mutation and verifies rollback, but after a failed COM setter it used XML equality as the first branch. A COM setter can theoretically mutate COM-visible state without changing GetXML. In that case V4 would abort the transaction instead of restoring baseline and then attempting the guarded XML fallback.

## Changes

- `NativeLayoutEngine.psm1`: after any failed COM FontName path, validate the complete baseline using `Assert-NativeFontState` (object identity/type, COM FontName, X/Y/Rotation/FontSize, XML FontName, payload and canonical XML). If any field differs, restore and verify the complete pre-call baseline before XML fallback.
- `NativeReviewFixtures.cs`: add `com-hidden-partial`, which changes COM FontName state only, leaves XML unchanged, then throws.
- `Test-NativeFontFallback.ps1`: add the 23rd font regression and require one restore plus one XML fallback for `com-hidden-partial`.
- `SELF_CHECK_NATIVE.ps1`: report 23 font cases.
- `Build-NativeLayout.ps1`: bump runtime revision.

## Scope

This hardening does not loosen XML acceptance, change FontSize routing, alter barcode sizing, or touch existing evidence/components. Windows PowerShell 5.1 and real BarTender runtime remain required for final executable verification.
