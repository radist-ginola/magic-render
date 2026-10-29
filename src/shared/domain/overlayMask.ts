import type { OverlayMask } from './overlayTypes';

export function maskClipPath(mask: OverlayMask | undefined, width: number, height: number): string | undefined {
  if (!mask) return undefined;
  const {x,y}=mask;
  if(mask.shape==='freehand') return mask.points && mask.points.length>=3 ? `polygon(${mask.points.map(p=>`${p.x*100}% ${p.y*100}%`).join(',')})` : undefined;
  if(mask.shape==='circle') return `circle(${Math.min(width*mask.width,height*mask.height)/2}px at ${(x+mask.width/2)*100}% ${(y+mask.height/2)*100}%)`;
  if(mask.shape==='oval') return `ellipse(${mask.width*50}% ${mask.height*50}% at ${(x+mask.width/2)*100}% ${(y+mask.height/2)*100}%)`;
  const w=mask.shape==='square' ? Math.min(width*mask.width,height*mask.height) : width*mask.width;
  const h=mask.shape==='square' ? w : height*mask.height;
  const left=(x*width+(width*mask.width-w)/2)/width*100, top=(y*height+(height*mask.height-h)/2)/height*100;
  return `polygon(${left}% ${top}%,${left+w/width*100}% ${top}%,${left+w/width*100}% ${top+h/height*100}%,${left}% ${top+h/height*100}%)`;
}

/** Generate an alpha expression; FFmpeg geq keeps original RGB and alpha. */
export function maskAlphaExpression(mask: OverlayMask): string {
  const n=(v:number)=>String(Number(v.toFixed(6)));
  const bx=`W*${n(mask.x)}`, by=`H*${n(mask.y)}`, bw=`W*${n(mask.width)}`, bh=`H*${n(mask.height)}`;
  const cx=`(${bx}+${bw}/2)`, cy=`(${by}+${bh}/2)`;
  if(mask.shape==='circle') return `lte(pow((X-${cx})/(min(${bw},${bh})/2),2)+pow((Y-${cy})/(min(${bw},${bh})/2),2),1)`;
  if(mask.shape==='oval') return `lte(pow((X-${cx})/(${bw}/2),2)+pow((Y-${cy})/(${bh}/2),2),1)`;
  if(mask.shape==='square') return `between(X,${cx}-min(${bw},${bh})/2,${cx}+min(${bw},${bh})/2)*between(Y,${cy}-min(${bw},${bh})/2,${cy}+min(${bw},${bh})/2)`;
  if(mask.shape==='rectangle') return `between(X,${bx},${bx}+${bw})*between(Y,${by},${by}+${bh})`;
  const pts=mask.points ?? [];
  if(pts.length<3) return '1';
  const terms=pts.map((p,i)=>{
    const q=pts[(i+1)%pts.length]!;
    if(Math.abs(p.y-q.y)<.000001)return '0';
    const y1=`H*${n(p.y)}`,y2=`H*${n(q.y)}`,x1=`W*${n(p.x)}`,x2=`W*${n(q.x)}`;
    return `(gte(Y,min(${y1},${y2}))*lt(Y,max(${y1},${y2}))*lt(X,${x1}+(Y-${y1})*(${x2}-${x1})/(${y2}-${y1})))`;
  });
  return `mod(${terms.join('+')},2)`;
}
