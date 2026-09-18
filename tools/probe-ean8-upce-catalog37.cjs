const BASE='https://www.bartendersoftware.com';
const pages=[
  BASE+'/resources/index/templates/all/template-library',
  ...Array.from({length:36},(_,i)=>BASE+'/resources/index/templates/all/p'+(i+2))
];

function clean(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function uniq(a){return [...new Set(a)]}

(async()=>{
  const hits=[];
  for(let i=0;i<pages.length;i+=8){
    const rows=await Promise.all(pages.slice(i,i+8).map(async(url)=>{
      try{
        const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchCatalog37/1.0'}});
        const html=await r.text();
        return{url,status:r.status,html}
      }catch(e){return{url,error:String(e?.message||e),html:''}}
    }));
    for(const row of rows){
      if(!row.html)continue;
      const plain=clean(row.html);
      const hasEan=/\bEAN[\s\-_]?8\b/i.test(plain),hasUpce=/\bUPC[\s\-_]?E\b/i.test(plain);
      console.log('CATALOG_PAGE',row.url,'chars',row.html.length,'ean8',hasEan,'upce',hasUpce);
      if(!hasEan&&!hasUpce)continue;

      const cards=[...row.html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map(m=>m[0]);
      for(const card of cards){
        const text=clean(card),ean8=/\bEAN[\s\-_]?8\b/i.test(text),upce=/\bUPC[\s\-_]?E\b/i.test(text);
        if(!ean8&&!upce)continue;
        const hrefs=uniq([...card.matchAll(/href=["']([^"']+)["']/gi)].map(m=>new URL(m[1],row.url).href)).filter(u=>/\/resources\/library\//i.test(u));
        const item={page:row.url,ean8,upce,text:text.slice(0,1200),hrefs};
        console.log('CATALOG_CARD_TARGET',JSON.stringify(item));
        hits.push(item);
      }
      if(!cards.length){
        for(const needle of ['EAN-8','EAN 8','EAN_8','UPC-E','UPC E','UPC_E']){
          let p=0;
          while((p=row.html.toUpperCase().indexOf(needle.toUpperCase(),p))>=0){
            const chunk=row.html.slice(Math.max(0,p-1800),Math.min(row.html.length,p+1800));
            const hrefs=uniq([...chunk.matchAll(/href=["']([^"']+)["']/gi)].map(m=>new URL(m[1],row.url).href)).filter(u=>/\/resources\/library\//i.test(u));
            console.log('CATALOG_RAW_TARGET',JSON.stringify({page:row.url,needle,hrefs,text:clean(chunk).slice(0,1400)}));
            p+=needle.length;
          }
        }
      }
    }
  }
  console.log('CATALOG_37_TARGETS',JSON.stringify(hits,null,2));
})().catch(e=>{console.error(e);process.exit(1)});


async function searchCatalogTerms(){
  const terms=['EAN-8','EAN8','UPC-E','UPCE','UPC E'];
  for(const term of terms){
    const url='https://www.bartendersoftware.com/resources/index/templates/all?terms='+encodeURIComponent(term);
    try{
      const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchCatalogSearch/1.0'}});
      const html=await r.text();
      const plain=clean(html);
      const hrefs=uniq([...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>new URL(m[1],url).href))
        .filter(u=>/\/resources\/library\//i.test(u)&&!/template-library/i.test(u));
      const count=(/([0-9]+)\s+results?/i.exec(plain)||[])[1]||'';
      console.log('CATALOG_SEARCH',JSON.stringify({term,status:r.status,chars:html.length,resultCountText:count,hrefs:hrefs.slice(0,100),containsTerm:plain.toUpperCase().includes(term.toUpperCase())}));
      for(const href of hrefs.slice(0,40)){
        try{
          const page=await (await fetch(href,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 LabelWorkbenchCatalogSearch/1.0'}})).text();
          const text=clean(page);
          const ids=[...new Set([
            ...[...page.matchAll(/download-resource\?resourceId=(\d{4,8})/gi)].map(m=>m[1]),
            ...[...page.matchAll(/(?:resourceId|resource_id|resource-id)[^0-9]{0,30}(\d{4,8})/gi)].map(m=>m[1])
          ])];
          console.log('CATALOG_SEARCH_DETAIL',JSON.stringify({term,href,title:(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||'',ids,text:text.slice(0,900)}));
        }catch(e){console.log('CATALOG_SEARCH_DETAIL_FAIL',term,href,String(e?.message||e))}
      }
    }catch(e){console.log('CATALOG_SEARCH_FAIL',term,String(e?.message||e))}
  }
}
searchCatalogTerms().catch(e=>{console.error('CATALOG_SEARCH_FATAL',e);process.exitCode=1});
