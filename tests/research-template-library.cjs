const urls=[
  'https://www.bartendersoftware.com/resources/library/cea-label-code-128',
  'https://www.bartendersoftware.com/resources/library/cea-label'
];
function uniq(a){return[...new Set(a)]}
function snippets(html,needle,radius=900,max=20){const out=[];let p=0;while((p=html.toLowerCase().indexOf(needle.toLowerCase(),p))>=0&&out.length<max){out.push(html.slice(Math.max(0,p-radius),Math.min(html.length,p+needle.length+radius)));p+=needle.length}return out}
(async()=>{
  for(const url of urls){
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.1'}}),html=await r.text();
    console.log('\n===',url,'status',r.status,'bytes',html.length,'===');
    const attrs=uniq([...html.matchAll(/(?:href|src|action|data-[\w:-]+|value)=["']([^"']+)["']/gi)].map(m=>m[0]));
    attrs.filter(x=>/btw|download|file|asset|resource|template|marketo|form|redirect|success|entry|4684547d|cea/i.test(x)).slice(0,500).forEach(x=>console.log('ATTR',x));
    for(const needle of ['MktoForms2','onSuccess','downloadUrl','download-url','fileUrl','file-url','redirect','formId','CEA_Label_Code_128','thanks','freeform','resourceDownload']){
      snippets(html,needle).forEach((s,i)=>console.log(`SNIP ${needle} #${i+1}`,JSON.stringify(s)));
    }
    const scripts=uniq([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]));
    console.log('SCRIPTS',JSON.stringify(scripts));
  }
})().catch(e=>{console.error(e);process.exit(1)});
