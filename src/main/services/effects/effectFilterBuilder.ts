import type { BeatSync, MainMediaEffect, ParticleEffect } from '../../../shared/domain/effectTypes';
import { DEFAULT_BEAT } from '../../../shared/domain/effectTypes';
import { particleBounds, particleColor, particleGlyph, particleSize, particleMotionFactor, particleTravelPixelsPerSecond, particleOscillationsPerSecond } from '../../../shared/domain/particleGeometry';

const n = (value: number) => String(Number(value.toFixed(4)));

function wave(effect: { speed: number; beatSync: boolean }, beat: BeatSync, time = 't'): string {
  const expression = (bpm:number, offset:number) => `2*PI*(${time}-${n(offset)})*${n(bpm / 60 * effect.speed)}`;
  if (!effect.beatSync) return expression(60,0);
  const segments = beat.segments;
  if (!segments?.length) return expression(beat.bpm,beat.phaseSec);
  return segments.slice(0,-1).reduceRight((later, segment) => `if(lt(${time}\\,${n(segment.endSec)})\\,${expression(segment.bpm,segment.phaseSec)}\\,${later})`, expression(segments.at(-1)!.bpm,segments.at(-1)!.phaseSec));
}

export function buildMainEffectFilters(effects: MainMediaEffect[] = [], input: string, width: number, height: number, fps: number, beat: BeatSync = DEFAULT_BEAT): { filters: string[]; output: string } {
  const filters: string[] = [];
  let current = input;
  effects.forEach((e, index) => {
    const label = `main_effect_${index}`;
    const phase = wave(e, beat);
    const pulse = `(0.5+0.5*cos(${phase}))`;
    const fade = (e.fadeInSec ?? 0) > 0 ? `min(1\\,t/${n(e.fadeInSec!)})` : '1';
    const strength = `${n(e.opacity)}*${fade}`;
    let filter = 'null';
    if (e.kind === 'blink' || e.kind === 'flicker') filter = `eq=brightness='-${n(e.kind === 'flicker' ? 0.18 : 0.45)}*${strength}*${pulse}':eval=frame`;
    if (e.kind === 'light') filter = `eq=brightness='${n(0.18)}*${strength}*${pulse}':saturation='1+${n(0.22)}*${strength}*${pulse}':eval=frame`;
    if (e.kind === 'pulse' || e.kind === 'zoom') {
      const amount = e.kind === 'pulse' ? 0.025 : 0.085;
      const zoomFade = (e.fadeInSec ?? 0) > 0 ? `*min(1\\,on/${n(fps * e.fadeInSec!)})` : '';
      filter = `zoompan=z='1+${n(amount * e.opacity)}*(0.5+0.5*cos(${wave(e, beat, `on/${fps}`)}))${zoomFade}':d=1:s=${width}x${height}:fps=${fps}`;
    }
    if (e.kind === 'sway' || e.kind === 'wobble') filter = `rotate=a='${n((e.kind === 'wobble' ? 0.07 : 0.035) * e.opacity * (e.axisX || 1))}*${fade}*sin(${phase})':fillcolor=black`;
    if (e.kind === 'float') filter = `pad=iw+48:ih+48:24:24:color=black,crop=${width}:${height}:x='24+${n(12 * e.axisX)}*${strength}*sin(${phase})':y='24+${n(20 * e.axisY)}*${strength}*cos(${phase})'`;
    if (e.kind === 'tint') filter = `hue=h='${n(16)}*${strength}*${pulse}':s='1+${n(0.28)}*${strength}*${pulse}'`;
    if (e.kind === 'shake' || e.kind === 'glitch') {
      const magnitude = (e.kind === 'shake' ? 14 : 22);
      const horizontal = n(magnitude * e.axisX), vertical = n(magnitude * e.axisY);
      filter = `pad=iw+48:ih+48:24:24:color=black,crop=${width}:${height}:x='24+${horizontal}*${strength}*sin(${phase})':y='24+${vertical}*${strength}*cos(${phase})'`;
      if (e.kind === 'glitch') filter += `,hue=h='${n(8)}*${strength}*(0.5+0.5*cos(${phase}))'`;
    }
    filters.push(`[${current}]${filter}[${label}]`);
    current = label;
  });
  return { filters, output: current };
}

