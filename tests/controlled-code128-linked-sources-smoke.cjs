const fs=require('fs'),vm=require('vm');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-layout-map.js','assets/btw-controlled-donor.js','assets/btw-second-native.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const values=[
  'W25N01GWZEIG','6612D7800ZZ',
  'T','D','4000',
  '2628','G','20260722',
  '6612D7800','1','G','PS',
  '+090CI3L0_PS','N2'
];
const textObjects=values.map((text,i)=>({
  text,confidence:99,repeat:3,
  sourceBox:{x:.12+(i%4)*.18,y:.05+Math.floor(i/4)*.08,w:.12,h:.04}
}));
const barcodes=[
  {format:'Data Matrix',text:'DM-CONTENT-001',sourceBox:{x:.86,y:.05,w:.08,h:.16}},
  {format:'Code 128',text:'1PW25N01GWZEIG#1T6612D7800ZZ',sourceBox:{x:.03,y:.14,w:.30,h:.06}},
  {format:'Code 128',text:'30PT#31PD#Q4000',sourceBox:{x:.03,y:.30,w:.28,h:.06}},
  {format:'Code 128',text:'10D2628#21LG#16D20260722',sourceBox:{x:.03,y:.46,w:.32,h:.06}},
  {format:'Code 128',text:'31T6612D7800#33P1#23LG#24LPS',sourceBox:{x:.03,y:.62,w:.36,h:.06}},
  {format:'Code 128',text:'1Y+090CI3L0_PS#2Y#4YN2',sourceBox:{x:.03,y:.80,w:.32,h:.06}}
];
const label={sourceName:'linked-code128.png',sourceGeometry:{widthMm:140,heightMm:38},textObjects,fields:[],barcodes};

(async()=>{
  const S=c.LabelWorkbenchBtwSecondNative,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  const P=S.plan(label);assert(P,'plan rejected linked Code128 case');
  const out=await S.generateOne(label,0);
  assert(out.layout?.linkedCode128===5,'expected all 5 Code128 objects to use linked datasource mode');
  const parsed=F.parseStructure(out.bytes),mapped=M.mapContainer(await F.inflateContainer(parsed));
  for(const exp of out.layout.barcodes.filter(x=>x.type==='Code 128')){
    const o=mapped.objects.find(x=>x.index===exp.index);
    assert(o&&o.kind==='barcode','missing generated Code128 object '+exp.index);
    assert(o.resolvedPreview===exp.value,'Code128 resolved payload mismatch: '+o.resolvedPreview+' != '+exp.value);
    assert(!o.resolvedPreview.includes('#'),'segment separator leaked into native Code128 payload');
    assert(o.components.some(x=>/^文字\s*\d+/i.test(String(x))),'linked Code128 donor lost its Text datasource references');
    assert(!o.components.some(x=>String(x).includes('#')),'full merged payload was written into barcode component slot');
  }
  const linkedText=out.layout.text.filter(x=>x.linkedBarcode);
  assert(linkedText.length===14,'expected 14 linked visible Text datasource objects, got '+linkedText.length);
  assert(linkedText.every(x=>x.donorRelative),'linked barcode text did not use donor-relative geometry');
  for(const v of values){
    assert(linkedText.some(x=>x.value===v),'linked visible Text value missing: '+v);
  }
  const dups=[
    {text:'(10D)DATE NO: 2628',confidence:96,repeat:3,sourceBox:{x:.08,y:.40,w:.18,h:.04}},
    {text:'(10D)DATE NO: 2628',confidence:82,repeat:1,sourceBox:{x:.082,y:.407,w:.18,h:.04}},
    {text:'SAME FAR AWAY',confidence:90,repeat:2,sourceBox:{x:.65,y:.10,w:.15,h:.04}},
    {text:'SAME FAR AWAY',confidence:91,repeat:2,sourceBox:{x:.65,y:.70,w:.15,h:.04}}
  ];
  const dd=S.dedupeTextFields(dups);
  assert(dd.fields.filter(x=>x.text==='(10D)DATE NO: 2628').length===1,'near duplicate text was not removed');
  assert(dd.fields.filter(x=>x.text==='SAME FAR AWAY').length===2,'far-apart legitimate repeated text was incorrectly removed');
  console.log('PASS: linked Code128 text uses donor-relative layout and conservative near-duplicate text cleanup');
})().catch(e=>{console.error(e);process.exit(1)});