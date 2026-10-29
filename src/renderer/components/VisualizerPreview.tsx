import { useEffect, useRef, useState, type CSSProperties, type JSX, type PointerEvent, type WheelEvent } from 'react';
import type { VisualizerEffect, VisualizerBlendMode, StereoVisualizerStyle } from '../../shared/domain/visualizerTypes';
import { resolveVisualizerColors } from '../../shared/domain/visualizerPalette';
type Props = { items: VisualizerEffect[]; audio: HTMLAudioElement | null; playing: boolean; time: number; fps?: number; onError?: (message: string) => void; selectedId?: string | null; onLayerPointerDown?: (id: string, mode: 'move' | 'resize', event: PointerEvent<HTMLElement>, handle?: string) => void; onLayerWheelZoom?: (id: string, direction: 1 | -1) => void };
type StereoAnalyserPair = { left: AnalyserNode; right: AnalyserNode };
type AudioRouting = { context: AudioContext; source: MediaElementAudioSourceNode; splitter: ChannelSplitterNode; analysers: Map<string, AnalyserNode>; stereoAnalysers: Map<string, StereoAnalyserPair>; mutedOutputs: Map<string, GainNode>; stereoMutedOutputs: Map<string, [GainNode, GainNode]>; users: number; closing?: number };
type AudioBuffers = { fftSize: number; frequencies: Uint8Array<ArrayBuffer>; leftWaveform: Uint8Array<ArrayBuffer>; rightWaveform: Uint8Array<ArrayBuffer>; smoothedLeft: Uint8Array<ArrayBuffer>; smoothedRight: Uint8Array<ArrayBuffer> };
type MediaImage = { path: string; image: HTMLImageElement };
type PreparedImage = { signature: string; canvas: HTMLCanvasElement };
const analysers = new WeakMap<HTMLAudioElement, AudioRouting>();
const blendModes: Record<VisualizerBlendMode, CSSProperties['mixBlendMode']> = {
  normal: 'normal', screen: 'screen', multiply: 'multiply', overlay: 'overlay', lighten: 'lighten', add: 'plus-lighter' as CSSProperties['mixBlendMode'],
};

function cropSignature(visual: VisualizerEffect, width: number, height: number): string {
  const crop = visual.sourceCrop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  return JSON.stringify([visual.sourcePath, width, height, crop.left, crop.right, crop.top, crop.bottom,
    visual.chromaKeyEnabled ?? false, visual.chromaKeyColor ?? '#00ff00', visual.chromaSimilarity ?? .12, visual.chromaBlend ?? .06]);
}

function byteSample(data: Uint8Array<ArrayBuffer>, index: number, sensitivity: number): number {
  return (((data[Math.max(0, Math.min(data.length - 1, index))] ?? 128) - 128) / 128) * sensitivity;
}

function drawRoundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, roundTop = true, roundBottom = false): void {
  if (width <= 0 || height <= 0) return;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r <= 0.25) { ctx.fillRect(x, y, width, height); return; }
  ctx.beginPath();
  ctx.moveTo(x + (roundTop ? r : 0), y);
  ctx.lineTo(x + width - (roundTop ? r : 0), y);
  if (roundTop) ctx.quadraticCurveTo(x + width, y, x + width, y + r); else ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - (roundBottom ? r : 0));
  if (roundBottom) ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); else ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + (roundBottom ? r : 0), y + height);
  if (roundBottom) ctx.quadraticCurveTo(x, y + height, x, y + height - r); else ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + (roundTop ? r : 0));
  if (roundTop) ctx.quadraticCurveTo(x, y, x + r, y); else ctx.lineTo(x, y);
  ctx.closePath(); ctx.fill();
}

