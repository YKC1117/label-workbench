const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
function assert(c,m){if(!c)throw new Error(m)}
const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of ['assets/btw-format.js','assets/btw-object-map.js','assets/btw-controlled-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
const cases=[
 ['A_short_ascii','ABC123'],
 ['B_long_ascii','PART NO : W25N01GWZEIG'],
 ['C_spaces','DATE NO : 20260722 LOT A1'],
 ['D_zh_tw','測試文字 ABC123 20260722']
];
(async()=>{
  const F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap,D=c.LabelWorkbenchBtwControlledDonor,OFF=50000;
  const seed=new Uint8Array(await D.bytes()),parsed=F.parseStructure(seed),container=await F.inflateContainer(parsed),map=M.mapContainer(container);
  const proto=map.objects.find(o=>o.kind==='text'&&String(o.name).trim()==='文字 28');
  assert(proto,'controlled donor text prototype 文字 28 not found');
  assert(proto.valueEntry,'文字 28 has no writable value');
  fs.mkdirSync('artifacts/btw-diagnostic/clean-text-probe',{recursive:true});
  const summary={
    donorBuild:D.BUILD||null,
    objectMapBuild:M.BUILD||null,
    prototype:{
      index:proto.index,name:proto.name,rootPath:proto.rootPath,owner:proto.owner,
      xMil:proto.xMil,yMil:proto.yMil,boxXMil:proto.textBoxXMil,boxYMil:proto.textBoxYMil,
      boxDeltaX:Number.isFinite(proto.textBoxXMil)?proto.textBoxXMil-proto.xMil:null,
      boxDeltaY:Number.isFinite(proto.textBoxYMil)?proto.textBoxYMil-proto.yMil:null,
      fontName:proto.fontName,fontSize:proto.fontSize,fontSizeOffset:proto.fontSizeOffset,
      recordStart:proto.recordStart,recordEnd:proto.recordEnd,stringsCount:proto.stringsCount
    },
    cases:[]
  };
  for(const [id,value] of cases){
    const edits=map.objects.map(o=>({index:o.index,xMil:OFF,yMil:OFF}));
    const hit=edits.find(e=>e.index===proto.index);
    Object.assign(hit,{xMil:1000,yMil:1000,value});
    if(proto.fontNameOffset!=null)hit.fontName='Microsoft JhengHei';
    if(proto.fontSizeOffset!=null)hit.fontSize=6;
    const rebuilt=await M.rebuildBtw(seed,edits),bytes=rebuilt.bytes||rebuilt;
    const outPath='artifacts/btw-diagnostic/clean-text-probe/'+id+'.btw';
    fs.writeFileSync(outPath,Buffer.from(bytes));
    const decoded=await M.decodeBtw(bytes),obj=decoded.map.objects.find(o=>o.index===proto.index);
    assert(obj&&obj.value===value,id+' value round-trip failed');
    assert(obj.xMil===1000&&obj.yMil===1000,id+' position round-trip failed');
    summary.cases.push({
      id,value,file:id+'.btw',sha256:crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
      readback:{xMil:obj.xMil,yMil:obj.yMil,boxXMil:obj.textBoxXMil,boxYMil:obj.textBoxYMil,fontName:obj.fontName,fontSize:obj.fontSize}
    });
  }
  const readme=[
    '# Clean Normal Text prototype probe',
    '',
    'Purpose: verify whether controlled donor object 文字 28 already behaves like a usable BarTender Normal single-line text prototype.',
    '',
    'Open A/B/C/D in the same BarTender Designer for Argox environment. Do not edit before observing.',
    '',
    'PASS criteria for the prototype:',
    '- all four values remain one line;',
    '- no wrapping;',
    '- no clipping;',
    '- no automatic font shrink/grow between cases;',
    '- left/top reference point stays visually stable;',
    '- Chinese file remains readable with the installed font.',
    '',
    'If any criterion fails, do not promote 文字 28 into production. Build controlled A/B/C/D BarTender samples instead.',
    ''
  ].join('\n');
  fs.writeFileSync('artifacts/btw-diagnostic/clean-text-probe/README.md',readme);
  fs.writeFileSync('artifacts/btw-diagnostic/clean-text-probe/probe-summary.json',JSON.stringify(summary,null,2));
  console.log('CLEAN_TEXT_PROBE '+JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exit(1)});