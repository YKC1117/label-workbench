/* Label Workbench rich editable BTW generator v0.1.3
 * Reuses verified official BarTender donor templates as an editable object pool.
 * Every unused donor root is moved off-canvas before Quick Analysis fields/barcodes are restored.
 * When Quick Analysis has reliable physical source dimensions, both object coordinates and
 * BarTender TemplateSize are rewritten to the source label size.
 */
(function(){
  'use strict';
  const BUILD='20260911-btw-rich-130-source-size';
  const SEED_FUNCTION='btw-seed';
  const OFF=50000;
  const MAX_TEXT=29;
  const MAX_SIZE_PAIRS=24;
  const CONTAINER_MARKER=new Uint8Array([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,0x00,0x01]);
  const seeds={
    'gtl-a5':{id:'GTL-A5-2022-R1'},
    'ford-gtl':{id:'FORD-GTL-MIXED-2022-R8'}
  };
  const seedCache=new Map();

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const barcodeText=b=>String(b?.text??b?.value??'').trim();
  const isDm=b=>/datamatrix/.test(normalizeFormat(b?.format));
  const isC128=b=>/code128|c128/.test(normalizeFormat(b?.format));
  const outputName=(label,index=0)=>`BT_Editable_${safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''))}_L${String(index+1).padStart(2,'0')}.btw`;
  const near=(a,b,t=.03)=>Math.abs(Number(a)-Number(b))<=t;

  function cloudEndpoint(seedKey){
    const cfg=window.LABEL_WORKBENCH_CLOUD||window.LabelWorkbenchCloudConfig||{},base=String(cfg.url||'').replace(/\/$/,'');
    if(!base||!String(cfg.key||'').startsWith('sb_publishable_'))throw new Error('BTW rich donor 連線設定未載入');
    return{url:`${base}/functions/v1/${SEED_FUNCTION}?seed=${encodeURIComponent(seedKey)}`,key:String(cfg.key)}
  }
  function nonEmptyFields(label){return(label?.fields||[]).filter(f=>String(f?.value??'').trim())}
  function unsupportedBarcodes(label){return(label?.barcodes||[]).filter(b=>barcodeText(b)&&!isDm(b)&&!isC128(b))}
  function selectPlan(label){
    const fields=nonEmptyFields(label),rows=(label?.barcodes||[]).filter(b=>barcodeText(b)),dm=rows.filter(isDm),c128=rows.filter(isC128);
    if(fields.length>MAX_TEXT||unsupportedBarcodes(label).length||dm.length>1||c128.length>2)return null;
    if(dm.length===1&&c128.length<=1)return{seedKey:'gtl-a5',seedId:seeds['gtl-a5'].id,fields,dm,c128,kind:c128.length?'mixed':'dm'};
    if(dm.length===0&&c128.length<=2)return{seedKey:'ford-gtl',seedId:seeds['ford-gtl'].id,fields,dm,c128,kind:c128.length?'c128':'text'};
    return null
  }
  function canGenerate(label){return!!selectPlan(label)}

  async function fetchSeed(seedKey){
    if(seedCache.has(seedKey))return seedCache.get(seedKey);
    const p=(async()=>{
      const spec=seeds[seedKey];if(!spec)throw new Error(`未知 rich donor：${seedKey}`);
      const ep=cloudEndpoint(seedKey),r=await fetch(ep.url,{cache:'force-cache',headers:{apikey:ep.key}});
      if(!r.ok)throw new Error(`無法取得 rich donor (${seedKey}, ${r.status})`);
      if(r.headers.get('x-label-workbench-seed')!==spec.id)throw new Error(`rich donor 身分驗證失敗：${seedKey}`);
      const bytes=await r.arrayBuffer(),head=new TextDecoder('latin1').decode(new Uint8Array(bytes).slice(0,900)).replace(/\0/g,'');
      if(!/Bar Tender Format File/.test(head)||!/Application:\s*Version=2022/i.test(head))throw new Error(`rich donor 不是 BarTender 2022：${seedKey}`);
      return bytes
    })().catch(err=>{seedCache.delete(seedKey);throw err});
    seedCache.set(seedKey,p);return p
  }

  function findMarker(data){
    outer:for(let i=0;i<=data.length-CONTAINER_MARKER.length;i++){
      for(let j=0;j<CONTAINER_MARKER.length;j++)if(data[i+j]!==CONTAINER_MARKER[j])continue outer;
      return i
    }
    return-1
  }
  async function inflateDeflate(bytes){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  async function deflate(bytes){
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  function concatBytes(a,b){const out=new Uint8Array(a.length+b.length);out.set(a,0);out.set(b,a.length);return out}
  async function splitOfficialBtw(input){
    const file=input instanceof Uint8Array?input:new Uint8Array(input),at=findMarker(file);
    if(at<0)throw new Error('找不到官方 BTW 容器標記');
    const end=at+CONTAINER_MARKER.length,prefix=file.slice(0,end),compressed=file.slice(end),container=await inflateDeflate(compressed),head=new TextDecoder('latin1').decode(file.slice(0,Math.min(file.length,4096))).replace(/\0/g,'');
    const applicationVersion=/Application:\s*Version=([^;\r\n]+)/i.exec(head)?.[1]?.trim()||'',compatibleVersion=/Document:\s*CompatibleVersion=([^;\r\n]+)/i.exec(head)?.[1]?.trim()||'';
    if(!/Bar Tender Format File/.test(head)||!/^2022\b/i.test(applicationVersion))throw new Error(`rich donor 版本驗證失敗：${applicationVersion||'未知'}`);
    return{prefix,container,header:{text:head,applicationVersion,compatibleVersion}}
  }
  async function rebuildOfficialBtw(prefix,container){return concatBytes(prefix,await deflate(container))}

  function templateSizeMm(parsed){
    const text=String(parsed?.header?.text||''),raw=/<TemplateSize>([^<]+)<\/TemplateSize>/i.exec(text)?.[1]?.trim()||'';
    const m=/([0-9.]+)\s*(?:"|mm|cm|in(?:ch(?:es)?)?)?\s*[x×]\s*([0-9.]+)\s*(?:"|mm|cm|in(?:ch(?:es)?)?)?/i.exec(raw);
    if(m){
      let width=Number(m[1]),height=Number(m[2]);
      if(!(width>0&&height>0))return{width:76.2,height:50.8,raw:raw||'fallback 3x2in'};
      const lower=raw.toLowerCase();
      if(/\bmm\b/.test(lower))return{width,height,raw};
      if(/\bcm\b/.test(lower))return{width:width*10,height:height*10,raw};
      if(raw.includes('"')||/\bin(?:ch(?:es)?)?\b/.test(lower)||!/[a-z]/i.test(raw))return{width:width*25.4,height:height*25.4,raw};
    }
    return{width:76.2,height:50.8,raw:raw||'fallback 3x2in'}
  }
  function sourceTargetSize(label,donor){
    const g=label?.sourceGeometry||{},width=Number(g.widthMm),height=Number(g.heightMm);
    if(width>=5&&height>=5&&width<=1000&&height<=1000)return{width,height,raw:`source ${width.toFixed(3)} x ${height.toFixed(3)} mm`,source:true};
    return{width:donor.width,height:donor.height,raw:donor.raw,source:false}
  }
  function mmToMil(v){return Math.round(Number(v)/0.0254)}
  function findTemplateSizePairs(container,size){
    const data=container instanceof Uint8Array?container:new Uint8Array(container),w=mmToMil(size?.width),h=mmToMil(size?.height),out=[];
    if(!(w>0&&h>0)||data.byteLength<8)return out;
    const dv=new DataView(data.buffer,data.byteOffset,data.byteLength);
    for(let i=0;i<=data.byteLength-8;i++)if(dv.getInt32(i,true)===w&&dv.getInt32(i+4,true)===h)out.push(i);
    return out
  }
  function replaceTemplateSizePairs(container,current,target){
    const same=near(current?.width,target?.width)&&near(current?.height,target?.height);
    if(same)return{container:container instanceof Uint8Array?new Uint8Array(container):new Uint8Array(container),changed:false,offsets:[],from:{width:mmToMil(current.width),height:mmToMil(current.height)},to:{width:mmToMil(target.width),height:mmToMil(target.height)}};
    const offsets=findTemplateSizePairs(container,current);
    if(!offsets.length)throw new Error(`BTW 內部找不到 donor 尺寸 ${current.width}×${current.height}mm 的相鄰 mil pair`);
    if(offsets.length>MAX_SIZE_PAIRS)throw new Error(`BTW donor 尺寸 pair 過多 (${offsets.length})，停止自動改尺寸`);
    const out=new Uint8Array(container),dv=new DataView(out.buffer,out.byteOffset,out.byteLength),w=mmToMil(target.width),h=mmToMil(target.height);
    for(const off of offsets){dv.setInt32(off,w,true);dv.setInt32(off+4,h,true)}
    return{container:out,changed:true,offsets,from:{width:mmToMil(current.width),height:mmToMil(current.height)},to:{width:w,height:h}}
  }
  function sameMappedObjects(a,b){
    if(!a?.objects||!b?.objects||a.objects.length!==b.objects.length)return false;
    for(let i=0;i<a.objects.length;i++){
      const x=a.objects[i],y=b.objects[i];
      if(x.index!==y.index||x.xMil!==y.xMil||x.yMil!==y.yMil||String(x.value??'')!==String(y.value??''))return false;
      if(JSON.stringify(x.components||[])!==JSON.stringify(y.components||[]))return false;
    }
    return true
  }
  function sourceLayout(box,target){
    const L=window.LabelWorkbenchBtwLayout;if(!L?.boxToLayout||!box)return null;
    try{return L.boxToLayout(box,target)}catch{return null}
  }
  function fallbackTextPos(i,count,target){
    const cols=count>14?2:1,rows=Math.max(1,Math.ceil(count/cols)),col=i%cols,row=Math.floor(i/cols),x=.055+col*(cols===2?.48:0),y=.055+row*(.86/rows);
    return{xMil:Math.round((x*target.width)/0.0254),yMil:Math.round((y*target.height)/0.0254)}
  }
  function fallbackBarcodePos(i,total,target){
    const x=.58,y=.70+(i*(.22/Math.max(1,total)));
    return{xMil:Math.round((x*target.width)/0.0254),yMil:Math.round((y*target.height)/0.0254)}
  }
  function reusableText(objects){return objects.filter(o=>o.kind==='text'&&/^Text\s*\d+$/i.test(o.name||'')&&o.valueEntry)}
  function findBarcode(objects,type,used){return objects.find(o=>o.kind==='barcode'&&o.barcodeType===type&&!used.has(o.index))||null}

  async function generateOne(label,index=0){
    const plan=selectPlan(label);if(!plan)throw new Error('此標籤超出 rich donor 可安全建立範圍');
    const M=window.LabelWorkbenchBtwObjectMap,F=window.LabelWorkbenchBtwFormat;
    if(!M?.mapContainer||!M?.editContainer||typeof DecompressionStream!=='function'||typeof CompressionStream!=='function')throw new Error('BTW rich donor 元件尚未載入');
    const seed=await fetchSeed(plan.seedKey),parsed=await splitOfficialBtw(seed),container=parsed.container,before=M.mapContainer(container),donorTarget=templateSizeMm(parsed),target=sourceTargetSize(label,donorTarget),texts=reusableText(before.objects);
    if(texts.length<plan.fields.length)throw new Error(`rich donor 可編輯文字不足：${texts.length}/${plan.fields.length}`);

    const edits=new Map();for(const o of before.objects)edits.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});
    const expectedText=[];
    plan.fields.forEach((field,i)=>{
      const obj=texts[i],layout=sourceLayout(field?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackTextPos(i,plan.fields.length,target),value=String(field?.value??'').trim();
      edits.set(obj.index,{index:obj.index,value,...pos});expectedText.push({index:obj.index,value,...pos})
    });

    const used=new Set(),expectedBarcode=[],barcodeRows=[...plan.dm.map(b=>({type:'Data Matrix',row:b})),...plan.c128.map(b=>({type:'Code 128',row:b}))];
    barcodeRows.forEach((spec,i)=>{
      const obj=findBarcode(before.objects,spec.type,used);if(!obj)throw new Error(`${plan.seedKey} 缺少可用 ${spec.type} 物件`);used.add(obj.index);
      const value=barcodeText(spec.row),components=obj.componentEntries.map((_,j)=>j===0?value:''),layout=sourceLayout(spec.row?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackBarcodePos(i,barcodeRows.length,target);
      edits.set(obj.index,{index:obj.index,barcodeComponents:components,...pos});expectedBarcode.push({index:obj.index,type:spec.type,value,...pos})
    });

    const edited=M.editContainer(container,[...edits.values()]),editedMap=M.mapContainer(edited),sizeMutation=replaceTemplateSizePairs(edited,donorTarget,target),sizedMap=M.mapContainer(sizeMutation.container);
    if(sizeMutation.changed&&!sameMappedObjects(editedMap,sizedMap))throw new Error('改寫 BTW 內部標籤尺寸時碰到物件資料，已停止產檔');
    let rebuilt=await rebuildOfficialBtw(parsed.prefix,sizeMutation.container);
    if(sizeMutation.changed){
      if(!F?.replaceTemplateSize)throw new Error('BTW TemplateSize metadata 元件未載入');
      rebuilt=F.replaceTemplateSize(rebuilt,target.width,target.height)
    }
    const check=await splitOfficialBtw(rebuilt),after=M.mapContainer(check.container),finalSize=templateSizeMm(check);
    if(!near(finalSize.width,target.width)||!near(finalSize.height,target.height))throw new Error(`BTW TemplateSize 驗證失敗：${finalSize.width}×${finalSize.height}mm`);
    if(sizeMutation.changed){
      const newPairs=findTemplateSizePairs(check.container,target),oldPairs=findTemplateSizePairs(check.container,donorTarget);
      if(newPairs.length<sizeMutation.offsets.length)throw new Error(`BTW 內部新尺寸 pair 驗證失敗：${newPairs.length}/${sizeMutation.offsets.length}`);
      if(oldPairs.length)throw new Error(`BTW 內部仍殘留 ${oldPairs.length} 組舊 donor 尺寸 pair`)
    }
    if(after.objects.length!==before.objects.length)throw new Error(`rich donor root 數改變：${before.objects.length}→${after.objects.length}`);
    for(const e of expectedText){const o=after.objects.find(x=>x.index===e.index);if(!o||o.value!==e.value||o.xMil!==e.xMil||o.yMil!==e.yMil)throw new Error(`rich Text 驗證失敗：${e.index}`)}
    for(const e of expectedBarcode){const o=after.objects.find(x=>x.index===e.index);if(!o||o.components.join('')!==e.value||o.xMil!==e.xMil||o.yMil!==e.yMil)throw new Error(`rich ${e.type} 驗證失敗：${e.index}`)}
    const active=new Set([...expectedText.map(x=>x.index),...expectedBarcode.map(x=>x.index)]),leaks=after.objects.filter(o=>!active.has(o.index)&&(o.xMil!==OFF||o.yMil!==OFF));
    if(leaks.length)throw new Error(`rich donor 清場驗證失敗：${leaks.length} 個物件仍在畫布`);
    return{name:outputName(label,index),bytes:rebuilt,kind:plan.kind,summary:plan.fields.map(f=>String(f.value??'')).join('\r'),barcodeValue:expectedBarcode[0]?.value||'',barcodes:{dataMatrix:plan.dm.map(barcodeText),code128:plan.c128.map(barcodeText)},layout:{target,donorTarget,fields:expectedText,barcodes:expectedBarcode,sizeMutation:{changed:sizeMutation.changed,count:sizeMutation.offsets.length,from:sizeMutation.from,to:sizeMutation.to}},header:check.header,seed:plan.seedId,seedKey:plan.seedKey,rich:true,editableTextCount:expectedText.length}
  }

  window.LabelWorkbenchBtwRichNative={BUILD,OFF,MAX_TEXT,seeds,selectPlan,canGenerate,fetchSeed,splitOfficialBtw,rebuildOfficialBtw,templateSizeMm,sourceTargetSize,mmToMil,findTemplateSizePairs,replaceTemplateSizePairs,sameMappedObjects,reusableText,generateOne};
})();
