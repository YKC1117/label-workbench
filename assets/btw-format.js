/* Label Workbench BTW binary format helper v0.1
 * Experimental parser/rebuilder for native BarTender .btw files.
 * Based on the documented/reverse-engineered BTW layout used by the public-domain barmaid project:
 * text header + PNG preview blobs + zlib-compressed serialized object container.
 * This module does NOT invent a BTW file from scratch; it first proves safe round-trip handling of an existing BTW.
 */
(function(){
  'use strict';
  const BUILD='20260910-btw011';
  const SOF=new Uint8Array([0x0d,0x0a,0x42,0x61,0x72,0x20,0x54,0x65,0x6e,0x64,0x65,0x72,0x20,0x46,0x6f,0x72,0x6d,0x61,0x74,0x20,0x46,0x69,0x6c,0x65,0x0d,0x0a]);
  const END_META=new Uint8Array([0xff,0xfe,0xff,0x00]);
  const ZLIB_TAG=new Uint8Array([0x00,0x01]);
  const PNG_MAGIC=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

  const u8=value=>value instanceof Uint8Array?value:new Uint8Array(value);
  function eqAt(data,seq,offset){if(offset<0||offset+seq.length>data.length)return false;for(let i=0;i<seq.length;i++)if(data[offset+i]!==seq[i])return false;return true}
  function findSeq(data,seq,start=0){for(let i=Math.max(0,start);i<=data.length-seq.length;i++)if(eqAt(data,seq,i))return i;return-1}
  function readU32LE(data,offset){return(data[offset]|(data[offset+1]<<8)|(data[offset+2]<<16)|(data[offset+3]<<24))>>>0}
  function skipZeroPadding(data,offset){let p=offset;while(p+4<=data.length&&data[p]===0&&data[p+1]===0&&data[p+2]===0&&data[p+3]===0)p+=4;return p}
  function concatBytes(parts){const arrays=parts.map(u8),size=arrays.reduce((n,a)=>n+a.length,0),out=new Uint8Array(size);let o=0;for(const a of arrays){out.set(a,o);o+=a.length}return out}
  function ascii(bytes){return new TextDecoder('latin1').decode(bytes)}

  function parseHeaderText(data,limit){
    const text=ascii(data.slice(0,Math.max(0,limit))).replace(/\0/g,'');
    const app=/Application:\s*Version=([^;\r\n]+)(?:;\s*Build=([^;\r\n]+))?(?:;\s*Edition=([^;\r\n]+))?/i.exec(text);
    const doc=/Document:\s*CompatibleVersion=([^;\r\n]+)(?:;\s*ArchiveVersion=([^;\r\n]+))?/i.exec(text);
    return{text,applicationVersion:app?.[1]?.trim()||'',build:app?.[2]?.trim()||'',edition:app?.[3]?.trim()||'',compatibleVersion:doc?.[1]?.trim()||'',archiveVersion:doc?.[2]?.trim()||''};
  }

  function parseStructure(buffer){
    const data=u8(buffer);if(!eqAt(data,SOF,0))throw new Error('不是可辨識的 BarTender BTW 檔案');
    const metaEnd=findSeq(data,END_META,SOF.length);if(metaEnd<0)throw new Error('找不到 BTW metadata 結尾');
    let p=skipZeroPadding(data,metaEnd+END_META.length),pngs=[];
    for(let i=0;i<2;i++){
      if(p+4>data.length)throw new Error('BTW 預覽區不完整');
      const size=readU32LE(data,p),start=p+4,end=start+size;
      if(!size||end>data.length)throw new Error(`BTW PNG #${i+1} 長度異常`);
      pngs.push({size,start,end,isPng:eqAt(data,PNG_MAGIC,start)});p=skipZeroPadding(data,end);
    }
    const tagOffset=p,zlibTagged=eqAt(data,ZLIB_TAG,p);if(zlibTagged)p+=2;
    const header=parseHeaderText(data,metaEnd);
    return{BUILD,byteLength:data.length,metaEnd,tagOffset,containerOffset:p,zlibTagged,prefix:data.slice(0,p),compressedContainer:data.slice(p),pngs,header};
  }

  async function streamTransform(bytes,kind){
    const C=kind==='inflate'?globalThis.DecompressionStream:globalThis.CompressionStream;
    if(typeof C!=='function')throw new Error(kind==='inflate'?'此瀏覽器不支援 BTW 解壓縮':'此瀏覽器不支援 BTW 壓縮');
    const stream=new Blob([bytes]).stream().pipeThrough(new C('deflate')),buf=await new Response(stream).arrayBuffer();return new Uint8Array(buf)
  }
  async function inflateContainer(parsedOrBuffer){const parsed=parsedOrBuffer?.compressedContainer?parsedOrBuffer:parseStructure(parsedOrBuffer);if(!parsed.zlibTagged)throw new Error('目前只支援 zlib 壓縮的 BTW 容器');return streamTransform(parsed.compressedContainer,'inflate')}
  async function deflateContainer(bytes){return streamTransform(u8(bytes),'deflate')}
  async function rebuild(parsedOrBuffer,containerBytes){const parsed=parsedOrBuffer?.prefix?parsedOrBuffer:parseStructure(parsedOrBuffer),compressed=await deflateContainer(containerBytes);return concatBytes([parsed.prefix,compressed])}

  function scanUtf16Strings(container,{minLength=1,maxLength=10000}={}){
    const data=u8(container),decoder=new TextDecoder('utf-16le'),out=[];
    for(let i=0;i+4<=data.length;i++){
      if(data[i]!==0xff||data[i+1]!==0xfe||data[i+2]!==0xff)continue;
      let chars=0,head=4;
      if(data[i+3]===0xff){if(i+6>data.length)continue;chars=data[i+4]|(data[i+5]<<8);head=6}else chars=data[i+3];
      if(chars<minLength||chars>maxLength)continue;const start=i+head,end=start+chars*2;if(end>data.length)continue;
      try{const text=decoder.decode(data.slice(start,end));if(text&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))out.push({offset:i,headerLength:head,charLength:chars,start,end,text})}catch{}
      i=end-1;
    }
    return out;
  }

  function encodeBtwString(text){
    const value=String(text??''),units=value.length;if(units>65535)throw new Error('BTW 字串過長');
    const payload=new Uint8Array(units*2);for(let i=0;i<units;i++){const code=value.charCodeAt(i);payload[i*2]=code&255;payload[i*2+1]=(code>>>8)&255}
    const head=units<=254?new Uint8Array([0xff,0xfe,0xff,units]):new Uint8Array([0xff,0xfe,0xff,0xff,units&255,(units>>>8)&255]);return concatBytes([head,payload]);
  }
  function replaceStringAt(container,entry,newText){const data=u8(container),before=data.slice(0,entry.offset),after=data.slice(entry.end),encoded=encodeBtwString(newText);return concatBytes([before,encoded,after])}

  async function roundTrip(buffer){const original=u8(buffer),parsed=parseStructure(original),container=await inflateContainer(parsed),rebuilt=await rebuild(parsed,container),reparsed=parseStructure(rebuilt),roundContainer=await inflateContainer(reparsed);let same=container.length===roundContainer.length;for(let i=0;same&&i<container.length;i++)if(container[i]!==roundContainer[i])same=false;return{ok:same,originalBytes:original.length,rebuiltBytes:rebuilt.length,containerBytes:container.length,parsed,rebuilt,strings:scanUtf16Strings(container,{minLength:2}).slice(0,500)}}

  window.LabelWorkbenchBtwFormat={BUILD,SOF,END_META,ZLIB_TAG,PNG_MAGIC,findSeq,readU32LE,skipZeroPadding,parseHeaderText,parseStructure,inflateContainer,deflateContainer,rebuild,scanUtf16Strings,encodeBtwString,replaceStringAt,roundTrip};
})();
