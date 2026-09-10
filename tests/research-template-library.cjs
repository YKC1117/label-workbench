const pages=[
  'https://www.bartendersoftware.com/resources/library/cea-label-code-128',
  'https://www.bartendersoftware.com/resources/library/cea-label'
];
const assets=[
  'https://www.bartendersoftware.com/dist/scripts.min.js?b=2ca5272896862c1d2e2daf3f439c2a1a8821344d'
];
function uniq(a){return[...new Set(a)]}
function snippets(text,needle,radius=900,max=12){const out=[];let p=0;while((p=text.toLowerCase().indexOf(needle.toLowerCase(),p))>=0&&out.length<max){out.push(text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)));p+=needle.length}return out}
async function getText(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.3'}});return{r,text:await r.text()}}
function sig(bytes){return Buffer.from(bytes.slice(0,80)).toString('latin1').replace(/[^ -~\r\n]/g,'.')}
(async()=>{
  const ids=[];
  for(const url of pages){
    const {r,text:html}=await getText(url);console.log('\n=== PAGE',url,'status',r.status,'bytes',html.length,'===');
    const forms=[...html.matchAll(/<form[^>]*data-download\s*=\s*["']?(\d+)["']?[^>]*>/gi)].map(m=>({id:m[1],html:m[0]}));console.log('DOWNLOAD_FORMS',JSON.stringify(forms));ids.push(...forms.map(x=>x.id));
  }
  for(const url of assets){
    const {r,text}=await getText(url);console.log('\n=== ASSET',url,'status',r.status,'bytes',text.length,'===');
    snippets(text,'/download-resource?resourceId=').forEach((s,i)=>console.log(`DOWNLOAD_JS #${i+1}`,JSON.stringify(s)));
  }
  for(const id of uniq(ids)){
    const url=`https://www.bartendersoftware.com/download-resource?resourceId=${id}`;
    const manual=await fetch(url,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.3'}});
    console.log('\nDOWNLOAD_MANUAL',id,'status',manual.status,'location',manual.headers.get('location'),'type',manual.headers.get('content-type'),'disposition',manual.headers.get('content-disposition'));
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.3'}}),ab=await r.arrayBuffer(),b=new Uint8Array(ab);
    console.log('DOWNLOAD_FINAL',id,'status',r.status,'url',r.url,'type',r.headers.get('content-type'),'disposition',r.headers.get('content-disposition'),'bytes',b.length,'sig',JSON.stringify(sig(b)),'btw',Buffer.from(b.slice(0,27)).toString('latin1').includes('Bar Tender Format File'));
  }
})().catch(e=>{console.error(e);process.exit(1)});
