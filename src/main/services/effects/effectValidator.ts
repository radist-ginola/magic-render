import type { MainMediaEffect, ParticleEffect } from '../../../shared/domain/effectTypes';

const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateMainEffect(value: unknown): MainMediaEffect {
  const e = value as MainMediaEffect;
  if (!e || typeof e.id !== 'string' || !/^[\w-]{1,80}$/.test(e.id) || !['blink','pulse','sway','shake','zoom','light','glitch','flicker','float','tint','wobble'].includes(e.kind) || !inRange(e.opacity,0,1) || !inRange(e.axisX,-1,1) || !inRange(e.axisY,-1,1) || !inRange(e.speed,0.25,4) || typeof e.beatSync !== 'boolean' || (e.fadeInSec !== undefined && !inRange(e.fadeInSec,0,30))) throw new Error('Efek media utama tidak valid.');
  return e;
}

export function validateParticleEffect(value: unknown): ParticleEffect {
  const e = value as ParticleEffect;
  if (!e || typeof e.id !== 'string' || !/^[\w-]{1,80}$/.test(e.id) || !['firefly','dust','smoke','stars','colors','lines','rain','snow','embers','petals','sparks','bubbles','confetti','leaves','fire','meteor','glitter','firefliesBlue','pollen','ash','ice','neon','hearts','diamonds','twinkle'].includes(e.kind) || !['spread','fall','drift','evaporate','orbit','spiral','zigzag','bounce','rise'].includes(e.motion) || !inRange(e.opacity,0,1) || !inRange(e.rotation,-360,360) || !inRange(e.speed,0.25,4) || !inRange(e.minCount,1,40) || !inRange(e.maxCount,e.minCount,40) || !inRange(e.minDistance,0,1000) || !inRange(e.maxDistance,e.minDistance,2000) || (e.size !== undefined && !inRange(e.size,8,110)) || (e.color !== undefined && (typeof e.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(e.color))) || !Number.isInteger(e.minCount) || !Number.isInteger(e.maxCount) || typeof e.flipX !== 'boolean' || typeof e.flipY !== 'boolean' || typeof e.beatSync !== 'boolean' || (e.fadeInSec !== undefined && !inRange(e.fadeInSec,0,30))) throw new Error('Efek partikel tidak valid.');
  return e;
}
