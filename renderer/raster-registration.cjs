'use strict';
// Global registration across two native rasters with different printer-dot
// phases. No expected-position window or arbitrary coordinate compensation.
function dilate(rows,r){
 const w=rows[0].length,h=rows.length,temp=Array.from({length:h},()=>Buffer.alloc(w)),out=Array.from({length:h},()=>Buffer.alloc(w));
 for(let y=0;y<h;y++){let n=0;for(let x=-r;x<w;x++){const add=x+r;if(add<w)n+=rows[y][add];const sub=x-r-1;if(sub>=0)n-=rows[y][sub];if(x>=0)temp[y][x]=+(n>0);}}
 for(let x=0;x<w;x++){let n=0;for(let y=-r;y<h;y++){const add=y+r;if(add<h)n+=temp[add][x];const sub=y-r-1;if(sub>=0)n-=temp[sub][x];if(y>=0)out[y][x]=+(n>0);}}
 return out;
}
function locateRaster(page,tile,r=2){
 if(!Number.isInteger(r)||r<1||r>2)throw Error('Uncertified native printer phase radius');
 const pw=page[0].length,ph=page.length,w=tile[0].length,h=tile.length,padded=dilate(page,r),dilated=dilate(tile,r),points=[],samples=[],cells=new Set();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(tile[y][x]){points.push([x,y]);const cell=Math.floor(x*8/w)+8*Math.floor(y*8/h);if(!cells.has(cell)){cells.add(cell);samples.push([x,y]);}}
 if(!points.length)return null;const matches=new Map(),pad=2*r+2;
 for(let y=0;y<=ph-h;y++)for(let x=0;x<=pw-w;x++){
  if(!samples.every(([xx,yy])=>padded[y+yy][x+xx]))continue;
  if(!points.every(([xx,yy])=>padded[y+yy][x+xx]))continue;
  const x0=Math.max(0,x-pad),y0=Math.max(0,y-pad),x1=Math.min(pw,x+w+pad),y1=Math.min(ph,y+h+pad);
  let left=pw,right=-1,top=ph,bottom=-1,valid=true;
  for(let yy=y0;valid&&yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(page[yy][xx]){
   if(xx===x0||yy===y0||xx===x1-1||yy===y1-1){valid=false;break;}
   let near=false;
   if(xx>=x&&xx<x+w&&yy>=y&&yy<y+h)near=!!dilated[yy-y][xx-x];
   else for(let dy=-r;!near&&dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(tile[yy-y+dy]?.[xx-x+dx]){near=true;break;}
   if(!near){valid=false;break;}left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);
  }
  if(valid&&right>=left){const b={x:left,y:top,width:right-left+1,height:bottom-top+1};matches.set([b.x,b.y,b.width,b.height].join(','),b);if(matches.size>1)return null;}
 }
 return matches.size===1?[...matches.values()][0]:null;
}
module.exports={dilate,locateRaster};
