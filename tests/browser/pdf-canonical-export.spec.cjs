const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

// Real website, real Chromium download. The three libraries the export uses are
// served from local npm packages pinned to the exact versions the site requests
// (offline-capable, identical bytes to the published npm tarballs). A version
// mismatch returns 404 and fails the test; nothing is substituted silently.
const ROOT=path.resolve(__dirname,'..','..');
const LOCAL={'pdfjs-dist@6.3.289':'node_modules/pdfjs-dist','zxing-wasm@3.1.3':'node_modules/zxing-wasm','bwip-js@4.6.0':'node_modules/bwip-js-site'};
const TYPES={'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
if(process.env.E2E_CHROMIUM)test.use({launchOptions:{executablePath:process.env.E2E_CHROMIUM,args:['--no-sandbox','--disable-gpu','--no-zygote']}});

async function routeLibraries(page){
  await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(pdfjs-dist|zxing-wasm|bwip-js)@/,async route=>{
    const m=/^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:pdfjs-dist|zxing-wasm|bwip-js)@[^/]+)\/([^?#]+)/.exec(route.request().url());
    const base=m&&LOCAL[m[1]];const file=base&&path.join(ROOT,base,m[2]);
    if(!file||!fs.existsSync(file))return route.fulfill({status:404,body:'not pinned locally: '+route.request().url()});
    return route.fulfill({status:200,body:fs.readFileSync(file),headers:{'content-type':TYPES[path.extname(file)]||'application/octet-stream','access-control-allow-origin':'*'}});
  });
}
async function openPanel(page){
  await routeLibraries(page);
  await page.goto(process.env.E2E_APP_PATH||'/');
  await page.getByRole('button',{name:'⚡ 快速分析',exact:true}).click();
  await page.waitForFunction(()=>window.LabelWorkbenchPdfCanonicalExport&&window.LabelWorkbenchPdfCanonical&&window.LabelWorkbenchBarcodeCore&&true,null,{timeout:60000});
}

test('vector PDF -> website canonical export equals Node core output',async({page})=>{
  test.setTimeout(240000);
  await openPanel(page);
  await page.locator('#analysisFiles').setInputFiles(path.join(ROOT,'tests/fixtures/vector-minimal.pdf'));
  const button=page.getByRole('button',{name:'匯出 canonical JSON · vector-minimal.pdf'});
  await expect(button).toBeVisible();
  // Independent of RC2: the export host is separate and needs no BTW production output.
  await expect(page.locator('#pdfCanonicalExport')).toHaveCount(1);
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:180000}),button.click()]);
  expect(download.suggestedFilename()).toBe('vector-minimal.canonical.json');
  const site=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  await expect(page.locator('.pdf-canonical-status').first()).toHaveAttribute('data-status','complete');
  const report=JSON.parse(await page.locator('.pdf-canonical-report').first().textContent());
  fs.mkdirSync(path.join(ROOT,'artifacts/browser'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'artifacts/browser/site-vector-minimal.canonical.json'),JSON.stringify(site,null,2)+'\n');
  fs.writeFileSync(path.join(ROOT,'artifacts/browser/site-vector-minimal.report.json'),JSON.stringify(report,null,2)+'\n');
  const committed=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/vector-minimal.canonical.json'),'utf8'));
  const {pdfToCanonical}=require('../../tools/pdf-to-canonical.cjs');
  const node=(await pdfToCanonical(path.join(ROOT,'tests/fixtures/vector-minimal.pdf'))).canonical;
  expect(node).toEqual(committed);
  // Parity contract (declared, for ChatGPT review): every field identical except
  // text ink xMm/yMm, which come from a 600 dpi raster rendered by two Skia
  // backends (Chromium vs @napi-rs/canvas) and may differ by one pixel at an
  // antialiased edge. Barcodes, fonts, sizes, text, frames and modules are exact.
  const PX=25.4/600+1e-4;
  expect(site.objects.map(o=>o.id)).toEqual(node.objects.map(o=>o.id));
  const strip=o=>o.type==='text'?{...o,xMm:0,yMm:0}:o;
  expect({...site,objects:site.objects.map(strip)}).toEqual({...node,objects:node.objects.map(strip)});
  site.objects.forEach((o,i)=>{if(o.type==='text'){expect(Math.abs(o.xMm-node.objects[i].xMm)).toBeLessThanOrEqual(PX);expect(Math.abs(o.yMm-node.objects[i].yMm)).toBeLessThanOrEqual(PX);}});
  // The website output must also satisfy the independent truth on its own.
  const exp=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/vector-minimal.expected.json'),'utf8'));
  for(const t of exp.texts){const o=site.objects.find(x=>x.type==='text'&&x.text===t.text&&Math.abs(x.yMm-t.expectedInk.inkTopMm)<1);
    expect(o).toBeTruthy();expect(Math.abs(o.xMm-t.expectedInk.inkLeftMm)).toBeLessThanOrEqual(exp.tolerances.textInkMm);expect(Math.abs(o.yMm-t.expectedInk.inkTopMm)).toBeLessThanOrEqual(exp.tolerances.textInkMm);}
});

test('unsupported PDF content is rejected on the website without a canonical download',async({page})=>{
  test.setTimeout(240000);
  await openPanel(page);
  await page.locator('#analysisFiles').setInputFiles([path.join(ROOT,'tests/fixtures/generic-qr.pdf'),path.join(ROOT,'tests/fixtures/vector-unsupported-graphics.pdf')]);
  const downloads=[];page.on('download',d=>downloads.push(d));
  for(const [name,code] of [['generic-qr.pdf','UNSUPPORTED_SYMBOLOGY'],['vector-unsupported-graphics.pdf','UNSUPPORTED_STROKE']]){
    const row=page.locator('.pdf-canonical-row').filter({has:page.getByRole('button',{name:'匯出 canonical JSON · '+name})});
    await row.getByRole('button').click();
    await expect(row.locator('.pdf-canonical-status')).toHaveAttribute('data-status','rejected',{timeout:180000});
    await expect(row.locator('.pdf-canonical-status')).toContainText(code);
    const report=JSON.parse(await row.locator('.pdf-canonical-report').textContent());
    expect(report.status).toBe('REJECTED');expect(report.objects).toEqual([]);
  }
  expect(downloads).toHaveLength(0);
});
