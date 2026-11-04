"""Independent text-ink expectation for tests/fixtures/vector-minimal.pdf.

Uses fontTools glyph outlines (glyf bounding boxes + advance widths) only.
It does not use pdf.js, the canonical core, or the PDF bytes. Inputs are the
hand-written design constants repeated in vector-minimal.expected.json.
reportlab drawString applies no kerning, so pen advance = sum of hmtx widths.
"""
import json, sys
from fontTools.ttLib import TTFont

FONTS = {'LiberationSans': '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
         'LiberationSans-Bold': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'}
PT_MM = 25.4 / 72


def ink(text, font, size, left_mm, baseline_mm):
    f = TTFont(FONTS[font]); upm = f['head'].unitsPerEm; cmap = f.getBestCmap(); glyf = f['glyf']; hmtx = f['hmtx']
    pen = 0.0; x0 = y0 = float('inf'); x1 = y1 = float('-inf')
    for ch in text:
        g = cmap[ord(ch)]; adv, _ = hmtx[g]; gl = glyf[g]
        if gl.numberOfContours != 0:
            x0 = min(x0, pen + gl.xMin); x1 = max(x1, pen + gl.xMax); y0 = min(y0, gl.yMin); y1 = max(y1, gl.yMax)
        pen += adv
    s = size / upm * PT_MM
    return {'inkLeftMm': round(left_mm + x0 * s, 4), 'inkTopMm': round(baseline_mm - y1 * s, 4),
            'inkWidthMm': round((x1 - x0) * s, 4), 'inkHeightMm': round((y1 - y0) * s, 4), 'advanceWidthMm': round(pen * s, 4)}


if __name__ == '__main__':
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    print(json.dumps([dict(t, expectedInk=ink(t['text'], t['pdfFont'], t['sizePt'], t['leftMm'], t['baselineMm'])) for t in spec['texts']], indent=2, ensure_ascii=False))
