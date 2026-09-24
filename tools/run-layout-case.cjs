const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const zlib=require('node:zlib');
const {chromium}=require('@playwright/test');

const ROOT=path.resolve(__dirname,'..');
const imagePath=path.resolve(process.argv[2]||'');
const sizeArg=String(process.argv[3]||'').trim();
if(!process.argv[2]||!fs.existsSync(imagePath)){
  console.error('Usage: node tools/run-layout-case.cjs <Image.jpg> <WIDTHxHEIGHT-mm>');
  process.exit(2);
}
const outDir=path.join(ROOT,'artifacts','manual-case');
fs.mkdirSync(outDir,{recursive:true});

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.pdf':'application/pdf'};
function serve(req,res){
  let p=decodeURIComponent((req.url||'/').split('?')[0]); if(p==='/')p='/index.html';
  const file=path.resolve(ROOT,'.'+p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return}
  res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
}
function dataUrlToBuffer(s){return Buffer.from(String(s).split(',')[1]||'','base64')}
function installedBrowserCandidates(){
  const out=[];
  if(process.env.LW_BROWSER_PATH)out.push(process.env.LW_BROWSER_PATH);
  if(process.platform==='win32'){
    for(const base of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean)){
      out.push(path.join(base,'Google','Chrome','Application','chrome.exe'));
      out.push(path.join(base,'Microsoft','Edge','Application','msedge.exe'));
    }
  }else if(process.platform==='darwin'){
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    out.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  }else{
    out.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/microsoft-edge','/usr/bin/microsoft-edge-stable','/usr/bin/chromium','/usr/bin/chromium-browser');
  }
  return [...new Set(out.filter(Boolean))];
}
function findInstalledBrowser(){return installedBrowserCandidates().find(p=>fs.existsSync(p))||null}
async function launchBrowser(){
  const installed=findInstalledBrowser(),attempts=[];
  if(installed){
    try{
      const browser=await chromium.launch({headless:true,executablePath:installed});
      return{browser,source:'system',executablePath:installed}
    }catch(error){attempts.push('system '+installed+': '+String(error?.message||error))}
  }
  try{
    const browser=await chromium.launch({headless:true});
    return{browser,source:'playwright',executablePath:chromium.executablePath()}
  }catch(error){attempts.push('playwright bundled chromium: '+String(error?.message||error))}
  throw new Error('No usable Chromium browser. Install Chrome/Edge or set LW_BROWSER_PATH. Attempts:\n'+attempts.join('\n'))
}

