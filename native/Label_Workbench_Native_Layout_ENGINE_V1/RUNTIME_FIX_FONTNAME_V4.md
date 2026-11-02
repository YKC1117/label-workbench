> 本文保留前一輪紀錄；本次權威結論與修正請讀 CODEX_V4_FINAL_REVIEW.md。READY 狀態為 NO，新增程式未執行驗證。

# Runtime FontName fix V4

Observed on the real Windows + BarTender 2022/Argox run:

`COM FontName(System.String) failed`

The run had already passed far enough to enter the native BarTender build and create a Text object.

Targeted changes:

1. Do not write FontName when the newly-created Text already reports the requested font.
2. If a different font is requested, prefer the documented COM FontName setter.
3. If that setter throws or does not read back, use that exact Text object's GetXML, modify only the direct `<Font FontName="...">` attribute, SetXML it back, and verify:
   - Text root remains native Text
   - the EmbeddedDataSource ID is unchanged
   - payload is unchanged
   - COM FontName readback equals the request
4. FontSize remains on the previously proven COM property route; X/Y/rotation remain unchanged.
5. NativeReviewFixtures now emulates a rejected COM FontName PUT and Test-NativePersistence forces a non-default font so the mock suite exercises this fallback.

This is a targeted runtime correction; Windows PowerShell 5.1 and real BarTender execution are still the final authority.