/** Procedural particles: no downloaded assets and no intermediate video encode. */
export function buildParticleFilters(effects: ParticleEffect[] = [], input: string, width: number, height: number, beat: BeatSync = DEFAULT_BEAT, fps = 30): { filters: string[]; output: string } {
  const filters: string[] = [];
  let current = input;
  effects.forEach((e, effectIndex) => {
    const underlying = current;
    if (e.kind === 'smoke') {
      current = `smoke_canvas_${effectIndex}`;
      filters.push(`color=c=black@0:s=${width}x${height}:r=${fps},format=rgba[${current}]`);
    }
    for (let i = 0; i < e.maxCount; i += 1) {
      const {x,y,amplitude,margin,phase} = particleBounds(e,i,width,height);
      const a = n(amplitude), p = n(phase), rotation = n(phase + e.rotation * Math.PI/180);
      const speed = particleMotionFactor(e,beat.bpm);
      const baseX = n(e.flipX ? width-x : x), baseY = n(e.flipY ? height-y : y);
      const travel=n(particleTravelPixelsPerSecond*speed*width/1920);
      const oscillation=n(2*Math.PI*particleOscillationsPerSecond*speed);
      const cycle=`t*${oscillation}+${p}`;
      let dx=`${a}*sin(${cycle})*${n(Math.cos(phase+e.rotation*Math.PI/180))}`;
      let dy=`${a}*cos(${cycle})*${n(Math.sin(phase+e.rotation*Math.PI/180))}`;
      let axisX=`${baseX}+${dx}`,axisY=`${baseY}+${dy}`,fade='1';
      if (['fall','zigzag','rise','evaporate'].includes(e.motion)) {
        const delta=`${e.motion==='rise'||e.motion==='evaporate'?'-':''}t*${travel}`;
        const progress=`mod(${baseY}-${n(margin)}+(${delta})+${n(height-2*margin)}*100000\\,${n(height-2*margin)})/${n(height-2*margin)}`;
        axisY=`${n(margin)}+(${progress})*${n(height-2*margin)}`;
        axisX=e.motion==='zigzag'?`${baseX}+${a}*sin(3*${cycle})`:baseX;
        fade=`min(1\\,min((${progress})*12\\,(1-(${progress}))*12))`;
      } else if(e.motion==='drift') {
        const progress=`mod(${baseX}-${n(margin)}+t*${travel}+${n(width-2*margin)}*100000\\,${n(width-2*margin)})/${n(width-2*margin)}`;
        axisX=`${n(margin)}+(${progress})*${n(width-2*margin)}`;axisY=baseY;
        fade=`min(1\\,min((${progress})*12\\,(1-(${progress}))*12))`;
      } else if(e.motion==='spread'||e.motion==='spiral') {
        const progress=`mod(t*${n(particleOscillationsPerSecond*speed)}+${n(phase/(2*Math.PI))}\\,1)`;
        const direction=e.motion==='spiral'?`${rotation}+t*${oscillation}`:rotation;
        axisX=`${baseX}+${a}*(${progress})*cos(${direction})`;
        axisY=`${baseY}+${a}*(${progress})*sin(${direction})`;
        fade=`min(1\\,min((${progress})*12\\,(1-(${progress}))*12))`;
      } else if(e.motion==='orbit') {axisX=`${baseX}+${a}*cos(t*${oscillation}+${rotation})`;axisY=`${baseY}+${a}*sin(t*${oscillation}+${rotation})`;}
      else if(e.motion==='bounce'){axisY=`${baseY}-${a}*abs(sin(${cycle}))`;}
      const horizontal = `max(${n(margin)}\\,min(${n(width-margin)}\\,${axisX}))`;
      const vertical = `max(${n(margin)}\\,min(${n(height-margin)}\\,${axisY}))`;
      const threshold = n((i - e.minCount + 1) / (e.maxCount - e.minCount + 1));
      const extra = i < e.minCount ? '' : `*max(0\\,min(1\\,((0.5+0.5*cos(${wave(e, beat)}))-${threshold})*4))`;
      const fadeIn = (e.fadeInSec ?? 0) > 0 ? `*min(1\\,t/${n(e.fadeInSec!)})` : '';
      const alpha = `${n(e.opacity * (e.kind === 'smoke' ? 0.38 : 1))}*(${fade})${fadeIn}${e.beatSync ? `*(0.65+0.35*cos(${wave(e, beat)}))` : ''}${extra}`;
      const size = Math.max(10, Math.round(particleSize(e) * width / 1920));
      const next = `particle_${effectIndex}_${i}`;
      filters.push(`[${current}]drawtext=font='Segoe UI Symbol':text='${particleGlyph[e.kind]}':fontcolor=${particleColor(e,i).slice(1)}:fontsize=${size}:alpha='${alpha}':x='${horizontal}':y='${vertical}'[${next}]`);
      current = next;
    }
    if (e.kind === 'smoke') {
      const blurred = `smoke_blur_${effectIndex}`, combined = `smoke_composite_${effectIndex}`;
      filters.push(`[${current}]gblur=sigma=${Math.max(2, Math.round(12 * width / 1920))}[${blurred}]`);
      filters.push(`[${underlying}][${blurred}]overlay=eof_action=repeat:format=auto[${combined}]`);
      current = combined;
    }
  });
  return { filters, output: current };
}
