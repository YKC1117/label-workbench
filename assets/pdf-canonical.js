/* Label Workbench vector PDF -> lwb-canonical-v1 core.
 * One rule set shared by the browser export and the Node CLI/tests.
 * Environment adapters only supply plain data: page box, pdf.js text content,
 * resolved font names, normalized operator list, a gray raster of the page and
 * decoded barcodes in page millimetres. Nothing here touches the DOM or files.
 *
 * Fail-closed policy: when any visible PDF content is not represented by the
 * model, or any object is outside the runtime-verified renderer subset, the
 * result is REJECTED with reasons and no canonical is emitted.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LabelWorkbenchPdfCanonical=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const BUILD='20261104-pdf-canonical-v1';
  const PT_MM=25.4/72;
  const RENDER_DPI=600;
  // Run45/Run49 runtime-verified module sizes on the Argox CP-3140 PPLA 300 dpi
  // driver. ANALYZER_CONTRACT.md: never extrapolate Index+1=dot.
  const VERIFIED_MODULES=Object.freeze([{moduleMm:0.254,moduleIndex:2},{moduleMm:0.338582,moduleIndex:3}]);
  // Vector geometry is exact; only PDF number formatting is tolerated. Writers
  // commonly round to 0.01 pt = 0.0035 mm. Printer-dot rounding (a 0.3175 mm
  // module becoming 4 dots) would silently resize the symbol and is rejected.
  const MODULE_TOLERANCE_MM=0.004;
  const QUIET_ZONE_MODULES=10;                    // Code 128 minimum quiet zone
  const RUN_GAP_EM=0.6;                           // split a baseline into runs
  const SPACE_GAP_EM=0.15;                        // insert a space between items
  const INK_GRAY=128;
  const BARCODE_MATCH_MM=1.0;                     // decoded raster box vs vector symbol
  const PAINT_OPS=new Set(['fill','eoFill','stroke','closeStroke','fillStroke','eoFillStroke','closeFillStroke','closeEOFillStroke']);
  const STROKE_OPS=new Set(['stroke','closeStroke','fillStroke','eoFillStroke','closeFillStroke','closeEOFillStroke']);
  const IMAGE_OPS=new Set(['paintImageXObject','paintInlineImageXObject','paintInlineImageXObjectGroup','paintImageXObjectRepeat','paintImageMaskXObject','paintImageMaskXObjectGroup','paintImageMaskXObjectRepeat','paintSolidColorImageMask']);
  const OTHER_VISIBLE_OPS=new Set(['shadingFill','beginAnnotation']);
  // Explicit, auditable font table. Substitutions are reported, never silent.
  const FONT_RULES=[
    {re:/^Arial(MT)?(-(Bold|Italic|BoldItalic)(MT)?)?$/i,family:'Arial'},
    {re:/^Arial,?(Bold|Italic|BoldItalic)?$/i,family:'Arial'},
    {re:/^LiberationSans(-(Bold|Italic|BoldItalic))?$/i,family:'Arial',substitution:'LiberationSans->Arial (metric-compatible)'},
    {re:/^CourierNewPS(-(Bold|Italic|BoldItalic))?MT$/i,family:'Courier New'},
    {re:/^LiberationMono(-(Bold|Italic|BoldItalic))?$/i,family:'Courier New',substitution:'LiberationMono->Courier New (metric-compatible)'},
    {re:/^TimesNewRomanPS(-(Bold|Italic|BoldItalic))?MT$/i,family:'Times New Roman'},
    {re:/^LiberationSerif(-(Bold|Italic|BoldItalic))?$/i,family:'Times New Roman',substitution:'LiberationSerif->Times New Roman (metric-compatible)'}
  ];
  const r4=v=>Math.round(v*1e4)/1e4;

  function stripSubset(name){return String(name||'').replace(/^[A-Z]{6}\+/,'');}
  function mapFont(realName){
    const base=stripSubset(realName);
    for(const rule of FONT_RULES)if(rule.re.test(base)){
      return {family:rule.family,bold:/bold/i.test(base),italic:/italic|oblique/i.test(base),substitution:rule.substitution||null,pdfFont:base};
    }
    return null;
  }
  function mul(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
  function apply(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
  function bboxOf(m,x0,y0,x1,y1){
    const p=[apply(m,x0,y0),apply(m,x1,y0),apply(m,x0,y1),apply(m,x1,y1)];
    return {x0:Math.min(...p.map(q=>q[0])),y0:Math.min(...p.map(q=>q[1])),x1:Math.max(...p.map(q=>q[0])),y1:Math.max(...p.map(q=>q[1]))};
  }
  function toArray(v){return v&&typeof v.length==='number'&&typeof v!=='string'?Array.from(v,x=>(x&&typeof x==='object'&&typeof x.length==='number')?Array.from(x):x):v;}

  // pdf.js operator list -> [{op,args}] with names; constructPath paint op named too.
  function normalizeOps(opList,OPS){
    const name={};for(const [k,v] of Object.entries(OPS))name[v]=k;
    return opList.fnArray.map((fn,i)=>{
      const op=name[fn]||('op'+fn),a=opList.argsArray[i];
      if(op==='constructPath'&&a)return {op,args:[name[a[0]]||('op'+a[0]),toArray(a[1]),a[2]?Array.from(a[2]):null]};
      if(op==='setTextRenderingMode'||op==='setLineWidth'||op==='setFillRGBColor'||op==='setStrokeRGBColor'||op==='transform')return {op,args:toArray(a)};
      if(op==='paintFormXObjectBegin')return {op,args:[a&&a[0]?Array.from(a[0]):null,a&&a[1]?Array.from(a[1]):null]};
      if(op==='beginGroup')return {op,args:[a&&a[0]&&a[0].matrix?Array.from(a[0].matrix):null]};
      return {op,args:null};
    });
  }
  function luminance(hex){
    const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||''));if(!m)return null;
    const n=parseInt(m[1],16);return .2126*(n>>16&255)+.7152*(n>>8&255)+.0722*(n&255);
  }
  function pathBox(data){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,i=0;const pts=[];
    const flat=Array.isArray(data)&&Array.isArray(data[0])?data[0]:data;
    if(!flat)return null;
    while(i<flat.length){
      const c=flat[i++],n=c===0||c===1?2:c===2?6:c===3?4:0;
      for(let k=0;k<n;k+=2){const x=flat[i+k],y=flat[i+k+1];pts.push([x,y]);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
      i+=n;
    }
    return pts.length?{x0,y0,x1,y1,pts}:null;
  }
  function isAxisRect(pts){
    if(!pts||pts.length<4||pts.length>5)return false;
    const xs=new Set(pts.map(p=>Math.round(p[0]*1e4))),ys=new Set(pts.map(p=>Math.round(p[1]*1e4)));
    return xs.size===2&&ys.size===2;
  }
  // Walk operators with a CTM stack and collect every visible mark.
  function graphics(ops){
    let ctm=[1,0,0,1,0,0],fill='#000000',stroke='#000000',lineWidth=1,textMode=0;const stack=[];
    const shapes=[],images=[],other=[],textModes=new Set(),textFills=new Set();
    for(const {op,args} of ops){
      if(op==='save'){stack.push([ctm,fill,stroke,lineWidth,textMode]);}
      else if(op==='restore'){const s=stack.pop();if(s)[ctm,fill,stroke,lineWidth,textMode]=s;}
      else if(op==='transform'&&args){ctm=mul(ctm,args);}
      else if(op==='paintFormXObjectBegin'){stack.push([ctm,fill,stroke,lineWidth,textMode]);if(args&&args[0])ctm=mul(ctm,args[0]);}
      else if(op==='paintFormXObjectEnd'||op==='endGroup'){const s=stack.pop();if(s)[ctm,fill,stroke,lineWidth,textMode]=s;}
      else if(op==='beginGroup'){stack.push([ctm,fill,stroke,lineWidth,textMode]);if(args&&args[0])ctm=mul(ctm,args[0]);}
      else if(op==='setFillRGBColor'&&args){fill=args[0];}
      else if(op==='setStrokeRGBColor'&&args){stroke=args[0];}
      else if(op==='setLineWidth'&&args){lineWidth=Number(args[0]);}
      else if(op==='setTextRenderingMode'&&args){textMode=Number(args[0]);}
      else if(op==='showText'||op==='showSpacedText'||op==='nextLineShowText'||op==='nextLineSetSpacingShowText'){textModes.add(textMode);textFills.add(fill);}
      else if(op==='constructPath'&&args){
        const paint=args[0];if(!PAINT_OPS.has(paint))continue;     // endPath/clip only: no ink
        const pb=pathBox(args[1]);let local=args[2]?{x0:args[2][0],y0:args[2][1],x1:args[2][2],y1:args[2][3]}:pb;
        if(!local)continue;
        const isStroke=STROKE_OPS.has(paint),rigid=Math.abs(ctm[1])<1e-9&&Math.abs(ctm[2])<1e-9;
        let box=bboxOf(ctm,local.x0,local.y0,local.x1,local.y1);
        if(isStroke){const h=lineWidth/2*Math.max(Math.hypot(ctm[0],ctm[1]),Math.hypot(ctm[2],ctm[3]));box={x0:box.x0-h,y0:box.y0-h,x1:box.x1+h,y1:box.y1+h};}
        const color=isStroke?stroke:fill,lum=luminance(color);
        shapes.push({paint,stroke:isStroke,box,rect:rigid&&!isStroke&&isAxisRect(pb&&pb.pts),color,white:!isStroke&&lum!==null&&lum>=250});
      }
      else if(IMAGE_OPS.has(op)){images.push({op,box:bboxOf(ctm,0,0,1,1)});}
      else if(OTHER_VISIBLE_OPS.has(op)){other.push(op);}
    }
    return {shapes,images,other,textModes:[...textModes],textFills:[...textFills]};
  }

  function pageInfo(page){
    const v=page.view.map(Number);
    return {x0:v[0],y0:v[1],x1:v[2],y1:v[3],widthMm:r4((v[2]-v[0])*PT_MM),heightMm:r4((v[3]-v[1])*PT_MM),rotate:Number(page.rotate||0),userUnit:Number(page.userUnit||1)};
  }
  function ptBoxToMm(p,b){return {x:(b.x0-p.x0)*PT_MM,y:(p.y1-b.y1)*PT_MM,w:(b.x1-b.x0)*PT_MM,h:(b.y1-b.y0)*PT_MM};}

  // Text items -> runs on one baseline split at wide gaps.
  function textRuns(textContent,fontNames,page,reasons){
    const p=pageInfo(page),styles=textContent.styles||{},items=[];
    for(const it of textContent.items||[]){
      if(typeof it.str!=='string'||!it.str.trim())continue;
      const t=it.transform.map(Number),size=Math.hypot(t[2],t[3]);
      if(Math.abs(t[1])>1e-6||Math.abs(t[2])>1e-6||t[0]<=0||t[3]<=0){reasons.push({code:'ROTATED_OR_MIRRORED_TEXT',detail:it.str});continue;}
      if(Math.abs(t[0]/t[3]-1)>1e-3){reasons.push({code:'HORIZONTAL_TEXT_SCALE_UNSUPPORTED',detail:it.str});continue;}
      const st=styles[it.fontName];
      if(!st||!Number.isFinite(st.ascent)||!Number.isFinite(st.descent)||st.vertical){reasons.push({code:'FONT_METRICS_UNAVAILABLE',detail:it.str});continue;}
      items.push({str:it.str,x:t[4],y:t[5],w:Number(it.width),size,font:it.fontName,real:fontNames[it.fontName]||null,ascent:st.ascent,descent:st.descent});
    }
    items.sort((a,b)=>b.y-a.y||a.x-b.x);
    const runs=[];
    for(const it of items){
      const last=runs[runs.length-1],prev=last&&last.items[last.items.length-1];
      const gap=prev?it.x-(prev.x+prev.w):Infinity;
      if(last&&last.font===it.font&&Math.abs(last.size-it.size)<1e-6&&Math.abs(last.y-it.y)<=1e-3*it.size&&gap<RUN_GAP_EM*it.size&&gap>-.1*it.size){
        if(gap>SPACE_GAP_EM*it.size&&!/\s$/.test(last.text)&&!/^\s/.test(it.str))last.text+=' ';
        last.text+=it.str;last.items.push(it);last.x1=it.x+it.w;
      }else runs.push({text:it.str,x0:it.x,x1:it.x+it.w,y:it.y,size:it.size,font:it.font,real:it.real,ascent:it.ascent,descent:it.descent,items:[it]});
    }
    return runs.map(r=>{
      const text=r.text.replace(/\s+/g,' ').trim(),top=r.y+r.ascent*r.size,bottom=r.y+r.descent*r.size;
      return {text,size:r.size,font:r.font,real:r.real,emBoxMm:ptBoxToMm(p,{x0:r.x0,x1:r.x1,y0:bottom,y1:top}),advanceMm:(r.x1-r.x0)*PT_MM,baselineMm:(p.y1-r.y)*PT_MM};
    });
  }

  // raster: {width,height,gray:Uint8Array|Array, pxPerMm}; boxes in page mm.
  function measureInk(raster,box,exclusions){
    const k=raster.pxPerMm,pad=.5;
    const X0=Math.max(0,Math.floor((box.x-pad)*k)),X1=Math.min(raster.width-1,Math.ceil((box.x+box.w+pad)*k));
    const Y0=Math.max(0,Math.floor(box.y*k)),Y1=Math.min(raster.height-1,Math.ceil((box.y+box.h)*k));
    const ex=(exclusions||[]).map(e=>({x0:Math.floor(e.x*k),y0:Math.floor(e.y*k),x1:Math.ceil((e.x+e.w)*k),y1:Math.ceil((e.y+e.h)*k)}));
    let x0=Infinity,y0=Infinity,x1=-1,y1=-1;
    for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++){
      if(raster.gray[y*raster.width+x]>=INK_GRAY)continue;
      if(ex.some(e=>x>=e.x0&&x<e.x1&&y>=e.y0&&y<e.y1))continue;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
    if(x1<0)return null;
    return {x:x0/k,y:y0/k,w:(x1-x0+1)/k,h:(y1-y0+1)/k,touchesWindow:x0===X0||x1===X1||y0===Y0||y1===Y1};
  }

  // Analysis-geometry region/sourceBox -> page millimetres. The rendered image
  // must be the whole page at a uniform scale (any scale); regionPx is the
  // detected label band inside it (offset and margins are preserved).
  function regionBoxToPageMm(sourceBox,geometry,pageMm){
    const g=geometry||{},r=g.regionPx||{x:0,y:0,w:g.imageWidthPx,h:g.imageHeightPx},b=sourceBox||{};
    const W=Number(g.imageWidthPx),H=Number(g.imageHeightPx);
    if(!(W>0&&H>0)||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0||r.x<0||r.y<0||r.x+r.w>W+1e-6||r.y+r.h>H+1e-6)throw Error('REGION_OUTSIDE_RENDERED_PAGE');
    if(![b.x,b.y,b.w,b.h].every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>1+1e-6||b.y+b.h>1+1e-6)throw Error('INVALID_SOURCE_BOX');
    const sx=pageMm.widthMm/W,sy=pageMm.heightMm/H;
    if(Math.abs(sx/sy-1)>.01)throw Error('RENDER_ASPECT_MISMATCH');
    return {x:(r.x+b.x*r.w)*sx,y:(r.y+b.y*r.h)*sy,w:b.w*r.w*sx,h:b.h*r.h*sy};
  }
  function normalizeFormat(f){
    const k=String(f||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return k==='code128'?'Code128':k==='datamatrix'?'DataMatrix':null;
  }
  function inside(c,b,m){return c[0]>=b.x-m&&c[0]<=b.x+b.w+m&&c[1]>=b.y-m&&c[1]<=b.y+b.h+m;}
  function snapModule(m){
    const hit=VERIFIED_MODULES.filter(v=>Math.abs(v.moduleMm-m)<=MODULE_TOLERANCE_MM);
    return hit.length===1?hit[0]:null;
  }

  function buildBarcodes(page,shapes,decoded,encoder,reasons){
    const p=pageInfo(page),out=[],used=new Set();
    const rects=shapes.map((s,i)=>({i,s,mm:ptBoxToMm(p,s.box)})).filter(r=>r.s.rect&&!r.s.white&&!r.s.stroke);
    for(const d of decoded||[]){
      const symbology=normalizeFormat(d.format);
      const mine=rects.filter(r=>!used.has(r.i)&&inside([r.mm.x+r.mm.w/2,r.mm.y+r.mm.h/2],d.boxMm,BARCODE_MATCH_MM));
      mine.forEach(r=>used.add(r.i));
      if(!symbology){reasons.push({code:'UNSUPPORTED_SYMBOLOGY',detail:String(d.format)});continue;}
      if(!mine.length){reasons.push({code:'BARCODE_NOT_VECTOR',detail:symbology+':'+d.text});continue;}
      const x0=Math.min(...mine.map(r=>r.mm.x)),y0=Math.min(...mine.map(r=>r.mm.y)),x1=Math.max(...mine.map(r=>r.mm.x+r.mm.w)),y1=Math.max(...mine.map(r=>r.mm.y+r.mm.h));
      const sym={x:x0,y:y0,w:x1-x0,h:y1-y0};
      const edges=[Math.abs(sym.x-d.boxMm.x),Math.abs(sym.y-d.boxMm.y),Math.abs(sym.x+sym.w-d.boxMm.x-d.boxMm.w),Math.abs(sym.y+sym.h-d.boxMm.y-d.boxMm.h)];
      const row={symbology,value:String(d.text),symbolMm:sym,rects:mine.length,decodedBoxMm:d.boxMm,decodedEdgeDeltaMm:edges.map(r4)};
      if(edges.some(e=>e>BARCODE_MATCH_MM)){reasons.push({code:'BARCODE_POSITION_MISMATCH',detail:symbology+':'+d.text});continue;}
      let modules,moduleMm;
      if(symbology==='Code128'){
        const bars=mine.map(r=>r.mm.w),m0=Math.min(...bars);modules=Math.round(sym.w/m0);
        const okBars=bars.every(w=>Math.abs(w/m0-Math.round(w/m0))<=.05);
        if(!okBars||Math.abs(sym.w/m0-modules)>.05*Math.max(1,modules/50)||(modules-2)%11!==0){reasons.push({code:'CODE128_GEOMETRY_INVALID',detail:d.text});continue;}
        if(encoder){const [raw]=encoder.raw({bcid:'code128',text:row.value,includetext:false});const em=raw.sbs.reduce((a,b)=>a+b,0);row.encoderModules=em;if(em!==modules){reasons.push({code:'CODE128_ENCODING_DIFFERS_FROM_ENCODER',detail:d.text+' pdf='+modules+' encoder='+em});continue;}}
        moduleMm=sym.w/modules;
      }else{
        const m0=Math.min(...mine.map(r=>Math.min(r.mm.w,r.mm.h)));const cols=Math.round(sym.w/m0),rows=Math.round(sym.h/m0);
        if(Math.abs(sym.w/m0-cols)>.05||Math.abs(sym.h/m0-rows)>.05||cols!==rows||cols%2||cols<10||cols>144){reasons.push({code:'DATAMATRIX_GEOMETRY_INVALID',detail:d.text});continue;}
        if(encoder){const [raw]=encoder.raw({bcid:'datamatrix',text:row.value});row.encoderModules=raw.pixx;if(raw.pixx!==cols||raw.pixy!==rows){reasons.push({code:'DATAMATRIX_SIZE_DIFFERS_FROM_ENCODER',detail:d.text+' pdf='+cols+' encoder='+raw.pixx});continue;}}
        modules=cols;moduleMm=sym.w/cols;
      }
      row.modules=modules;row.measuredModuleMm=r4(moduleMm);
      const v=snapModule(moduleMm);
      if(!v){reasons.push({code:'MODULE_NOT_IN_VERIFIED_TABLE',detail:symbology+':'+d.text+' moduleMm='+r4(moduleMm)});continue;}
      row.moduleMm=v.moduleMm;row.moduleIndex=v.moduleIndex;out.push(row);
    }
    return {barcodes:out,used};
  }

  function build(input){
    const reasons=[],warnings=[],page=input.page,p=pageInfo(page);
    const report={schema:'lwb-pdf-canonical-report-v1',build:BUILD,status:'REJECTED',source:input.sourceName||null,page:{widthMm:p.widthMm,heightMm:p.heightMm,rotate:p.rotate,userUnit:p.userUnit},reasons,warnings,substitutions:[],coverage:{},objects:[]};
    if((input.numPages||1)!==1)reasons.push({code:'MULTI_PAGE_UNSUPPORTED',detail:String(input.numPages)});
    if(p.rotate!==0)reasons.push({code:'PAGE_ROTATION_UNSUPPORTED',detail:String(p.rotate)});
    if(p.userUnit!==1)reasons.push({code:'USER_UNIT_UNSUPPORTED',detail:String(p.userUnit)});
    const g=graphics(input.ops);
    if(g.images.length)reasons.push({code:'UNSUPPORTED_IMAGE',detail:g.images.length+' image paint(s)'});
    if(g.other.length)reasons.push({code:'UNSUPPORTED_VISIBLE_CONTENT',detail:[...new Set(g.other)].join(',')});
    if(g.textModes.some(m=>m!==0))reasons.push({code:'TEXT_RENDER_MODE_UNSUPPORTED',detail:g.textModes.join(',')});
    if(g.textFills.some(c=>{const l=luminance(c);return l===null||l>=128;}))reasons.push({code:'TEXT_COLOR_UNSUPPORTED',detail:g.textFills.join(',')});
    const runs=textRuns(input.textContent,input.fontNames||{},page,reasons);
    const {barcodes,used}=buildBarcodes(page,g.shapes,input.decodedBarcodes,input.encoder,reasons);
    const leftovers=g.shapes.map((s,i)=>({s,i})).filter(x=>!used.has(x.i)&&!x.s.white);
    for(const x of leftovers)reasons.push({code:x.s.stroke?'UNSUPPORTED_STROKE':'UNSUPPORTED_GRAPHIC',detail:JSON.stringify(Object.fromEntries(Object.entries(ptBoxToMm(p,x.s.box)).map(([k,v])=>[k,r4(v)])))});
    report.coverage={textRuns:runs.length,shapes:g.shapes.length,shapesInSupportedBarcodes:[...used].length,ignoredWhiteFills:g.shapes.filter(s=>s.white).length,images:g.images.length,decodedBarcodes:(input.decodedBarcodes||[]).length};
    const exclusions=barcodes.map(b=>({x:b.symbolMm.x-.3,y:b.symbolMm.y-.3,w:b.symbolMm.w+.6,h:b.symbolMm.h+.6}));
    const texts=[];
    for(const r of runs){
      const f=mapFont(r.real);
      if(!f){reasons.push({code:'UNSUPPORTED_FONT',detail:stripSubset(r.real)+':'+r.text});continue;}
      if(f.substitution&&!report.substitutions.includes(f.substitution))report.substitutions.push(f.substitution);
      if(!input.raster){reasons.push({code:'RASTER_UNAVAILABLE',detail:r.text});continue;}
      const ink=measureInk(input.raster,r.emBoxMm,exclusions);
      if(!ink){reasons.push({code:'TEXT_INK_NOT_FOUND',detail:r.text});continue;}
      if(ink.touchesWindow)warnings.push({code:'TEXT_INK_TOUCHES_SEARCH_WINDOW',detail:r.text});
      for(const b of barcodes){const s=b.symbolMm;if(ink.x<s.x+s.w&&ink.x+ink.w>s.x&&ink.y<s.y+s.h&&ink.y+ink.h>s.y)reasons.push({code:'TEXT_OVERLAPS_BARCODE',detail:r.text});}
      texts.push({r,f,ink});
    }
    report.coverage.textObjects=texts.length;
    if(reasons.length)return {report,canonical:null};
    texts.sort((a,b)=>a.ink.y-b.ink.y||a.ink.x-b.ink.x);
    const objects=[];let n=0;
    for(const {r,f,ink} of texts){
      const id='TEXT_'+String(++n).padStart(3,'0'),h=(r.emBoxMm.h);
      objects.push({id,type:'text',xMm:r4(ink.x),yMm:r4(ink.y),widthMm:r4(Math.max(r.advanceMm,ink.w)+.2),heightMm:r4(Math.max(h,ink.h)+.2),rotation:0,printable:true,
        text:r.text,fontFamily:f.family,fontSizePt:r4(r.size),bold:f.bold,italic:f.italic,alignment:'left',multiline:false,frameMode:'containment'});
      report.objects.push({id,source:{pdfFont:f.pdfFont,substitution:f.substitution,emBoxMm:mapR4(r.emBoxMm),baselineMm:r4(r.baselineMm),inkMm:mapR4(ink)}});
    }
    let c1=0,c2=0;
    for(const b of barcodes){
      const s=b.symbolMm;
      if(b.symbology==='Code128'){
        const id='CODE128_'+String(++c1).padStart(3,'0'),qz=r4(QUIET_ZONE_MODULES*b.moduleMm);
        objects.push({id,type:'barcode1d',xMm:r4(s.x-qz),yMm:r4(s.y),widthMm:r4(s.w+2*qz),heightMm:r4(s.h),rotation:0,printable:true,symbology:'Code128',value:b.value,moduleMm:b.moduleMm,moduleIndex:b.moduleIndex,barHeightMm:r4(s.h),humanReadable:false,quietZoneMm:qz});
        report.objects.push({id,source:b});
      }else{
        const id='DATAMATRIX_'+String(++c2).padStart(3,'0');
        objects.push({id,type:'barcode2d',xMm:r4(s.x),yMm:r4(s.y),widthMm:r4(s.w),heightMm:r4(s.h),rotation:0,printable:true,symbology:'DataMatrix',value:b.value,moduleMm:b.moduleMm,moduleIndex:b.moduleIndex,rows:null,columns:null,gs1:false});
        report.objects.push({id,source:b});
      }
    }
    for(const o of objects)if(o.xMm<0||o.yMm<0||o.xMm+o.widthMm>p.widthMm+1e-6||o.yMm+o.heightMm>p.heightMm+1e-6)reasons.push({code:'OBJECT_OUTSIDE_PAGE',detail:o.id});
    if(!objects.length)reasons.push({code:'NO_SUPPORTED_OBJECTS',detail:''});
    if(reasons.length){report.objects=[];return {report,canonical:null};}
    report.status='COMPLETE';
    return {report,canonical:{schema:'lwb-canonical-v1',runtimeProfile:'candidate-general-v1',label:{widthMm:p.widthMm,heightMm:p.heightMm,dpi:300},objects}};
  }
  function mapR4(o){const out={};for(const k of ['x','y','w','h'])if(k in o)out[k]=r4(o[k]);return out;}
  // Gray raster from RGBA (white background assumed by the renderer call).
  function grayFromRgba(rgba,width,height){const g=new Uint8Array(width*height);for(let i=0,j=0;j<g.length;i+=4,j++){const a=rgba[i+3]/255;g[j]=Math.round((.299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2])*a+255*(1-a));}return g;}
  return {BUILD,PT_MM,RENDER_DPI,VERIFIED_MODULES,MODULE_TOLERANCE_MM,QUIET_ZONE_MODULES,RUN_GAP_EM,SPACE_GAP_EM,
    mapFont,stripSubset,normalizeOps,graphics,textRuns,measureInk,regionBoxToPageMm,normalizeFormat,snapModule,buildBarcodes,build,grayFromRgba,pageInfo};
});
