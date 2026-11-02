const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compare,locate,assess}=require('./compare-render.cjs');
function bmp(rows){
 const h=rows.length,w=rows[0].length,stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+h*stride);
 b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);
 b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
 rows.forEach((row,y)=>row.forEach((v,x)=>{const k=54+(h-1-y)*stride+x*3;b.fill(v?0:255,k,k+3);}));
 return b;
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lw-render-'));
try{
 const logo=[[1,0,1],[1,1,0]], page=Array.from({length:12},()=>Array(20).fill(0));
 for(let i=0;i<2;i++)page[i+4].splice(8,3,...logo[i]);
 fs.writeFileSync(path.join(dir,'native-format-preview.bmp'),bmp(page));
 fs.writeFileSync(path.join(dir,'visual-OBJ_1.bmp'),bmp(logo));
 const ev={requestedDpi:25.4,objects:[{id:'OBJ_1',rotationDeg:0,raster:{inkTopPx:0,inkLeftPx:0,inkWidthPx:3,inkHeightPx:2}}]};
 const plan={widthMm:20,heightMm:12,objects:[{id:'OBJ_1',xMm:5,yMm:2,widthMm:4,heightMm:2}]};
 assert.deepEqual(compare(dir,ev,plan)[0].delta,{dx:3,dy:2,dw:-1,dh:0});
 assert.equal(compare(dir,ev,{...plan,widthMm:40})[0].status,'UNRESOLVED');
 // Expected span encloses the observed ink (quiet zone / font margins).
 const request=(x,y,w,h)=>({...plan,objects:[{...plan.objects[0],sourceBox:{x:x/20,y:y/12,w:w/20,h:h/12}}]});
 const nested=compare(dir,ev,request(5,2,10,7));
 assert.equal(nested[0].metrics.dw.policy,'DIAGNOSTIC_ONLY');
 assert.equal(nested[0].metrics.placementX.policy,'COMPARABLE');
 assert.equal(assess(nested),'WITHIN_PLACEMENT_ENVELOPES');
 const displaced=compare(dir,ev,request(5,2,3,2));
 assert.equal(displaced[0].metrics.placementX.value,3);
 assert.equal(displaced[0].metrics.placementY.value,2);
 assert.equal(assess(displaced),'OUTSIDE_TOLERANCE');
 assert.equal(assess(compare(dir,ev,plan)),'PLACEMENT_NOT_COMPARABLE');
 assert.equal(assess(compare(dir,ev,{...plan,widthMm:40})),'UNRESOLVED');
 for(let i=0;i<2;i++)page[i+8].splice(1,3,...logo[i]);
 assert.equal(locate(page.map(r=>Buffer.from(r)),logo.map(r=>Buffer.from(r))),null);
 console.log('PASS: absolute placement, displacement and size residuals, wrong page scale, duplicate bitmap');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
