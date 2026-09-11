/* Label Workbench BTW layout mapper v1.0
 * Converts normalized Quick Analysis source geometry into BarTender coordinates.
 * Current structural seed is CEA 3x2 inch (76.2 x 50.8 mm); source physical size is
 * preserved separately so the template-size field can be switched once fully verified.
 */
(function(){
  'use strict';
  const BUILD='20260911-btw-layout-map-100';
  const CEA_MM={width:76.2,height:50.8};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const mmToMil=v=>Math.round(Number(v)/0.0254);
  const round2=v=>Math.round(Number(v)*100)/100;
  const cleanBox=b=>b&&Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y))?{x:clamp(b.x,0,1),y:clamp(b.y,0,1),w:clamp(b.w,0,1),h:clamp(b.h,0,1)}:null;
  function sourceSize(label){
    const g=label?.sourceGeometry||{},w=Number(g.widthMm),h=Number(g.heightMm);
    if(w>=5&&w<=1000&&h>=5&&h<=1000)return{width:round2(w),height:round2(h),known:true};
    return{width:CEA_MM.width,height:CEA_MM.height,known:false}
  }
  function boxToLayout(box,target=CEA_MM){
    const b=cleanBox(box);if(!b)return null;const width=Number(target?.width)||CEA_MM.width,height=Number(target?.height)||CEA_MM.height;
    const mm={x:round2(b.x*width),y:round2(b.y*height),w:round2(b.w*width),h:round2(b.h*height)};
    return{normalized:b,mm,mil:{x:mmToMil(mm.x),y:mmToMil(mm.y),w:mmToMil(mm.w),h:mmToMil(mm.h)}}
  }
  function fieldKey(f){return String(f?.code||f?.name||'').trim()}
  function barcodeValue(b){return String(b?.text??b?.value??'')}
  function barcodeType(b){const f=String(b?.format||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(f.includes('datamatrix'))return'Data Matrix';if(f.includes('code128')||f==='c128')return'Code 128';return String(b?.format||'')}
  function buildLayoutPlan(label,target=CEA_MM){
    const physical=sourceSize(label),fields=(label?.fields||[]).map((f,index)=>({index,key:fieldKey(f),value:String(f?.value??''),layout:boxToLayout(f?.sourceBox,target),sourceBox:f?.sourceBox||null})),barcodes=(label?.barcodes||[]).map((b,index)=>({index,type:barcodeType(b),value:barcodeValue(b),layout:boxToLayout(b?.sourceBox,target),sourceBox:b?.sourceBox||null}));
    const locatedFields=fields.filter(x=>x.layout).length,locatedBarcodes=barcodes.filter(x=>x.layout).length,total=fields.length+barcodes.length,located=locatedFields+locatedBarcodes;
    return{BUILD,target:{width:Number(target.width),height:Number(target.height)},sourcePhysical:physical,fields,barcodes,coverage:{located,total,ratio:total?Math.round(located/total*1000)/1000:0,locatedFields,locatedBarcodes}}
  }
  window.LabelWorkbenchBtwLayout={BUILD,CEA_MM,mmToMil,sourceSize,boxToLayout,buildLayoutPlan,barcodeType};
})();
