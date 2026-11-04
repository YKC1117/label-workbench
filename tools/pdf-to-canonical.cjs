'use strict';
// Node environment adapter for the shared core assets/pdf-canonical.js.
// It only gathers plain inputs (pdf.js text/operators, a 600 dpi gray raster,
// zxing-wasm decodes) with the same library versions the website loads.
// Usage: node tools/pdf-to-canonical.cjs <file.pdf> <outDir>
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../assets/pdf-canonical.js');
const ROOT=path.resolve(__dirname,'..');

async function libs(){
  const pdfjs=await import(path.join(ROOT,'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
  const zx=await import('zxing-wasm/reader');
  // Same binary as the site's zxing-wasm 3.1.3, loaded locally (no CDN fetch).
  zx.prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(path.join(ROOT,'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'))},fireImmediately:true});
  const {createCanvas}=require('@napi-rs/canvas');
  return {pdfjs,zx,createCanvas,bwip:require('bwip-js-site')};
}
async function extract(file){
  const {pdfjs,zx,createCanvas,bwip}=await libs();
  const data=new Uint8Array(fs.readFileSync(file));
  const pdf=await pdfjs.getDocument({data,standardFontDataUrl:path.join(ROOT,'node_modules/pdfjs-dist/standard_fonts/'),isEvalSupported:false}).promise;
  const page=await pdf.getPage(1);
  const opList=await page.getOperatorList();
  const textContent=await page.getTextContent({includeMarkedContent:false});
  const fontNames={};
  for(const id of new Set(textContent.items.map(i=>i.fontName)))if(page.commonObjs.has(id))fontNames[id]=page.commonObjs.get(id).name;
  const scale=Core.RENDER_DPI/72,vp=page.getViewport({scale});
  const canvas=createCanvas(Math.round(vp.width),Math.round(vp.height)),ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:vp,background:'rgb(255,255,255)'}).promise;
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const gray=Core.grayFromRgba(img.data,canvas.width,canvas.height);
  const pageMm=Core.pageInfo({view:page.view,rotate:page.rotate,userUnit:page.userUnit});
  const png=canvas.toBuffer('image/png');
  const found=await zx.readBarcodes(new Uint8Array(png),{formats:[],tryHarder:true,maxNumberOfSymbols:32});
  const decodedBarcodes=found.filter(r=>r.isValid).map(r=>{
    const xs=[r.position.topLeft.x,r.position.topRight.x,r.position.bottomLeft.x,r.position.bottomRight.x],ys=[r.position.topLeft.y,r.position.topRight.y,r.position.bottomLeft.y,r.position.bottomRight.y];
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const sourceBox={x:x0/canvas.width,y:y0/canvas.height,w:Math.max(1,x1-x0)/canvas.width,h:Math.max(1,y1-y0)/canvas.height};
    return {format:r.format,text:r.text,boxMm:Core.regionBoxToPageMm(sourceBox,{imageWidthPx:canvas.width,imageHeightPx:canvas.height},pageMm)};
  });
  return {input:{sourceName:path.basename(file),numPages:pdf.numPages,page:{view:Array.from(page.view),rotate:page.rotate,userUnit:page.userUnit},
    textContent:{items:textContent.items.map(i=>({str:i.str,transform:Array.from(i.transform),width:i.width,fontName:i.fontName})),styles:textContent.styles},
    fontNames,ops:Core.normalizeOps(opList,pdfjs.OPS),raster:{width:canvas.width,height:canvas.height,gray,pxPerMm:Core.RENDER_DPI/25.4},decodedBarcodes,encoder:bwip},
    rasterPng:png};
}
async function pdfToCanonical(file){
  const {input,rasterPng}=await extract(file);
  return {...Core.build(input),rasterPng};
}
module.exports={extract,pdfToCanonical};
if(require.main===module){
  (async()=>{
    const [file,outDir]=process.argv.slice(2);
    if(!file||!outDir)throw Error('usage: node tools/pdf-to-canonical.cjs <file.pdf> <outDir>');
    const {report,canonical,rasterPng}=await pdfToCanonical(file);
    fs.mkdirSync(outDir,{recursive:true});
    const base=path.basename(file,'.pdf');
    fs.writeFileSync(path.join(outDir,base+'.report.json'),JSON.stringify(report,null,2)+'\n');
    if(canonical)fs.writeFileSync(path.join(outDir,base+'.canonical.json'),JSON.stringify(canonical,null,2)+'\n');
    if(process.env.LWB_WRITE_RASTER)fs.writeFileSync(path.join(outDir,base+'.source-600dpi.png'),rasterPng);
    process.stdout.write(report.status+(report.reasons.length?' '+report.reasons.map(r=>r.code).join(','):'')+'\n');
    process.exit(report.status==='COMPLETE'?0:2);
  })().catch(e=>{console.error(e&&e.stack||e);process.exit(1);});
}
