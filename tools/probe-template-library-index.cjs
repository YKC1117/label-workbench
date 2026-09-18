const fs=require('fs');

const URLS=[
  'https://www.bartendersoftware.com/resources/library/template-library',
  'https://www.bartendersoftware.com/resources/library'
];

function uniq(a){return [...new Set(a)]}
function around(text,needle,span=500){
  const out=[];let p=0;
  while((p=text.toLowerCase().indexOf(needle.toLowerCase(),p))>=0&&out.length<20){
    out.push(text.slice(Math.max(0,p-span),Math.min(text.length,p+needle.length+span)));
    p+=needle.length;
  }
  return out;
}

(async()=>{
  for(const url of URLS){
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchTemplateIndexProbe/1.0'}});
    const html=await r.text();
    console.log('\n=== PAGE ===',url,'status',r.status,'chars',html.length,'final',r.url);

    const scripts=uniq([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]));
    const urls=uniq([
      ...[...html.matchAll(/https?:\\?\/\\?\/[^"'<>\\s]+/gi)].map(m=>m[0].replace(/\\\//g,'/')),
      ...[...html.matchAll(/(?:api|ajax|search|library|template)[^"'<>\\s]{0,180}/gi)].map(m=>m[0])
    ]);
    console.log('SCRIPTS',JSON.stringify(scripts.slice(0,100),null,2));
    console.log('URL_HINTS',JSON.stringify(urls.slice(0,150),null,2));

    for(const needle of ['resourceId','template-library','load more','search','filter','api/','graphql','algolia','elastic','EAN-8','UPC-E','Interleaved']){
      const hits=around(html,needle);
      if(hits.length)console.log('AROUND',needle,JSON.stringify(hits.slice(0,8),null,2));
    }

    for(const src of scripts){
      if(!/library|template|main|app|bundle|search/i.test(src))continue;
      try{
        const abs=new URL(src,r.url).href,js=await (await fetch(abs,{headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchTemplateIndexProbe/1.0'}})).text();
        console.log('\n=== SCRIPT ===',abs,'chars',js.length);
        for(const needle of ['resourceId','template-library','fetch(','axios','XMLHttpRequest','graphql','algolia','search','filter']){
          const hits=around(js,needle,700);
          if(hits.length)console.log('JS_AROUND',needle,JSON.stringify(hits.slice(0,6),null,2));
        }
      }catch(e){console.log('SCRIPT_FAIL',src,String(e?.message||e))}
    }
  }
})().catch(e=>{console.error(e);process.exit(1)});
