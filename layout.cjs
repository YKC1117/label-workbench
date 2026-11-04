'use strict';
const fs=require('node:fs'),{fromAnalysis}=require('./renderer/canonical.cjs');
const canonical=(label,styles,dpi=300)=>fromAnalysis(label,styles,dpi);
module.exports={canonical};
if(require.main===module){const data=JSON.parse(fs.readFileSync(process.argv[2]));console.log(JSON.stringify(canonical(data.label,data.styles,data.dpi??300),null,2));}
