"""Deterministic public vector-PDF fixtures for the PDF -> canonical flow.

Requires: reportlab, Pillow, Liberation fonts, node + bwip-js (devDependency).
No customer data. Design constants below are restated by hand in
tests/fixtures/vector-minimal.expected.json; the expected file is NOT generated
from this script (independent truth, see that file's "method").

Independent encoders on purpose:
  * Code 128 is drawn by reportlab (its bar pattern equals bwip-js for the value).
  * Data Matrix is drawn cell by cell from the bwip-js 12x12 matrix, because
    reportlab's ECC200DataMatrix selects 44x44 for this payload, which BarTender
    and bwip-js would not produce.
"""
from pathlib import Path
import hashlib, io, json, subprocess
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.code128 import Code128
from reportlab.lib.utils import ImageReader
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests' / 'fixtures'
FONTS = Path('/usr/share/fonts/truetype/liberation')
pdfmetrics.registerFont(TTFont('LiberationSans', str(FONTS / 'LiberationSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('LiberationSans-Bold', str(FONTS / 'LiberationSans-Bold.ttf')))

MM = 72 / 25.4
PAGE_W_MM, PAGE_H_MM = 100.0, 70.0
# (text, font, size pt, left mm, baseline mm from top)
TEXTS = [
    ('LW VECTOR LABEL', 'LiberationSans-Bold', 12, 6.0, 11.0),
    ('PART NO:', 'LiberationSans', 8, 6.0, 18.0),
    ('LW-ABC-77', 'LiberationSans', 8, 30.0, 18.0),
    ('QTY: 250', 'LiberationSans', 10, 6.0, 25.0),
    ('DM: LWDM01', 'LiberationSans', 8, 66.0, 25.0),
    ('LW-ABC-77', 'LiberationSans', 8, 6.0, 44.0),
]
CODE128 = dict(value='LW-ABC-77', left=6.0, top=30.0, module=0.254, height=8.0)
DATAMATRIX = dict(value='LWDM01', left=66.0, top=30.0, module=0.338582)


def y_pt(mm_from_top):
    return (PAGE_H_MM - mm_from_top) * MM


def dm_matrix(value):
    js = ("const [r]=require('bwip-js').raw({bcid:'datamatrix',text:%s});"
          "process.stdout.write(JSON.stringify({w:r.pixx,h:r.pixy,p:Array.from(r.pixs)}))") % json.dumps(value)
    data = json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, check=True, capture_output=True, text=True).stdout)
    return data['w'], data['h'], data['p']


def draw_label(c, extra=None):
    for text, font, size, left, base in TEXTS:
        c.setFont(font, size)
        c.drawString(left * MM, y_pt(base), text)
    bc = Code128(CODE128['value'], barWidth=CODE128['module'] * MM, barHeight=CODE128['height'] * MM, quiet=0)
    bc.drawOn(c, CODE128['left'] * MM, y_pt(CODE128['top'] + CODE128['height']))
    w, h, cells = dm_matrix(DATAMATRIX['value'])
    m = DATAMATRIX['module'] * MM
    for r in range(h):
        for col in range(w):
            if cells[r * w + col]:
                c.rect(DATAMATRIX['left'] * MM + col * m, y_pt(DATAMATRIX['top']) - (r + 1) * m, m, m, stroke=0, fill=1)
    if extra:
        extra(c)


def white_background(c):
    c.saveState(); c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, PAGE_W_MM * MM, PAGE_H_MM * MM, stroke=0, fill=1); c.restoreState()


def frame_and_rule(c):
    c.setLineWidth(0.5)
    c.rect(2 * MM, 2 * MM, 96 * MM, 66 * MM, stroke=1, fill=0)
    c.line(6 * MM, y_pt(27), 94 * MM, y_pt(27))


def small_image(c):
    img = Image.new('L', (16, 16), 255)
    for i in range(16):
        img.putpixel((i, i), 0)
    buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    c.drawImage(ImageReader(buf), 84 * MM, y_pt(14), 8 * MM, 8 * MM)


def rotated_text(c):
    c.saveState(); c.translate(95 * MM, y_pt(60)); c.rotate(90)
    c.setFont('LiberationSans', 8); c.drawString(0, 0, 'ROTATED'); c.restoreState()


VARIANTS = {
    'vector-minimal': (None, None),
    'vector-white-background': (white_background, None),
    'vector-unsupported-graphics': (None, frame_and_rule),
    'vector-image': (None, small_image),
    'vector-rotated-text': (None, rotated_text),
}

manifest = {}
for name, (before, after) in VARIANTS.items():
    path = OUT / (name + '.pdf')
    c = canvas.Canvas(str(path), pagesize=(PAGE_W_MM * MM, PAGE_H_MM * MM), pageCompression=1, invariant=1)
    if before:
        before(c)
    draw_label(c, after)
    c.showPage(); c.save()
    manifest[name + '.pdf'] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUT / 'vector-fixtures.sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
