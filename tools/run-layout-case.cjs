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
  console.error('Usage: node tools/run-layout-case.cjs <Image.jpg> [100x65]');
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

(async()=>{
  const server=http.createServer(serve);
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
  const port=server.address().port;
  const browser=await chromium.launch({headless:true});
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
    const residualOffCanvas=decoded.filter(o=>Number(o.xMil)===50000||Number(o.yMil)===50000).map(o=>({index:o.index,kind:o.kind,name:o.name,value:o.value||'',barcodeType:o.barcodeType||'',components:o.components||[],xMil:o.xMil,yMil:o.yMil}));
    const outOfBoundsAnchors=templateSize?decoded.filter(o=>Number.isFinite(Number(o.xMm))&&Number.isFinite(Number(o.yMm))&&(Number(o.xMm)<0||Number(o.yMm)<0||Number(o.xMm)>templateSize.widthMm||Number(o.yMm)>templateSize.heightMm)).map(o=>({index:o.index,kind:o.kind,name:o.name,value:o.value||'',xMm:o.xMm,yMm:o.yMm})):[];

    fs.writeFileSync(path.join(outDir,'btw-decoded.json'),JSON.stringify({templateSize,requestedSize,objectCount:decoded.length,residualOffCanvas,outOfBoundsAnchors,objects:decoded},null,2),'utf8');
    const sizeMatches=!!(templateSize&&requestedSize&&Math.abs(templateSize.widthMm-requestedSize.widthMm)<.02&&Math.abs(templateSize.heightMm-requestedSize.heightMm)<.02);
    const summary={
      input:imagePath,sizeArg:sizeArg||null,output:btwPath,
      label:model.result.labels[0],
      outputInspection:{templateSize,requestedSize,sizeMatches,objectCount:decoded.length,residualOffCanvasCount:residualOffCanvas.length,outOfBoundsAnchorCount:outOfBoundsAnchors.length},
      consoleErrors,pageErrors
    };
    fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2),'utf8');
    if(!sizeMatches)throw new Error('Exported TemplateSize does not match explicit physical size '+sizeArg);
    if(residualOffCanvas.length)console.error('RESIDUAL_OFF_CANVAS',JSON.stringify(residualOffCanvas.slice(0,12)));
    await page.screenshot({path:path.join(outDir,'analysis-page.png'),fullPage:true});
    console.log('PASS');
    console.log('Artifacts: '+outDir);
    console.log('BTW: '+btwPath);
  }finally{
    await browser.close();
    await new Promise(r=>server.close(r));
  }
})().catch(e=>{console.error(e);process.exit(1)});
