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


async function discoverByLibraryPages(){
  const indexUrl='https://www.bartendersoftware.com/resources/library/template-library';
  const html=await (await fetch(indexUrl,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchLibraryCatalogProbe/1.0'}})).text();
  const hrefs=[...new Set([...html.matchAll(/href=["']([^"']*\/resources\/library\/[^"'?#]+)[^"']*["']/gi)]
    .map(m=>new URL(m[1],indexUrl).href)
    .filter(u=>!/\/template-library\/?$/i.test(u)))];
  console.log('CATALOG_LINK_COUNT',hrefs.length);

  const targets=[];
  let cursor=0;
  async function worker(){
    while(cursor<hrefs.length){
      const i=cursor++,url=hrefs[i];
      try{
        const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchLibraryCatalogProbe/1.0'}});
        const page=await r.text();
        const plain=page.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
        const hitEan=/\bEAN[\s\-_]?8\b/i.test(plain),hitUpce=/\bUPC[\s\-_]?E\b/i.test(plain);
        if(!hitEan&&!hitUpce)continue;
        const ids=[...new Set([
          ...[...page.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]),
          ...[...page.matchAll(/(?:resourceId|resource_id|resource-id)[^0-9]{0,30}(\d{4,8})/gi)].map(m=>m[1])
        ])];
        const title=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||'';
        const row={url,title,ean8:hitEan,upce:hitUpce,ids};
        console.log('CATALOG_TARGET',JSON.stringify(row));
        targets.push(row);
      }catch(e){console.log('CATALOG_PAGE_FAIL',url,String(e?.message||e))}
    }
  }
  await Promise.all(Array.from({length:10},worker));
  console.log('CATALOG_TARGETS',JSON.stringify(targets,null,2));
}
discoverByLibraryPages().catch(e=>{console.error('CATALOG_DISCOVERY_FAIL',e);process.exitCode=1});


async function inspectPagination(){
  const base='https://www.bartendersoftware.com/resources/library/template-library';
  const html=await (await fetch(base,{headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchPaginationProbe/1.0'}})).text();
  const links=[...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({
    href:new URL(m[1],base).href,
    text:m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
  }));
  const pagers=links.filter(x=>/[?&](?:page|p|offset|start)=\d+/i.test(x.href)||/next|previous|older|newer|more|\d+/i.test(x.text)&&/template-library/i.test(x.href));
  console.log('PAGINATION_LINKS',JSON.stringify(pagers.slice(0,100),null,2));

  for(const needle of ['pagination','paginate','pageInfo','currentPage','totalPages','load-more','loadMore','data-page','data-url','data-endpoint','hx-get']){
    const hits=around(html,needle,800);
    if(hits.length)console.log('PAGINATION_AROUND',needle,JSON.stringify(hits.slice(0,12),null,2));
  }

  const forms=[...html.matchAll(/<form[^>]*action=["']([^"']*)["'][^>]*>([\s\S]*?)<\/form>/gi)].map(m=>({
    action:new URL(m[1]||base,base).href,
    snippet:m[2].replace(/\s+/g,' ').slice(0,1800)
  }));
  console.log('FORMS',JSON.stringify(forms.slice(0,30),null,2));
}
inspectPagination().catch(e=>{console.error('PAGINATION_PROBE_FAIL',e);process.exitCode=1});
