const fs=require('fs');const vm=require('vm');
const c={console,Math,Date,setInterval,clearInterval,setTimeout,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,window:null,globalThis:null,document:{readyState:'loading',addEventListener(){},createElement(){return{}},head:{appendChild(){}}}};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/analysis-geometry.js','utf8'),c,{filename:'analysis-geometry.js'});
const G=c.LabelWorkbenchAnalysisGeometry;if(!G?.matchKnownFields)throw new Error('geometry API missing');
const words=[
{text:'(1P)',confidence:96,x0:20,y0:20,x1:60,y1:40,w:40,h:20},
{text:'PART',confidence:97,x0:65,y0:20,x1:115,y1:40,w:50,h:20},
{text:'NO',confidence:97,x0:120,y0:20,x1:145,y1:40,w:25,h:20},
{text:'W25N01GWZEIR',confidence:94,x0:200,y0:20,x1:360,y1:40,w:160,h:20},
{text:'QTY',confidence:98,x0:20,y0:90,x1:60,y1:112,w:40,h:22},
{text:'4000',confidence:99,x0:210,y0:90,x1:260,y1:112,w:50,h:22},
{text:'LOT',confidence:90,x0:20,y0:150,x1:60,y1:170,w:40,h:20},
{text:'6612D7800ZZ',confidence:93,x0:200,y0:150,x1:340,y1:170,w:140,h:20}
];
const fields=[{code:'1P',name:'PART NO',value:'W25N01GWZEIR'},{code:'Q',name:'QTY',value:'4000'},{code:'1T',name:'LOT NO',value:'6612D7800ZZ'}];
const m=G.matchKnownFields(fields,words,400,200);if(m.length!==3)throw new Error(`expected 3 matches, got ${m.length}`);
const p=m.find(x=>x.field.code==='1P')?.sourceBox,q=m.find(x=>x.field.code==='Q')?.sourceBox,l=m.find(x=>x.field.code==='1T')?.sourceBox;
if(Math.abs(p.x-.5)>.001||Math.abs(p.y-.1)>.001||Math.abs(p.w-.4)>.001)throw new Error('part geometry mismatch '+JSON.stringify(p));
if(Math.abs(q.x-.525)>.001||Math.abs(q.y-.45)>.001)throw new Error('qty geometry mismatch '+JSON.stringify(q));
if(Math.abs(l.x-.5)>.001||Math.abs(l.y-.75)>.001)throw new Error('lot geometry mismatch '+JSON.stringify(l));
const fuzzy=G.charSimilarity('W25N01GWZEIR','W25NO1GWZEIR');if(!(fuzzy>.84&&fuzzy<1))throw new Error('controlled fuzzy score mismatch '+fuzzy);
console.log('PASS: known field values map to normalized source geometry without changing field values');
