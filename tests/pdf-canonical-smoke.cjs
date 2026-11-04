'use strict';
// PDF -> canonical regression. Expected numbers are independent of the code
// under test: hand-written design constants, fontTools glyph metrics
// (tests/fixtures/vector-minimal.expected.json) and hand-computed region maths.
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Core=require('../assets/pdf-canonical.js');
const {pdfToCanonical}=require('../tools/pdf-to-canonical.cjs');
const {validate}=require('../renderer/canonical.cjs');
const {nativeRequest}=require('../renderer/adapter.cjs');
const {preview}=require('../renderer/preview.cjs');
const FX=path.join(__dirname,'fixtures');
let n=0;const ok=(name,fn)=>Promise.resolve().then(fn).then(()=>{n++;},e=>{e.message=name+': '+e.message;throw e;});
const near=(a,b,t,msg)=>assert.ok(Math.abs(a-b)<=t,`${msg}: ${a} vs ${b} (tol ${t})`);

(async()=>{
  // 1. Region -> page mm (hand-computed). Page 100 x 70 mm.
  const page={widthMm:100,heightMm:70};
  await ok('margin band at 10 px/mm',()=>{
    const r=Core.regionBoxToPageMm({x:.25,y:.5,w:.1,h:.05},{imageWidthPx:1000,imageHeightPx:700,regionPx:{x:100,y:50,w:800,h:600}},page);
    for(const [k,v] of Object.entries({x:30,y:35,w:8,h:3}))near(r[k],v,1e-9,k);
  });
  await ok('same physical box at 20 px/mm',()=>{
    const r=Core.regionBoxToPageMm({x:.25,y:.5,w:.1,h:.05},{imageWidthPx:2000,imageHeightPx:1400,regionPx:{x:200,y:100,w:1600,h:1200}},page);
    for(const [k,v] of Object.entries({x:30,y:35,w:8,h:3}))near(r[k],v,1e-9,k);
  });
  await ok('band offset toward bottom-right',()=>{
    const r=Core.regionBoxToPageMm({x:0,y:0,w:.5,h:.5},{imageWidthPx:1000,imageHeightPx:700,regionPx:{x:400,y:300,w:200,h:100}},page);
    for(const [k,v] of Object.entries({x:40,y:30,w:10,h:5}))near(r[k],v,1e-9,k);
  });
  await ok('whole page region when regionPx omitted',()=>{
    const r=Core.regionBoxToPageMm({x:.06,y:30/70,w:.34036,h:8/70},{imageWidthPx:2362,imageHeightPx:1654},page);
    near(r.x,6,1e-9,'x');near(r.w,34.036,1e-9,'w');near(r.y,30,.02,'y');
  });
  await ok('aspect mismatch rejected',()=>assert.throws(()=>Core.regionBoxToPageMm({x:0,y:0,w:.1,h:.1},{imageWidthPx:1000,imageHeightPx:800},page),/RENDER_ASPECT_MISMATCH/));
  await ok('region outside image rejected',()=>assert.throws(()=>Core.regionBoxToPageMm({x:0,y:0,w:.1,h:.1},{imageWidthPx:1000,imageHeightPx:700,regionPx:{x:900,y:0,w:200,h:100}},page),/REGION_OUTSIDE/));
  await ok('source box outside region rejected',()=>assert.throws(()=>Core.regionBoxToPageMm({x:.95,y:0,w:.1,h:.1},{imageWidthPx:1000,imageHeightPx:700},page),/INVALID_SOURCE_BOX/));

  // 2. Module table: exact vector values only, never printer-dot snapping.
  await ok('verified modules snap',()=>{assert.strictEqual(Core.snapModule(.254).moduleIndex,2);assert.strictEqual(Core.snapModule(.338582).moduleIndex,3);assert.strictEqual(Core.snapModule(.2575).moduleIndex,2);});
  await ok('0.3175 mm is not silently resized to 4 dots',()=>assert.strictEqual(Core.snapModule(.3175),null));
  await ok('fonts: verified, substituted, rejected',()=>{
    assert.deepStrictEqual(Core.mapFont('ABCDEF+Arial-BoldMT'),{family:'Arial',bold:true,italic:false,substitution:null,pdfFont:'Arial-BoldMT'});
    assert.strictEqual(Core.mapFont('AAAAAA+LiberationSans').substitution,'LiberationSans->Arial (metric-compatible)');
    assert.strictEqual(Core.mapFont('TimesNewRomanPS-ItalicMT').italic,true);
    assert.strictEqual(Core.mapFont('AAAAAA+DejaVuSans'),null);
  });

  // 3. Fixture integrity.
  const manifest=JSON.parse(fs.readFileSync(path.join(FX,'vector-fixtures.sha256.json'),'utf8'));
  await ok('fixture SHA manifest',()=>{for(const [f,h] of Object.entries(manifest))assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(FX,f))).digest('hex'),h,f);});

  // 4. Positive: vector-minimal against independent truth.
  const exp=JSON.parse(fs.readFileSync(path.join(FX,'vector-minimal.expected.json'),'utf8'));
  const a=await pdfToCanonical(path.join(FX,'vector-minimal.pdf'));
  await ok('vector-minimal COMPLETE',()=>{assert.strictEqual(a.report.status,'COMPLETE',JSON.stringify(a.report.reasons));assert.deepStrictEqual(a.report.substitutions,['LiberationSans->Arial (metric-compatible)']);});
  await ok('page size',()=>{assert.strictEqual(a.canonical.label.widthMm,exp.page.widthMm);assert.strictEqual(a.canonical.label.heightMm,exp.page.heightMm);});
  const texts=a.canonical.objects.filter(o=>o.type==='text');
  await ok('every expected text present exactly once',()=>{
    assert.strictEqual(texts.length,exp.texts.length);
    for(const t of exp.texts){
      const m=texts.filter(o=>o.text===t.text&&Math.abs(o.yMm-t.expectedInk.inkTopMm)<1);
      assert.strictEqual(m.length,1,t.text);const o=m[0];
      assert.strictEqual(o.fontFamily,t.fontFamily);assert.strictEqual(o.bold,t.bold);assert.strictEqual(o.italic,t.italic);assert.strictEqual(o.fontSizePt,t.sizePt);
      near(o.xMm,t.expectedInk.inkLeftMm,exp.tolerances.textInkMm,t.text+' ink left');
      near(o.yMm,t.expectedInk.inkTopMm,exp.tolerances.textInkMm,t.text+' ink top');
      assert.ok(o.widthMm>=t.expectedInk.inkWidthMm&&o.heightMm>=t.expectedInk.inkHeightMm,t.text+' frame contains ink');
    }
  });
  await ok('barcodes: symbol geometry, module, quiet zone',()=>{
    for(const b of exp.barcodes){
      const m=a.canonical.objects.filter(o=>o.type===b.type);assert.strictEqual(m.length,1);const o=m[0];
      assert.strictEqual(o.symbology,b.symbology);assert.strictEqual(o.value,b.value);assert.strictEqual(o.moduleMm,b.moduleMm);assert.strictEqual(o.moduleIndex,b.moduleIndex);
      for(const k of ['xMm','yMm','widthMm','heightMm'])near(o[k],b.canonical[k],exp.tolerances.barcodeGeometryMm,b.symbology+' '+k);
      if(b.type==='barcode1d'){assert.strictEqual(o.quietZoneMm,b.quietZoneMm);near(o.barHeightMm,b.barHeightMm,.01,'bar height');assert.strictEqual(o.humanReadable,false);}
    }
  });
  await ok('authoritative renderer validation',()=>{validate(a.canonical);const r=nativeRequest(JSON.parse(JSON.stringify(a.canonical)));assert.strictEqual(r.objects.length,8);preview(JSON.parse(JSON.stringify(a.canonical)));
    const c=r.objects.find(o=>o.type==='code128');near(c.xMm,6,.01,'native Code128 symbol left');near(c.widthMm,34.036,.01,'native Code128 symbol width');});
  await ok('committed canonical equals fresh output',()=>assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(FX,'vector-minimal.canonical.json'),'utf8')),a.canonical));
  const a2=await pdfToCanonical(path.join(FX,'vector-minimal.pdf'));
  await ok('deterministic',()=>assert.deepStrictEqual(a2.canonical,a.canonical));

  // 5. White page background is not ink; output identical to minimal.
  const w=await pdfToCanonical(path.join(FX,'vector-white-background.pdf'));
  await ok('white background ignored, same canonical',()=>{assert.strictEqual(w.report.status,'COMPLETE');assert.strictEqual(w.report.coverage.ignoredWhiteFills,1);assert.deepStrictEqual(w.canonical,a.canonical);});

  // 6. Negatives: never a canonical, exact reason codes.
  const neg={'vector-unsupported-graphics.pdf':['UNSUPPORTED_STROKE'],'vector-image.pdf':['UNSUPPORTED_IMAGE'],'vector-rotated-text.pdf':['ROTATED_OR_MIRRORED_TEXT'],
    'generic-label.pdf':['MODULE_NOT_IN_VERIFIED_TABLE','UNSUPPORTED_FONT'],'generic-qr.pdf':['UNSUPPORTED_SYMBOLOGY','UNSUPPORTED_FONT']};
  for(const [f,codes] of Object.entries(neg)){
    const r=await pdfToCanonical(path.join(FX,f));
    await ok('reject '+f,()=>{assert.strictEqual(r.report.status,'REJECTED');assert.strictEqual(r.canonical,null);assert.deepStrictEqual([...new Set(r.report.reasons.map(x=>x.code))].sort(),codes.slice().sort());assert.strictEqual(r.report.objects.length,0);});
  }

  // 7. Synthetic core cases: undecoded vector barcode and decoded barcode without vectors.
  const inp=(await require('../tools/pdf-to-canonical.cjs').extract(path.join(FX,'vector-minimal.pdf'))).input;
  await ok('undecoded vector barcode is never dropped silently',()=>{const r=Core.build({...inp,decodedBarcodes:inp.decodedBarcodes.filter(d=>Core.normalizeFormat(d.format)!=='Code128')});assert.strictEqual(r.canonical,null);assert.ok(r.report.reasons.some(x=>x.code==='UNSUPPORTED_GRAPHIC'));});
  await ok('decoded box far from vectors rejected',()=>{const d=inp.decodedBarcodes.map(x=>({...x,boxMm:{...x.boxMm,x:x.boxMm.x+5}}));const r=Core.build({...inp,decodedBarcodes:d});assert.strictEqual(r.canonical,null);});
  await ok('analysis-style band with margins associates correctly',()=>{
    // Re-express each decoded box through a band that excludes 4 mm margins at 7 px/mm.
    const W=700,H=490,reg={x:28,y:28,w:644,h:434};
    const d=inp.decodedBarcodes.map(x=>{const b=x.boxMm;const sb={x:(b.x*7-reg.x)/reg.w,y:(b.y*7-reg.y)/reg.h,w:b.w*7/reg.w,h:b.h*7/reg.h};return {...x,boxMm:Core.regionBoxToPageMm(sb,{imageWidthPx:W,imageHeightPx:H,regionPx:reg},{widthMm:100,heightMm:70})};});
    assert.deepStrictEqual(Core.build({...inp,decodedBarcodes:d}).canonical,a.canonical);
  });
  await ok('missing raster rejects text',()=>{const r=Core.build({...inp,raster:null});assert.ok(r.report.reasons.some(x=>x.code==='RASTER_UNAVAILABLE'));});
  await ok('multi-page rejected',()=>assert.ok(Core.build({...inp,numPages:2}).report.reasons.some(x=>x.code==='MULTI_PAGE_UNSUPPORTED')));
  await ok('rotated page rejected',()=>assert.ok(Core.build({...inp,page:{...inp.page,rotate:90}}).report.reasons.some(x=>x.code==='PAGE_ROTATION_UNSUPPORTED')));
  console.log('PDF -> canonical regression: '+n+'/'+n+' PASS');
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
