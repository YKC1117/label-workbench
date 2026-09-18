"""Deterministic public test labels. Requires reportlab, Pillow, pdftoppm.
Embed a font: a missing Helvetica substitute can overlap glyphs on Linux.
"""
from pathlib import Path
import subprocess
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode import code128, qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from PIL import Image

root=Path(__file__).resolve().parents[1]/'tests'/'fixtures'
pdfmetrics.registerFont(TTFont('FixtureSans','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
for name in ['generic-label','generic-qr']:
 c=canvas.Canvas(str(root/(name+'.pdf')),pagesize=(288,216),pageCompression=1,invariant=1)
 c.setFont('FixtureSans',12)
 for i,t in enumerate(['Customer Ref: SAMPLE-42','Batch: B2026','Serial: ABC123','Color: BLUE','Made in Taiwan']):c.drawString(18,192-i*24,t)
 if name=='generic-label':code128.Code128('ABC123',barHeight=30,barWidth=.9).drawOn(c,18,25)
 else:
  w=qr.QrCodeWidget('ABC123');b=w.getBounds();d=Drawing(60,60,transform=[60/(b[2]-b[0]),0,0,60/(b[3]-b[1]),0,0]);d.add(w);renderPDF.draw(d,c,200,18)
 c.showPage();c.save()
subprocess.run(['pdftoppm','-scale-to','1600','-singlefile','-png',str(root/'generic-label.pdf'),str(root/'generic-label')],check=True)
Image.open(root/'generic-label.png').convert('RGB').save(root/'generic-label.jpg',quality=95)
