const fs=require('fs');
const vm=require('vm');

function assert(cond,msg){if(!cond)throw new Error(msg)}

const elements=new Map();
const toasts=[];
const downloads=[];
let objectUrlSeq=0;

class MockEl{
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();
    this.id='';
    this.className='';
    this.textContent='';
    this.innerHTML='';
    this.dataset={};
    this.disabled=false;
    this.children=[];
    this.parentElement=null;
    this.listeners={};
    this.download='';
    this.href='';
  }
  setAttribute(name,value){this[name]=value}
  addEventListener(type,fn){this.listeners[type]=fn}
  async click(){
    if(this.tagName==='A'){
      downloads.push({name:this.download,href:this.href});
      return;
    }
    return this.listeners.click?.({target:this,currentTarget:this});
  }
  remove(){
    if(this.id)elements.delete(this.id);
    if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);
  }
  appendChild(child){child.parentElement=this;this.children.push(child);if(child.id)elements.set(child.id,child);return child}
  insertBefore(child,before){
    child.parentElement=this;
    const i=before?this.children.indexOf(before):-1;
    if(i>=0)this.children.splice(i,0,child);else this.children.push(child);
    if(child.id)elements.set(child.id,child);
    return child;
  }
  insertAdjacentElement(_pos,child){
    const root=this.parentElement;
    if(root)root.appendChild(child);
    else this.appendChild(child);
    return child;
  }
  querySelector(sel){
    if(sel==='.analysis-actions')return this.children.find(x=>String(x.className).split(/\s+/).includes('analysis-actions'))||null;
    if(sel==='[data-bt-native-hint]')return this.children.find(x=>x.dataset?.btNativeHint==='true')||null;
    if(sel==='.panel')return this.children.find(x=>String(x.className).split(/\s+/).includes('panel'))||null;
    if(sel==='.case-actions')return this.children.find(x=>String(x.className).split(/\s+/).includes('case-actions'))||null;
    if(sel==='.bt-title')return null;
    if(sel==='.workflow')return null;
    return null;
  }
  querySelectorAll(){return[]}
}

const analysisResult=new MockEl('div');analysisResult.id='analysisResult';elements.set('analysisResult',analysisResult);

const document={
  readyState:'loading',
  getElementById(id){return elements.get(id)||null},
  querySelector(){return null},
  querySelectorAll(){return[]},
  createElement(tag){return new MockEl(tag)},
  head:{appendChild(){}},
  body:{children:[],appendChild(node){node.parentElement=this;this.children.push(node);if(node.id)elements.set(node.id,node)}},
  addEventListener(){}
};

const result={labels:[{
  sourceName:'第一個.pdf',
  fields:[{code:'1P',name:'PART NO',value:'W25NO1GWZEIR',barcodeVerified:true,alternatives:[],conflict:false}],
  barcodes:[{format:'Code 128',text:'W25NO1GWZEIR'}]
}]};
const files=[{name:'第一個.pdf',type:'application/pdf'}];

let secondCalls=0;
let legacyDownloadCalls=0;

const c={
  console,Uint8Array,ArrayBuffer,Blob,Promise,Date,Math,setTimeout,clearTimeout,setInterval,clearInterval,
  URL:{
    createObjectURL(){objectUrlSeq++;return 'blob:test-'+objectUrlSeq},
    revokeObjectURL(){}
  },
  document,
  window:null,globalThis:null,
  CustomEvent:function(type,init){this.type=type;this.detail=init?.detail},
  MutationObserver:function(){this.observe=()=>{}},
  LabelWorkbenchAnalysisCopy:{decorate(){}},
  LabelWorkbenchBtwSecondNative:{
    canGenerate(){return true},
    async generateOne(_label,index){
      secondCalls++;
      return{name:'BT_Editable_first_L'+String(index+1).padStart(2,'0')+'.btw',bytes:new Uint8Array([66,84,87,1])}
    }
  },
  LabelWorkbenchBtwRichNative:{canGenerate(){return false},async generateOne(){throw new Error('rich should not run')}},
  LabelWorkbenchBtwNative:{
    async generateOne(){throw new Error('native fallback should not run')},
    async downloadFromAnalysis(){legacyDownloadCalls++;throw new Error('legacy wrapper path must not run')}
  },
  LabelWorkbenchBtBridge:{
    latestResult:result,
    latestFiles:files
  },
  toast(msg){toasts.push(msg)}
};
c.window=c;c.globalThis=c;
c.addEventListener=()=>{};

vm.createContext(c);
for(const f of[
  'assets/analysis-confidence-guard.js',
  'assets/btw-production-gate.js',
  'assets/btw-production-core.js',
  'assets/bt-native-primary.js'
]){
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
}

(async()=>{
  const ui=c.LabelWorkbenchBtNativePrimary;
  assert(ui?.BUILD==='20260918-btnp230-website-only-ux','unexpected BTW primary build');

  ui.decorateAnalysis();

  const button=elements.get('analysisBtNative');
  assert(button,'analysis result did not receive the BTW download button');
  assert(/下載可編輯 \.BTW/.test(button.textContent),'BTW button label is wrong');
  assert(button.disabled===false,'BTW button should be enabled after analysis');

  await button.click();
  await new Promise(r=>setTimeout(r,10));

  assert(secondCalls===1,'single-donor generator was not called exactly once');
  assert(legacyDownloadCalls===0,'website click leaked into legacy wrapped download path');
  assert(downloads.length===1,'browser download was not triggered exactly once');
  assert(/\.btw$/i.test(downloads[0].name),`browser downloaded the wrong file type: ${downloads[0].name}`);
  assert(toasts.some(x=>/可編輯 \.BTW 已下載/.test(x)),'success toast was not shown');
  assert(button.disabled===false,'BTW button stayed disabled after download');
  assert(/下載可編輯 \.BTW/.test(button.textContent),'BTW button label was not restored');

  console.log('PASS: website flow renders one-click editable BTW button and clicking it triggers a direct .btw browser download through production core');
})().catch(err=>{console.error(err);process.exit(1)});
