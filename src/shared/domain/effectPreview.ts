import { beatAt, type BeatSync, type MainMediaEffect, type ParticleEffect } from './effectTypes';
import { inFrame, particleBounds, particleMotionFactor, particleOscillationsPerSecond, particleTravelPixelsPerSecond } from './particleGeometry';

export function mainEffectStyle(effects: MainMediaEffect[] = [], time: number, beat: BeatSync, displayScale = 1): { transform: string; filter: string } {
  let x = 0, y = 0, scale = 1, rotation = 0, brightness = 1, saturation = 1, hue = 0;
  for (const e of effects) {
    const active = beatAt(time, beat);
    const phase = 2 * Math.PI * (time - (e.beatSync ? active.phaseSec : 0)) * (e.beatSync ? active.bpm / 60 : 1) * e.speed;
    const pulse = (1 + Math.cos(phase)) / 2;
    const strength = e.opacity * ((e.fadeInSec ?? 0) > 0 ? Math.min(1, Math.max(0, time) / e.fadeInSec!) : 1);
    if (e.kind === 'blink' || e.kind === 'flicker') brightness -= (e.kind === 'flicker' ? 0.18 : 0.45) * strength * pulse;
    if (e.kind === 'light') { brightness += 0.18 * strength * pulse; saturation += 0.22 * strength * pulse; }
    if (e.kind === 'pulse') scale *= 1 + 0.025 * strength * pulse;
    if (e.kind === 'zoom') scale *= 1 + 0.085 * strength * pulse;
    if (e.kind === 'sway' || e.kind === 'wobble') rotation += (e.kind === 'wobble' ? 4 : 2) * strength * (e.axisX || 1) * Math.sin(phase);
    if (e.kind === 'float') { x += 12 * strength * e.axisX * Math.sin(phase); y += 20 * strength * e.axisY * Math.cos(phase); }
    if (e.kind === 'tint') { hue += 16 * strength * pulse; saturation += 0.28 * strength * pulse; }
    if (e.kind === 'shake' || e.kind === 'glitch') { x += (e.kind === 'shake' ? 14 : 22) * strength * e.axisX * Math.sin(phase); y += (e.kind === 'shake' ? 14 : 22) * strength * e.axisY * Math.cos(phase); }
    if (e.kind === 'glitch') hue += 8 * strength * pulse;
  }
  const safeDisplayScale = Number.isFinite(displayScale) ? Math.max(0.01, Math.min(4, displayScale)) : 1;
  return { transform: `translate(${(x * safeDisplayScale).toFixed(2)}px,${(y * safeDisplayScale).toFixed(2)}px) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(4)})`, filter: `brightness(${Math.max(0.1, brightness).toFixed(3)}) saturate(${saturation.toFixed(3)}) hue-rotate(${hue.toFixed(2)}deg)` };
}

export function particlePosition(effect: ParticleEffect, index: number, time: number, beat: BeatSync): { x: number; y: number; opacity: number } {
  const active = beatAt(time, beat);
  const {x:baseX,y:baseY,amplitude,margin,phase} = particleBounds(effect,index);
  const angle = effect.rotation * Math.PI / 180;
  const speed = particleMotionFactor(effect,beat.bpm);
  const wave = 2 * Math.PI * time * particleOscillationsPerSecond * speed;
  const beatWave = 2*Math.PI*(time-active.phaseSec)*active.bpm/60;
  const rotation = angle + phase;
  let dx = amplitude * Math.sin(wave + phase) * Math.cos(rotation);
  let dy = amplitude * Math.cos(wave + phase) * Math.sin(rotation);
  const wrap=(value:number,span:number)=>((value%span)+span)%span;
  const spanX=1920-2*margin, spanY=1080-2*margin;
  const travel=time*particleTravelPixelsPerSecond*speed;
  const originX=effect.flipX?1920-baseX:baseX, originY=effect.flipY?1080-baseY:baseY;
  let x=originX,y=originY,fade=1;
  if(effect.motion==='fall'||effect.motion==='zigzag'||effect.motion==='rise'||effect.motion==='evaporate') {
    const descending=effect.motion==='fall'||effect.motion==='zigzag';
    const progress=wrap(originY-margin+(descending?travel:-travel),spanY)/spanY;
    y=margin+progress*spanY;
    if(effect.motion==='zigzag')x+=amplitude*Math.sin(wave*3+phase);
    fade=Math.min(1,progress*12,(1-progress)*12);
  } else if(effect.motion==='drift') {
    const progress=wrap(originX-margin+travel,spanX)/spanX;
    x=margin+progress*spanX;
    fade=Math.min(1,progress*12,(1-progress)*12);
  } else if(effect.motion==='spread'||effect.motion==='spiral') {
    const progress=wrap(time*particleOscillationsPerSecond*speed+phase/(2*Math.PI),1);
    const direction=effect.motion==='spiral'?rotation+wave:rotation;
    x+=amplitude*progress*Math.cos(direction);
    y+=amplitude*progress*Math.sin(direction);
    fade=Math.min(1,progress*12,(1-progress)*12);
  } else if(effect.motion==='orbit') {
    x+=amplitude*Math.cos(wave+rotation);y+=amplitude*Math.sin(wave+rotation);
  } else if(effect.motion==='bounce') {
    x+=dx;y-=amplitude*Math.abs(Math.sin(wave+phase));
  } else { x+=dx;y+=dy; }
  x=inFrame(x,margin,1920); y=inFrame(y,margin,1080);
  const pulse = effect.beatSync ? (0.65 + 0.35 * Math.cos(beatWave)) : 1;
  const countPulse = (0.5 + 0.5 * Math.cos(beatWave));
  const threshold = (index - effect.minCount + 1) / (effect.maxCount - effect.minCount + 1);
  const enabled = index < effect.minCount ? 1 : Math.max(0, Math.min(1, (countPulse - threshold) * 4));
  const effectFadeIn = (effect.fadeInSec ?? 0) > 0 ? Math.min(1, Math.max(0, time) / effect.fadeInSec!) : 1;
  return { x, y, opacity: effect.opacity * pulse * enabled * fade * effectFadeIn };
}
