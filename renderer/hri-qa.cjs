'use strict';
function bounds(rows,start,end){let left=Infinity,right=-1,top=Infinity,bottom=-1;for(let y=start;y<end;y++)for(let x=0;x<rows[0].length;x++)if(rows[y][x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(right<left)throw Error('Missing native HRI ink');return {x:left,y:top,width:right-left+1,height:bottom-top+1};}
function split(rows){
 let best={length:0};for(let y=0;y<rows.length;){let end=y+1;while(end<rows.length&&rows[end].equals(rows[y]))end++;if(rows[y].some(v=>v)&&end-y>best.length)best={start:y,end,length:end-y};y=end;}
 if(best.length<10)throw Error('No stable native barcode bar band');const symbol=bounds(rows,best.start,best.end),caption=bounds(rows,best.end,rows.length);
 if(caption.y<=symbol.y+symbol.height)throw Error('HRI has no distinct gap');return {symbol,caption};
}
module.exports={split};
