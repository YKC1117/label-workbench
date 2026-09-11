/* Label Workbench BTW field-caption adapter v0.1.0
 * Expands one accepted Quick Analysis field into independent caption + value Text objects
 * before the verified rich donor generator runs. Not loaded by production until gated.
 */
(function(){
  'use strict';
  const BUILD='20260912-btw-caption-adapter-100';
  const MAX_TEXT=29;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const text=v=>String(v??'').trim();
  function captionText(field){
    const rawCode=text(field?.code),code=rawCode.replace(/^\((.*)\)$/,'$1').trim(),name=text(field?.name);
    if(!code&&!name)return'';
    if(code&&name)return`(${code})${name} :`;
    if(code)return`(${code}) :`;
    return`${name} :`;
  }
  function boxOk(b){return b&&Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y))&&Number(b.w)>0&&Number(b.h)>0}
  function cloneBox(b){return boxOk(b)?{...b,x:clamp(b.x,0,1),y:clamp(b.y,0,1),w:clamp(b.w,0,1),h:clamp(b.h,0,1)}:null}
  function pairedBoxes(field,caption,index,total){
    const b=cloneBox(field?.sourceBox);
    if(b){
      const valueLen=Math.max(3,text(field?.value).length),captionLen=Math.max(3,caption.length),unit=Math.max(.004,b.w/valueLen),want=clamp(unit*captionLen,.04,.32),gap=.008;
      if(b.x-want-gap>=.01)return{caption:{x:b.x-want-gap,y:b.y,w:want,h:b.h},value:b,mode:'source-left'};
      const aboveY=b.y-b.h*1.12;
      if(aboveY>=.01)return{caption:{x:b.x,y:aboveY,w:Math.min(.36,Math.max(want,b.w)),h:b.h},value:b,mode:'source-above'};
      return{caption:{x:.01,y:b.y,w:Math.min(Math.max(.04,b.x-.018),.28),h:b.h},value:b,mode:'source-edge'};
    }
    const rows=Math.max(1,total),y=clamp(.055+index*(.86/rows),.02,.93),h=clamp(.62/rows,.035,.075);
    return{caption:{x:.05,y,w:.21,h},value:{x:.29,y,w:.31,h},mode:'fallback-pair'};
  }
  function cloneField(field){return{...(field||{}),sourceBox:field?.sourceBox?{...field.sourceBox}:field?.sourceBox}}
  function prepareLabel(label){
    const sourceFields=(label?.fields||[]).filter(f=>text(f?.value)),planned=[];
    for(const [i,field] of sourceFields.entries()){
      const caption=captionText(field);
      if(!caption){planned.push(cloneField(field));continue}
      const boxes=pairedBoxes(field,caption,i,sourceFields.length);
      planned.push({code:'',name:'',value:caption,sourceBox:boxes.caption,__lwCaption:true,__lwCaptionFor:i,__lwCaptionMode:boxes.mode});
      planned.push({...cloneField(field),sourceBox:boxes.value,__lwValueFor:i});
    }
    const applied=planned.length<=MAX_TEXT&&planned.length>sourceFields.length;
    const fields=applied?planned:sourceFields.map(cloneField);
    return{label:{...(label||{}),fields,barcodes:(label?.barcodes||[]).map(b=>({...b,sourceBox:b?.sourceBox?{...b.sourceBox}:b?.sourceBox}))},applied,originalFields:sourceFields.length,outputTexts:fields.length,captions:applied?fields.filter(f=>f.__lwCaption).length:0}
  }
  function install(){
    const R=window.LabelWorkbenchBtwRichNative;if(!R?.canGenerate||!R?.generateOne||R.__captionAdapterWrapped)return !!R?.__captionAdapterWrapped;
    const baseCan=R.canGenerate.bind(R),baseGenerate=R.generateOne.bind(R);
    R.canGenerate=function(label){const p=prepareLabel(label);return baseCan(p.label)};
    R.generateOne=async function(label,index=0){const p=prepareLabel(label),out=await baseGenerate(p.label,index);return{...out,captionAdapter:{build:BUILD,applied:p.applied,originalFields:p.originalFields,outputTexts:p.outputTexts,captions:p.captions}}};
    R.__captionAdapterWrapped=true;R.__captionAdapterBase={canGenerate:baseCan,generateOne:baseGenerate};return true
  }
  const installed=install();
  window.LabelWorkbenchBtwCaptionAdapter={BUILD,MAX_TEXT,captionText,pairedBoxes,prepareLabel,install,get installed(){return installed||!!window.LabelWorkbenchBtwRichNative?.__captionAdapterWrapped}};
})();
