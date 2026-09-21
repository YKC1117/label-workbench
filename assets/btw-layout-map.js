/* Label Workbench BTW layout mapper v1.0
 * Converts normalized Quick Analysis source geometry into BarTender coordinates.
 * Current structural seed is CEA 3x2 inch (76.2 x 50.8 mm); source physical size is
 * preserved separately so the template-size field can be switched once fully verified.
 */
(function(){
  'use strict';
  const BUILD='20260921-btw-layout-map-110-validation';
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
  function rawBox(row){return row?.sourceBox||null}
  function validSourceBox(box){
    if(!box||!['x','y','w','h'].every(k=>Number.isFinite(Number(box[k]))))return false;
    const x=Number(box.x),y=Number(box.y),w=Number(box.w),h=Number(box.h);
    return x>=0&&y>=0&&w>0&&h>0&&x+w<=1.002&&y+h<=1.002
  }
  function overlapRatio(a,b){
    if(!validSourceBox(a)||!validSourceBox(b))return 0;
    const x0=Math.max(Number(a.x),Number(b.x)),y0=Math.max(Number(a.y),Number(b.y)),x1=Math.min(Number(a.x)+Number(a.w),Number(b.x)+Number(b.w)),y1=Math.min(Number(a.y)+Number(a.h),Number(b.y)+Number(b.h));
    const area=Math.max(0,x1-x0)*Math.max(0,y1-y0),base=Math.max(1e-9,Math.min(Number(a.w)*Number(a.h),Number(b.w)*Number(b.h)));
    return area/base
  }
  function validateSourceLayout(label){
    const rows=[...(label?.textObjects||[]).map(x=>({kind:'text',row:x})),...(label?.barcodes||[]).map(x=>({kind:'barcode',row:x}))].filter(x=>String(x.row?.text??x.row?.value??x.row?.data??'').trim());
    const errors=[],warnings=[],ids=new Set();
    for(const item of rows){
      const id=String(item.row?.id||'');
      if(!id)warnings.push({code:'missing-id',kind:item.kind});else if(ids.has(id))errors.push({code:'duplicate-id',id});else ids.add(id);
      if(!validSourceBox(rawBox(item.row)))errors.push({code:'invalid-source-box',id:id||null,kind:item.kind,box:rawBox(item.row)});
    }
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      if(rows[i].kind!==rows[j].kind)continue;
      const ratio=overlapRatio(rawBox(rows[i].row),rawBox(rows[j].row));
      const a=String(rows[i].row?.text??rows[i].row?.value??''),b=String(rows[j].row?.text??rows[j].row?.value??'');
      if(ratio>=.88&&a!==b)errors.push({code:'severe-overlap',a:rows[i].row?.id||null,b:rows[j].row?.id||null,kind:rows[i].kind,ratio:Math.round(ratio*1000)/1000});
      else if(ratio>=.88&&a===b)errors.push({code:'duplicate-object',a:rows[i].row?.id||null,b:rows[j].row?.id||null,kind:rows[i].kind,ratio:Math.round(ratio*1000)/1000});
    }
    return{ok:errors.length===0,errors,warnings,count:rows.length}
  }
  function assertSourceLayout(label){
    const report=validateSourceLayout(label);
    if(!report.ok)throw new Error('來源版面驗證失敗：'+report.errors.map(x=>x.code).join('、'));
    return report
  }
  function fieldKey(f){return String(f?.code||f?.name||'').trim()}
  function barcodeValue(b){return String(b?.text??b?.value??'')}
  function barcodeType(b){const f=String(b?.format||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(f.includes('datamatrix'))return'Data Matrix';if(f.includes('code128')||f==='c128')return'Code 128';return String(b?.format||'')}
  function buildLayoutPlan(label,target=CEA_MM){
    const physical=sourceSize(label),fields=(label?.fields||[]).map((f,index)=>({index,key:fieldKey(f),value:String(f?.value??''),layout:boxToLayout(f?.sourceBox,target),sourceBox:f?.sourceBox||null})),barcodes=(label?.barcodes||[]).map((b,index)=>({index,type:barcodeType(b),value:barcodeValue(b),layout:boxToLayout(b?.sourceBox,target),sourceBox:b?.sourceBox||null}));
    const locatedFields=fields.filter(x=>x.layout).length,locatedBarcodes=barcodes.filter(x=>x.layout).length,total=fields.length+barcodes.length,located=locatedFields+locatedBarcodes;
    return{BUILD,target:{width:Number(target.width),height:Number(target.height)},sourcePhysical:physical,fields,barcodes,coverage:{located,total,ratio:total?Math.round(located/total*1000)/1000:0,locatedFields,locatedBarcodes}}
  }
  window.LabelWorkbenchBtwLayout={BUILD,CEA_MM,mmToMil,sourceSize,boxToLayout,validSourceBox,overlapRatio,validateSourceLayout,assertSourceLayout,buildLayoutPlan,barcodeType};
})();
