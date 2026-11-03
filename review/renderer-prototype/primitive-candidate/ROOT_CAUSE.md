# Native primitive/HRI contract review

Baseline Run45 remains the passing Text/barcode renderer. This work adds no production capability until a real native geometry/persistence/visual gate is complete.

Run46 (41600992090), source bf2cfff8b4b5c1dca17e09464cdeabf529d2bee6: discovery workflow SUCCESS means only capture completed. The capabilities did NOT pass. Actual TypeLib BtObjectType constants: Line2, Box3, Barcode4, Text5, Picture6, RichText9; no separate Paragraph enum. Create2/3/6 returned native Line/Box/Picture roots, but direct property writes all returned 0x8000FFFF, including inserted proven BTC's Height in this Formats.Add document. Blank picture cold reopen is not an embedding PASS.

The default HumanReadableValue did match the main AB12 payload before the diagnostic stopped on Height refusal. This is partial caption-binding evidence only; not two-value persistence/geometry proof. Raw errors and actual artifact saved under evidence/run46.

Hypothesis, not fact: the Designer-authored document context used by the proven Hybrid renderer, and/or reacquiring Find handles, may change property availability. Follow-up uses fixed-SHA existing Designer base (all unused slots removed), creates only one each of Line/Box/Picture, reacquires Find, and tests direct setters then documented-name SetProperty/GetProperty (no guessed property variants). HRI value capture continues even if Height refuses, so capability axes are separate. Cold reopen starts a different owned COM process and hides the source PNG path. Strict peer XML and before/after file SHA remain enforced. There is no retry of the rejected Create5 primary Text route, mass component scan, user testing or donor binary rewrite.
