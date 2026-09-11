/* Label Workbench BTW object decoder/editor v0.1
 * Interoperability-focused reverse engineering for BarTender .btw files.
 * Uses the same public-domain layout observations as Elias Oenal's Barmaid:
 * prefix + preview PNG blobs + zlib serialized container + FF FE FF UTF-16 strings.
 * Customer files stay in the browser. This module does not bypass BarTender licensing.
 */
(function(){
  'use strict';
  const BUILD='20260911-btw-object-map-010';
  const ROOT='Root.MasterSelectedObject.';
  const FONT_MARKER=new Uint8Array([0x03,0x02,0x01,0x22]);
  const PLACEHOLDER='(???) ???-????';

  const u8=v=>v instanceof Uint8Array?v:new Uint8Array(v);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function readI32(data,offset){return new DataView(data.buffer,data.byteOffset,data.byteLength).getInt32(offset,true)}
  function writeI32(data,offset,value){new DataView(data.buffer,data.byteOffset,data.byteLength).setInt32(offset,Math.trunc(value),true)}
  function readF32(data,offset){return new DataView(data.buffer,data.byteOffset,data.byteLength).getFloat32(offset,true)}
  function writeF32(data,offset,value){new DataView(data.buffer,data.byteOffset,data.byteLength).setFloat32(offset,Number(value),true)}
  function findBytes(data,needle,start=0,end=data.length){outer:for(let i=Math.max(0,start);i<=Math.min(end,data.length)-needle.length;i++){for(let j=0;j<needle.length;j++)if(data[i+j]!==needle[j])continue outer;return i}return-1}
  function milToMm(v){return Number.isFinite(v)?Math.round(v*0.0254*100)/100:null}
  function mmToMil(v){return Math.round(Number(v)/0.0254)}

  function fontInfo(data,start,end){
    const marker=findBytes(data,FONT_MARKER,start,end);if(marker<0)return null;
    const nameStart=marker+FONT_MARKER.length,chars=[];
    for(let i=0;i<32&&nameStart+i*2+1<end;i++){
      const code=data[nameStart+i*2]|(data[nameStart+i*2+1]<<8);if(!code)break;
      if(code<0x20)break;chars.push(String.fromCharCode(code));
    }
    const name=chars.join('').trim();if(!name)return null;
    const sizeOffset=nameStart+64;let size=null;
    if(sizeOffset+4<=end){const n=readF32(data,sizeOffset);if(Number.isFinite(n)&&n>=1&&n<=200)size=Math.round(n*1000)/1000}
    return{name,size,sizeOffset:size==null?null:sizeOffset,markerOffset:marker};
  }

  function kindFor(root,name){
    if(/Line Options/i.test(root)||/^線條\s*\d*/.test(name))return'line';
    if(/\.Border$/i.test(root))return'border';
    if(/\.Barcode$/i.test(root)||/^條碼\s*\d*/.test(name))return'barcode';
    if(/DataSourceGeneral\.DataSource/i.test(root)||/^文字\s*\d*/.test(name))return'text';
    return'object';
  }
  function primaryValueEntry(strings,kind){
    if(kind!=='text')return null;
    let hit=null;
    for(let i=0;i<strings.length-1;i++){
      if(strings[i].text!==PLACEHOLDER)continue;
      const n=strings[i+1];
      if(!n?.text||/^(?:Box Options|DataSource|Text 1|文字範例)$/i.test(n.text))continue;
      hit=n;
    }
    return hit;
  }
  function barcodeComponents(strings){
    const out=[];
    for(let i=0;i<strings.length-1;i++){
      if(strings[i].text!==PLACEHOLDER)continue;
      const v=String(strings[i+1]?.text||'').trim();
      if(!v||/^(?:文字範例|Box Options|DataSource|Text 1)$/i.test(v))continue;
      out.push(v);
    }
    return out;
  }

  function mapContainer(container){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.scanUtf16Strings)throw new Error('BTW 格式解析器尚未載入');
    const data=u8(container),entries=F.scanUtf16Strings(data,{minLength:1,maxLength:10000}),roots=entries.filter(e=>String(e.text||'').startsWith(ROOT));
    const objects=[];
    for(let i=0;i<roots.length;i++){
      const root=roots[i],recordStart=Math.max(0,root.offset-20),recordEnd=i+1<roots.length?Math.max(recordStart,roots[i+1].offset-20):data.length;
      const strings=entries.filter(e=>e.offset>=root.offset&&e.offset<recordEnd),nameEntry=strings.find((e,j)=>j>0&&e.text&&!String(e.text).startsWith(ROOT))||null,name=String(nameEntry?.text||'');
      let x=null,y=null;if(recordStart+8<=data.length){const a=readI32(data,recordStart),b=readI32(data,recordStart+4);if(Math.abs(a)<1000000&&Math.abs(b)<1000000){x=a;y=b}}
      const rootPath=String(root.text||''),kind=kindFor(rootPath,name),valueEntry=primaryValueEntry(strings,kind),font=fontInfo(data,recordStart,recordEnd),components=kind==='barcode'?barcodeComponents(strings):[];
      objects.push({id:`obj-${i+1}`,index:i,kind,name,rootPath,recordStart,recordEnd,rootOffset:root.offset,xMil:x,yMil:y,xMm:milToMm(x),yMm:milToMm(y),value:valueEntry?.text||'',valueEntry:valueEntry?{offset:valueEntry.offset,end:valueEntry.end,headerLength:valueEntry.headerLength,charLength:valueEntry.charLength,text:valueEntry.text}:null,fontName:font?.name||'',fontSize:font?.size??null,fontSizeOffset:font?.sizeOffset??null,components,stringsCount:strings.length});
    }
    const byName=new Map(objects.filter(o=>o.name).map(o=>[o.name,o]));
    for(const o of objects){if(o.kind!=='barcode')continue;o.resolvedComponents=o.components.map(part=>{const ref=byName.get(part);return ref?{type:'object',ref:part,value:ref.value||''}:{type:'literal',value:part}});o.resolvedPreview=o.resolvedComponents.map(x=>x.value).join('')}
    return{BUILD,byteLength:data.length,strings:entries.length,objects};
  }

  function resolveObject(map,edit){
    if(Number.isInteger(edit?.index))return map.objects.find(o=>o.index===edit.index)||null;
    if(edit?.id)return map.objects.find(o=>o.id===edit.id)||null;
    if(edit?.name)return map.objects.find(o=>o.name===edit.name)||null;
    if(edit?.valueMatch)return map.objects.find(o=>o.value===edit.valueMatch)||null;
    return null;
  }

  function editContainer(container,edits){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.replaceStringAt)throw new Error('BTW 字串寫回元件尚未載入');
    let out=u8(container).slice(),map=mapContainer(out),jobs=(edits||[]).map(edit=>({edit,obj:resolveObject(map,edit)}));
    for(const j of jobs)if(!j.obj)throw new Error(`找不到 BTW 物件：${j.edit?.name||j.edit?.id||j.edit?.index??'未指定'}`);
    jobs.sort((a,b)=>b.obj.recordStart-a.obj.recordStart);
    for(const {edit,obj} of jobs){
      if(edit.xMil!=null||edit.xMm!=null){const v=edit.xMil!=null?Number(edit.xMil):mmToMil(edit.xMm);writeI32(out,obj.recordStart,v)}
      if(edit.yMil!=null||edit.yMm!=null){const v=edit.yMil!=null?Number(edit.yMil):mmToMil(edit.yMm);writeI32(out,obj.recordStart+4,v)}
      if(edit.fontSize!=null){if(obj.fontSizeOffset==null)throw new Error(`${obj.name||obj.id} 尚未定位可安全寫入的字級欄位`);writeF32(out,obj.fontSizeOffset,Number(edit.fontSize))}
      if(Object.prototype.hasOwnProperty.call(edit,'value')){if(!obj.valueEntry)throw new Error(`${obj.name||obj.id} 尚未定位可安全寫入的文字值`);out=F.replaceStringAt(out,obj.valueEntry,String(edit.value??''))}
    }
    return out;
  }

  async function decodeBtw(buffer){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.parseStructure||!F?.inflateContainer)throw new Error('BTW 格式解析器尚未載入');
    const parsed=F.parseStructure(buffer),container=await F.inflateContainer(parsed),map=mapContainer(container);return{parsed,container,map};
  }
  async function rebuildBtw(buffer,edits){
    const F=window.LabelWorkbenchBtwFormat;if(!F?.rebuild)throw new Error('BTW 重建元件尚未載入');
    const decoded=await decodeBtw(buffer),edited=editContainer(decoded.container,edits),bytes=await F.rebuild(decoded.parsed,edited),verify=await decodeBtw(bytes);return{bytes,objects:verify.map.objects,header:verify.parsed.header};
  }

  function objectSummary(o){
    if(o.kind==='barcode'){
      const parts=(o.resolvedComponents||[]).map(x=>x.type==='object'?`${x.ref} → ${x.value||'（空）'}`:x.value).filter(Boolean);
      return parts.length?parts.join(' ｜ '):(o.value||'尚未解出資料組成');
    }
    return o.value||'—';
  }
  function renderDecoded(file,decoded){
    const h=decoded.parsed.header||{},objects=decoded.map.objects,counts={};for(const o of objects)counts[o.kind]=(counts[o.kind]||0)+1;
    const chips=Object.entries(counts).map(([k,n])=>`<span class="file-chip">${esc(k)} ${n}</span>`).join('');
    const size=/<TemplateSize>([^<]+)<\/TemplateSize>/i.exec(h.text||'')?.[1]||'';
    const rows=objects.slice(0,100).map(o=>`<tr><td>${esc(o.kind)}</td><td>${esc(o.name||o.id)}</td><td>${o.xMm==null?'—':`${o.xMm} / ${o.yMm} mm`}</td><td>${esc(objectSummary(o))}</td><td>${esc(o.fontName||'—')}${o.fontSize!=null?` ${o.fontSize} pt`:''}</td></tr>`).join('');
    return `<div class="analysis-block lw-btw-decoded"><div class="section-title"><b>BTW 原生物件解析：${esc(file.name)}</b><span class="pill">${objects.length} 個物件</span></div><div class="file-chips"><span class="file-chip">${esc(h.applicationVersion||'BarTender')}</span>${h.compatibleVersion?`<span class="file-chip">相容 ${esc(h.compatibleVersion)}</span>`:''}${size?`<span class="file-chip">${esc(size)}</span>`:''}${chips}</div><div class="note"><b>已直接讀取 BTW：</b>以下位置、文字、字型/字級與條碼資料關聯來自檔案內的原生 serialized container，不是 OCR。條碼 symbology、尺寸與部分特殊物件仍持續逆向，不確定的欄位不會硬猜。</div><div class="table-scroll"><table class="analysis-table"><thead><tr><th>類型</th><th>物件</th><th>X / Y</th><th>內容 / 資料組成</th><th>字型</th></tr></thead><tbody>${rows}</tbody></table></div>${objects.length>100?'<div class="footer-note">物件超過 100 個，畫面先顯示前 100 個。</div>':''}</div>`;
  }

  async function waitBaseAnalysis(out,timeout=120000){
    const start=Date.now();while(Date.now()-start<timeout){const text=out?.textContent||'';if(!out?.querySelector('.scan-working')&&!/持續解析中|本機解析中/.test(text))return;await new Promise(r=>setTimeout(r,120))}
  }
  async function analyzeBtwFiles(files){
    const list=[...(files||[])].filter(f=>/\.btw$/i.test(f.name)).slice(0,4);if(!list.length)return;
    const out=document.getElementById('analysisResult');if(!out)return;
    const results=await Promise.all(list.map(async file=>{try{return{file,decoded:await decodeBtw(await file.arrayBuffer())}}catch(error){return{file,error}}}));
    await waitBaseAnalysis(out);
    [...out.querySelectorAll('.analysis-block')].forEach(n=>{const t=n.textContent||'';if(/BarTender \.btw/i.test(t)&&/不會在外部瀏覽器假裝解析|正式內容仍回公司/.test(t))n.remove()});
    out.querySelectorAll('.lw-btw-decoded,.lw-btw-error').forEach(n=>n.remove());
    for(const r of results){if(r.decoded)out.insertAdjacentHTML('beforeend',renderDecoded(r.file,r.decoded));else out.insertAdjacentHTML('beforeend',`<div class="analysis-block lw-btw-error"><b>BTW：${esc(r.file.name)}</b><div class="note warn-note">原生物件解析失敗：${esc(r.error?.message||r.error)}</div></div>`)}
  }
  function bindAnalysis(){
    const input=document.getElementById('analysisFiles');if(!input||input.dataset.lwBtwObjectMap)return;input.dataset.lwBtwObjectMap='1';input.addEventListener('change',e=>{analyzeBtwFiles(e.target.files).catch(err=>console.warn('[Label Workbench] BTW object analysis failed',err))})
  }
  function init(){bindAnalysis();let tries=0;const t=setInterval(()=>{bindAnalysis();if(document.getElementById('analysisFiles')||tries++>80)clearInterval(t)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

  window.LabelWorkbenchBtwObjectMap={BUILD,mapContainer,editContainer,decodeBtw,rebuildBtw,milToMm,mmToMil,renderDecoded,analyzeBtwFiles};
  console.info('[Label Workbench] BTW object map',BUILD);
})();