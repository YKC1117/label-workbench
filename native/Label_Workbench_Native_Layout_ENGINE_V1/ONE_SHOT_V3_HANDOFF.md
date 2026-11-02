# ONE-SHOT V3 handoff

This package is based on the real Windows result returned at 2026-10-02 11:35.

## Real evidence now proven

- BarTender 2022 R2 Automation opens the selected original BTW and leaves its SHA256 unchanged.
- Bundled `proven-code128.btc` inserts once as native `BarCode-Code-128`.
- Code128 has exactly one EmbeddedDataSource with no source transforms and accepts the target payload.
- Existing Data Matrix also accepts the target payload with a single EmbeddedDataSource and no source transforms.
- Text payload and SaveAs -> Close -> Reopen readback already passed.

## Why V2 stopped

V2 made geometry target equality a fatal gate before barcode sizing. The real run showed Code128 Y and Data Matrix X were adjusted by BarTender, so both barcode tests stopped before size and persistence. The Data Matrix X target was also applied while the original object still had a much larger footprint.

## V3 changes

1. Confirm `Format.MeasurementUnits = btUnitsMillimeters (3)` by live readback.
2. Barcode sizing runs before X/Y positioning.
3. X/Y target mismatch is non-fatal and records both requested and accepted coordinates. Save/reopen verifies the accepted coordinates.
4. Code128 uses the documented 1D barcode `Height` setter only. Barcode `Width` is not used as a size control.
5. Code128 runs one bounded XDimension write/readback/raster-response probe, then restores the exact starting XDimension and reapplies target Height. Width 32 mm is not falsely accepted because the bundled component has visible human-readable text and no decoder-confirmed symbol bounds.
6. Data Matrix uses the existing bounded empirical XDimension experiment (max five samples) with BMP header-DPI sanity checks and raster ink bounds to approach 12 x 12 mm. It does not infer `Index+1 = printer dots`.
7. After sizing, target position is applied; then one SaveAs -> Close -> Reopen verifies payload, source structure, accepted geometry, XDimension/raster state, and second payload editability.
8. No mass component scan. One proven Code128 component insertion only.

## Still NOT product acceptance

- Code128 32 mm decoder-confirmed symbol width.
- Physical print/scanner verification.
- Designer visual acceptance.
- Windows/BarTender execution of V3 itself until the user runs `CORE_TEST.cmd`.
