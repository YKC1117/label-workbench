const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-controlled-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const label={
  sourceName:'five-code-one-dm.pdf',
  sourceGeometry:{widthMm:140,heightMm:38},
  fields:Array.from({length:12},(_,i)=>({name:`FIELD_${i+1}`,value:`VALUE_${String(i+1).padStart(2,'0')}`,sourceBox:{x:.03+(i%3)*.2,y:.03+Math.floor(i/3)*.1,w:.15,h:.04}})),
  barcodes:[
    {format:'Data Matrix',text:'DM-TEST-001-ABC',sourceBox:{x:.72,y:.05,w:.12,h:.20}},
    {format:'Code 128',text:'C128-ONE-111',sourceBox:{x:.05,y:.52,w:.35,h:.06}},
    {format:'Code 128',text:'C128-TWO-222',sourceBox:{x:.05,y:.61,w:.35,h:.06}},
    {format:'Code 128',text:'C128-THREE-333',sourceBox:{x:.05,y:.70,w:.35,h:.06}},
    {format:'Code 128',text:'C128-FOUR-444',sourceBox:{x:.48,y:.61,w:.35,h:.06}},
    {format:'Code 128',text:'C128-FIVE-555',sourceBox:{x:.48,y:.70,w:.35,h:.06}}
  ]
};

