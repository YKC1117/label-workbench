const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
const c={window:{},fetch:()=>{throw Error('must not fetch seed');},Uint8Array};
vm.createContext(c);vm.runInContext(fs.readFileSync('assets/btw-rich-native.js','utf8'),c);
(async()=>{await assert.rejects(c.window.LabelWorkbenchBtwRichNative.generateOne({fields:[{value:'X'}]}),/BTW_BINARY_EXPORT_DISABLED/);console.log('PASS: retired exporter refuses unverified binary output');})().catch(e=>{console.error(e);process.exitCode=1;});
