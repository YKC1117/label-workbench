const fs=require('fs');
const path=require('path');
const {fixtureLabel,loadRuntime}=require('./create-btw-runtime-fixture.cjs');

function near(a,b,t=1){return Math.abs(Number(a)-Number(b))<=t}

async function verifyFixture(filePath){
  const root=path.resolve(__dirname,'..'),c=loadRuntime(root),F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,L=c.LabelWorkbenchBtwLayout;
  const bytes=new Uint8Array(fs.readFileSync(filePath));
  const parsed=F.parseStructure(bytes);
  if(!/^2022\b/.test(parsed.header?.applicationVersion||''))throw new Error(`application version changed: ${parsed.header?.applicationVersion}`);
  if(!/^2022\b/.test(parsed.header?.compatibleVersion||''))throw new Error(`compatible version changed: ${parsed.header?.compatibleVersion}`);
  const expected=fixtureLabel(),target={width:expected.sourceGeometry.widthMm,height:expected.sourceGeometry.heightMm};
  const sizeText=`${F.formatMm(target.width)} x ${F.formatMm(target.height)} mm`;
  if(!String(parsed.header?.text||'').includes(`<TemplateSize>${sizeText}</TemplateSize>`))throw new Error(`TemplateSize mismatch: ${sizeText}`);
  const map=M.mapContainer(await F.inflateContainer(parsed)),objects=map.objects;
  if(objects.length!==40)throw new Error(`root object count changed: ${objects.length}/40`);
  const visible=objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil<50000&&o.yMil<50000);
  const visibleText=visible.filter(o=>o.kind==='text');
  const c128=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128');
  const dm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  if(visibleText.length!==expected.fields.length)throw new Error(`visible Text count ${visibleText.length}/${expected.fields.length}; unused donor Text leaked into label area`);
  if(c128.length!==5)throw new Error(`visible Code128 count ${c128.length}/5`);
  if(dm.length!==1)throw new Error(`visible DataMatrix count ${dm.length}/1`);
  const actualBarcode=[...c128,...dm].map(o=>String(o.resolvedPreview||o.components?.join('')||''));
  const wantedBarcode=expected.barcodes.map(b=>b.text);
  for(const value of wantedBarcode)if(!actualBarcode.includes(value))throw new Error(`missing independent barcode after runtime save: ${value}`);
  if(new Set(actualBarcode).size!==6)throw new Error(`barcode values are not independent: ${JSON.stringify(actualBarcode)}`);

  for(const field of expected.fields){
    const o=visibleText.find(x=>String(x.value??'')===field.value);
    if(!o)throw new Error(`missing editable Text object: ${field.value}`);
    const pos=L.boxToLayout(field.sourceBox,target).mil;
    if(!near(o.xMil,pos.x)||!near(o.yMil,pos.y))throw new Error(`Text position changed: ${field.value} ${o.xMil},${o.yMil} != ${pos.x},${pos.y}`);
  }
  for(const b of expected.barcodes){
    const o=visible.find(x=>x.kind==='barcode'&&String(x.resolvedPreview||x.components?.join('')||'')===b.text);
    if(!o)throw new Error(`missing barcode object: ${b.text}`);
    const pos=L.boxToLayout(b.sourceBox,target).mil;
    if(!near(o.xMil,pos.x)||!near(o.yMil,pos.y))throw new Error(`barcode position changed: ${b.text} ${o.xMil},${o.yMil} != ${pos.x},${pos.y}`);
  }

  const raw=Buffer.from(bytes).toString('utf8');
  for(const token of['FTUSER5','FTWIN10-PC','第二個.pdf','W668GG6TB-06','K5494D9CJ','932437','C.K.B   QA  ACC']){
    if(raw.includes(token))throw new Error(`sanitized donor token reappeared: ${token}`);
  }
  return{file:path.resolve(filePath),bytes:bytes.length,applicationVersion:parsed.header.applicationVersion,compatibleVersion:parsed.header.compatibleVersion,objectCount:objects.length,visibleText:visibleText.length,visibleCode128:c128.length,visibleDataMatrix:dm.length,barcodes:wantedBarcode};
}

if(require.main===module){
  const target=process.argv[2];
  if(!target){console.error('Usage: node tools/verify-btw-runtime-fixture.cjs <file.btw>');process.exit(2)}
  verifyFixture(path.resolve(target)).then(report=>{
    console.log('PASS: BTW runtime fixture structure and six independent barcode values are intact');
    console.log(JSON.stringify(report,null,2));
  }).catch(err=>{console.error(err);process.exit(1)});
}

module.exports={verifyFixture};
