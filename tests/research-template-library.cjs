const urls=[
  'https://www.bartendersoftware.com/resources/library/cea-label-code-128',
  'https://www.bartendersoftware.com/resources/library/cea-label'
];

function uniq(a){return[...new Set(a)]}
(async()=>{
  for(const url of urls){
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchResearch/1.0'}});
    console.log('\n===',url,'status',r.status,'final',r.url,'===');
    const html=await r.text();
    console.log('bytes',html.length);
    const abs=uniq([...html.matchAll(/https?:\\?\/\\?\/[^"'<>\\s)]+/g)].map(m=>m[0].replace(/\\\//g,'/')));
    const href=uniq([...html.matchAll(/(?:href|src|action)=["']([^"']+)["']/gi)].map(m=>m[1]));
    const interesting=uniq([...abs,...href]).filter(x=>/btw|download|resource|template|api|hubspot|marketo|form/i.test(x));
    interesting.slice(0,250).forEach(x=>console.log('URL',x));
    for(const needle of ['.btw','CEA_Label','Code-128','download','form','resource-library']){
      const p=html.toLowerCase().indexOf(needle.toLowerCase());
      if(p>=0)console.log('SNIP',needle,JSON.stringify(html.slice(Math.max(0,p-500),Math.min(html.length,p+1000))));
    }
  }
})().catch(e=>{console.error(e);process.exit(1)});
