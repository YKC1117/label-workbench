const fs=require('fs');
const vm=require('vm');

class FakeButton{
  constructor(){this.dataset={};this.classList={add(){},remove(){}};this.parent=null;this.textContent='';this.title=''}
  addEventListener(){}
  remove(){if(!this.parent)return;const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null}
}
class FakeTd{
  constructor(text=''){this.dataset={};this.children=[];this.innerText=text;this.textContent=text}
  appendChild(btn){btn.parent=this;this.children.push(btn);return btn}
  querySelectorAll(sel){return sel==='[data-analysis-cell-copy]'?this.children.filter(x=>x.dataset?.analysisCellCopy):[]}
  cloneNode(){return{innerText:this.innerText,textContent:this.textContent,querySelectorAll(){return[]}}}
}
function copyButton(td){const b=new FakeButton();b.dataset.analysisCellCopy='1';td.appendChild(b);return b}

const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(){return null},
  createElement(tag){return tag==='button'?new FakeButton():new FakeButton()},
  body:{appendChild(){}},head:{appendChild(){}},execCommand(){return true}
};
const c={console,document,navigator:{clipboard:{writeText:async()=>{}}},setTimeout,clearTimeout,window:null,globalThis:null};c.window=c;c.globalThis=c;
vm.createContext(c);vm.runInContext(fs.readFileSync('assets/analysis-copy.js','utf8'),c,{filename:'assets/analysis-copy.js'});
function assert(cond,msg){if(!cond)throw new Error(msg)}
const A=c.LabelWorkbenchAnalysisCopy;
assert(A?.BUILD==='20260911-analysis-copy-110-row-content-only','unexpected copy build');

const a=new FakeTd('FIELD'),b=new FakeTd('VALUE'),d=new FakeTd('STATUS');
copyButton(a);copyButton(b);copyButton(b);copyButton(d);a.dataset.analysisCopyReady=b.dataset.analysisCopyReady=d.dataset.analysisCopyReady='1';
const row={cells:[a,b,d]};
const host={querySelectorAll(sel){return sel==='.analysis-table tbody tr'?[row]:[]}};
A.decorate({getElementById(){return host}});
assert(a.children.length===0,'first-cell copy button was not removed');
assert(b.children.length===1,'content cell must keep exactly one copy button');
assert(d.children.length===0,'status-cell copy button was not removed');
assert(!a.dataset.analysisCopyReady&&!d.dataset.analysisCopyReady,'non-content ready markers were not cleared');
assert(b.dataset.analysisCopyReady==='1','content cell ready marker missing');
A.decorate({getElementById(){return host}});
assert(b.children.length===1,'redecorate created a duplicate content copy button');

const x=new FakeTd('FIELD2'),y=new FakeTd('VALUE2'),z=new FakeTd('STATUS2'),row2={cells:[x,y,z]};
A.normalizeRow(row2);
assert(x.children.length===0&&y.children.length===1&&z.children.length===0,'fresh row did not receive exactly one middle-cell button');
console.log('PASS: Quick Analysis keeps exactly one copy button per row and cleans legacy extra buttons');
