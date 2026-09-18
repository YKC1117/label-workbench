/* Label Workbench native barcode-family BTW generator v0.1.0
 * Uses complete official BarTender 2022 donors; no cross-document object transplant.
 * Supported after donor round-trip verification:
 * - QR Code: resource 80135, BcQrcodeData, direct component datasource
 * - Code 39: resource 80043, BcC39RegularData, linked writable Text datasource
 */
(function(){
  'use strict';

  const BUILD='20260918-btw-family-native-100-qr-c39';
  const OFF=50000;
  const MAX_SIZE_PAIRS=16;
  const PROFILES={
    qr:{
      key:'qr',seedKey:'qr-rich',seedId:'QR-RICH-2022-R6',
      app:'2022 R6',compatible:'2019',barcodeType:'QR Code',owner:'BcQrcodeData',
      donor:{width:106.68,height:55.88},maxText:8,mode:'components'
    },
    c39:{
      key:'c39',seedKey:'c39-rich',seedId:'C39-RICH-2022-R5',
      app:'2022 R5',compatible:'2019',barcodeType:'Code 39',owner:'BcC39RegularData',
      donor:{width:60.96,height:38.1},maxText:9,mode:'linked-text'
    }
  };
  const seedPromises=new Map();

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const barcodeText=b=>String(b?.text??b?.value??b?.data??'').trim();
  const textValue=v=>String(v?.text??v?.value??'').trim();
  const mmToMil=v=>Math.round(Number(v)/0.0254);
  const near=(a,b,t=.03)=>Math.abs(Number(a)-Number(b))<=t;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function kindFor(row){
    const f=normalizeFormat(row?.format);
    if(/qrcode|qr/.test(f))return'qr';
    if(/code39|c39/.test(f))return'c39';
    return'';
  }
  function textItems(label){
    const objects=(label?.textObjects||[]).filter(o=>textValue(o));
    if(objects.length)return objects;
    return(label?.fields||[]).filter(f=>textValue(f));
  }
  function rows(label){return(label?.barcodes||[]).filter(b=>barcodeText(b))}
  function code39Safe(value){return /^[0-9A-Z\-\. \$\/\+%]+$/.test(String(value||''))}
  function plan(label){
    const all=rows(label);if(all.length!==1)return null;
    const kind=kindFor(all[0]),profile=PROFILES[kind];if(!profile)return null;
    const value=barcodeText(all[0]);if(!value)return null;
    if(kind==='c39'&&!code39Safe(value))return null;
    const texts=textItems(label);if(texts.length>profile.maxText)return null;
    return{kind,profile,row:all[0],value,texts}
  }
  function canGenerate(label){return!!plan(label)}
  function outputName(label,index=0,kind='family'){
    const base=safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''));
    return`BT_Editable_${base}_L${String(index+1).padStart(2,'0')}_${kind.toUpperCase()}.btw`
  }
  function targetSize(label,profile){
    const g=label?.sourceGeometry||{},width=Number(g.widthMm),height=Number(g.heightMm);
    if(width>=5&&height>=5&&width<=1000&&height<=1000)return{width,height,source:true};
    return{...profile.donor,source:false}
  }
  function sourceLayout(box,target){
    const L=window.LabelWorkbenchBtwLayout;if(!L?.boxToLayout||!box)return null;
    try{return L.boxToLayout(box,target)}catch{return null}
  }
  function fallbackTextPos(i,count,target){
    const rows=Math.max(1,count),x=.055,y=.06+i*(.78/rows);
    return{xMil:mmToMil(x*target.width),yMil:mmToMil(y*target.height)}
  }
  function fallbackBarcodePos(target){return{xMil:mmToMil(.60*target.width),yMil:mmToMil(.62*target.height)}}
  function adjacentSizePairs(container,size){
    const data=container instanceof Uint8Array?container:new Uint8Array(container),dv=new DataView(data.buffer,data.byteOffset,data.byteLength),w=mmToMil(size.width),h=mmToMil(size.height),out=[];
    for(let i=0;i<=data.byteLength-8;i++)if(dv.getInt32(i,true)===w&&dv.getInt32(i+4,true)===h)out.push(i);
    return out
  }
  function rewriteInternalSize(container,profile,target){
    const out=new Uint8Array(container);
    if(near(target.width,profile.donor.width)&&near(target.height,profile.donor.height))return{container:out,offsets:[]};
    const offsets=adjacentSizePairs(out,profile.donor);
    if(!offsets.length)throw new Error(`${profile.barcodeType} donor 找不到內部尺寸 pair`);
    if(offsets.length>MAX_SIZE_PAIRS)throw new Error(`${profile.barcodeType} donor 尺寸 pair 異常：${offsets.length}`);
    const dv=new DataView(out.buffer,out.byteOffset,out.byteLength),w=mmToMil(target.width),h=mmToMil(target.height);
    for(const off of offsets){dv.setInt32(off,w,true);dv.setInt32(off+4,h,true)}
    return{container:out,offsets}
  }
  function printableTexts(objects){
    return(objects||[]).filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+$/i.test(String(o.name||''))&&o.owner!=='EditControlData'&&o.owner!=='PictureData');
  }
  function linkedWritable(barcode,objects){
    for(const ref of barcode?.linkedDataSourceRefs||[]){
      const o=objects.find(x=>x.index===ref.index);
      if(o?.kind==='text'&&o.valueEntry)return o;
    }
    return null
  }
  function hideable(o){
    if(!Number.isFinite(o?.xMil)||!Number.isFinite(o?.yMil))return false;
    if(o.kind==='barcode'||o.kind==='line'||o.kind==='border')return true;
    if(o.owner==='PictureData')return true;
    if(o.kind==='text'&&/^Text\s+\d+$/i.test(String(o.name||'')))return true;
    return false
  }
  function seedEndpoint(profile){
    const cfg=window.LABEL_WORKBENCH_CLOUD||window.LabelWorkbenchCloudConfig||{},base=String(cfg.url||'').replace(/\/$/,'');
    if(!base||!String(cfg.key||'').startsWith('sb_publishable_'))throw new Error('BTW family seed 連線設定未載入');
    return{url:`${base}/functions/v1/btw-seed?seed=${encodeURIComponent(profile.seedKey)}`,key:String(cfg.key)}
  }
  async function fetchSeed(profile){
    if(seedPromises.has(profile.key))return seedPromises.get(profile.key);
    const promise=(async()=>{
      const ep=seedEndpoint(profile);let last=null;
      for(let attempt=1;attempt<=3;attempt++){
        try{
          const r=await fetch(ep.url,{cache:attempt===1?'force-cache':'no-store',headers:{apikey:ep.key}});
          if(!r.ok)throw new Error(`${profile.barcodeType} donor 取得失敗 (${r.status})`);
          if(r.headers.get('x-label-workbench-seed')!==profile.seedId)throw new Error(`${profile.barcodeType} donor 版本驗證失敗`);
          const bytes=new Uint8Array(await r.arrayBuffer()),F=window.LabelWorkbenchBtwFormat,parsed=F.parseStructure(bytes);
          if(parsed.header?.applicationVersion!==profile.app||!String(parsed.header?.compatibleVersion||'').startsWith(profile.compatible))throw new Error(`${profile.barcodeType} donor 不是已驗證的 BarTender 2022 格式`);
          return bytes;
        }catch(err){last=err;if(attempt<3)await sleep(250*attempt)}
      }
      throw last||new Error(`${profile.barcodeType} donor 取得失敗`)
    })().catch(err=>{seedPromises.delete(profile.key);throw err});
    seedPromises.set(profile.key,promise);return promise
  }
  function barcodeEdit(plan,barcode,objects,pos){
    if(plan.profile.mode==='components'){
      if(!barcode.componentEntries?.length)throw new Error('QR donor 沒有可安全寫入的 component datasource');
      return{barcode:{index:barcode.index,barcodeComponents:barcode.componentEntries.map((_,i)=>i===0?plan.value:''),...pos},reserved:null}
    }
    const target=linkedWritable(barcode,objects);
    if(!target)throw new Error('Code 39 donor 找不到可安全寫入的 linked Text datasource');
    return{barcode:{index:barcode.index,...pos},reserved:{index:target.index,value:plan.value,xMil:OFF,yMil:OFF}}
  }

  async function generateOne(label,index=0){
    const P=plan(label);if(!P)throw new Error('此標籤超出 QR / Code 39 native donor 可安全建立範圍');
    const F=window.LabelWorkbenchBtwFormat,M=window.LabelWorkbenchBtwObjectMap;
    if(!F?.parseStructure||!F?.inflateContainer||!F?.rebuild||!F?.replaceTemplateSize||!M?.mapContainer||!M?.editContainer)throw new Error('BTW family 元件尚未載入');

    const seed=await fetchSeed(P.profile),parsed=F.parseStructure(seed);
    let container=await F.inflateContainer(parsed),before=M.mapContainer(container);
    let barcode=before.objects.find(o=>o.kind==='barcode'&&o.owner===P.profile.owner&&o.barcodeType===P.profile.barcodeType);
    if(!barcode)throw new Error(`${P.profile.barcodeType} donor 缺少原生條碼物件`);

    const target=targetSize(label,P.profile),sized=rewriteInternalSize(container,P.profile,target);container=sized.container;
    before=M.mapContainer(container);barcode=before.objects.find(o=>o.kind==='barcode'&&o.owner===P.profile.owner&&o.barcodeType===P.profile.barcodeType);
    const barLayout=sourceLayout(P.row?.sourceBox,target),barPos=barLayout?.mil?{xMil:barLayout.mil.x,yMil:barLayout.mil.y}:fallbackBarcodePos(target);
    const bEdit=barcodeEdit(P,barcode,before.objects,barPos),reservedIndex=bEdit.reserved?.index??null;
    const pool=printableTexts(before.objects).filter(o=>o.index!==reservedIndex);
    if(P.texts.length>pool.length)throw new Error(`${P.profile.barcodeType} donor 只有 ${pool.length} 個可印文字槽，需求 ${P.texts.length} 個`);

    const edits=new Map();
    for(const o of before.objects)if(hideable(o))edits.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});
    for(const o of pool)edits.set(o.index,{index:o.index,value:'',xMil:OFF,yMil:OFF});
    if(bEdit.reserved)edits.set(bEdit.reserved.index,bEdit.reserved);
    edits.set(barcode.index,bEdit.barcode);

    const expectedText=[];
    P.texts.forEach((item,i)=>{
      const obj=pool[i],layout=sourceLayout(item?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackTextPos(i,P.texts.length,target),value=textValue(item);
      edits.set(obj.index,{index:obj.index,value,...pos});expectedText.push({index:obj.index,value,...pos})
    });

    const edited=M.editContainer(container,[...edits.values()]),rebuilt0=await F.rebuild(parsed,edited),rebuilt=target.source?F.replaceTemplateSize(rebuilt0,target.width,target.height):rebuilt0;
    const check=F.parseStructure(rebuilt),round=await F.inflateContainer(check),remap=M.mapContainer(round),afterBarcode=remap.objects.find(o=>o.kind==='barcode'&&o.owner===P.profile.owner&&o.barcodeType===P.profile.barcodeType);
    if(!afterBarcode)throw new Error(`${P.profile.barcodeType} 重建後原生條碼物件消失`);
    if(afterBarcode.xMil!==barPos.xMil||afterBarcode.yMil!==barPos.yMil)throw new Error(`${P.profile.barcodeType} 重建後座標不符`);

    if(P.profile.mode==='components'){
      if(afterBarcode.resolvedPreview!==P.value)throw new Error('QR 重建後 payload round-trip 不符');
    }else{
      const afterSource=(afterBarcode.linkedDataSourceRefs||[]).map(r=>remap.objects.find(o=>o.index===r.index)).find(o=>o?.value===P.value);
      if(!afterSource||afterBarcode.resolvedPreview!==P.value)throw new Error('Code 39 重建後 linked datasource round-trip 不符');
    }
    for(const e of expectedText){
      const o=remap.objects.find(x=>x.kind==='text'&&x.value===e.value&&x.xMil===e.xMil&&x.yMil===e.yMil);
      if(!o)throw new Error(`${P.profile.barcodeType} 文字 round-trip 驗證失敗：${e.value}`)
    }
    if(target.source){
      const tag=`<TemplateSize>${String(Math.round(target.width*100)/100).replace(/\.0+$/,'')} x ${String(Math.round(target.height*100)/100).replace(/\.0+$/,'')} mm</TemplateSize>`;
      if(!check.header?.text?.includes(tag))throw new Error(`${P.profile.barcodeType} TemplateSize 驗證失敗`);
      if(!adjacentSizePairs(round,target).length)throw new Error(`${P.profile.barcodeType} 內部尺寸 pair 驗證失敗`);
    }
    return{
      name:outputName(label,index,P.kind),bytes:rebuilt,kind:P.kind,
      barcodeValue:P.value,barcodes:{[P.profile.barcodeType]:P.value},
      layout:{barcode:barPos,text:expectedText},header:check.header,
      seed:P.profile.seedId,profile:P.profile.key,textCount:expectedText.length
    }
  }

  window.LabelWorkbenchBtwFamilyNative={
    BUILD,PROFILES,kindFor,textItems,plan,canGenerate,targetSize,printableTexts,adjacentSizePairs,rewriteInternalSize,seedEndpoint,fetchSeed,generateOne
  };
})();