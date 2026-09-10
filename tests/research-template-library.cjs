const pages=[
  'https://www.bartendersoftware.com/resources/library/cea-label-code-128',
  'https://www.bartendersoftware.com/resources/library/cea-label'
];
const assets=[
  'https://www.bartendersoftware.com/dist/scripts.min.js?b=2ca5272896862c1d2e2daf3f439c2a1a8821344d',
  'https://www.bartendersoftware.com/cpresources/4684547d/js/scripts/front-end/plugin/freeform.js?v=1788206909'
];
function uniq(a){return[...new Set(a)]}
function snippets(text,needle,radius=1200,max=30){const out=[];let p=0;while((p=text.toLowerCase().indexOf(needle.toLowerCase(),p))>=0&&out.length<max){out.push(text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)));p+=needle.length}return out}
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.2'}});return{r,text:await r.text()}}
(async()=>{
  for(const url of pages){
    const {r,text:html}=await get(url);console.log('\n=== PAGE',url,'status',r.status,'bytes',html.length,'===');
    const form=[...html.matchAll(/<form[^>]*data-download\s*=\s*["']?(\d+)["']?[^>]*>/gi)].map(m=>({id:m[1],html:m[0]}));console.log('DOWNLOAD_FORMS',JSON.stringify(form));
    const attrs=uniq([...html.matchAll(/(?:href|src|action|data-[\w:-]+|value)=["']([^"']+)["']/gi)].map(m=>m[0]));
    attrs.filter(x=>/btw|download|file|asset|resource|template|marketo|form|redirect|success|entry|cea/i.test(x)).slice(0,250).forEach(x=>console.log('ATTR',x));
  }
  for(const url of assets){
    const {r,text}=await get(url);console.log('\n=== ASSET',url,'status',r.status,'bytes',text.length,'===');
    for(const needle of ['data-download','dataset.download','download]','MktoForms2','onSuccess','fetch(','XMLHttpRequest','/actions/','/api/','downloadUrl','resourceDownload','79797','79796']){
      snippets(text,needle).forEach((s,i)=>console.log(`SNIP ${needle} #${i+1}`,JSON.stringify(s)));
    }
    const paths=uniq([...text.matchAll(/["'`](\/?[A-Za-z0-9_./?=&:%-]{4,220})["'`]/g)].map(m=>m[1])).filter(x=>/download|resource|asset|template|action|api/i.test(x));
    paths.slice(0,300).forEach(x=>console.log('PATH',x));
  }
})().catch(e=>{console.error(e);process.exit(1)});
