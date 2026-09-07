const STORAGE_KEY='labelWorkbench.cases.v1';
const DRAFT_KEY='labelWorkbench.draft.v1';
const statusLabels={new:'新案件',waiting:'待客戶確認',ready:'資料齊全',bartender:'待 BarTender',testing:'測試中',done:'完成'};
const meta={dashboard:['工作台','把 BarTender 前置工作先完成，回公司專心製作、測試與列印。'],cases:['案件','建立、整理與追蹤標籤案件。'],analysis:['快速分析','收到客戶檔案時先快速判斷格式與缺件。'],barcode:['條碼工具','常用條碼優先，實際編碼與顯示文字分開。'],bartender:['BarTender','公司端正式製作、測試與列印。']};
let editingId=null;
let selectedFiles=[];

function uid(){return 'LW-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function nowISO(){return new Date().toISOString()}
function esc(v=''){return String(v).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function loadCases(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return []}}
function saveCases(cases){localStorage.setItem(STORAGE_KEY,JSON.stringify(cases));renderAll()}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),1800)}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.getElementById('pageTitle').textContent=meta[id][0];document.getElementById('pageSub').textContent=meta[id][1];window.scrollTo({top:0,behavior:'smooth'})}

function classifyFiles(files){const groups={image:0,pdf:0,excel:0,word:0,csv:0,btw:0,other:0};files.forEach(f=>{const e=(f.name.split('.').pop()||'').toLowerCase();if(['jpg','jpeg','png','webp'].includes(e))groups.image++;else if(e==='pdf')groups.pdf++;else if(['xls','xlsx'].includes(e))groups.excel++;else if(['doc','docx'].includes(e))groups.word++;else if(e==='csv')groups.csv++;else if(e==='btw')groups.btw++;else groups.other++});return groups}
function fileMeta(files){return [...files].map(f=>({name:f.name,size:f.size,type:f.type||'',lastModified:f.lastModified||null,ext:(f.name.split('.').pop()||'').toLowerCase()}))}
function summarize(files,target){const arr=[...files];if(!arr.length){target.textContent='等待檔案';return}const groups=classifyFiles(arr);const types=Object.entries(groups).filter(([,n])=>n).map(([k,n])=>`${k.toUpperCase()} × ${n}`).join('｜');const names=arr.map(f=>esc(f.name)).join('、');target.innerHTML=`<b>${types}</b><br>${names}<br><br>下一步：確認 Label 尺寸、印表機型號 / DPI、變動欄位、條碼種類與實際編碼規則。`}

