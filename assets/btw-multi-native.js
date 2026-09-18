/* Label Workbench verified multi-barcode native BTW generator v0.1.0
 * Uses complete official BarTender 2022 donors that already contain multiple barcode objects.
 * No cross-document object transplantation.
 */
(function(){
  'use strict';

  const BUILD='20260918-btw-multi-native-100-qrc39-pdfc128';
  const OFF=50000;
  const seedPromises=new Map();
  const PROFILES={
    qrc39:{
      key:'qrc39',seedKey:'qr-c39',seedId:'QR-C39-2022-R4',
      app:'2022 R4',compatible:'2019',donor:{width:50.8,height:25.4},maxText:2,
      required:{qr:1,c39:1}
    },
    pdfc128:{
      key:'pdfc128',seedKey:'pdf417-rich',seedId:'PDF417-RICH-2022-R5',
      app:'2022 R5',compatible:'2019',donor:{width:210.0072,height:148.0058},maxText:18,
      required:{pdf417:1,c128Min:1,c128Max:2}
    }
  };

  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const value=b=>String(b?.text??b?.value??b?.data??'').trim();
  const textValue=o=>String(o?.text??o?.value??'').trim();
  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const isQr=b=>/qrcode|qr/.test(norm(b?.format));
  const isC39=b=>/code39|c39/.test(norm(b?.format));
  const isPdf=b=>/pdf417/.test(norm(b?.format));
  const isC128=b=>/code128|c128/.test(norm(b?.format))&&!/gs1/.test(norm(b?.format));
  const code39Safe=v=>/^[0-9A-Z\-\. \$\/\+%]+$/.test(String(v||''));
  const pdfSafe=v=>{const s=String(v||'');return s.length>0&&s.length<=1800};
  const c128Safe=v=>String(v||'').length>0&&String(v||'').length<=512;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function texts(label){
    const os=(label?.textObjects||[]).filter(o=>textValue(o));
    return os.length?os:(label?.fields||[]).filter(o=>textValue(o));
  }
  function rows(label){return(label?.barcodes||[]).filter(b=>value(b))}
  function plan(label){
    const all=rows(label),ts=texts(label);
    if(all.length===2){
      const qr=all.filter(isQr),c39=all.filter(isC39);
      if(qr.length===1&&c39.length===1&&all.every(b=>isQr(b)||isC39(b))&&code39Safe(value(c39[0]))&&ts.length<=PROFILES.qrc39.maxText)
        return{profile:PROFILES.qrc39,kind:'qrc39',texts:ts,qr,c39,all}
    }
    if(all.length>=2&&all.length<=3){
      const pdf=all.filter(isPdf),c128=all.filter(isC128);
      if(pdf.length===1&&c128.length>=1&&c128.length<=2&&all.length===pdf.length+c128.length&&pdfSafe(value(pdf[0]))&&c128.every(b=>c128Safe(value(b)))&&ts.length<=PROFILES.pdfc128.maxText)
        return{profile:PROFILES.pdfc128,kind:'pdfc128',texts:ts,pdf,c128,all}
    }
    return null
  }
  function canGenerate(label){return!!plan(label)}
  function cloudEndpoint(profile){
    const cfg=window.LABEL_WORKBENCH_CLOUD||{},base=String(cfg.url||'').replace(/\/$/,'');
    if(!base||!String(cfg.key||'').startsWith('sb_publishable_'))throw new Error('BTW multi seed 連線設定未載入');
    return{url:`${base}/functions/v1/btw-seed?seed=${encodeURIComponent(profile.seedKey)}`,key:String(cfg.key)}
  }
  async function fetchSeed(profile){
    if(seedPromises.has(profile.key))return seedPromises.get(profile.key);
    const p=(async()=>{
      const ep=cloudEndpoint(profile);let last=null;
      for(let attempt=1;attempt<=3;attempt++){
        try{
          const r=await fetch(ep.url,{cache:attempt===1?'force-cache':'no-store',headers:{apikey:ep.key}});
          if(!r.ok)throw new Error(`${profile.key} donor 取得失敗 (${r.status})`);
          if(r.headers.get('x-label-workbench-seed')!==profile.seedId)throw new Error(`${profile.key} donor 身分驗證失敗`);
          const bytes=new Uint8Array(await r.arrayBuffer()),F=window.LabelWorkbenchBtwFormat,p=F.parseStructure(bytes);
          if(p.header.applicationVersion!==profile.app||!String(p.header.compatibleVersion||'').startsWith(profile.compatible))throw new Error(`${profile.key} donor BarTender 版本驗證失敗`);
          return bytes
        }catch(e){last=e;if(attempt<3)await sleep(250*attempt)}
      }
      throw last||new Error(profile.key+' donor 取得失敗')
    })().catch(e=>{seedPromises.delete(profile.key);throw e});
    seedPromises.set(profile.key,p);return p
  }
  function targetSize(label,p){
    const g=label?.sourceGeometry||{},w=Number(g.widthMm),h=Number(g.heightMm);
    return w>=5&&h>=5&&w<=1000&&h<=1000?{width:w,height:h,source:true}:{...p.donor,source:false}
  }
  function layout(box,target){
    try{return box&&window.LabelWorkbenchBtwLayout?.boxToLayout?.(box,target)||null}catch{return null}
  }
  function fallbackText(i,n,target){
    const rows=Math.max(1,n);return{xMil:Math.round(.05*target.width/.0254),yMil:Math.round((.06+i*(.70/rows))*target.height/.0254)}
  }
  function fallbackBar(i,n,target){
    return{xMil:Math.round((.55)*target.width/.0254),yMil:Math.round((.15+i*(.70/Math.max(1,n)))*target.height/.0254)}
  }
  function hideable(o){
    return Number.isFinite(o?.xMil)&&Number.isFinite(o?.yMil)&&(o.kind==='barcode'||o.kind==='line'||o.kind==='border'||o.owner==='PictureData'||(o.kind==='text'&&/^Text\s+\d+/i.test(o.name||'')))
  }
  function reservedIndexes(bars){
    const s=new Set();for(const b of bars)for(const r of b.linkedDataSourceRefs||[])if(Number.isInteger(r.index))s.add(r.index);return s
  }
  function textPool(objects,reserved){
    return objects.filter(o=>o.kind==='text'&&o.valueEntry&&/^Text\s+\d+/i.test(o.name||'')&&o.owner!=='EditControlData'&&o.owner!=='PictureData'&&!reserved.has(o.index))
  }
  function mirrorEntry(container,obj){
    const F=window.LabelWorkbenchBtwFormat,rows=F.scanUtf16Strings(container,{minLength:0,maxLength:10000,includeEmpty:true}).filter(e=>e.offset>=obj.recordStart&&e.offset<obj.recordEnd);
    for(let i=0;i<rows.length;i++){
      if(rows[i].text!=='(???) ???-????')continue;
      for(let j=i+1;j<Math.min(rows.length,i+6);j++)if(rows[j].text==='Sample Text')return rows[j]
    }
    return null
  }
  function setMirror(container,owner,payload){
    const F=window.LabelWorkbenchBtwFormat,M=window.LabelWorkbenchBtwObjectMap,map=M.mapContainer(container),obj=map.objects.find(o=>o.kind==='barcode'&&o.owner===owner),entry=obj&&mirrorEntry(container,obj);
    if(!obj||!entry)throw new Error(owner+' donor 找不到獨立 datasource mirror');
    const out=F.replaceStringAt(container,entry,payload),after=M.mapContainer(out).objects.find(o=>o.kind==='barcode'&&o.owner===owner);
    if(!after||after.resolvedPreview!==payload)throw new Error(owner+' mirror round-trip 驗證失敗');
    return out
  }
  function outputName(label,index,kind){return`BT_Editable_${safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''))}_L${String(index+1).padStart(2,'0')}_${kind.toUpperCase()}.btw`}

  async function generateOne(label,index=0){
    const P=plan(label);if(!P)throw new Error('此標籤沒有已驗證的 multi-barcode donor 組合');
    const F=window.LabelWorkbenchBtwFormat,M=window.LabelWorkbenchBtwObjectMap,L=window.LabelWorkbenchBtwFamilyNative;
    if(!F?.parseStructure||!M?.mapContainer||!M?.editContainer||!L?.rewriteInternalSize)throw new Error('BTW multi 元件尚未載入');
    const bytes=await fetchSeed(P.profile),parsed=F.parseStructure(bytes);
    let container=await F.inflateContainer(parsed),target=targetSize(label,P.profile),sized=L.rewriteInternalSize(container,P.profile,target);container=sized.container;
    const expectedBars=[];

    if(P.kind==='qrc39'){
      // Higher-offset QR record and lower-offset Code39 record use different mirrors.
      container=setMirror(container,'BcC39RegularData',value(P.c39[0]));
      container=setMirror(container,'BcQrcodeData',value(P.qr[0]));
    }

    let map=M.mapContainer(container),bars=[];
    if(P.kind==='qrc39'){
      bars=[
        {obj:map.objects.find(o=>o.owner==='BcQrcodeData'),row:P.qr[0],type:'QR Code'},
        {obj:map.objects.find(o=>o.owner==='BcC39RegularData'),row:P.c39[0],type:'Code 39'}
      ]
    }else{
      const pdfObj=map.objects.find(o=>o.owner==='BcPdf417Data');
      const c128Objs=map.objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128').slice(0,P.c128.length);
      bars=[{obj:pdfObj,row:P.pdf[0],type:'PDF417'},...P.c128.map((row,i)=>({obj:c128Objs[i],row,type:'Code 128'}))];
      if(bars.some(x=>!x.obj))throw new Error('PDF417 multi donor 條碼物件不足');
    }

    const reserved=reservedIndexes(bars.map(x=>x.obj)),pool=textPool(map.objects,reserved);
    if(P.texts.length>pool.length)throw new Error(`multi donor 可用文字槽不足：${pool.length}/${P.texts.length}`);
    const edits=new Map();
    for(const o of map.objects)if(hideable(o))edits.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});
    for(const o of pool)edits.set(o.index,{index:o.index,value:'',xMil:OFF,yMil:OFF});

    bars.forEach((b,i)=>{
      const pos=layout(b.row?.sourceBox,target)?.mil||fallbackBar(i,bars.length,target);
      const e={index:b.obj.index,xMil:pos.xMil,yMil:pos.yMil};
      if(P.kind==='pdfc128')e.barcodeComponents=b.obj.componentEntries.map((_,j)=>j===0?value(b.row):'');
      edits.set(b.obj.index,e);
      expectedBars.push({owner:b.obj.owner,type:b.type,value:value(b.row),xMil:pos.xMil,yMil:pos.yMil})
    });
    const expectedText=[];
    P.texts.forEach((t,i)=>{
      const o=pool[i],pos=layout(t?.sourceBox,target)?.mil||fallbackText(i,P.texts.length,target),v=textValue(t);
      edits.set(o.index,{index:o.index,value:v,xMil:pos.xMil,yMil:pos.yMil});expectedText.push({value:v,xMil:pos.xMil,yMil:pos.yMil})
    });

    const edited=M.editContainer(container,[...edits.values()]),rebuilt0=await F.rebuild(parsed,edited),rebuilt=target.source?F.replaceTemplateSize(rebuilt0,target.width,target.height):rebuilt0;
    const rp=F.parseStructure(rebuilt),rc=await F.inflateContainer(rp),rm=M.mapContainer(rc);
    for(const e of expectedBars){
      const o=rm.objects.find(x=>x.kind==='barcode'&&x.barcodeType===e.type&&x.resolvedPreview===e.value&&x.xMil===e.xMil&&x.yMil===e.yMil);
      if(!o){
        const got=rm.objects.filter(x=>x.kind==='barcode').map(x=>({index:x.index,owner:x.owner,type:x.barcodeType,preview:x.resolvedPreview,components:x.components,x:x.xMil,y:x.yMil}));
        throw new Error(`multi ${e.type} round-trip 驗證失敗：${e.value}; got=${JSON.stringify(got)}`)
      }
    }
    for(const e of expectedText){
      const o=rm.objects.find(x=>x.kind==='text'&&x.value===e.value&&x.xMil===e.xMil&&x.yMil===e.yMil);
      if(!o)throw new Error('multi Text round-trip 驗證失敗：'+e.value)
    }
    if(target.source&&!rp.header.text.includes(`<TemplateSize>${String(Math.round(target.width*100)/100).replace(/\.0+$/,'')} x ${String(Math.round(target.height*100)/100).replace(/\.0+$/,'')} mm</TemplateSize>`))throw new Error('multi TemplateSize 驗證失敗');
    return{name:outputName(label,index,P.kind),bytes:rebuilt,kind:P.kind,seed:P.profile.seedId,barcodes:expectedBars,textCount:expectedText.length,header:rp.header}
  }

  window.LabelWorkbenchBtwMultiNative={BUILD,PROFILES,plan,canGenerate,fetchSeed,targetSize,mirrorEntry,setMirror,generateOne};
})();