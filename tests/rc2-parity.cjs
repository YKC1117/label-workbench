const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto,createHash}=require('node:crypto');
let downloaded;
const link={click(){},remove(){}};
const c={console,crypto:webcrypto,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,setInterval(){},clearInterval(){},setTimeout(){},
 URL:{createObjectURL(blob){downloaded=blob;return 'blob:test';}},document:{body:{appendChild(){}},createElement(){return link;},readyState:'loading',addEventListener(){},getElementById(){return null;}}};
c.window=c;vm.createContext(c);
for(const f of ['analysis-geometry','btw-format','btw-object-map','btw-layout-map','btw-second-donor','btw-second-native','btw-family-native','btw-production-gate','btw-production-core','native-review']){
 vm.runInContext(fs.readFileSync('assets/'+f+'.js','utf8'),c,{filename:f});
}
(async()=>{
 const api=c.LabelWorkbenchBtwProductionCore;
 for(const [widthMm,heightMm] of [[140,38],[96,54],[45,55]]){
  const sourceBox={x:.12,y:.23,w:.3,h:.06};
  const label={sourceName:'test.png',sourceGeometry:{widthMm,heightMm},textObjects:[{text:'VISIBLE',confidence:99,sourceBox}],barcodes:[
   {format:'Code 128',text:'ABC123',sourceBox:{x:.12,y:.22,w:.4,h:.1}},
   {format:'Data Matrix',text:'DM1',sourceBox:{x:.71,y:.05,w:.13,h:.19}}]};
  const generated=await api.generate({labels:[label]},[]);
  await api.downloadGenerated(generated);
  const out=generated.outputs[0],review=JSON.parse(JSON.stringify(await c.LabelWorkbenchNativeReview.build(out)));
  const bytes=Buffer.from(await downloaded.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),review.sha256);
  assert.deepEqual(Buffer.from(review.btwBase64,'base64'),bytes);
  assert.deepEqual(review.layout,JSON.parse(JSON.stringify(out.request)));
  assert.deepEqual([review.layout.widthMm,review.layout.heightMm],[widthMm,heightMm]);
  const F=c.LabelWorkbenchBtwFormat, M=c.LabelWorkbenchBtwObjectMap;
  const rows=M.mapContainer(await F.inflateContainer(F.parseStructure(bytes))).objects;
  assert.equal(review.layout.objects.length,3);
  for(const o of review.layout.objects){
   const row=rows[o.donorIndex];
   assert.equal(row.name,o.physicalName);assert.equal(row.xMil*.0254,o.xMm);assert.equal(row.yMil*.0254,o.yMm);
   assert.equal(o.rotationMode,'inherit-donor');
   if(o.type==='text'){
    assert.deepEqual(o.sourceBox,sourceBox);assert.deepEqual(o.placementBox,sourceBox);
    assert.ok(Math.abs(o.yMm-sourceBox.y*heightMm)<.0254);
    assert.equal(row.value,o.value);assert.equal(row.fontName,o.fontName);assert.equal(o.fontName,'Microsoft JhengHei');
    assert.ok(Math.abs(row.fontSize-o.fontSizePt)<.11);
   }else{
    assert.equal(row.xDimension,o.xDimensionHundredthMil);assert.equal(row.resolvedPreview||row.components.join(''),o.value);
   }
  }
  console.log('PASS production download bytes, request and readback '+widthMm+'x'+heightMm);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