(async()=>{
  const server=http.createServer(serve);
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
  const port=server.address().port;
  const launched=await launchBrowser(),browser=launched.browser;
  console.log('Browser: '+launched.source+' '+(launched.executablePath||''));
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1100}});
  const consoleErrors=[],pageErrors=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  page.on('pageerror',e=>pageErrors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'⚡ 快速分析',exact:true}).click();
    await page.locator('#analysisFiles').setInputFiles(imagePath);
    const button=page.locator('#analysisBtNative');
    await button.waitFor({state:'visible',timeout:180000});
    await page.waitForFunction(()=>window.LabelWorkbenchAnalysisCoreV2?.latestResult?.labels?.length>0,null,{timeout:180000});

    const model=await page.evaluate(()=>({
      result:window.LabelWorkbenchAnalysisCoreV2?.latestResult,
      files:window.LabelWorkbenchAnalysisCoreV2?.latestFiles?.map(f=>({name:f.name,type:f.type,size:f.size}))||[],
      bridge:window.LabelWorkbenchBtBridge?.latestResult
    }));
    fs.writeFileSync(path.join(outDir,'analysis.json'),JSON.stringify(model,null,2),'utf8');

    const visual=await page.evaluate(async()=>{
      const input=document.getElementById('analysisFiles'),file=input?.files?.[0],label=window.LabelWorkbenchAnalysisCoreV2?.latestResult?.labels?.[0];
      if(!file||!label)throw new Error('analysis file/label missing');
      const bmp=await createImageBitmap(file),deg=((Number(label.rotation)||0)%360+360)%360;
      const swap=deg===90||deg===270,ow=swap?bmp.height:bmp.width,oh=swap?bmp.width:bmp.height;
      const oriented=document.createElement('canvas');oriented.width=ow;oriented.height=oh;const ox=oriented.getContext('2d');
      ox.save();
      if(deg===90){ox.translate(ow,0);ox.rotate(Math.PI/2)}
      else if(deg===180){ox.translate(ow,oh);ox.rotate(Math.PI)}
      else if(deg===270){ox.translate(0,oh);ox.rotate(-Math.PI/2)}
      ox.drawImage(bmp,0,0);ox.restore();
      const sr=label.sourceRegion?.normalized||{x:0,y:0,w:1,h:1};
      const rx=sr.x*ow,ry=sr.y*oh,rw=sr.w*ow,rh=sr.h*oh;
      const crop=document.createElement('canvas');crop.width=Math.max(1,Math.round(rw));crop.height=Math.max(1,Math.round(rh));const cx=crop.getContext('2d');
      cx.drawImage(oriented,rx,ry,rw,rh,0,0,crop.width,crop.height);
      cx.lineWidth=Math.max(2,Math.round(Math.min(crop.width,crop.height)/180));
      cx.font=Math.max(12,Math.round(Math.min(crop.width,crop.height)/24))+'px sans-serif';
      cx.textBaseline='top';
      function draw(box,labelText,stroke){
        if(!box)return;const x=box.x*crop.width,y=box.y*crop.height,w=box.w*crop.width,h=box.h*crop.height;
        cx.strokeStyle=stroke;cx.fillStyle=stroke;cx.strokeRect(x,y,w,h);cx.fillText(labelText,x+2,Math.max(0,y-18));
      }
      (label.textObjects||[]).forEach((o,i)=>draw(o.sourceBox,'T'+(i+1),'#0066ff'));
      (label.barcodes||[]).forEach((o,i)=>draw(o.sourceBox,'B'+(i+1),'#ff0000'));
      const full=document.createElement('canvas');full.width=ow;full.height=oh;const fx=full.getContext('2d');fx.drawImage(oriented,0,0);
      fx.lineWidth=Math.max(3,Math.round(Math.min(ow,oh)/200));fx.strokeStyle='#00a050';fx.strokeRect(rx,ry,rw,rh);
      fx.font=Math.max(14,Math.round(Math.min(ow,oh)/28))+'px sans-serif';fx.fillStyle='#00a050';fx.fillText('LABEL REGION',rx+4,Math.max(0,ry-24));
      return{crop:crop.toDataURL('image/png'),full:full.toDataURL('image/png')};
    });
    fs.writeFileSync(path.join(outDir,'corrected-label.png'),dataUrlToBuffer(visual.crop));
    fs.writeFileSync(path.join(outDir,'source-region.png'),dataUrlToBuffer(visual.full));
    fs.writeFileSync(path.join(outDir,'correction.json'),JSON.stringify({
      orientationRotationDeg:Number(model.result.labels[0]?.rotation||0),
      labelCropApplied:true,
      perspectiveCorrectionApplied:false,
      note:'corrected-label.png currently means orientation-corrected + cropped label region; no homography/perspective warp is applied.'
    },null,2),'utf8');

    if(!sizeArg){
      fs.writeFileSync(path.join(outDir,'SIZE_REQUIRED.txt'),'Image analysis completed. Real label width x height in mm is required before BTW export. Do not guess donor size.','utf8');
      console.log('SIZE_REQUIRED');
      console.log('Analysis evidence: '+outDir);
      process.exitCode=3;
      return;
    }
    page.once('dialog',async d=>{await d.accept(sizeArg)});
    const dp=page.waitForEvent('download',{timeout:60000});
    await button.click();
    const download=await dp;
    const btwPath=path.join(outDir,'case-output.btw');
    await download.saveAs(btwPath);

    const bytes=fs.readFileSync(btwPath);
    const sandbox={console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Buffer,
      atob:s=>Buffer.from(s,'base64').toString('binary'),
      document:{readyState:'loading',addEventListener(){},getElementById(){return null}}};
    sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);
    for(const name of ['btw-format','btw-object-map'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',name+'.js'),'utf8'),sandbox,{filename:name+'.js'});
    const parsed=sandbox.LabelWorkbenchBtwFormat.parseStructure(bytes);
    const container=zlib.inflateSync(parsed.compressedContainer);
    const decoded=sandbox.LabelWorkbenchBtwObjectMap.mapContainer(container).objects;
    const m=/<TemplateSize>\s*([\d.]+)\s*x\s*([\d.]+)\s*mm<\/TemplateSize>/i.exec(parsed.header?.text||'');
    const templateSize=m?{widthMm:Number(m[1]),heightMm:Number(m[2])}:null;
    const requested=/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(sizeArg);
    const requestedSize=requested?{widthMm:Number(requested[1]),heightMm:Number(requested[2])}:null;
    const region=model.result.labels[0]?.sourceRegion||{};
    const regionAspect=Number(region.w)>0&&Number(region.h)>0?Number(region.w)/Number(region.h):null;
    const targetAspect=requestedSize?requestedSize.widthMm/requestedSize.heightMm:null;
    const aspectMismatch=regionAspect&&targetAspect?Math.max(regionAspect,targetAspect)/Math.min(regionAspect,targetAspect):null;
    const residualOffCanvas=decoded.filter(o=>Number(o.xMil)===50000||Number(o.yMil)===50000).map(o=>({index:o.index,kind:o.kind,name:o.name,value:o.value||'',barcodeType:o.barcodeType||'',components:o.components||[],xMil:o.xMil,yMil:o.yMil}));
    const outOfBoundsAnchors=templateSize?decoded.filter(o=>Number.isFinite(Number(o.xMm))&&Number.isFinite(Number(o.yMm))&&(Number(o.xMm)<0||Number(o.yMm)<0||Number(o.xMm)>templateSize.widthMm||Number(o.yMm)>templateSize.heightMm)).map(o=>({index:o.index,kind:o.kind,name:o.name,value:o.value||'',xMm:o.xMm,yMm:o.yMm})):[];
    const label=model.result.labels[0]||{};
    const sourceTextValues=new Set((label.textObjects||[]).map(o=>String(o?.text||'').trim()).filter(Boolean));
    if(!sourceTextValues.size)for(const field of (label.fields||[])){const v=String(field?.value||'').trim();if(v)sourceTextValues.add(v)}
    const decodedText=decoded.filter(o=>o.kind==='text'&&String(o.value||'').trim());
    const unexpectedText=decodedText.filter(o=>!sourceTextValues.has(String(o.value||'').trim())).map(o=>({index:o.index,name:o.name,value:o.value,xMm:o.xMm,yMm:o.yMm}));
    const normType=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const barcodeValue=o=>String(o?.resolvedPreview||o?.components?.join('')||'').trim();
    const sourceBarcodes=(label.barcodes||[]).map(b=>({type:normType(b?.format),value:String(b?.text??b?.value??'').trim()})).filter(b=>b.value);
    const decodedBarcodes=decoded.filter(o=>o.kind==='barcode'&&barcodeValue(o));
    const unexpectedBarcodes=decodedBarcodes.filter(o=>!sourceBarcodes.some(b=>b.value===barcodeValue(o)&&b.type===normType(o.barcodeType))).map(o=>({index:o.index,name:o.name,type:o.barcodeType,value:barcodeValue(o),xMm:o.xMm,yMm:o.yMm}));
    const syntheticObjects=decoded.filter(o=>o.syntheticFromTag).map(o=>({index:o.index,kind:o.kind,name:o.name,owner:o.owner}));
    const duplicateObjects=[];
    for(let i=0;i<decodedText.length;i++)for(let j=i+1;j<decodedText.length;j++){
      const a=decodedText[i],b=decodedText[j];
      if(String(a.value||'').trim()===String(b.value||'').trim()&&Number(a.xMil)===Number(b.xMil)&&Number(a.yMil)===Number(b.yMil))duplicateObjects.push({value:a.value,indexes:[a.index,b.index],xMil:a.xMil,yMil:a.yMil})
    }
    const overlapFraction=(a,b)=>{if(!a||!b)return 0;const ax2=Number(a.x)+Number(a.w),ay2=Number(a.y)+Number(a.h),bx2=Number(b.x)+Number(b.w),by2=Number(b.y)+Number(b.h),iw=Math.max(0,Math.min(ax2,bx2)-Math.max(Number(a.x),Number(b.x))),ih=Math.max(0,Math.min(ay2,by2)-Math.max(Number(a.y),Number(b.y))),area=Math.max(0,Number(a.w)*Number(a.h));return area?(iw*ih)/area:0};
    const severeSourceOverlaps=[];
    for(const t of (label.textObjects||[]))for(const b of (label.barcodes||[])){const fraction=overlapFraction(t?.sourceBox,b?.sourceBox);if(fraction>=.58)severeSourceOverlaps.push({text:t.text,barcode:String(b?.text||''),fraction:Math.round(fraction*1000)/1000})}

    fs.writeFileSync(path.join(outDir,'btw-decoded.json'),JSON.stringify({templateSize,requestedSize,objectCount:decoded.length,residualOffCanvas,outOfBoundsAnchors,unexpectedText,unexpectedBarcodes,syntheticObjects,duplicateObjects,severeSourceOverlaps,objects:decoded},null,2),'utf8');
    const sizeMatches=!!(templateSize&&requestedSize&&Math.abs(templateSize.widthMm-requestedSize.widthMm)<.02&&Math.abs(templateSize.heightMm-requestedSize.heightMm)<.02);
    const summary={
      input:imagePath,sizeArg:sizeArg||null,output:btwPath,
      browser:{source:launched.source,executablePath:launched.executablePath||null},
      label:model.result.labels[0],
      outputInspection:{templateSize,requestedSize,sizeMatches,regionAspect,targetAspect,aspectMismatch,objectCount:decoded.length,residualOffCanvasCount:residualOffCanvas.length,outOfBoundsAnchorCount:outOfBoundsAnchors.length,unexpectedTextCount:unexpectedText.length,unexpectedBarcodeCount:unexpectedBarcodes.length,syntheticObjectCount:syntheticObjects.length,duplicateObjectCount:duplicateObjects.length,severeSourceOverlapCount:severeSourceOverlaps.length},
      consoleErrors,pageErrors
    };
    fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2),'utf8');
    if(!sizeMatches)throw new Error('Exported TemplateSize does not match explicit physical size '+sizeArg);
    if(aspectMismatch==null||aspectMismatch>2.2)throw new Error('Detected label region aspect ratio does not match the requested physical label size; inspect source-region.png before accepting the BTW');
    if(residualOffCanvas.length)throw new Error('Exported BTW still contains '+residualOffCanvas.length+' donor object(s) hidden at 50000 mil');
    if(outOfBoundsAnchors.length)throw new Error('Exported BTW contains '+outOfBoundsAnchors.length+' object anchor(s) outside the requested label size');
    if(unexpectedText.length)throw new Error('Exported BTW contains '+unexpectedText.length+' text object(s) not present in the analysis source model');
    if(unexpectedBarcodes.length)throw new Error('Exported BTW contains '+unexpectedBarcodes.length+' barcode object(s) whose decoded type/payload do not match the analysis');
    if(syntheticObjects.length)throw new Error('Exported BTW still contains '+syntheticObjects.length+' synthetic donor barcode object(s)');
    if(duplicateObjects.length)throw new Error('Exported BTW contains '+duplicateObjects.length+' duplicate text object(s) at the same position');
    if(severeSourceOverlaps.length)throw new Error('Analysis still contains '+severeSourceOverlaps.length+' severe text/barcode overlap(s)');
    await page.screenshot({path:path.join(outDir,'analysis-page.png'),fullPage:true});
    console.log('PASS');
    console.log('Artifacts: '+outDir);
    console.log('BTW: '+btwPath);
  }finally{
    await browser.close();
    await new Promise(r=>server.close(r));
  }
})().catch(e=>{console.error(e);process.exit(1)});