(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,L=c.LabelWorkbenchBtwLayout;
  if(!S.canGenerate(label))throw new Error('5C128+1DM plan unexpectedly rejected');
  const missingGeometry={...label,barcodes:label.barcodes.map((b,i)=>i===1?{...b,sourceBox:null}:{...b})};
  let geometryRejected=false;
  try{await S.generateOne(missingGeometry,0)}catch(error){geometryRejected=/sourceBox|座標不完整/.test(String(error?.message||error))}
  if(!geometryRejected)throw new Error('known-size 5C128+1DM output must reject missing barcode sourceBox instead of using fallback coordinates');
  const missingTextGeometry={...label,fields:label.fields.map((f,i)=>i===2?{...f,sourceBox:null}:{...f})};
  let textGeometryRejected=false;
  try{await S.generateOne(missingTextGeometry,0)}catch(error){textGeometryRejected=/sourceBox|座標不完整/.test(String(error?.message||error))}
  if(!textGeometryRejected)throw new Error('known-size output must reject missing text sourceBox instead of using fallback coordinates');
  const out=await S.generateOne(label,0);
  if(out.seed!=='LW-CONTROLLED-140x38-2022-R2')throw new Error(`seed ${out.seed}`);
  const parsed=F.parseStructure(out.bytes);
  if(parsed.header.applicationVersion!=='2022 R2'||parsed.header.compatibleVersion!=='2022 R1')throw new Error('version changed');
  if(!parsed.header.text.includes('<TemplateSize>140 x 38 mm</TemplateSize>'))throw new Error('TemplateSize not rewritten');
  const map=M.mapContainer(await F.inflateContainer(parsed)),objects=map.objects;
  const renderedContainer=await F.inflateContainer(parsed),rdv=new DataView(renderedContainer.buffer,renderedContainer.byteOffset,renderedContainer.byteLength),auxCoords=[];
  for(let i=0;i+16<renderedContainer.length;i++){
    if(renderedContainer[i]!==0xff||renderedContainer[i+1]!==0xff||renderedContainer[i+2]!==0x01||renderedContainer[i+3]!==0x00)continue;
    const len=renderedContainer[i+4]|(renderedContainer[i+5]<<8);if(len<3||len>80||i+6+len+8>renderedContainer.length)continue;
    let type='';let ok=true;for(let j=0;j<len;j++){const b=renderedContainer[i+6+j];if(b<0x20||b>0x7e){ok=false;break}type+=String.fromCharCode(b)}
    if(!ok||!['LineData','CircleData','PictureData'].includes(type))continue;
    const at=i+6+len;auxCoords.push({type,x:rdv.getInt32(at,true),y:rdv.getInt32(at+4,true)})
  }
  if(auxCoords.length<2||auxCoords.some(x=>x.x!==S.OFF||x.y!==S.OFF))throw new Error('controlled donor auxiliary line/circle/picture graphics were not parked off-canvas');
  const donorBytes=new Uint8Array(await c.LabelWorkbenchBtwControlledDonor.bytes()),donorParsed=F.parseStructure(donorBytes),donorObjects=M.mapContainer(await F.inflateContainer(donorParsed)).objects;
  const expectedRoots=label.fields.length+label.barcodes.length;
  if(objects.length!==out.layout?.originalRootCount)throw new Error(`donor root graph changed ${objects.length}/${out.layout?.originalRootCount}`);
  if(out.layout?.parkedDonorRoots!==(objects.length-expectedRoots))throw new Error(`parked donor roots ${out.layout?.parkedDonorRoots}`);
  const parked=objects.filter(o=>Number(o.xMil)===S.OFF&&Number(o.yMil)===S.OFF);
  if(parked.length!==out.layout.parkedDonorRoots)throw new Error(`off-canvas donor count ${parked.length}/${out.layout.parkedDonorRoots}`);
  for(const o of objects.filter(x=>x.kind==='text'&&Number.isFinite(x.textBoxXMil)&&Number.isFinite(x.textBoxYMil))){
    const before=donorObjects.find(x=>x.index===o.index);if(!before||!Number.isFinite(before.textBoxXMil)||!Number.isFinite(before.textBoxYMil))throw new Error(`missing donor Text Box geometry for index ${o.index}`);
    if(o.xMil===S.OFF&&o.yMil===S.OFF){
      if(o.textBoxXMil-o.xMil!==before.textBoxXMil-before.xMil)throw new Error(`parked Text Box relative X changed at index ${o.index}`);
      if(o.textBoxYMil-o.yMil!==before.textBoxYMil-before.yMil)throw new Error(`parked Text Box relative Y changed at index ${o.index}`);
    }else{
      if(o.textBoxXMil!==o.xMil||o.textBoxYMil!==o.yMil)throw new Error(`visible Text Box did not align to source position at index ${o.index}: ${o.textBoxXMil}/${o.textBoxYMil} vs ${o.xMil}/${o.yMil}`);
    }
  }
  for(const o of parked.filter(x=>x.kind==='text'&&Number.isFinite(x.textBoxXMil)&&Number.isFinite(x.textBoxYMil))){
    if(o.textBoxXMil<40000||o.textBoxYMil<40000)throw new Error(`parked Text internal Box remained on-label at index ${o.index}: ${o.textBoxXMil}/${o.textBoxYMil}`)
  }
  const visible=objects.filter(o=>Number.isFinite(o.xMil)&&Number.isFinite(o.yMil)&&o.xMil>=0&&o.yMil>=0&&o.xMil<S.OFF&&o.yMil<S.OFF);
  const visibleText=visible.filter(o=>o.kind==='text');
  if(visibleText.some(o=>o.anchorPoint!==0))throw new Error('visible controlled-donor Text must normalize to Top-Left Anchor 0');
  const visibleDm=visible.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix');
  const dmIndexes=new Set(visibleDm.map(o=>o.index)),visibleC128=visible.filter(o=>o.kind==='barcode'&&!dmIndexes.has(o.index)&&o.componentEntries?.length);
  if(visibleC128.length!==5)throw new Error(`visible Code128 ${visibleC128.length}`);
  if(visibleDm.length!==1)throw new Error(`visible DataMatrix ${visibleDm.length}`);
  const wanted=label.barcodes.map(b=>b.text),actual=[...visibleDm,...visibleC128].map(o=>o.resolvedPreview||o.components?.join('')||'');
  for(const value of wanted)if(!actual.includes(value))throw new Error(`missing independent barcode ${value}; got ${JSON.stringify(actual)}`);
  if(new Set(actual).size!==6)throw new Error('barcode values are not independent');
  for(const f of label.fields){const o=visible.find(x=>x.kind==='text'&&x.value===f.value);if(!o)throw new Error(`missing field ${f.value}`);const pos=L.boxToLayout(f.sourceBox,{width:140,height:38}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`field position mismatch ${f.value}`)}
  for(const b of label.barcodes){const o=visible.find(x=>x.kind==='barcode'&&x.resolvedPreview===b.text);if(!o)throw new Error(`missing barcode ${b.text}`);const pos=L.boxToLayout(b.sourceBox,{width:140,height:38}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`barcode position mismatch ${b.text}`)}
  const sizedContainer=await F.inflateContainer(parsed),dv=new DataView(sizedContainer.buffer,sizedContainer.byteOffset,sizedContainer.byteLength);let pairs=0;for(let i=0;i<=dv.byteLength-8;i++)if(dv.getInt32(i,true)===L.mmToMil(140)&&dv.getInt32(i+4,true)===L.mmToMil(38))pairs++;
  if(pairs<2)throw new Error(`internal size pair rewrite missing: ${pairs}`);

  // The same normalized layout must map correctly to a completely different customer label size.
  // This proves production layout is dimension-driven, not hardcoded to the 140x38 regression fixture.
  const altLabel={
    ...label,
    sourceName:'another-customer-label.png',
    sourceGeometry:{widthMm:96,heightMm:54},
    fields:label.fields.slice(0,8).map((f,i)=>({...f,name:`ALT_FIELD_${i+1}`,value:`ALT_VALUE_${i+1}`,sourceBox:{x:.04+(i%2)*.42,y:.05+Math.floor(i/2)*.12,w:.28,h:.05}})),
    barcodes:[
      {format:'Data Matrix',text:'ALT-DM-900',sourceBox:{x:.76,y:.06,w:.16,h:.24}},
      {format:'Code 128',text:'ALT-C128-A',sourceBox:{x:.05,y:.56,w:.38,h:.07}},
      {format:'Code 128',text:'ALT-C128-B',sourceBox:{x:.52,y:.56,w:.38,h:.07}},
      {format:'Code 128',text:'ALT-C128-C',sourceBox:{x:.05,y:.68,w:.38,h:.07}},
      {format:'Code 128',text:'ALT-C128-D',sourceBox:{x:.52,y:.68,w:.38,h:.07}},
      {format:'Code 128',text:'ALT-C128-E',sourceBox:{x:.28,y:.82,w:.44,h:.07}}
    ]
  };
  const alt=await S.generateOne(altLabel,1),altParsed=F.parseStructure(alt.bytes),altObjects=M.mapContainer(await F.inflateContainer(altParsed)).objects;
  if(altObjects.filter(o=>o.kind==='text'&&o.xMil>=0&&o.yMil>=0&&o.xMil<S.OFF&&o.yMil<S.OFF).some(o=>o.anchorPoint!==0))throw new Error('arbitrary-size visible Text Anchor was not normalized to Top-Left');
  if(!altParsed.header.text.includes('<TemplateSize>96 x 54 mm</TemplateSize>'))throw new Error('arbitrary customer TemplateSize was not rewritten to 96x54mm');
  if(altObjects.length!==alt.layout?.originalRootCount)throw new Error('arbitrary-size donor root graph changed');
  const altParked=altObjects.filter(o=>Number(o.xMil)===S.OFF&&Number(o.yMil)===S.OFF);
  if(altParked.length!==alt.layout?.parkedDonorRoots)throw new Error(`arbitrary-size parked donor count ${altParked.length}/${alt.layout?.parkedDonorRoots}`);
  for(const f of altLabel.fields){const o=altObjects.find(x=>x.kind==='text'&&x.value===f.value);if(!o)throw new Error(`alt missing field ${f.value}`);const pos=L.boxToLayout(f.sourceBox,{width:96,height:54}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`alt field position mismatch ${f.value}`)}
  for(const b of altLabel.barcodes){const o=altObjects.find(x=>x.kind==='barcode'&&x.resolvedPreview===b.text);if(!o)throw new Error(`alt missing barcode ${b.text}`);const pos=L.boxToLayout(b.sourceBox,{width:96,height:54}).mil;if(o.xMil!==pos.x||o.yMil!==pos.y)throw new Error(`alt barcode position mismatch ${b.text}`)}
  console.log('PASS: generic 5C128+1DM layout restores normalized source geometry with Top-Left Text anchors at both 140x38mm and unrelated 96x54mm sizes, rejects missing geometry, while preserving the native donor object graph');
})().catch(e=>{console.error(e);process.exit(1)});