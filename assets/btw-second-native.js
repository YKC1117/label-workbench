/* Label Workbench controlled native BTW generator v0.2.0
 * Uses a sanitized, verified hand-laid-out BarTender 2022 R2 donor as a controlled
 * object library: 29 clean Text, 5 Code 128 and 1 Data Matrix native objects.
 * Customer content/positions are still supplied by Quick Analysis.
 */
(function(){
  'use strict';
  const BUILD='20260929-btw-second-native-270-linked-code128';
  const SEED_ID='LW-CONTROLLED-140x38-2022-R2';
  const MAX_TEXT=29;
  const MAX_C128=5;
  const MAX_DM=1;
  const DONOR_SIZE={width:140,height:38};
  const OFF=50000;
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
  function textReadOrder(a,b){
    const A=a?.sourceBox||{},B=b?.sourceBox||{},ay=Number(A.y),by=Number(B.y),ah=Number(A.h)||0,bh=Number(B.h)||0;
    return Math.abs(ay-by)<Math.max(ah,bh,.012)*.55?Number(A.x)-Number(B.x):ay-by
  }
  function textPriority(o){
    const value=textValue(o),box=o?.sourceBox||{},confidence=Math.max(0,Math.min(100,Number(o?.confidence||o?.sourceBox?.confidence||0))),repeat=Math.max(0,Number(o?.repeat||0));
    const geometry=validSourceBox(box)?18:0,semantic=o?.semanticSplit?9:0,repeatScore=Math.min(4,repeat)*7,confidenceScore=confidence*.22,lengthScore=Math.min(40,value.length)*.12;
    const tiny=(Number(box?.w)||0)<.006||(Number(box?.h)||0)<.006?-18:0;
    const single=value.replace(/\s/g,'').length===1&&confidence<80&&repeat<2?-14:0;
    return geometry+semantic+repeatScore+confidenceScore+lengthScore+tiny+single
  }
  function compactTextFields(items,max=MAX_TEXT){
    const rows=[...(items||[])].filter(o=>textValue(o));
    if(rows.length<=max)return{fields:rows,omitted:[],inputCount:rows.length};
    const ranked=rows.map((o,i)=>({o,i,score:textPriority(o)})).sort((a,b)=>b.score-a.score||a.i-b.i);
    const keep=ranked.slice(0,max).map(x=>x.o).sort(textReadOrder),kept=new Set(keep),omitted=rows.filter(x=>!kept.has(x));
    return{fields:keep,omitted,inputCount:rows.length}
  }
  function plan(label){
    const raw=fields(label),fit=compactTextFields(raw,MAX_TEXT),all=rows(label),dm=all.filter(isDm),c128=all.filter(isC128);
    if(unsupported(label).length||dm.length>MAX_DM||c128.length>MAX_C128)return null;
    return{fields:fit.fields,omittedText:fit.omitted,inputTextCount:fit.inputCount,dm,c128,kind:dm.length&&c128.length?'mixed':dm.length?'dm':c128.length?'c128':'text'}
  }
  function canGenerate(label){return!!plan(label)}

  function reusableText(objects){return objects.filter(o=>
    o.kind==='text'&&
    /^(?:Text|文字)\s*\d+/i.test(o.name||'')&&
    /DataSourceGeneral/i.test(String(o.rootPath||''))&&
    !/\.Border$/i.test(String(o.rootPath||''))&&
    o.valueEntry
  )}
  function pool(objects){
    const dm=objects.filter(o=>o.kind==='barcode'&&o.barcodeType==='Data Matrix'&&o.componentEntries?.length);
    const dmIndexes=new Set(dm.map(o=>o.index));
    const c128=objects.filter(o=>o.kind==='barcode'&&!dmIndexes.has(o.index)&&o.componentEntries?.length);
    return{texts:reusableText(objects),c128,dm}
  }
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
  function validSourceBox(box){
    const x=Number(box?.x),y=Number(box?.y),w=Number(box?.w),h=Number(box?.h);
    return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(w)&&Number.isFinite(h)&&x>=0&&y>=0&&w>0&&h>0&&x<=1&&y<=1&&x+w<=1.02&&y+h<=1.02
  }
  function sourceLayout(box,target){
    const L=window.LabelWorkbenchBtwLayout;if(!L?.boxToLayout||!box)return null;
    try{return L.boxToLayout(box,target)}catch{return null}
  }
  function visualChars(value){
    let units=0;
    for(const ch of String(value??'')){
      if(/[\u3400-\u9FFF]/.test(ch))units+=1;
      else if(/\s/.test(ch))units+=.34;
      else if(/[MW@#%]/.test(ch))units+=.78;
      else if(/[ilI1.,:;|!'()\[\]]/.test(ch))units+=.34;
      else units+=.56;
    }
    return Math.max(1,units)
  }
  function sourceFontSize(layout,current,value){
    const h=Number(layout?.mm?.h),w=Number(layout?.mm?.w),fallback=Number.isFinite(Number(current))&&Number(current)>0?Number(current):6;
    if(!(h>0)&&!(w>0))return fallback;
    const byHeight=h>0?h/0.3527777778*.76:Infinity;
    const units=visualChars(value);
    const byWidth=w>0?w/(0.3527777778*Math.max(1,units))*.88:Infinity;
    return Math.round(Math.max(4.5,Math.min(18,byHeight,byWidth))*10)/10
  }
  function donorNormalizedPos(obj){
    return{x:(Number(obj?.xMil)||0)*0.0254/DONOR_SIZE.width,y:(Number(obj?.yMil)||0)*0.0254/DONOR_SIZE.height}
  }
  function textStyleScore(field,obj){
    const box=field?.sourceBox||{},p=donorNormalizedPos(obj),has=validSourceBox(box);
    const spatial=has?(Math.abs(Number(box.x)-p.x)*1.15+Math.abs(Number(box.y)-p.y)*1.5):0;
    const want=Math.max(1,visualChars(textValue(field))),have=Math.max(1,visualChars(obj?.value||'LW'));
    const length=Math.abs(Math.log(want/have))*.16;
    return spatial+length
  }
  function assignTextPool(fields,texts){
    const available=[...(texts||[])],out=[];
    for(const field of fields||[]){
      let best=-1,bestScore=Infinity;
      for(let i=0;i<available.length;i++){
        const score=textStyleScore(field,available[i]);
        if(score<bestScore){bestScore=score;best=i}
      }
      if(best<0)throw new Error('controlled donor 找不到可用文字物件');
      out.push({field,obj:available.splice(best,1)[0],score:bestScore})
    }
    return out
  }
  function fallbackTextPos(i,count,target){
    const cols=count>17?2:1,rows=Math.max(1,Math.ceil(count/cols)),col=i%cols,row=Math.floor(i/cols),x=.045+col*(cols===2?.49:0),y=.045+row*(.86/rows);
    return{xMil:mmToMil(x*target.width),yMil:mmToMil(y*target.height)}
  }
  function barcodeStyleScore(row,obj){
    const box=row?.sourceBox||{},p=donorNormalizedPos(obj),has=validSourceBox(box);
    if(!has)return 0;
    const sx=Number(box.x),sy=Number(box.y),cx=sx+Number(box.w||0)/2,cy=sy+Number(box.h||0)/2;
    return Math.hypot((p.x-cx)*1.0,(p.y-cy)*1.8)
  }
  function textKey(value){return String(value??'').trim().replace(/\s+/g,' ')}
  function code128Structure(obj,value){
    const parts=Array.isArray(obj?.resolvedComponents)?obj.resolvedComponents:[];
    if(!parts.length||!parts.some(p=>p?.type==='object'))return null;
    const segments=[];let current=null;
    for(const part of parts){
      if(part?.type==='literal'){
        if(current)segments.push(current);
        current={literal:String(part.value??''),refs:[]}
      }else if(part?.type==='object'){
        if(!current)return null;
        current.refs.push({index:part.index,ref:part.ref})
      }
    }
    if(current)segments.push(current);
    if(!segments.length||segments.some(x=>!x.literal))return null;
    const raw=String(value??'').trim();if(!raw)return null;
    let chunks=raw.includes('#')?raw.split('#'):null;
    if(!chunks){
      chunks=[];let pos=0;
      for(let i=0;i<segments.length;i++){
        const seg=segments[i];
        if(!raw.startsWith(seg.literal,pos))return null;
        const start=pos+seg.literal.length,next=segments[i+1]?.literal||'';
        let end=raw.length;
        if(next){end=raw.indexOf(next,start);if(end<0)return null}
        chunks.push(raw.slice(pos,end));pos=end
      }
      if(pos!==raw.length)return null
    }
    if(chunks.length!==segments.length)return null;
    const refs=[],payload=[];
    for(let i=0;i<segments.length;i++){
      const seg=segments[i],chunk=String(chunks[i]??'');
      if(!chunk.startsWith(seg.literal))return null;
      const remainder=chunk.slice(seg.literal.length);
      if(!seg.refs.length&&remainder)return null;
      payload.push(seg.literal,remainder);
      seg.refs.forEach((ref,j)=>refs.push({...ref,value:j===0?remainder:''}))
    }
    return{payload:payload.join(''),refs,segments}
  }
  function assignCode128Pool(rows,objects){
    const available=[...(objects||[])],out=[];
    for(const row of rows||[]){
      let best=-1,bestScore=Infinity,bestStructure=null;
      for(let i=0;i<available.length;i++){
        const structure=code128Structure(available[i],barcodeText(row));
        const score=barcodeStyleScore(row,available[i])+(structure?-10:100);
        if(score<bestScore){bestScore=score;best=i;bestStructure=structure}
      }
      if(best<0)throw new Error('controlled donor 找不到可用 Code128 物件');
      out.push({row,obj:available.splice(best,1)[0],score:bestScore,structure:bestStructure})
    }
    return out
  }
  function takeMatchingField(fields,value,obj){
    const wanted=textKey(value);if(!wanted)return null;
    let best=-1,bestScore=Infinity;
    for(let i=0;i<fields.length;i++){
      if(textKey(textValue(fields[i]))!==wanted)continue;
      const score=textStyleScore(fields[i],obj);
      if(score<bestScore){bestScore=score;best=i}
    }
    if(best<0)return null;
    return fields.splice(best,1)[0]
  }
  function assignBarcodePool(rows,objects){
    const available=[...(objects||[])],out=[];
    for(const row of rows||[]){
      let best=-1,bestScore=Infinity;
      for(let i=0;i<available.length;i++){
        const score=barcodeStyleScore(row,available[i]);if(score<bestScore){bestScore=score;best=i}
      }
      if(best<0)throw new Error('controlled donor 找不到可用條碼物件');
      out.push({row,obj:available.splice(best,1)[0],score:bestScore})
    }
    return out
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
    if(!offsets.length)throw new Error('controlled donor 找不到 140×38mm 內部尺寸 pair');
    if(offsets.length>MAX_SIZE_PAIRS)throw new Error(`5C128+1DM donor 尺寸 pair 異常：${offsets.length}`);
    const dv=new DataView(out.buffer,out.byteOffset,out.byteLength),w=mmToMil(target.width),h=mmToMil(target.height);
    for(const off of offsets){dv.setInt32(off,w,true);dv.setInt32(off+4,h,true)}
    return{container:out,offsets}
  }
  function parkAuxiliaryGraphics(container){
    const data=container instanceof Uint8Array?new Uint8Array(container):new Uint8Array(container),dv=new DataView(data.buffer,data.byteOffset,data.byteLength),parked=[];
    for(let i=0;i+16<data.length;i++){
      if(data[i]!==0xff||data[i+1]!==0xff||data[i+2]!==0x01||data[i+3]!==0x00)continue;
      const len=data[i+4]|(data[i+5]<<8);if(len<3||len>80||i+6+len+8>data.length)continue;
      let type='';let ok=true;
      for(let j=0;j<len;j++){const b=data[i+6+j];if(b<0x20||b>0x7e){ok=false;break}type+=String.fromCharCode(b)}
      if(!ok||!['LineData','CircleData'].includes(type))continue;
      const at=i+6+len,x=dv.getInt32(at,true),y=dv.getInt32(at+4,true);
      if(Math.abs(x)>=1000000||Math.abs(y)>=1000000)continue;
      dv.setInt32(at,OFF,true);dv.setInt32(at+4,OFF,true);parked.push({type,offset:at,from:{x,y}})
    }
    return{container:data,parked}
  }
  function barcodeEdit(obj,value,pos,structure=null){
    if(structure)return{index:obj.index,...pos};
    if(!obj?.componentEntries?.length)throw new Error(`${obj?.name||'條碼'} 沒有可安全寫入的 datasource slot`);
    const components=obj.componentEntries.map((_,i)=>i===0?String(value):'');
    return{index:obj.index,barcodeComponents:components,...pos}
  }
  function requestedBarcodeRows(p){return[...p.dm.map(row=>({type:'Data Matrix',row,value:barcodeText(row)})),...p.c128.map(row=>({type:'Code 128',row,value:barcodeText(row)}))]}

  async function generateOne(label,index=0){
    const P=plan(label);if(!P)throw new Error('此標籤超出 5C128+1DM native donor 可安全建立範圍');
    const D=window.LabelWorkbenchBtwControlledDonor,F=window.LabelWorkbenchBtwFormat,M=window.LabelWorkbenchBtwObjectMap;
    if(!D?.bytes||!F?.parseStructure||!F?.inflateContainer||!F?.rebuild||!F?.replaceTemplateSize||!M?.mapContainer||!M?.editContainer)throw new Error('controlled 5C128+1DM BTW 元件尚未載入');

    const seed=new Uint8Array(await D.bytes()),parsed=F.parseStructure(seed);
    if(parsed.header?.applicationVersion!=='2022 R2'||parsed.header?.compatibleVersion!=='2022 R1')throw new Error('5C128+1DM donor 版本不是 BarTender 2022 R2 / 2022 R1 相容');
    let container=await F.inflateContainer(parsed),before=M.mapContainer(container),donorPool=pool(before.objects);assertPool(donorPool);
    const rootCount=before.objects.length,target=targetSize(label),sized=rewriteInternalSize(container,target),aux=parkAuxiliaryGraphics(sized.container);container=aux.container;

    /* Re-map after fixed-width size/auxiliary rewrites so all edit offsets are derived from the bytes being edited. */
    before=M.mapContainer(container);donorPool=pool(before.objects);assertPool(donorPool);
    if(target.source){
      const missingText=P.fields.filter(item=>!validSourceBox(item?.sourceBox));
      const missingBarcode=requestedBarcodeRows(P).filter(item=>!validSourceBox(item?.row?.sourceBox));
      if(missingText.length||missingBarcode.length)throw new Error(`5C128+1DM 版面座標不完整：文字 ${missingText.length}、條碼 ${missingBarcode.length} 缺少 sourceBox；停止使用預設位置產檔`)
    }
    /* Preserve the donor's serialized object graph. Removing raw object records can leave
       BarTender-internal references/counts inconsistent even when our parser still round-trips.
       Park every donor object off-canvas, then move only requested objects back onto the label. */
    const edits=new Map(),activeIndexes=new Set(),expectedText=[];
    for(const o of before.objects)edits.set(o.index,{index:o.index,xMil:OFF,yMil:OFF});

    const expectedBarcode=[],barRows=requestedBarcodeRows(P);
    const dmAssignments=assignBarcodePool(P.dm,donorPool.dm).map(x=>({type:'Data Matrix',value:barcodeText(x.row),...x,structure:null}));
    const c128Assignments=assignCode128Pool(P.c128,donorPool.c128).map(x=>({type:'Code 128',value:barcodeText(x.row),...x}));
    const barcodeAssignments=[...dmAssignments,...c128Assignments];
    const reserved=new Map();
    for(const item of c128Assignments){
      for(const ref of item.structure?.refs||[]){
        if(reserved.has(ref.index)&&reserved.get(ref.index).value!==ref.value)throw new Error('Code128 linked datasource 重複要求不同值');
        reserved.set(ref.index,{...ref,barcodeIndex:item.obj.index})
      }
    }

    const remainingFields=[...P.fields],reservedIndexes=new Set(reserved.keys());
    for(const ref of reserved.values()){
      const obj=before.objects.find(o=>o.index===ref.index);if(!obj)throw new Error(`Code128 linked Text 不存在：${ref.ref||ref.index}`);
      const field=takeMatchingField(remainingFields,ref.value,obj),value=String(ref.value??'');
      if(field){
        const layout=sourceLayout(field?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackTextPos(expectedText.length,P.fields.length,target),fontSize=sourceFontSize(layout,obj.fontSize,value),edit={index:obj.index,value,...pos};
        if(obj.fontNameOffset!=null)edit.fontName='Microsoft JhengHei';
        if(fontSize!=null&&obj.fontSizeOffset!=null)edit.fontSize=fontSize;
        edits.set(obj.index,edit);activeIndexes.add(obj.index);expectedText.push({index:obj.index,value,fontName:edit.fontName??obj.fontName,fontSize:edit.fontSize??obj.fontSize,linkedBarcode:true,...pos})
      }else{
        edits.set(obj.index,{index:obj.index,value,xMil:OFF,yMil:OFF})
      }
    }

    const freeTexts=donorPool.texts.filter(o=>!reservedIndexes.has(o.index)),fit=compactTextFields(remainingFields,freeTexts.length);
    const textAssignments=assignTextPool(fit.fields,freeTexts);
    textAssignments.forEach(({field,obj,score},i)=>{
      const layout=sourceLayout(field?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackTextPos(i,fit.fields.length,target),value=textValue(field),fontSize=sourceFontSize(layout,obj.fontSize,value),edit={index:obj.index,value,...pos};
      if(obj.fontNameOffset!=null)edit.fontName='Microsoft JhengHei';
      if(fontSize!=null&&obj.fontSizeOffset!=null)edit.fontSize=fontSize;
      edits.set(obj.index,edit);activeIndexes.add(obj.index);expectedText.push({index:obj.index,value,fontName:edit.fontName??obj.fontName,fontSize:edit.fontSize??obj.fontSize,styleScore:Math.round(score*1000)/1000,...pos})
    });

    barcodeAssignments.forEach((item,i)=>{
      const obj=item.obj;
      if(!obj)throw new Error(`5C128+1DM donor 缺少 ${item.type} 原生物件`);
      const layout=sourceLayout(item.row?.sourceBox,target),pos=layout?.mil?{xMil:layout.mil.x,yMil:layout.mil.y}:fallbackBarcodePos(i,barRows.length,target),edit=barcodeEdit(obj,item.value,pos,item.structure);
      edits.set(obj.index,edit);activeIndexes.add(obj.index);expectedBarcode.push({index:obj.index,type:item.type,value:item.structure?.payload??item.value,sourceValue:item.value,linked:!!item.structure,styleScore:Math.round(item.score*1000)/1000,...pos})
    });

    const edited=M.editContainer(container,[...edits.values()]);
    const parkedIndexes=before.objects.filter(o=>!activeIndexes.has(o.index)).map(o=>o.index);
    const rebuilt0=await F.rebuild(parsed,edited),rebuilt=target.source?F.replaceTemplateSize(rebuilt0,target.width,target.height):rebuilt0;
    const check=F.parseStructure(rebuilt),round=await F.inflateContainer(check),after=M.mapContainer(round);
    if(!/^2022\b/.test(check.header?.applicationVersion||'')||!/^2022\b/.test(check.header?.compatibleVersion||''))throw new Error('5C128+1DM BTW 重建後版本驗證失敗');
    if(after.objects.length!==rootCount)throw new Error(`5C128+1DM donor root 數改變：${rootCount}→${after.objects.length}`);
    const parked=after.objects.filter(o=>parkedIndexes.includes(o.index));
    if(parked.length!==parkedIndexes.length||parked.some(o=>o.xMil!==OFF||o.yMil!==OFF))throw new Error(`5C128+1DM donor 紙外停放驗證失敗：${parked.length}/${parkedIndexes.length}`);

    for(const exp of expectedText){
      const got=after.objects.find(o=>o.kind==='text'&&String(o.value??'')===exp.value&&near(o.xMil,exp.xMil)&&near(o.yMil,exp.yMil));
      if(!got)throw new Error(`BTW 文字 round-trip 失敗：${exp.value}`);
      if(exp.fontName&&got.fontName!==exp.fontName)throw new Error(`BTW 文字字型 round-trip 失敗：${exp.value} / ${got.fontName}`);
      if(exp.fontSize!=null&&got.fontSize!=null&&!near(got.fontSize,exp.fontSize,.11))throw new Error(`BTW 文字字級 round-trip 失敗：${exp.value}`)
    }
    for(const exp of expectedBarcode){
      const got=after.objects.find(o=>o.index===exp.index&&o.kind==='barcode'&&String(o.resolvedPreview||o.components?.join('')||'')===exp.value&&near(o.xMil,exp.xMil)&&near(o.yMil,exp.yMil));
      if(!got)throw new Error(`BTW ${exp.type} 原生物件 round-trip 失敗：${exp.value}`)
    }
    if(target.source){
      const text=check.header?.text||'',wanted=`${F.formatMm(target.width)} x ${F.formatMm(target.height)} mm`;
      if(!text.includes(`<TemplateSize>${wanted}</TemplateSize>`))throw new Error('BTW TemplateSize round-trip 驗證失敗')
    }

    return{name:outputName(label,index),bytes:rebuilt,kind:P.kind,barcodes:{dataMatrix:P.dm.map(barcodeText),code128:P.c128.map(barcodeText)},layout:{target,internalSizeOffsets:sized.offsets,text:expectedText,barcodes:expectedBarcode,parkedDonorRoots:parkedIndexes.length,parkedAuxiliaryGraphics:aux.parked,originalRootCount:rootCount,textCompaction:{input:P.inputTextCount,written:expectedText.length,omitted:[...P.omittedText,...fit.omitted].map(x=>textValue(x))},linkedCode128:c128Assignments.filter(x=>x.structure).length},header:check.header,seed:SEED_ID}
  }

  window.LabelWorkbenchBtwSecondNative={BUILD,SEED_ID,MAX_TEXT,MAX_C128,MAX_DM,OFF,plan,canGenerate,pool,validSourceBox,textPriority,compactTextFields,textStyleScore,assignTextPool,barcodeStyleScore,code128Structure,assignBarcodePool,assignCode128Pool,takeMatchingField,parkAuxiliaryGraphics,generateOne};
  console.info('[Label Workbench] controlled 5C128+1DM native generator',BUILD);
})();
