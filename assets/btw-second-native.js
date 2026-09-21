/* Label Workbench sanitized single-donor native BTW generator v0.1.0
 * Uses the sanitized user-provided BarTender 2022 R2 donor with 33 Text,
 * 5 Code 128 and 1 Data Matrix native objects. No object transplant/concatenation.
 */
(function(){
  'use strict';
  const BUILD='20260918-btw-second-native-110-textobjects';
  const SEED_ID='LW-SECOND-SANITIZED-2022-R2';
  const OFF=50000;
  const MAX_TEXT=33;
  const MAX_C128=5;
  const MAX_DM=1;
  const DONOR_SIZE={width:100,height:65};
  const MAX_SIZE_PAIRS=16;

  const safeFile=v=>String(v||'Label').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'Label';
  const normalizeFormat=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const barcodeText=b=>String(b?.text??b?.value??b?.data??'').trim();
  const textValue=v=>String(v?.text??v?.value??'').trim();
  const isDm=b=>/datamatrix/.test(normalizeFormat(b?.format));
  const isC128=b=>/code128|c128/.test(normalizeFormat(b?.format));
  const mmToMil=v=>Math.round(Number(v)/0.0254);
  const near=(a,b,t=1)=>Math.abs(Number(a)-Number(b))<=t;
  const outputName=(label,index=0)=>`BT_Editable_${safeFile(String(label?.sourceName||'Label').replace(/\.[^.]+$/,''))}_L${String(index+1).padStart(2,'0')}.btw`;

  function rows(label){return(label?.barcodes||[]).filter(b=>barcodeText(b))}
  function fields(label){
    const objects=(label?.textObjects||[]).filter(o=>textValue(o));
    if(objects.length)return objects;
    return(label?.fields||[]).filter(f=>textValue(f))
  }
  function unsupported(label){return rows(label).filter(b=>!isDm(b)&&!isC128(b))}
  function plan(label){
    const fs=fields(label),all=rows(label),dm=all.filter(isDm),c128=all.filter(isC128);
    if(fs.length>MAX_TEXT||unsupported(label).length||dm.length>MAX_DM||c128.length>MAX_C128)return null;
    return{fields:fs,dm,c128,kind:dm.length&&c128.length?'mixed':dm.length?'dm':c128.length?'c128':'text'}
  }
  function canGenerate(label){return!!plan(label)}

  function reusableText(objects){return objects.filter(o=>o.kind==='text'&&/^(?:Text|文字)\s*\d+/i.test(o.name||'')&&o.valueEntry)}
  function pool(objects){return{
    texts:reusableText(objects),
    c128:objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Code 128'&&o.componentEntries?.length),
    dm:objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix'&&o.componentEntries?.length)
  }}
  function assertPool(p){
    if(p.texts.length<MAX_TEXT)throw new Error(`5C128+1DM donor 文字物件不足：${p.texts.length}/${MAX_TEXT}`);
    if(p.c128.length<MAX_C128)throw new Error(`5C128+1DM donor Code 128 物件不足：${p.c128.length}/${MAX_C128}`);
    if(p.dm.length<MAX_DM)throw new Error(`5C128+1DM donor Data Matrix 物件不足：${p.dm.length}/${MAX_DM}`)
  }
  function targetSize(label){
    const g=label?.sourceGeometry||{},width=Number(g.widthMm),height=Number(g.heightMm);
    if(width>=5&&height>=5&&width<=1000&&height<=1000)return{width,height,source:true};
    return{...DONOR_SIZE,source:false}
  }
  function sourceLayout(box,target){
    const L=window.LabelWorkbenchBtwLayout;if(!L?.boxToLayout||!box)return null;
    try{return L.boxToLayout(box,target)}catch{return null}
  }
  function sourceFontSize(layout,current){
    const h=Number(layout?.mm?.h);if(!(h>0))return Number.isFinite(Number(current))?Number(current):null;
    return Math.round(Math.max(5,Math.min(42,h/0.3527777778*0.72))*10)/10
  }
  function fallbackTextPos(i,count,target){
    const cols=count>17?2:1,rows=Math.max(1,Math.ceil(count/cols)),col=i%cols,row=Math.floor(i/cols),x=.045+col*(cols===2?.49:0),y=.045+row*(.86/rows);
    return{xMil:mmToMil(x*target.width),yMil:mmToMil(y*target.height)}
  }
  function fallbackBarcodePos(i,total,target){
    const rows=Math.max(1,total),x=.55,y=.60+i*(.32/rows);
    return{xMil:mmToMil(x*target.width),yMil:mmToMil(y*target.height)}
  }
  function sizePairOffsets(container,current=DONOR_SIZE){
    const data=container instanceof Uint8Array?container:new Uint8Array(container),w=mmToMil(current.width),h=mmToMil(current.height),dv=new DataView(data.buffer,data.byteOffset,data.byteLength),out=[];
    for(let i=0;i<=data.byteLength-8;i++)if(dv.getInt32(i,true)===w&&dv.getInt32(i+4,true)===h)out.push(i);
    return out
  }
  function rewriteInternalSize(container,target){
    const same=near(target.width,DONOR_SIZE.width,.03)&&near(target.height,DONOR_SIZE.height,.03),out=new Uint8Array(container);
    if(same)return{container:out,offsets:[]};
    const offsets=sizePairOffsets(out);
    if(!offsets.length)throw new Error('5C128+1DM donor 找不到 100×65mm 內部尺寸 pair');
    if(offsets.length>MAX_SIZE_PAIRS)throw new Error(`5C128+1DM donor 尺寸 pair 異常：${offsets.length}`);
    const dv=new DataView(out.buffer,out.byteOffset,out.byteLength),w=mmToMil(target.width),h=mmToMil(target.height);
    for(const off of offsets){dv.setInt32(off,w,true);dv.setInt32(off+4,h,true)}
    return{container:out,offsets}
  }
  function barcodeEdit(obj,value,pos){
    if(!obj?.componentEntries?.length)throw new Error(`${obj?.name||'條碼'} 沒有可安全寫入的 datasource slot`);
    const components=obj.componentEntries.map((_,i)=>i===0?String(value):'');
    return{index:obj.index,barcodeComponents:components,...pos}
  }
  function requestedBarcodeRows(p){return[...p.dm.map(row=>({type:'Data Matrix',row,value:barcodeText(row)})),...p.c128.map(row=>({type:'Code 128',row,value:barcodeText(row)}))]}

  async function generateOne(label,index=0){
    const P=plan(label);if(!P)throw new Error('此標籤超出 5C128+1DM native donor 可安全建立範圍');
    const D=window.LabelWorkbenchBtwSecondDonor,F=window.LabelWorkbenchBtwFormat,M=window.LabelWorkbenchBtwObjectMap;
    if(!D?.bytes||!F?.parseStructure||!F?.inflateContainer||!F?.rebuild||!F?.replaceTemplateSize||!M?.mapContainer||!M?.editContainer)throw new Error('5C128+1DM BTW 元件尚未載入');

    const seed=new Uint8Array(await D.bytes()),parsed=F.parseStructure(seed);
    if(parsed.header?.applicationVersion!=='2022 R2'||parsed.header?.compatibleVersion!=='2022 R1')throw new Error('5C128+1DM donor 版本不是 BarTender 2022 R2 / 2022 R1 相容');
    let container=await F.inflateContainer(parsed),before=M.mapContainer(container),donorPool=pool(before.objects);assertPool(donorPool);
    const rootCount=before.objects.length,target=targetSize(label),sized=rewriteInternalSize(container,target);container=sized.container;

    /* Re-map after size rewrite so all edit offsets are derived from the bytes being edited. */
    before=M.mapContainer(container);donorPool=pool(before.objects);assertPool(donorPool);
    const edits=new Map();for(const o of before.objects)edits.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});
    const expectedText=[];
    P.fields.forEach((field,i)=>{
      const obj=donorPool.texts[i],layout=sourceLayout(field?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackTextPos(i,P.fields.length,target),value=textValue(field),fontSize=sourceFontSize(layout,obj.fontSize),edit={index:obj.index,value,...pos};
      if(fontSize!=null&&obj.fontSizeOffset!=null)edit.fontSize=fontSize;
      edits.set(obj.index,edit);expectedText.push({index:obj.index,value,fontSize:edit.fontSize??obj.fontSize,...pos})
    });

    const expectedBarcode=[],used={c128:0,dm:0},barRows=requestedBarcodeRows(P);
    barRows.forEach((item,i)=>{
      const list=item.type==='Data Matrix'?donorPool.dm:donorPool.c128,key=item.type==='Data Matrix'?'dm':'c128',obj=list[used[key]++];
      if(!obj)throw new Error(`5C128+1DM donor 缺少 ${item.type} 原生物件`);
      const layout=sourceLayout(item.row?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackBarcodePos(i,barRows.length,target),edit=barcodeEdit(obj,item.value,pos);
      edits.set(obj.index,edit);expectedBarcode.push({index:obj.index,type:item.type,value:item.value,...pos})
    });

    const edited=M.editContainer(container,[...edits.values()]),rebuilt0=await F.rebuild(parsed,edited),rebuilt=target.source?F.replaceTemplateSize(rebuilt0,target.width,target.height):rebuilt0;
    const check=F.parseStructure(rebuilt),round=await F.inflateContainer(check),after=M.mapContainer(round);
    if(!/^2022\b/.test(check.header?.applicationVersion||'')||!/^2022\b/.test(check.header?.compatibleVersion||''))throw new Error('5C128+1DM BTW 重建後版本驗證失敗');
    if(after.objects.length!==rootCount)throw new Error(`5C128+1DM BTW root count 改變：${after.objects.length}/${rootCount}`);

    for(const exp of expectedText){
      const got=after.objects.find(o=>o.index===exp.index);
      if(!got||String(got.value??'')!==exp.value)throw new Error(`BTW 文字 round-trip 失敗：${exp.value}`);
      if(!near(got.xMil,exp.xMil)||!near(got.yMil,exp.yMil))throw new Error(`BTW 文字位置 round-trip 失敗：${exp.value}`);if(exp.fontSize!=null&&got.fontSize!=null&&!near(got.fontSize,exp.fontSize,.11))throw new Error(`BTW 文字字級 round-trip 失敗：${exp.value}`)
    }
    for(const exp of expectedBarcode){
      const got=after.objects.find(o=>o.index===exp.index);
      if(!got||got.kind!=='barcode'||got.barcodeType!==exp.type)throw new Error(`BTW ${exp.type} 原生物件 round-trip 失敗`);
      const preview=String(got.resolvedPreview||got.components?.join('')||'');
      if(preview!==exp.value)throw new Error(`BTW ${exp.type} 資料 round-trip 失敗：${preview} != ${exp.value}`);
      if(!near(got.xMil,exp.xMil)||!near(got.yMil,exp.yMil))throw new Error(`BTW ${exp.type} 位置 round-trip 失敗`)
    }
    if(target.source){
      const text=check.header?.text||'',wanted=`${F.formatMm(target.width)} x ${F.formatMm(target.height)} mm`;
      if(!text.includes(`<TemplateSize>${wanted}</TemplateSize>`))throw new Error('BTW TemplateSize round-trip 驗證失敗')
    }

    return{name:outputName(label,index),bytes:rebuilt,kind:P.kind,barcodes:{dataMatrix:P.dm.map(barcodeText),code128:P.c128.map(barcodeText)},layout:{target,internalSizeOffsets:sized.offsets,text:expectedText,barcodes:expectedBarcode},header:check.header,seed:SEED_ID}
  }

  window.LabelWorkbenchBtwSecondNative={BUILD,SEED_ID,MAX_TEXT,MAX_C128,MAX_DM,plan,canGenerate,pool,generateOne};
  console.info('[Label Workbench] sanitized 5C128+1DM native generator',BUILD);
})();