function drawBarPeak(ctx: CanvasRenderingContext2D, x: number, y: number, slotWidth: number): void {
  const radius = Math.max(1.25, Math.min(3.5, slotWidth * 0.18));
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}
function drawWaveChannel(ctx: CanvasRenderingContext2D, data: Uint8Array<ArrayBuffer>, x: number, y: number, width: number, height: number, color: string, sensitivity: number, reverse = false, time = 0, rainbow = false, invertedY = false, mode: NonNullable<VisualizerEffect['waveformMode']> = 'cline', thickness = 2): void {
  if (data.length < 2 || width <= 0 || height <= 0) return;
  const gradient = rainbow ? ctx.createLinearGradient(x, y, x + width, y + height) : null;
  if (gradient) { gradient.addColorStop(0, `hsl(${(time * 100) % 360} 100% 60%)`); gradient.addColorStop(.5, `hsl(${(time * 100 + 145) % 360} 100% 62%)`); gradient.addColorStop(1, `hsl(${(time * 100 + 280) % 360} 100% 60%)`); }
  ctx.strokeStyle = gradient ?? color; ctx.fillStyle = gradient ?? color;
  ctx.lineWidth = Math.max(1, Math.min(12, thickness)); ctx.lineJoin = mode === 'cline' ? 'round' : 'miter'; ctx.lineCap = mode === 'cline' ? 'round' : 'butt';
  const steps = Math.max(2, Math.min(Math.floor(width), data.length - 1));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const sampleIndex = Math.round((reverse ? 1 - fraction : fraction) * (data.length - 1));
    const sample = byteSample(data, sampleIndex, sensitivity);
    points.push({ x: x + fraction * width, y: y + height / 2 + sample * height * (invertedY ? .44 : -.44) });
  }
  if (mode === 'point') {
    const radius = Math.max(1, Math.min(2.5, width / 700));
    for (let i = 0; i < points.length; i += 2) { const point = points[i]!; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  ctx.beginPath(); ctx.moveTo(points[0]!.x, points[0]!.y);
  if (mode === 'cline') {
    for (let i = 1; i < points.length - 1; i++) { const current = points[i]!, next = points[i + 1]!; const midX = (current.x + next.x) / 2, midY = (current.y + next.y) / 2; ctx.quadraticCurveTo(current.x, current.y, midX, midY); }
    const last = points[points.length - 1]!; ctx.lineTo(last.x, last.y);
  } else {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.stroke();
  if (mode === 'p2p') {
    const radius = Math.max(1, Math.min(2, width / 1000));
    for (let i = 0; i < points.length; i += Math.max(2, Math.floor(points.length / 80))) { const point = points[i]!; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawOnixInspiredModel(
  ctx: CanvasRenderingContext2D,
  style: StereoVisualizerStyle,
  width: number,
  height: number,
  left: Uint8Array<ArrayBuffer>,
  right: Uint8Array<ArrayBuffer>,
  visual: VisualizerEffect,
  levels: number[],
  time: number,
  leftColor: string,
  rightColor: string,
  barCount: number,
  thickness: number,
): boolean {
  const onixStyles: StereoVisualizerStyle[] = [
    'onix-analyzer','onix-classic','onix-modern','onix-plasma','onix-infinity','onix-neon','onix-hawking','onix-core','onix-reactor','onix-spotlight','onix-twirl','onix-warp','onix-ripple','onix-pulsar','onix-hallucia','onix-blank',
    'vertical-spectrum-bars','circular-spectrum','circular-waveform','radial-spectrum','oscilloscope','lissajous','waveform-progress',
  ];
  if (!onixStyles.includes(style)) return false;
  if (style === 'onix-blank') return true;
  const { primary, secondary } = resolveVisualizerColors(visual);
  const gradient = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const g = ctx.createLinearGradient(x0,y0,x1,y1); g.addColorStop(0,primary); g.addColorStop(1,secondary); return g;
  };
  const cx = width / 2, cy = height / 2, radius = Math.max(2, Math.min(width, height) * .29);
  // `levels` has already been sensitivity-scaled in the shared analyser loop.
  // Applying sensitivity again here made preview bars stronger than the FFmpeg render.
  const levelAt = (i: number): number => Math.max(0, Math.min(1, levels[i % Math.max(1, levels.length)] ?? 0));
  const waveAt = (buffer: Uint8Array<ArrayBuffer>, i: number): number => byteSample(buffer, Math.round(i / Math.max(1, barCount - 1) * (buffer.length - 1)), visual.sensitivity);
  const ring = (r: number, color: string, lineWidth = thickness): void => { ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.arc(cx,cy,Math.max(1,r),0,Math.PI*2); ctx.stroke(); };
  const drawRadialBars = (symmetric: boolean, innerRatio = .26, outerRatio = .46): void => {
    const count=Math.min(barCount,Math.max(16,levels.length)); const maxRadius=Math.min(width,height)*outerRatio; const inner=Math.min(width,height)*innerRatio; const slot=(Math.PI*2)/count;
    const colors=gradient(0,0,width,height);
    for(let i=0;i<count;i++) { const level=levelAt(i); const a=i*slot-Math.PI/2; const extent=(maxRadius-inner)*level; const start=symmetric?inner-extent*.5:inner; const end=symmetric?inner+extent*.5:inner+extent; ctx.beginPath();ctx.strokeStyle=colors;ctx.lineWidth=Math.max(1,Math.min(12,thickness,slot*radius*.8));ctx.moveTo(cx+Math.cos(a)*start,cy+Math.sin(a)*start);ctx.lineTo(cx+Math.cos(a)*end,cy+Math.sin(a)*end);ctx.stroke(); }
  };
  const drawCircleWave = (buffer: Uint8Array<ArrayBuffer>, color: string, phase = 0, reverse = false, radiusScale = 1): void => {
    const count=Math.min(buffer.length,Math.max(128,barCount*3));ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.lineJoin='round';
    for(let i=0;i<count;i++){const p=i/Math.max(1,count-1);const ix=Math.round((reverse?1-p:p)*(buffer.length-1));const amp=byteSample(buffer,ix,visual.sensitivity);const a=p*Math.PI*2+phase;const r=radius*(radiusScale+amp*.27);const x=cx+Math.cos(a)*r*width/Math.max(width,height);const y=cy+Math.sin(a)*r*height/Math.max(width,height);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();
  };
  const drawHorizontalWave = (buffer: Uint8Array<ArrayBuffer>, yCenter: number, amplitude: number, color: string, phase = 0): void => {
    const points=Math.min(width,Math.max(120,barCount*4));ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.lineJoin='round';
    for(let i=0;i<points;i++){const fraction=i/Math.max(1,points-1);const sample=waveAt(buffer,Math.floor(fraction*(barCount-1)));const wobble=Math.sin(fraction*Math.PI*2*3+time*1.5+phase)*.08;const y=yCenter-(sample+wobble)*amplitude;if(i===0)ctx.moveTo(fraction*width,y);else ctx.lineTo(fraction*width,y);}ctx.stroke();
  };
  if (style === 'vertical-spectrum-bars' || style === 'onix-analyzer' || style === 'onix-modern') {
    const count=Math.min(barCount,Math.max(16,levels.length));const slot=width/count;ctx.fillStyle=gradient(0,height,width,0);
    const widthFactor=Math.max(.2,Math.min(.98,1-(visual.bandSpacing ?? .15)));const bw=Math.max(1,slot*widthFactor);const radius=visual.roundedTop === false ? 0 : Math.max(0,Math.min(12,visual.cornerRadius ?? 6));
    for(let i=0;i<count;i++){const amount=levelAt(i);const bh=Math.max(1,amount*height*.88);const x=i*slot+(slot-bw)/2;
      if(visual.symmetry){const halfBarHeight=Math.max(1,amount*(height/2)*.88);const topY=height/2-halfBarHeight;const bottomY=height/2;drawRoundedBar(ctx,x,topY,bw,halfBarHeight,radius,true,false);drawRoundedBar(ctx,x,bottomY,bw,halfBarHeight,radius,false,true);if(visual.showPeakMarker!==false){drawBarPeak(ctx,x+bw/2,topY,slot);drawBarPeak(ctx,x+bw/2,bottomY+halfBarHeight,slot);}}
      else {const topY=height-bh;drawRoundedBar(ctx,x,topY,bw,bh,radius,true,false);if(visual.showPeakMarker!==false)drawBarPeak(ctx,x+bw/2,topY,slot);}
    }
    return true;
  }
  if (style === 'onix-classic' || style === 'oscilloscope') {
    ctx.shadowBlur = Math.max(0,visual.glow ?? 3)*3;drawWaveChannel(ctx,left,0,0,width,height,primary,visual.sensitivity,false,time,false,false,'cline',thickness);ctx.globalAlpha=.45;drawWaveChannel(ctx,right,0,0,width,height,secondary,visual.sensitivity,true,time,false,false,'cline',thickness);ctx.globalAlpha=1;return true;
  }
  if (style === 'onix-plasma') {
    ctx.shadowBlur=Math.max(2,visual.glow??2)*2;drawHorizontalWave(left,height*.35,height*.28,primary,0);drawHorizontalWave(right,height*.67,height*.28,secondary,Math.PI);ctx.globalAlpha=.16;drawHorizontalWave(left,height*.35,height*.38,secondary,time*.15);drawHorizontalWave(right,height*.67,height*.38,primary,-time*.15);ctx.globalAlpha=1;return true;
  }
  if (style === 'onix-infinity' || style === 'circular-waveform') {
    ctx.shadowBlur=Math.max(0,visual.glow??2)*2;drawCircleWave(left,primary,time*.2,false,1);drawCircleWave(right,secondary,-time*.2,true,1.08);return true;
  }
  if (style === 'circular-spectrum' || style === 'radial-spectrum' || style === 'onix-hawking' || style === 'onix-reactor') {
    ring(radius*.68,'rgba(255,255,255,.14)',1);drawRadialBars(!!visual.symmetry,style==='onix-hawking'?.18:.25,style==='onix-reactor'?.49:.47);
    if(style==='onix-hawking'){for(let i=0;i<Math.min(50,barCount);i++){const a=i*2.399+time*.08;const r=radius*(.5+((i*17)%23)/23);ctx.fillStyle=i%2?secondary:primary;ctx.globalAlpha=.25+(i%5)*.1;ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,Math.max(1,thickness*.8),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
    if(style==='onix-reactor'){ring(radius*.35,primary,Math.max(1,thickness*.6));ring(radius*.52,secondary,Math.max(1,thickness*.5));}
    return true;
  }
  if (style === 'onix-neon') {
    ctx.save();ctx.translate(cx,cy);ctx.rotate(time*.5);ctx.strokeStyle=primary;ctx.shadowColor=primary;ctx.shadowBlur=Math.max(3,visual.glow??3)*3;ctx.lineWidth=thickness*1.8;ctx.beginPath();ctx.moveTo(-radius,0);ctx.lineTo(radius,0);ctx.moveTo(0,-radius);ctx.lineTo(0,radius);ctx.stroke();ctx.rotate(-time);ctx.strokeStyle=secondary;ctx.beginPath();ctx.moveTo(-radius*.76,0);ctx.lineTo(radius*.76,0);ctx.moveTo(0,-radius*.76);ctx.lineTo(0,radius*.76);ctx.stroke();ctx.restore();return true;
  }
  if (style === 'onix-core' || style === 'onix-spotlight' || style === 'onix-pulsar') {
    const bass=levelAt(1);const pulse=1+bass*.2*Math.sin(time*3);ctx.save();ctx.translate(cx,cy);ctx.rotate(style==='onix-pulsar'?time*.35:style==='onix-spotlight'?-time*.18:0);ctx.strokeStyle=gradient(-radius,-radius,radius,radius);ctx.fillStyle=gradient(-radius,-radius,radius,radius);ctx.shadowColor=primary;ctx.shadowBlur=Math.max(2,visual.glow??3)*3;
    if(style==='onix-spotlight'){for(let i=0;i<24;i++){const a=i*Math.PI/12;ctx.globalAlpha=.16+(i%4)*.04;ctx.beginPath();ctx.moveTo(Math.cos(a)*radius*.35,Math.sin(a)*radius*.35);ctx.lineTo(Math.cos(a)*radius*1.35,Math.sin(a)*radius*1.35);ctx.stroke();}ctx.globalAlpha=1;}
    const ringCount=style==='onix-pulsar'?5:style==='onix-spotlight'?8:3;for(let i=0;i<ringCount;i++){ctx.beginPath();ctx.lineWidth=Math.max(1,thickness*(1-i*.08));ctx.arc(0,0,radius*(.32+i*.13)*pulse,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.arc(0,0,radius*(style==='onix-core'?.26:.18)*pulse,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();ctx.restore();return true;
  }
  if (style === 'onix-twirl' || style === 'onix-warp' || style === 'onix-hallucia') {
    ctx.strokeStyle=gradient(0,0,width,height);ctx.lineWidth=thickness;ctx.shadowBlur=Math.max(0,visual.glow??2)*2;const turns=style==='onix-hallucia'?9:style==='onix-twirl'?5:7;const steps=Math.min(1400,barCount*12);ctx.beginPath();
    for(let i=0;i<steps;i++){const p=i/Math.max(1,steps-1);const sample=waveAt(left,Math.floor(p*(barCount-1)));const a=p*Math.PI*2*turns+time*(style==='onix-warp'?.4:.7);const r=p*radius*(style==='onix-warp'?1+sample*.35:1+sample*.2);const x=cx+Math.cos(a)*r*width/Math.max(width,height);const y=cy+Math.sin(a)*r*height/Math.max(width,height);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();return true;
  }
  if (style === 'onix-ripple') {
    for(let i=0;i<7;i++){const phase=(time*.4+i/7)%1;ctx.globalAlpha=1-phase;ctx.strokeStyle=i%2?secondary:primary;ctx.lineWidth=thickness;ctx.beginPath();ctx.arc(cx,cy,radius*(.25+phase*.85),0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;drawCircleWave(left,primary,time*.1,false,.7);return true;
  }
  if (style === 'lissajous') {
    ctx.strokeStyle=gradient(0,0,width,height);ctx.lineWidth=thickness;ctx.shadowBlur=Math.max(0,visual.glow??2)*2;ctx.beginPath();const count=Math.min(left.length,right.length,Math.max(128,barCount*8));for(let i=0;i<count;i++){const x=cx+byteSample(left,i,visual.sensitivity)*width*.44;const y=cy+byteSample(right,i,visual.sensitivity)*height*.44;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();return true;
  }
  if (style === 'waveform-progress') {
    drawWaveChannel(ctx,left,0,height*.18,width,height*.64,'rgba(255,255,255,.25)',visual.sensitivity,false,time,false,false,'cline',thickness);
    const progress=(time%12)/12;ctx.save();ctx.beginPath();ctx.rect(0,0,width*progress,height);ctx.clip();drawWaveChannel(ctx,left,0,height*.18,width,height*.64,primary,visual.sensitivity,false,time,false,false,'cline',thickness);ctx.restore();ctx.fillStyle=secondary;ctx.beginPath();ctx.arc(width*progress,height*.5,Math.max(2,thickness*1.8),0,Math.PI*2);ctx.fill();return true;
  }
  return false;
}

function drawStereoModel(ctx: CanvasRenderingContext2D, style: StereoVisualizerStyle, width: number, height: number, left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>, visual: VisualizerEffect, levels: number[], time: number): void {
  const colorMode = visual.colorMode ?? 'gradient';
  const { primary: leftColor, secondary: rightColor } = resolveVisualizerColors(visual);
  const mid = width / 2;
  const thickness = Math.max(1, Math.min(12, visual.thickness ?? 2));
  const barCount = Math.max(16, Math.min(256, Math.round(visual.barCount ?? visual.density ?? 64)));
  ctx.lineWidth = thickness;
  ctx.shadowColor = colorMode === 'amber' ? '#ff8c42' : visual.color;
  ctx.shadowBlur = colorMode === 'neon' ? Math.max(4, visual.glow ?? 3) * 2 : style === 'glow' ? Math.max(0, visual.glow ?? 0) * 2 : 0;
  if (drawOnixInspiredModel(ctx, style, width, height, left, right, visual, levels, time, leftColor, rightColor, barCount, thickness)) { ctx.shadowBlur = 0; return; }
  if (style === 'spectrum') {
    const count = Math.max(16, Math.min(128, levels.length)); const slot = width / count;
    const palettes: Record<string, string[]> = { fire: ['#170000','#b40018','#ff4f00','#ffd34d'], cool: ['#071a52','#1368aa','#22b8c7','#d5ffff'], viridis: ['#440154','#31688e','#35b779','#fde725'], magma: ['#000004','#721f81','#ed6925','#fcfdbf'], rainbow: ['#ff3366','#ffc857','#5de2e7','#7568ff'], custom: [leftColor,rightColor] };
    const colors = palettes[visual.palette ?? 'rainbow'] ?? palettes.rainbow!; const gradient = ctx.createLinearGradient(0,height,0,0);
    colors.forEach((color, index) => gradient.addColorStop(index / Math.max(1, colors.length - 1), color)); ctx.fillStyle = gradient;
    const radius = visual.roundedTop === false ? 0 : Math.max(0, Math.min(12, visual.cornerRadius ?? 6));
    for (let i = 0; i < count; i++) { const amount = Math.max(.015, Math.min(1, levels[i] ?? 0)); const barHeight = amount * height; const bw = Math.max(1, slot * .88); const bx=i*slot+(slot-bw)/2; const by=height-barHeight; drawRoundedBar(ctx,bx,by,bw,barHeight,radius,true,false); if (visual.showPeakMarker !== false) drawBarPeak(ctx,bx+bw/2,by,slot); }
    ctx.shadowBlur = 0; return;
  }
  if (style === 'frequency') {
    const count = Math.max(16, Math.min(128, levels.length)); const slot = width / count; const mode = visual.frequencyMode ?? 'bar';
    const gradient = ctx.createLinearGradient(0, height, width, 0); gradient.addColorStop(0, leftColor); gradient.addColorStop(1, rightColor); ctx.strokeStyle = gradient; ctx.fillStyle = gradient;
    ctx.beginPath();
    const radius = visual.roundedTop === false ? 0 : Math.max(0, Math.min(12, visual.cornerRadius ?? 6));
    const widthFactor = Math.max(.2, Math.min(.98, 1 - (visual.bandSpacing ?? .15)));
    for (let i = 0; i < count; i++) { const amount = Math.max(.01, Math.min(1, levels[i] ?? 0)); const x = i * slot + slot / 2, y = height - amount * height;
      if (mode === 'bar') { const bw = Math.max(1, slot * widthFactor); const bx = i * slot + (slot - bw) / 2; drawRoundedBar(ctx,bx,y,bw,height-y,radius,true,false); if (visual.showPeakMarker !== false) drawBarPeak(ctx,x,y,slot); }
      else if (mode === 'dot') { ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, slot * .18), 0, Math.PI * 2); ctx.fill(); }
      else { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    }
    if (mode === 'line') ctx.stroke(); ctx.shadowBlur = 0; return;
  }
  if (style === 'vu-meter') {
    const amountRaw = visual.volumeMode === 'rms' ? Math.sqrt(levels.reduce((sum, value) => sum + value * value, 0) / Math.max(1, levels.length)) : Math.max(0, ...levels);
    const amount = Math.max(.01, Math.min(1, amountRaw));
    const vertical = visual.volumeOrientation === 'vertical'; const gradient = vertical ? ctx.createLinearGradient(0, height, 0, 0) : ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, leftColor); gradient.addColorStop(.72, visual.color); gradient.addColorStop(1, '#ff435a'); ctx.fillStyle = gradient;
    if (vertical) ctx.fillRect(width * .25, height * (1 - amount), width * .5, height * amount); else ctx.fillRect(0, height * .2, width * amount, height * .6);
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; const steps = 12; for (let i = 1; i < steps; i++) { if (vertical) { const y = height * i / steps; ctx.beginPath(); ctx.moveTo(width * .2, y); ctx.lineTo(width * .8, y); ctx.stroke(); } else { const x = width * i / steps; ctx.beginPath(); ctx.moveTo(x, height * .15); ctx.lineTo(x, height * .85); ctx.stroke(); } }
    ctx.shadowBlur = 0; return;
  }
  if (style === 'polar') {
    ctx.strokeStyle = leftColor; ctx.lineWidth = Math.max(1, width / 900); ctx.beginPath();
    const count = Math.min(left.length, right.length, Math.max(128, Math.round(width * 1.5)));
    for (let i = 0; i < count; i += 2) { const l = byteSample(left, i, visual.sensitivity), r = byteSample(right, i, visual.sensitivity); const angle = (i / count) * Math.PI * 2; const radius = Math.max(.03, Math.min(1, .5 + (l - r) * .38)); const x = width / 2 + Math.cos(angle) * radius * width * .44; const y = height / 2 + Math.sin(angle) * radius * height * .44; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0; return;
  }
  if (style === 'vector') {
    ctx.strokeStyle = leftColor; ctx.beginPath();
    const count = Math.min(left.length, right.length, 1400);
    for (let i = 0; i < count; i += 2) {
      const x = width / 2 + byteSample(left, i, 1) * width * .44;
      const y = height / 2 - byteSample(right, i, 1) * height * .44;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.shadowBlur = 0; return;
  }
  if (style === 'cqt') {
    const count = Math.max(16, Math.min(160, levels.length));
    const slot = width / count;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, leftColor); gradient.addColorStop(1, rightColor);
    for (let i = 0; i < count; i++) {
      const amount = Math.max(.004, Math.min(1, levels[i] ?? 0));
      const barHeight = amount * height;
      ctx.fillStyle = gradient;
      const bw = Math.max(1, slot * .86); const bx = i * slot + (slot - bw) / 2; const by = height - barHeight;
      drawRoundedBar(ctx, bx, by, bw, barHeight, visual.roundedTop === false ? 0 : Math.min(12, visual.cornerRadius ?? 6), true, false);
      if (visual.showPeakMarker !== false) drawBarPeak(ctx, bx + bw / 2, by, slot);
    }
    ctx.shadowBlur = 0; return;
  }
  if (style === 'split-colors') {
    drawWaveChannel(ctx, left, 0, 0, width, height / 2, leftColor, visual.sensitivity, false, time, false, false, visual.waveformMode ?? 'cline', thickness);
    drawWaveChannel(ctx, right, 0, height / 2, width, height / 2, rightColor, visual.sensitivity, false, time, false, false, visual.waveformMode ?? 'cline', thickness);
    ctx.shadowBlur = 0; return;
  }
  if (style === 'glow') {
    ctx.save(); ctx.globalAlpha = .38; ctx.shadowBlur = Math.max(6, (visual.glow ?? 2) * 4);
    drawWaveChannel(ctx, left, 0, 0, width / 2, height, leftColor, visual.sensitivity, false, time, false, false, visual.waveformMode ?? 'cline', thickness);
    drawWaveChannel(ctx, right, width / 2, 0, width / 2, height, rightColor, visual.sensitivity, true, time, false, false, visual.waveformMode ?? 'cline', thickness);
    ctx.restore();
    ctx.shadowBlur = Math.max(0, visual.glow ?? 0);
    drawWaveChannel(ctx, left, 0, 0, width / 2, height, leftColor, visual.sensitivity, false, time, false, false, visual.waveformMode ?? 'cline', thickness);
    drawWaveChannel(ctx, right, width / 2, 0, width / 2, height, rightColor, visual.sensitivity, true, time, false, false, visual.waveformMode ?? 'cline', thickness);
    ctx.shadowBlur = 0; return;
  }
  if (style === 'reflection') {
    const waveHeight = height * .56;
    drawWaveChannel(ctx, left, 0, 0, width / 2, waveHeight, leftColor, visual.sensitivity, false, time, false, false, visual.waveformMode ?? 'cline', thickness);
    drawWaveChannel(ctx, right, width / 2, 0, width / 2, waveHeight, rightColor, visual.sensitivity, true, time, false, false, visual.waveformMode ?? 'cline', thickness);
    ctx.save(); ctx.globalAlpha = .22;
    drawWaveChannel(ctx, left, 0, waveHeight, width / 2, height - waveHeight, leftColor, visual.sensitivity, false, time, false, true, visual.waveformMode ?? 'cline', thickness);
    drawWaveChannel(ctx, right, width / 2, waveHeight, width / 2, height - waveHeight, rightColor, visual.sensitivity, true, time, false, true, visual.waveformMode ?? 'cline', thickness);
    ctx.restore(); ctx.shadowBlur = 0; return;
  }
  const gap = style === 'gap' ? Math.max(4, width * .025) : 0;
  const half = Math.max(1, (width - gap) / 2);
  drawWaveChannel(ctx, left, 0, 0, half, height, leftColor, visual.sensitivity, false, time, style === 'rainbow', false, visual.waveformMode ?? 'cline', thickness);
  drawWaveChannel(ctx, right, half + gap, 0, half, height, rightColor, visual.sensitivity, style === 'mirrored' || style === 'gap', time, style === 'rainbow', false, visual.waveformMode ?? 'cline', thickness);
  ctx.shadowBlur = 0;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const span = Math.max(.0001, edge1 - edge0);
  const t = Math.max(0, Math.min(1, (value - edge0) / span));
  return t * t * (3 - 2 * t);
}

export function VisualizerPreview({ items, audio, playing, time, fps = 30, onError, selectedId = null, onLayerPointerDown, onLayerWheelZoom }: Props): JSX.Element {
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const mediaImages = useRef(new Map<string, MediaImage>());
  const preparedMedia = useRef(new Map<string, PreparedImage>());
  const [imageRevision, setImageRevision] = useState(0);
  const effects = useRef(items);
  const playingRef = useRef(playing);
  const timeRef = useRef(time);
  const contextRef = useRef<AudioContext | null>(null);
  const levelsRef = useRef(new Map<string, number[]>());
  const audioBuffers = useRef(new Map<string, AudioBuffers>());
  effects.current = items;
  // Rebuild audio analyser nodes only when the audio source, FFT capacity or the layer set changes.
  // Position/size/colour edits then remain smooth while the user resizes a visualizer on canvas.
  const routingSignature = items.map((item) => `${item.id}:${item.kind}:${item.density ?? 64}:${item.barCount ?? ''}`).join('|');
  playingRef.current = playing;
  timeRef.current = time;

  function getPreparedMedia(visual: VisualizerEffect, width: number, height: number): HTMLCanvasElement | null {
    const entry = mediaImages.current.get(visual.id);
    const image = entry?.image;
    if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
    const signature = cropSignature(visual, width, height);
    const cached = preparedMedia.current.get(visual.id);
    if (cached?.signature === signature) return cached.canvas;

    const crop = visual.sourceCrop ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const sx = image.naturalWidth * Math.max(0, crop.left) / 100;
    const sy = image.naturalHeight * Math.max(0, crop.top) / 100;
    const sw = image.naturalWidth * Math.max(.01, 1 - (crop.left + crop.right) / 100);
    const sh = image.naturalHeight * Math.max(.01, 1 - (crop.top + crop.bottom) / 100);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, width, height);
    const containScale = Math.min(width / sw, height / sh);
    const drawWidth = sw * containScale, drawHeight = sh * containScale;
    ctx.drawImage(image, sx, sy, sw, sh, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    if (visual.chromaKeyEnabled) {
      try {
        const rgb = (visual.chromaKeyColor ?? '#00ff00').slice(1);
        const keyR = Number.parseInt(rgb.slice(0, 2), 16), keyG = Number.parseInt(rgb.slice(2, 4), 16), keyB = Number.parseInt(rgb.slice(4, 6), 16);
        const pixels = ctx.getImageData(0, 0, width, height);
        const similarity = Math.max(0, Math.min(1, visual.chromaSimilarity ?? .12));
        const blend = Math.max(.002, Math.min(.8, visual.chromaBlend ?? .06));
        const data = pixels.data;
        for (let index = 0; index < data.length; index += 4) {
          const dr = data[index]! - keyR, dg = data[index + 1]! - keyG, db = data[index + 2]! - keyB;
          const distance = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
          data[index + 3] = Math.round(data[index + 3]! * (1 - smoothstep(similarity, similarity + blend, distance)));
        }
        ctx.putImageData(pixels, 0, 0);
      } catch (error) {
        onError?.(`Chroma Key preview tidak tersedia: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    preparedMedia.current.set(visual.id, { signature, canvas });
    return canvas;
  }

  useEffect(() => {
    const activeIds = new Set(items.filter((item) => item.kind === 'mediaLogo' && item.sourcePath).map((item) => item.id));
    for (const [id, entry] of mediaImages.current) {
      if (!activeIds.has(id)) { mediaImages.current.delete(id); preparedMedia.current.delete(id); }
      else if (!items.some((item) => item.id === id && item.sourcePath === entry.path)) { mediaImages.current.delete(id); preparedMedia.current.delete(id); }
    }
    for (const visual of items) {
      if (visual.kind !== 'mediaLogo' || !visual.sourcePath) { mediaImages.current.delete(visual.id); preparedMedia.current.delete(visual.id); continue; }
      const current = mediaImages.current.get(visual.id);
      if (current?.path === visual.sourcePath) continue;
      const image = new Image();
      image.onload = () => { preparedMedia.current.delete(visual.id); setImageRevision((revision) => revision + 1); };
      image.onerror = () => onError?.(`Logo visualizer tidak dapat dibuka: ${visual.sourcePath}`);
      image.src = `mrp-media://local?path=${encodeURIComponent(visual.sourcePath)}`;
      mediaImages.current.set(visual.id, { path: visual.sourcePath, image });
    }
  }, [items, onError]);

  useEffect(() => {
    const element = audio;
    if (!element) return;
    let frame = 0;
    let active = true;
    try {
      let routing = analysers.get(element);
      if (!routing) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(element);
        // Keep normal playback on one direct path. Analyzer branches are muted
        // and exist only for measurement, so adding visualizers never boosts audio.
        source.connect(context.destination);
        const splitter = context.createChannelSplitter(2);
        source.connect(splitter);
        routing = { context, source, splitter, analysers: new Map(), stereoAnalysers: new Map(), mutedOutputs: new Map(), stereoMutedOutputs: new Map(), users: 0 };
        analysers.set(element, routing);
      }
      if (routing.closing !== undefined) window.clearTimeout(routing.closing);
      routing.closing = undefined; routing.users++;
      const { context, source } = routing;
      contextRef.current = context;
      if (playingRef.current) void context.resume().catch(() => undefined);

      const activeAnalyzerIds = new Set(items.filter((item) => item.kind !== 'mediaLogo').map((item) => item.id));
      for (const [id, oldAnalyzer] of routing.analysers) {
        if (activeAnalyzerIds.has(id)) continue;
        const muted = routing.mutedOutputs.get(id);
        const stereo = routing.stereoAnalysers.get(id);
        const stereoMuted = routing.stereoMutedOutputs.get(id);
        try { source.disconnect(oldAnalyzer); oldAnalyzer.disconnect(); muted?.disconnect(); if (stereo) { routing.splitter.disconnect(stereo.left); routing.splitter.disconnect(stereo.right); stereo.left.disconnect(); stereo.right.disconnect(); } stereoMuted?.forEach((gain) => gain.disconnect()); } catch { /* nodes may already be disconnected */ }
        routing.analysers.delete(id); routing.stereoAnalysers.delete(id); routing.mutedOutputs.delete(id); routing.stereoMutedOutputs.delete(id); audioBuffers.current.delete(id);
        levelsRef.current.delete(id);
      }
      for (const visual of items) {
        if (visual.kind === 'mediaLogo') continue;
        const desiredFft = Math.max(32, Math.min(32768, 2 ** Math.round(Math.log2((visual.barCount ?? visual.density ?? 64) * 32))));
        const existing = routing.analysers.get(visual.id);
        if (existing && existing.fftSize === desiredFft) continue;
        if (existing) {
          const oldMuted = routing.mutedOutputs.get(visual.id);
          const oldStereo = routing.stereoAnalysers.get(visual.id);
          const oldStereoMuted = routing.stereoMutedOutputs.get(visual.id);
          try { source.disconnect(existing); existing.disconnect(); oldMuted?.disconnect(); if (oldStereo) { routing.splitter.disconnect(oldStereo.left); routing.splitter.disconnect(oldStereo.right); oldStereo.left.disconnect(); oldStereo.right.disconnect(); } oldStereoMuted?.forEach((gain) => gain.disconnect()); } catch { /* replace the old FFT node safely */ }
          routing.mutedOutputs.delete(visual.id); routing.stereoAnalysers.delete(visual.id); routing.stereoMutedOutputs.delete(visual.id);
        }
        const visualAnalyzer = context.createAnalyser();
        visualAnalyzer.fftSize = desiredFft;
        visualAnalyzer.smoothingTimeConstant = 0;
        const muted = context.createGain(); muted.gain.value = 0;
        source.connect(visualAnalyzer); visualAnalyzer.connect(muted); muted.connect(context.destination);
        const stereoLeft = context.createAnalyser(), stereoRight = context.createAnalyser();
        stereoLeft.fftSize = desiredFft; stereoRight.fftSize = desiredFft;
        stereoLeft.smoothingTimeConstant = 0; stereoRight.smoothingTimeConstant = 0;
        const mutedLeft = context.createGain(), mutedRight = context.createGain(); mutedLeft.gain.value = 0; mutedRight.gain.value = 0;
        routing.splitter.connect(stereoLeft, 0); routing.splitter.connect(stereoRight, 1);
        stereoLeft.connect(mutedLeft); mutedLeft.connect(context.destination); stereoRight.connect(mutedRight); mutedRight.connect(context.destination);
        routing.analysers.set(visual.id, visualAnalyzer); routing.stereoAnalysers.set(visual.id, { left: stereoLeft, right: stereoRight });
        routing.mutedOutputs.set(visual.id, muted); routing.stereoMutedOutputs.set(visual.id, [mutedLeft, mutedRight]);
        audioBuffers.current.set(visual.id, { fftSize: desiredFft, frequencies: new Uint8Array(visualAnalyzer.frequencyBinCount), leftWaveform: new Uint8Array(desiredFft), rightWaveform: new Uint8Array(desiredFft), smoothedLeft: new Uint8Array(desiredFft).fill(128), smoothedRight: new Uint8Array(desiredFft).fill(128) });
      }
      let lastPaint = 0;
      const paint = (now: number) => {
        if (!active) return;
        const deltaMs = Math.max(16, Math.min(100, lastPaint ? now - lastPaint : 33));
        const paintIntervalMs = playingRef.current ? 1000 / Math.max(1, Math.min(60, fps)) : 100;
        if (now - lastPaint < paintIntervalMs) { frame = requestAnimationFrame(paint); return; }
        lastPaint = now;
        for (const visual of effects.current) {
          const canvas = canvases.current.get(visual.id), ctx = canvas?.getContext('2d');
          if (!canvas || !ctx) continue;
          const w = canvas.width, h = canvas.height;
          const bands = Math.max(16, Math.min(256, Math.round(visual.barCount ?? visual.density ?? 64))); 
          if (visual.kind === 'mediaLogo') {
            ctx.clearRect(0, 0, w, h);
            const prepared = getPreparedMedia(visual, w, h);
            if (prepared) {
              const amount = Math.max(0, Math.min(.3, visual.motionAmount ?? .08));
              const speed = Math.max(.1, Math.min(4, visual.motionSpeed ?? 1));
              const motion = visual.mediaMotion ?? 'pulse-float';
              const projectTime = Math.max(0, timeRef.current);
              const phase = projectTime * Math.PI * 2 * speed;
              const pulse = motion === 'pulse' || motion === 'pulse-float' ? 1 + Math.min(.15, amount) * (0.5 + 0.5 * Math.sin(Math.PI * projectTime * speed)) : 1;
              const floatX = motion === 'float' || motion === 'pulse-float' ? Math.sin(phase * .42) * amount * w * .42 : 0;
              const floatY = motion === 'float' || motion === 'pulse-float' ? Math.cos(phase * .31) * amount * h * .28 : 0;
              const rotation = motion === 'rotate' ? Math.sin(phase * .35) * amount * .85 : 0;
              ctx.save(); ctx.translate(w / 2 + floatX, h / 2 + floatY); ctx.rotate(rotation); ctx.scale(pulse, pulse); ctx.drawImage(prepared, -w / 2, -h / 2, w, h); ctx.restore();
            }
            ctx.shadowBlur = 0;
            continue;
          }
          const visualAnalyzer = routing!.analysers.get(visual.id);
          if (!visualAnalyzer) continue;
          const cachedBuffers = audioBuffers.current.get(visual.id);
          const stereoAnalyzers = routing!.stereoAnalysers.get(visual.id);
          if (!cachedBuffers || cachedBuffers.fftSize !== visualAnalyzer.fftSize) {
            audioBuffers.current.set(visual.id, { fftSize: visualAnalyzer.fftSize, frequencies: new Uint8Array(visualAnalyzer.frequencyBinCount), leftWaveform: new Uint8Array(visualAnalyzer.fftSize), rightWaveform: new Uint8Array(visualAnalyzer.fftSize), smoothedLeft: new Uint8Array(visualAnalyzer.fftSize).fill(128), smoothedRight: new Uint8Array(visualAnalyzer.fftSize).fill(128) });
          }
          const buffers = audioBuffers.current.get(visual.id)!;
          visualAnalyzer.getByteFrequencyData(buffers.frequencies);
          stereoAnalyzers?.left.getByteTimeDomainData(buffers.leftWaveform); stereoAnalyzers?.right.getByteTimeDomainData(buffers.rightWaveform);
          let levels = levelsRef.current.get(visual.id);
          if (!levels || levels.length !== bands) { levels = Array(bands).fill(0); levelsRef.current.set(visual.id, levels); }
          const smoothing = Math.max(0, Math.min(.97, visual.smoothing ?? .9));
          const smoothingFrames = Math.max(1, Math.min(6, Math.round(1 + smoothing * 5)));
          // Approximate FFmpeg tmix's centered moving-average response in live preview.
          const temporalTau = Math.max(1 / Math.max(1, fps), (smoothingFrames / Math.max(1, fps)) * .63);
          const temporalAlpha = 1 - Math.exp(-(deltaMs / 1000) / temporalTau);
          const attack = temporalAlpha;
          const release = temporalAlpha;
          for (let sampleIndex = 0; sampleIndex < buffers.leftWaveform.length; sampleIndex++) {
            // Typed-array indexed reads may be undefined under noUncheckedIndexedAccess.
            // Neutral midpoint fallbacks keep the smoothing behavior safe without changing
            // valid in-range samples (all waveform buffers are initialized to the same length).
            const smoothedLeft = buffers.smoothedLeft[sampleIndex] ?? 128;
            const waveformLeft = buffers.leftWaveform[sampleIndex] ?? 128;
            const smoothedRight = buffers.smoothedRight[sampleIndex] ?? 128;
            const waveformRight = buffers.rightWaveform[sampleIndex] ?? 128;
            buffers.smoothedLeft[sampleIndex] = Math.max(0, Math.min(255, Math.round(smoothedLeft + (waveformLeft - smoothedLeft) * temporalAlpha)));
            buffers.smoothedRight[sampleIndex] = Math.max(0, Math.min(255, Math.round(smoothedRight + (waveformRight - smoothedRight) * temporalAlpha)));
          }
          const silent = !playingRef.current || !buffers.frequencies.some((value) => value > 0);
          for (let index = 0; index < bands; index++) {
            const fraction = index / Math.max(1, bands - 1);
            const binHz = visual.frequencyScale === 'linear'
              ? (visual.frequencyMinHz ?? 40) + fraction * (Math.max(visual.frequencyMinHz ?? 40, visual.frequencyMaxHz ?? 16000) - (visual.frequencyMinHz ?? 40))
              : Math.max(20, visual.frequencyMinHz ?? 40) * Math.pow(Math.max(1.01, (visual.frequencyMaxHz ?? 16000) / Math.max(20, visual.frequencyMinHz ?? 40)), fraction);
            const bin = Math.round(binHz * buffers.fftSize / Math.max(1, context.sampleRate));
            const centerBin = Math.min(buffers.frequencies.length - 1, Math.max(1, bin));
            let binSum = 0;
            let binCount = 0;
            const frequencyWindowRadius = Math.max(2, Math.min(32, Math.round(8 + smoothing * 24))); 
            for (let offset = -frequencyWindowRadius; offset <= frequencyWindowRadius; offset++) {
              const binIndex = Math.max(0, Math.min(buffers.frequencies.length - 1, centerBin + offset));
              binSum += buffers.frequencies[binIndex] ?? 0;
              binCount++;
            }
            const binAverage = binSum / Math.max(1, binCount * 255);
            const magnitude = silent ? .008 : Math.min(.92, binAverage * visual.sensitivity);
            const previous = levels[index] ?? 0;
            levels[index] = previous + (magnitude - previous) * (magnitude > previous ? attack : release);
          }
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = visual.color; ctx.fillStyle = visual.color;
          ctx.lineWidth = Math.max(1, w / 600);
          ctx.shadowColor = visual.color;
          drawStereoModel(ctx, visual.stereoStyle ?? 'basic-split', w, h, buffers.smoothedLeft, buffers.smoothedRight, visual, levels, timeRef.current);
          ctx.shadowBlur = 0;
        }
        frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
      return () => {
        active = false; cancelAnimationFrame(frame); contextRef.current = null; routing.users--;
        if (routing.users === 0) routing.closing = window.setTimeout(() => {
          if (routing.users !== 0) return;
          analysers.delete(element);
          for (const [id, node] of routing.analysers) {
            const stereo = routing.stereoAnalysers.get(id);
            try {
              routing.source.disconnect(node); node.disconnect(); routing.mutedOutputs.get(id)?.disconnect();
              if (stereo) { routing.splitter.disconnect(stereo.left); routing.splitter.disconnect(stereo.right); stereo.left.disconnect(); stereo.right.disconnect(); }
              routing.stereoMutedOutputs.get(id)?.forEach((gain) => gain.disconnect());
            } catch { /* context may already be closing */ }
          }
          routing.analysers.clear(); routing.mutedOutputs.clear(); routing.stereoAnalysers.clear(); routing.stereoMutedOutputs.clear();
          try { routing.source.disconnect(); routing.splitter.disconnect(); } catch { /* already disconnected */ }
          void routing.context.close().catch(() => undefined);
        }, 500);
      };
    } catch (error) { contextRef.current = null; onError?.(`Visualizer tidak dapat membaca audio preview: ${error instanceof Error ? error.message : String(error)}`); }
    return undefined;
  }, [audio, fps, routingSignature]);

  useEffect(() => { if (playing) void contextRef.current?.resume().catch(() => undefined); }, [playing]);

  useEffect(() => {
    if (audio) return;
    for (const visual of items) {
      const canvas = canvases.current.get(visual.id), ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) continue;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (visual.kind === 'mediaLogo') {
        const prepared = getPreparedMedia(visual, w, h);
        if (prepared) ctx.drawImage(prepared, 0, 0, w, h);
        continue;
      }
      // Show a neutral demonstration of the selected stereo model before audio is selected.
      const length = Math.max(512, Math.min(4096, w * 2));
      const left = new Uint8Array(length), right = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        const phase = i / length * Math.PI * 16;
        left[i] = Math.max(0, Math.min(255, Math.round(128 + Math.sin(phase) * (28 + 58 * Math.abs(Math.sin(phase * .21))))));
        right[i] = Math.max(0, Math.min(255, Math.round(128 + Math.sin(phase + .8) * (24 + 54 * Math.abs(Math.sin(phase * .17))))));
      }
      const levels = Array.from({length: Math.max(16, Math.min(128, visual.density ?? 64))}, (_, i) => .12 + .55 * Math.abs(Math.sin(i * .37)));
      drawStereoModel(ctx, visual.stereoStyle ?? 'basic-split', w, h, left, right, visual, levels, time);
    }
  }, [audio, items, imageRevision, time]);

  return <>{items.map((visual) => {
    const width = Math.max(32, Math.min(3840, Math.round(visual.size.width)));
    const height = Math.max(16, Math.min(2160, Math.round(visual.size.height)));
    const selected = selectedId === visual.id;
    const onWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); event.stopPropagation();
      onLayerWheelZoom?.(visual.id, event.deltaY < 0 ? 1 : -1);
    };
    return <div key={visual.id} className={`mrp-preview-visualizer-frame${selected ? ' is-selected' : ''}`} style={{ left: visual.position.x, top: visual.position.y, width: visual.size.width, height: visual.size.height, opacity: visual.opacity * ((visual.fadeInSec ?? 0) > 0 ? Math.min(1, Math.max(0, time) / (visual.fadeInSec ?? 1)) : 1), mixBlendMode: blendModes[visual.blendMode ?? 'normal'] }} onPointerDown={(event) => onLayerPointerDown?.(visual.id, 'move', event)} onWheel={onWheelZoom} title={selected ? 'Seret untuk memindahkan · tarik sudut untuk resize · Ctrl+scroll untuk zoom' : 'Klik untuk memilih visualizer'}>
      <canvas ref={(node) => { if (node) canvases.current.set(visual.id, node); else { canvases.current.delete(visual.id); levelsRef.current.delete(visual.id); } }} width={width} height={height} className="mrp-preview-visualizer" aria-label={`Audio visualizer ${visual.id}`} />
      {selected && <><span className="mrp-preview-visualizer__resize nw" aria-label="Resize kiri atas" onPointerDown={(event) => onLayerPointerDown?.(visual.id, 'resize', event, 'nw')} /><span className="mrp-preview-visualizer__resize ne" aria-label="Resize kanan atas" onPointerDown={(event) => onLayerPointerDown?.(visual.id, 'resize', event, 'ne')} /><span className="mrp-preview-visualizer__resize sw" aria-label="Resize kiri bawah" onPointerDown={(event) => onLayerPointerDown?.(visual.id, 'resize', event, 'sw')} /><span className="mrp-preview-visualizer__resize se" aria-label="Resize kanan bawah" onPointerDown={(event) => onLayerPointerDown?.(visual.id, 'resize', event, 'se')} /></>}
    </div>;
  })}</>;
}
