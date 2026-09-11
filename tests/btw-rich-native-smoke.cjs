const fs=require('fs');
const vm=require('vm');

const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,
  CompressionStream,DecompressionStream,fetch,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Date,Math,URL,
  document:{readyState:'loading',addEventListener(){},querySelector(){return null},createElement(){return{}},head:{appendChild(){}},body:{appendChild(){}}},
  navigator:{},window:null,globalThis:null
};
c.window=c;c.globalThis=c;
vm.createContext(c);
for(const f of['assets/cloud-config.js','assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-native.js','assets/btw-rich-native.js','assets/btw-rich-bridge.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

function activeObjects(M,container){return M.mapContainer(container).objects.filter(o=>o.xMil!==50000||o.yMil!==50000)}
function assert(cond,msg){if(!cond)throw new Error(msg)}
function near(a,b,t=.03){return Math.abs(Number(a)-Number(b))<=t}
async function verify(label,expectedSeed,expectedKind,expectedSize,{sourceSized=false,donorSize=null}={}){
  const R=c.LabelWorkbenchBtwRichNative,M=c.LabelWorkbenchBtwObjectMap;
  assert(R?.canGenerate(label),'rich generator rejected supported label');
  const out=await R.generateOne(label,0);assert(out.rich===true,'rich marker missing');assert(out.seed===expectedSeed,`seed mismatch ${out.seed}`);assert(out.kind===expectedKind,`kind mismatch ${out.kind}`);
  assert(out.editableTextCount===label.fields.filter(x=>String(x.value||'').trim()).length,'editable Text count mismatch');
  assert(near(out.layout.target.width,expectedSize[0])&&near(out.layout.target.height,expectedSize[1]),`TemplateSize numeric mismatch: ${out.layout.target.width} x ${out.layout.target.height}`);
  if(sourceSized){
    assert(out.layout.target.source===true,'source size was not selected');
    assert(out.layout.sizeMutation?.changed===true,'source size did not mutate donor container');
    assert(out.layout.sizeMutation.count>0,'source size mutation has no internal pair');
    assert(donorSize&&near(out.layout.donorTarget.width,donorSize[0])&&near(out.layout.donorTarget.height,donorSize[1]),'donor size baseline mismatch');
  }else assert(out.layout.sizeMutation?.changed===false,'donor-only output should not rewrite size');
  const round=await R.splitOfficialBtw(out.bytes),container=round.container,map=M.mapContainer(container),active=activeObjects(M,container),finalSize=R.templateSizeMm(round);
  assert(/^2022\b/i.test(String(round.header.applicationVersion||'')),`not a 2022 BTW: ${round.header.applicationVersion}`);
  assert(near(finalSize.width,expectedSize[0])&&near(finalSize.height,expectedSize[1]),`final header TemplateSize mismatch ${finalSize.width} x ${finalSize.height}`);
  assert(active.length===out.layout.fields.length+out.layout.barcodes.length,`donor leak: active=${active.length}`);
  for(const f of out.layout.fields){const o=map.objects.find(x=>x.index===f.index);assert(o&&o.value===f.value,`Text value mismatch ${f.index}`);assert(o.xMil===f.xMil&&o.yMil===f.yMil,`Text position mismatch ${f.index}`)}
  for(const b of out.layout.barcodes){const o=map.objects.find(x=>x.index===b.index);assert(o&&o.components.join('')===b.value,`barcode value mismatch ${b.index}`);assert(o.xMil===b.xMil&&o.yMil===b.yMil,`barcode position mismatch ${b.index}`)}
  console.log('PASS rich',expectedKind,JSON.stringify({seed:out.seed,version:round.header.applicationVersion,target:out.layout.target,donorTarget:out.layout.donorTarget,sizeMutation:out.layout.sizeMutation,texts:out.layout.fields.length,barcodes:out.layout.barcodes.length,active:active.length,bytes:out.bytes.byteLength}));
}

(async()=>{
  const N=c.LabelWorkbenchBtwNative,R=c.LabelWorkbenchBtwRichNative,B=c.LabelWorkbenchBtwRichBridge;
  assert(R?.BUILD==='20260911-btw-rich-130-source-size','unexpected rich generator build');
  assert(B?.installed===true&&N?.__richDonorWrapped===true,'rich bridge did not wrap native download flow');
  const metric=R.templateSizeMm({header:{text:'<TemplateSize>210 x 148 mm</TemplateSize>'}}),inch=R.templateSizeMm({header:{text:'<TemplateSize>3" x 2"</TemplateSize>'}});
  assert(near(metric.width,210)&&near(metric.height,148),'metric TemplateSize must not be multiplied by 25.4');
  assert(near(inch.width,76.2)&&near(inch.height,50.8),'inch TemplateSize conversion failed');
  assert(R.selectPlan({fields:new Array(30).fill(0).map((_,i)=>({value:'X'+i})),barcodes:[]})===null,'30 Text objects must fall back');
  assert(R.selectPlan({fields:[],barcodes:[1,2,3].map(i=>({format:'Code 128',text:'C'+i}))})===null,'3 Code128 objects must fall back');

  await verify({sourceName:'mixed-rich.pdf',sourceGeometry:{widthMm:100,heightMm:65},fields:[
    {code:'1P',name:'PART',value:'W25N01KVZEIR',sourceBox:{x:.08,y:.12,w:.28,h:.07}},
    {code:'1T',name:'LOT',value:'66068W100ZZ',sourceBox:{x:.08,y:.28,w:.26,h:.07}},
    {name:'QTY',value:'120',sourceBox:{x:.08,y:.44,w:.12,h:.07}}
  ],barcodes:[
    {format:'Data Matrix',text:'[)>06|W25N01KVZEIR|66068W100ZZ',sourceBox:{x:.68,y:.12,w:.2,h:.24}},
    {format:'Code 128',text:'W25N01KVZEIR',sourceBox:{x:.12,y:.66,w:.55,h:.12}}
  ]},'GTL-A5-2022-R1','mixed',[100,65],{sourceSized:true,donorSize:[210,148]});

  await verify({sourceName:'dual-c128-rich.pdf',fields:[
    {name:'PART',value:'ABC-123',sourceBox:{x:.1,y:.1,w:.25,h:.08}},
    {name:'SERIAL',value:'SN-987654',sourceBox:{x:.1,y:.3,w:.3,h:.08}},
    {name:'DESC',value:'EDITABLE TEXT',sourceBox:{x:.1,y:.5,w:.35,h:.08}}
  ],barcodes:[
    {format:'Code 128',text:'ABC-123',sourceBox:{x:.55,y:.18,w:.32,h:.12}},
    {format:'Code 128',text:'SN-987654',sourceBox:{x:.55,y:.52,w:.32,h:.12}}
  ]},'FORD-GTL-MIXED-2022-R8','c128',[210,114.3]);

  console.log('PASS: production rich donor generator safely rewrites physical TemplateSize to source geometry while preserving independent editable Text/barcode objects');
})().catch(err=>{console.error(err);process.exit(1)});
