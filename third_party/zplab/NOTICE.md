# ZPLab attribution

Copyright (c) 2026 u8array. MIT License in LICENSE alongside this notice.

Reviewed upstream files at https://github.com/u8array/ZPLab and their Git blob identities:

- packages/core/src/lib/coordinates.ts — 01dc038372230060394f908b272ef1710b6b7474
- packages/core/src/lib/objectBounds.ts — 88722d72dd9c7d268f7f01b989249a3c6a8a944d
- packages/core/src/lib/barcodeDims.ts — 55d048d9bbe9844757c645624e3defa9c8e93633
- packages/core/src/types/LabelConfig.ts and registry/index.ts — reviewed schema/registry composition
- registry/index.ts — f6131af0dbdddff76afc5a0ee075a3806d1556a3

Adapted ideas and elementary conversion functions into renderer/geometry.cjs: explicit physical units, conversion only at a device boundary, one geometry kernel and measured bounds separated from estimated bounds. Conversion uses dpi/25.4 rather than upstream dpmm, and dotsToMm deliberately preserves fractional mm rather than rounding to 0.1 mm. General clockwise rotation around canonical top-left replaces ZPL-specific FO/FT origin semantics.

renderer/barcode.cjs follows the upstream injected encoder and measured-footprint approach with bwip-js raw output. It is a small independent adapter supporting only Code128 and Data Matrix. No upstream ZPL emitters, firmware offsets, fonts or editor code were copied. Schema/adapter organization was borrowed conceptually; no labelforge source was copied. No GPL BarcodeLabelGen code or binary rewrite code was added.
