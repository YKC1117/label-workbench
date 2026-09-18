const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}
let calls=0;
const good=[
  '\r\nBar Tender Format File\r\n',
  'Application: Version=2022 R5; Build=197999; Edition=Enterprise; OS=Windows 10\r\n',
  'Document: CompatibleVersion=2022; ArchiveVersion=12345\r\n',
  '<Metadata><Application>BarTender 2022 R5</Application></Metadata>'
].join('');

async function fakeFetch(){
  calls++;
  if(calls<3)return new Response('temporary upstream failure',{status:502});
  return new Response(good,{status:200,headers:{'x-label-workbench-seed':'CEA-2022-R5'}});
}
const instantTimeout=fn=>{fn();return 1};
const c={
  console,Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Blob,Response,URL,
  fetch:fakeFetch,setTimeout:instantTimeout,clearTimeout(){},Promise,Date,Math,
  document:{readyState:'loading',addEventListener(){},createElement(){return{}},body:{appendChild(){}},head:{appendChild(){}}},
  window:null,globalThis:null
};
c.window=c;c.globalThis=c;
c.LABEL_WORKBENCH_CLOUD={url:'https://example.supabase.co',key:'sb_publishable_test'};
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/btw-native.js','utf8'),c,{filename:'btw-native.js'});

(async()=>{
  const N=c.LabelWorkbenchBtwNative;
  const bytes=await N.fetchSeed();
  assert(calls===3,`seed retry count mismatch: ${calls}`);
  assert(bytes.byteLength>100,'seed bytes missing after retry recovery');
  await N.fetchSeed();
  assert(calls===3,'successful seed should be memoized after retry recovery');
  console.log('PASS: browser BTW seed fetch recovers from two transient 502 responses and caches the successful seed');
})().catch(err=>{console.error(err);process.exit(1)});
