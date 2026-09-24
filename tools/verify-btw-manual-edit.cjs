const fs=require('fs');
const path=require('path');
const {fixtureLabel,loadRuntime}=require('./create-btw-runtime-fixture.cjs');

function near(a,b,t=1){return Math.abs(Number(a)-Number(b))<=t}

function manualExpectedLabel(){
  const label=fixtureLabel();
  label.sourceName='LabelWorkbench_Runtime_Acceptance_EDITED.btw';
  label.fields=label.fields.map((f,i)=>({...f,value:i===0?'TEXT_MANUAL_OK_001':f.value}));
  const values=[
    'C128_OK_ONE_111',
    'C128_OK_TWO_222',
    'C128_OK_THREE_333',
    'C128_OK_FOUR_444',
    'C128_OK_FIVE_555',
    'DM_OK_ONE_666'
  ];
  label.barcodes=label.barcodes.map((b,i)=>({...b,text:values[i]}));
  return label;
}

async function verifyManualEdit(filePath){
  const root=path.resolve(__dirname,'..'),c=loadRuntime(root),F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,L=c.LabelWorkbenchBtwLayout;
  const bytes=new Uint8Array(fs.readFileSync(filePath));
  const parsed=F.parseStructure(bytes);
  if(!/^2022\b/.test(parsed.header?.applicationVersion||''))throw new Error(`application version changed: ${parsed.header?.applicationVersion}`);
  if(!/^2022\b/.test(parsed.header?.compatibleVersion||''))throw new Error(`compatible version changed: ${parsed.header?.compatibleVersion}`);

  const expected=manualExpectedLabel();
  const target={width:expected.sourceGeometry.widthMm,height:expected.sourceGeometry.heightMm};
  const sizeText=`${F.formatMm(target.width)} x ${F.formatMm(target.height)} mm`;
  if(!String(parsed.header?.text||'').includes(`<TemplateSize>${sizeText}</TemplateSize>`))throw new Error(`TemplateSize mismatch: ${sizeText}`);

  const map=M.mapContainer(await F.inflateContainer(parsed)),objects=map.objects;
  const expectedRoots=expected.fields.length+expected.barcodes.length;
  if(objects.length!==expectedRoots)throw new Error(`root object count changed: ${objects.length}/${expectedRoots}`);
  if(objects.some(o=>Number(o.xMil)===50000||Number(o.yMil)===50000))throw new Error('unused donor root is hidden at 50000 mil instead of removed');
  const visible=objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil>=0&&o.yMil>=0&&o.xMil<50000&&o.yMil<50000);
  const visibleText=visible.filter(o=>o.kind==='text');
  const c128=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128');
  const dm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  if(visibleText.length!==6)throw new Error(`visible Text count ${visibleText.length}/6`);
  if(c128.length!==5)throw new Error(`visible Code128 count ${c128.length}/5`);
  if(dm.length!==1)throw new Error(`visible DataMatrix count ${dm.length}/1`);

  for(const field of expected.fields){
    const o=visibleText.find(x=>String(x.value??'')===field.value);
    if(!o)throw new Error(`missing expected manual Text value: ${field.value}`);
    const pos=L.boxToLayout(field.sourceBox,target).mil;
    if(!near(o.xMil,pos.x)||!near(o.yMil,pos.y))throw new Error(`Text position changed: ${field.value} ${o.xMil},${o.yMil} != ${pos.x},${pos.y}`);
  }

  const actualBarcode=[...c128,...dm].map(o=>String(o.resolvedPreview||o.components?.join('')||''));
  const wantedBarcode=expected.barcodes.map(b=>b.text);
  for(const value of wantedBarcode)if(!actualBarcode.includes(value))throw new Error(`missing expected manual barcode value: ${value}`);
  if(new Set(actualBarcode).size!==6)throw new Error(`manual barcode values are not independent: ${JSON.stringify(actualBarcode)}`);
  for(const b of expected.barcodes){
    const o=visible.find(x=>x.kind==='barcode'&&String(x.resolvedPreview||x.components?.join('')||'')===b.text);
    if(!o)throw new Error(`missing expected manual barcode object: ${b.text}`);
    const pos=L.boxToLayout(b.sourceBox,target).mil;
    if(!near(o.xMil,pos.x)||!near(o.yMil,pos.y))throw new Error(`barcode position changed: ${b.text} ${o.xMil},${o.yMil} != ${pos.x},${pos.y}`);
  }

  const stale=[
    'TEXT_EDIT_001',
    'C128_ONE_111','C128_TWO_222','C128_THREE_333','C128_FOUR_444','C128_FIVE_555','DM_ONE_666'
  ];
  const visibleValues=[...visibleText.map(o=>String(o.value??'')),...actualBarcode];
  for(const value of stale)if(visibleValues.includes(value))throw new Error(`manual edit did not replace original visible value: ${value}`);

  return{
    file:path.resolve(filePath),
    bytes:bytes.length,
    applicationVersion:parsed.header.applicationVersion,
    compatibleVersion:parsed.header.compatibleVersion,
    objectCount:objects.length,
    visibleText:visibleText.map(o=>o.value),
    visibleCode128:c128.length,
    visibleDataMatrix:dm.length,
    barcodes:wantedBarcode
  };
}

if(require.main===module){
  const target=process.argv[2]||path.join(process.cwd(),'LabelWorkbench_Runtime_Acceptance_EDITED.btw');
  if(!fs.existsSync(target)){
    console.error(`Manual edited BTW not found: ${path.resolve(target)}`);
    console.error('Save the edited BarTender document as LabelWorkbench_Runtime_Acceptance_EDITED.btw, then run this verifier again.');
    process.exit(2);
  }
  verifyManualEdit(path.resolve(target)).then(report=>{
    console.log('PASS: BarTender manual UI edits remained independent after save/reopen');
    console.log(JSON.stringify(report,null,2));
  }).catch(err=>{console.error(err);process.exit(1)});
}

module.exports={manualExpectedLabel,verifyManualEdit};
