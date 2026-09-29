const fs=require('fs');
const vm=require('vm');

const c={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream,atob,btoa,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
c.window=c;c.globalThis=c;vm.createContext(c);
for(const f of['assets/btw-format.js','assets/btw-object-map.js','assets/btw-second-donor.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});

const i32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getInt32(o,true);
const u32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getUint32(o,true);
const f32=(d,o)=>new DataView(d.buffer,d.byteOffset,d.byteLength).getFloat32(o,true);
const round=v=>Number.isFinite(v)?Math.round(v*1000)/1000:null;

(async()=>{
  const D=c.LabelWorkbenchBtwSecondDonor,F=c.LabelWorkbenchBtwFormat,M=c.LabelWorkbenchBtwObjectMap;
  const bytes=new Uint8Array(await D.bytes()),parsed=F.parseStructure(bytes),container=await F.inflateContainer(parsed),objects=M.mapContainer(container).objects;
  fs.mkdirSync('artifacts/btw-diagnostic',{recursive:true});
  parsed.pngs.forEach((p,i)=>fs.writeFileSync('artifacts/btw-diagnostic/donor-preview-'+(i+1)+'.png',Buffer.from(bytes.slice(p.start,p.end))));
  fs.writeFileSync('artifacts/btw-diagnostic/object-map.json',JSON.stringify({header:parsed.header,objects},null,2));
  const selected=[
    ...objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(o.name||'')).slice(0,8),
    ...objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128').slice(0,5),
    ...objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix').slice(0,1)
  ];
  for(const o of selected){
    const words=[];
    for(let rel=0;rel<=80;rel+=4){
      const off=o.recordStart+rel;
      if(off+4>o.recordEnd)break;
      words.push({rel,i32:i32(container,off),u32:u32(container,off),f32:round(f32(container,off))});
    }
    console.log('SIZE_DIAG '+JSON.stringify({
      index:o.index,kind:o.kind,name:o.name,barcodeType:o.barcodeType||'',recordStart:o.recordStart,recordEnd:o.recordEnd,
      xMil:o.xMil,yMil:o.yMil,xMm:o.xMm,yMm:o.yMm,fontSize:o.fontSize,words
    }));
  }
  const allStrings=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true});
  const insideString=(off)=>allStrings.some(e=>off>=e.offset&&off<e.end);
  const scanNumeric=(group,kind)=>{
    const byStart=new Map(),byEnd=new Map();
    for(const o of group){
      for(let off=o.recordStart;off+4<=o.recordEnd;off+=4){
        if(insideString(off)||insideString(off+3))continue;
        const rel=off-o.recordStart,tail=o.recordEnd-off;
        const iv=i32(container,off),fv=f32(container,off);
        if(iv>0&&iv<=5000){
          if(!byStart.has(rel))byStart.set(rel,[]);byStart.get(rel).push({index:o.index,value:iv});
          if(!byEnd.has(tail))byEnd.set(tail,[]);byEnd.get(tail).push({index:o.index,value:iv});
        }
        if(Number.isFinite(fv)&&fv>0.001&&fv<=1000){
          const key='f'+rel;if(!byStart.has(key))byStart.set(key,[]);byStart.get(key).push({index:o.index,value:round(fv)});
          const tkey='f'+tail;if(!byEnd.has(tkey))byEnd.set(tkey,[]);byEnd.get(tkey).push({index:o.index,value:round(fv)});
        }
      }
    }
    const compact=(map)=>[...map.entries()].filter(([,v])=>new Set(v.map(x=>x.index)).size>=Math.max(3,group.length-1)).map(([offset,values])=>({offset,values})).slice(0,120);
    console.log('NUMERIC_COMMON_START '+kind+' '+JSON.stringify(compact(byStart)));
    console.log('NUMERIC_COMMON_END '+kind+' '+JSON.stringify(compact(byEnd)));
  };
  const code128=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128');
  const textPool=objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\\s*\\d+/i.test(o.name||''));
  scanNumeric(code128,'Code128');
  scanNumeric(textPool.slice(0,12),'Text');
  for(const o of code128){
    const rows=[];
    for(let off=o.recordStart;off+4<=o.recordEnd;off+=4){
      if(insideString(off)||insideString(off+3))continue;
      const v=i32(container,off);
      if(v>=50&&v<=800)rows.push({rel:off-o.recordStart,value:v});
    }
    console.log('BARCODE_SMALL_INT_CANDIDATES '+o.index+' '+JSON.stringify(rows.slice(0,250)));
  }
  if(code128.length){
    const o=code128[0],entries=allStrings.filter(e=>e.offset>=o.recordStart+880&&e.offset<o.recordStart+1400).map(e=>({rel:e.offset-o.recordStart,text:e.text}));
    const numeric=[];
    for(let rel=880;rel<=1400;rel+=4){
      const off=o.recordStart+rel;if(off+4>o.recordEnd)break;
      numeric.push({rel,hex:[...container.slice(off,off+4)].map(x=>x.toString(16).padStart(2,'0')).join(' '),i32:i32(container,off),f32:round(f32(container,off)),string:insideString(off)});
    }
    console.log('CODE128_WINDOW_STRINGS '+JSON.stringify(entries));
    console.log('CODE128_WINDOW_NUMERIC '+JSON.stringify(numeric));
  }
  console.log('PASS: BTW object size diagnostic complete');
})().catch(e=>{console.error(e);process.exit(1)});