function getFormData(){return {
 customer:document.getElementById('customer').value.trim(),
 labelName:document.getElementById('labelName').value.trim(),
 status:document.getElementById('caseStatus').value,
 width:document.getElementById('labelWidth').value.trim(),
 height:document.getElementById('labelHeight').value.trim(),
 printerBrand:document.getElementById('printerBrand').value,
 printerModel:document.getElementById('printerModel').value.trim(),
 dpi:document.getElementById('dpi').value,
 printMethod:document.getElementById('printMethod').value,
 media:document.getElementById('media').value.trim(),
 dataSource:document.getElementById('dataSource').value,
 request:document.getElementById('request').value.trim(),
 notes:document.getElementById('notes').value.trim(),
 files:selectedFiles
}}
function validateCase(data){const missing=[];if(!data.customer)missing.push('客戶名稱');if(!data.labelName)missing.push('案件 / 標籤名稱');return missing}
function saveCase(){const data=getFormData();const missing=validateCase(data);if(missing.length){toast('請先填：'+missing.join('、'));return}const cases=loadCases();if(editingId){const i=cases.findIndex(c=>c.id===editingId);if(i>=0)cases[i]={...cases[i],...data,updatedAt:nowISO()};toast('案件已更新')}else{cases.unshift({id:uid(),...data,createdAt:nowISO(),updatedAt:nowISO()});toast('案件已建立')}saveCases(cases);resetForm();showView('cases')}
function resetForm(){editingId=null;selectedFiles=[];document.getElementById('caseForm').reset();document.getElementById('caseStatus').value='new';document.getElementById('printerBrand').value='';document.getElementById('dpi').value='';document.getElementById('printMethod').value='';document.getElementById('dataSource').value='';document.getElementById('fileList').textContent='尚未選擇檔案';document.getElementById('saveCaseBtn').textContent='儲存案件';document.getElementById('cancelEditBtn').classList.add('hidden')}
function editCase(id){const c=loadCases().find(x=>x.id===id);if(!c)return;editingId=id;document.getElementById('customer').value=c.customer||'';document.getElementById('labelName').value=c.labelName||'';document.getElementById('caseStatus').value=c.status||'new';document.getElementById('labelWidth').value=c.width||'';document.getElementById('labelHeight').value=c.height||'';document.getElementById('printerBrand').value=c.printerBrand||'';document.getElementById('printerModel').value=c.printerModel||'';document.getElementById('dpi').value=c.dpi||'';document.getElementById('printMethod').value=c.printMethod||'';document.getElementById('media').value=c.media||'';document.getElementById('dataSource').value=c.dataSource||'';document.getElementById('request').value=c.request||'';document.getElementById('notes').value=c.notes||'';selectedFiles=c.files||[];document.getElementById('fileList').innerHTML=selectedFiles.length?selectedFiles.map(f=>`<span class="file-chip">${esc(f.name)}</span>`).join(' '):'尚未選擇檔案';document.getElementById('saveCaseBtn').textContent='更新案件';document.getElementById('cancelEditBtn').classList.remove('hidden');showView('cases');document.getElementById('caseEditor').scrollIntoView({behavior:'smooth'})}
function cycleStatus(id){const order=['new','waiting','ready','bartender','testing','done'];const cases=loadCases();const i=cases.findIndex(c=>c.id===id);if(i<0)return;const current=cases[i].status||'new';cases[i].status=order[(order.indexOf(current)+1)%order.length];cases[i].updatedAt=nowISO();saveCases(cases);toast('狀態更新為：'+statusLabels[cases[i].status])}
function exportCase(id){const c=loadCases().find(x=>x.id===id);if(!c)return;const blob=new Blob([JSON.stringify({format:'label-workbench-case',version:1,case:c},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${safeName(c.customer+'_'+c.labelName)}.labelcase`;a.click();URL.revokeObjectURL(a.href);toast('案件檔已匯出')}
function safeName(s){return s.replace(/[\\/:*?"<>|]+/g,'_').slice(0,80)}
function importCaseFile(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(d.format!=='label-workbench-case'||!d.case)throw new Error();const c={...d.case,id:uid(),updatedAt:nowISO(),createdAt:d.case.createdAt||nowISO()};const cases=loadCases();cases.unshift(c);saveCases(cases);toast('案件匯入完成')}catch{toast('這不是有效的 .labelcase 案件檔')}};r.readAsText(file)}

function renderCounters(){const cases=loadCases();document.getElementById('caseCount').textContent=cases.filter(c=>c.status!=='done').length;document.getElementById('waitCount').textContent=cases.filter(c=>c.status==='waiting').length;document.getElementById('btCount').textContent=cases.filter(c=>c.status==='bartender').length}
function statusPill(status){return `<span class="pill ${esc(status)}">${esc(statusLabels[status]||statusLabels.new)}</span>`}
function displaySize(c){return c.width&&c.height?`${esc(c.width)} × ${esc(c.height)} mm`:'尺寸未填'}
function renderCases(){const box=document.getElementById('caseList');const q=(document.getElementById('caseSearch')?.value||'').trim().toLowerCase();const f=document.getElementById('caseFilter')?.value||'all';let cases=loadCases();if(q)cases=cases.filter(c=>[c.customer,c.labelName,c.printerModel,c.request].join(' ').toLowerCase().includes(q));if(f!=='all')cases=cases.filter(c=>c.status===f);if(!cases.length){box.innerHTML='<div class="empty">目前沒有符合條件的案件。<br>可以先建立第一筆標籤案件。</div>';return}box.innerHTML=cases.map(c=>`<article class="case-item"><div><div class="toolbar">${statusPill(c.status||'new')}<span class="pill">${esc(c.id)}</span></div><h4>${esc(c.customer)}｜${esc(c.labelName)}</h4><p>${displaySize(c)}　·　${esc(c.printerBrand||'印表機未填')} ${esc(c.printerModel||'')} ${c.dpi?`· ${esc(c.dpi)} dpi`:''}</p><p>${esc(c.request||'尚未填寫客戶需求')}</p>${c.files?.length?`<div class="file-chips">${c.files.slice(0,5).map(x=>`<span class="file-chip">${esc(x.name)}</span>`).join('')}${c.files.length>5?`<span class="file-chip">+${c.files.length-5}</span>`:''}</div>`:''}</div><div class="toolbar"><button class="btn ghost" onclick="editCase('${c.id}')">編輯</button><button class="btn ghost" onclick="cycleStatus('${c.id}')">下一狀態</button><button class="btn ghost" onclick="exportCase('${c.id}')">匯出</button></div></article>`).join('')}
function renderAll(){renderCounters();renderCases()}

function analyzeSelected(files){const arr=[...files];const out=document.getElementById('analysisResult');if(!arr.length){out.textContent='等待檔案';return}const groups=classifyFiles(arr);const found=[];if(groups.image)found.push(`圖片 × ${groups.image}`);if(groups.pdf)found.push(`PDF × ${groups.pdf}`);if(groups.excel)found.push(`Excel × ${groups.excel}`);if(groups.word)found.push(`Word × ${groups.word}`);if(groups.csv)found.push(`CSV × ${groups.csv}`);if(groups.btw)found.push(`BTW × ${groups.btw}`);if(groups.other)found.push(`其他 × ${groups.other}`);const checks=['Label 實際尺寸（寬 × 高）','印表機品牌 / 型號 / DPI','固定欄位與每張變動欄位','條碼種類','條碼實際編碼內容 / 規則'];if(groups.excel||groups.csv)checks.push('Excel / CSV 欄位與 BarTender 欄位對應');if(groups.btw)checks.push('BTW 需回公司用 BarTender 正式開啟確認物件與資料來源');out.innerHTML=`<b>已收到：${found.join('｜')}</b><div class="case-detail"><b>製作前檢查：</b><br>${checks.map(x=>'• '+esc(x)).join('<br>')}</div>`}

function init(){document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));document.getElementById('caseFiles').addEventListener('change',e=>{selectedFiles=fileMeta(e.target.files);document.getElementById('fileList').innerHTML=selectedFiles.length?selectedFiles.map(f=>`<span class="file-chip">${esc(f.name)}</span>`).join(' '):'尚未選擇檔案'});document.getElementById('analysisFiles').addEventListener('change',e=>analyzeSelected(e.target.files));document.getElementById('saveCaseBtn').addEventListener('click',saveCase);document.getElementById('cancelEditBtn').addEventListener('click',resetForm);document.getElementById('caseSearch').addEventListener('input',renderCases);document.getElementById('caseFilter').addEventListener('change',renderCases);document.getElementById('importCase').addEventListener('change',e=>{if(e.target.files[0])importCaseFile(e.target.files[0]);e.target.value=''});renderAll()}
document.addEventListener('DOMContentLoaded',init);
