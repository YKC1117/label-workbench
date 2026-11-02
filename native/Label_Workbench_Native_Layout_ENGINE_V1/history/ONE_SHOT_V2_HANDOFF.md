# Label Workbench BarTender ONE-SHOT V2 handoff

This package supersedes the earlier ONE-SHOT package.

## Real Windows evidence carried forward

The user's 2026-10-02 real run proved that the installed `Common Bar Codes\Code 128.btc` could be inserted and became a native `BarCode-Code-128` with exactly one `EmbeddedDataSource`, no source transforms, and successful challenge + target payload roundtrips. The returned component SHA256 is:

`0B1E2481BCDE6E5CF1D084599F822DC3027AB19215530B7776296B40A59899F2`

That run then lost the BarTender RPC server only after the diagnostic attempted hundreds of additional component insertions. The return ZIP showed 541 eligible candidates, 541 COM insertion attempts, the first exact Code 128 candidate qualified, and the remaining 540 attempts failed. V2 therefore removes the mass COM scan rather than repeating it.

## V2 strategy

1. `program/proven-code128.btc` is the exact component returned by the user's prior real Windows run. SELF_CHECK verifies its SHA256 before BarTender starts.
2. One `InsertComponent` call is made on the working BTW copy. The new object is re-verified on the real document: native Code128, one Embedded source, no source transforms, challenge payload, target payload.
3. The `Objects` COM collection is released and reacquired after structural insertion before the rest of the test continues.
4. Barcode sizing now tests the documented `IBtDesignObject.Width` / `Height` setters directly, with 0.85 mm tolerance, while recording actual readback. This is object-size evidence; it is not mislabeled as decoder-confirmed symbol bounds.
5. XDimension is now a one-step capability probe only: change one adjacent `Index`, read XML/raster response, then restore the exact original XML. No dot-count assumption, no slope-to-best-index search, no iterative size tuning.
6. After the temporary XDimension probe, target Width/Height are reapplied and the actual final native dimensions + XDimension are captured for SaveAs / Close / Reopen verification.
7. Text, Code128 and Data Matrix still persist independently. Raster evidence remains supplemental and never replaces native property/XML readback.

## User operation

`CORE_TEST.cmd` -> select original BTW -> wait -> upload `RETURN_TO_CHATGPT.zip`.

## Still NOT claimed before the next real run

- Code128 object Width target 32 mm on real BarTender
- Data Matrix object Width/Height target 12 x 12 mm on real BarTender
- XDimension SetXML adjacent-Index response on real BarTender
- SaveAs / Close / Reopen persistence for the new Code128 component
- decoder-confirmed barcode symbol bounds, print quality, or scanner readability
