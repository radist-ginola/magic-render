import path from 'node:path';
import type { ProjectTextOverlay, TextOverlayConfig } from '../../../shared/domain/textOverlayTypes';

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function escapePath(value: string): string {
  return escapeDrawtext(value.replaceAll('\\', '/'));
}

function color(value: string): string {
  if (!/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) throw new Error(`Warna teks tidak valid: ${value}`);
  return value.startsWith('#') ? value.slice(1) : value;
}

function fontOption(fontFamily: string): string {
  const looksLikeFontFile = /\.(ttf|otf|ttc)$/i.test(fontFamily) && path.isAbsolute(fontFamily);
  return looksLikeFontFile ? `fontfile='${escapePath(fontFamily)}'` : `font='${escapeDrawtext(fontFamily)}'`;
}

function alphaExpression(config: TextOverlayConfig, totalDurationSec?: number): string | null {
  const opacity = Number(config.opacity.toFixed(6));
  const factors: string[] = [];
  if ((config.fadeInSec ?? 0) > 0) factors.push(`min(1\\,t/${Number(config.fadeInSec!.toFixed(6))})`);
  if (config.animation === 'fade-in') factors.push('if(lt(t,1)\\,t\\,1)');
  if (config.animation === 'fade-out' && totalDurationSec && totalDurationSec > 0) factors.push(`if(gt(t,${Math.max(0, totalDurationSec - 1)})\\,${Math.max(0, totalDurationSec)}-t\\,1)`);
  if (config.animation === 'pulse') factors.push('(0.7+0.3*(0.5+0.5*sin(2*PI*t)))');
  return factors.length ? `alpha='${opacity}*${factors.join('*')}'` : null;
}

function buildX(config: TextOverlayConfig, canvasScale = 1): string {
  switch (config.animation) {
    case 'running-left': return `w-mod(t*${config.speed * 100 * canvasScale}+tw\,w+tw)`;
    case 'running-right': return `mod(t*${config.speed * 100 * canvasScale}+w\,w+tw)-tw`;
    default: return String(Math.round(config.position.x * canvasScale));
  }
}

export class TextOverlayBuilder {
  build(overlay: ProjectTextOverlay, inputLabel: string, outputLabel: string, totalDurationSec?: number, canvasScale = 1): string {
    const c = overlay.config;
    validateTextConfig(c);
    const parts = [
      fontOption(c.fontFamily),
      `text='${escapeDrawtext(c.text)}'`,
      `fontcolor=${color(c.fontColor)}`,
      `fontsize=${Math.max(1, Math.round(c.fontSize * (c.scale ?? 1) * canvasScale))}`,
      `x=${buildX(c, canvasScale)}`,
      `y=${Math.round(c.position.y * canvasScale)}`,
      `bordercolor=${color(c.strokeColor)}`,
      `borderw=${Math.round(c.strokeWidth * canvasScale)}`,
      `shadowcolor=${color(c.glowColor)}@${c.neonGlow ? Math.min(1, c.opacity * 0.8) : 0}`,
      `shadowx=${c.neonGlow ? Math.max(1, Math.round(c.glowBlur / 6 * canvasScale)) : 0}`,
      `shadowy=${c.neonGlow ? Math.max(1, Math.round(c.glowBlur / 6 * canvasScale)) : 0}`,
      `alpha=${c.opacity}`,
    ];
    const alpha = alphaExpression(c, totalDurationSec);
    if (alpha) parts[parts.findIndex((x) => x.startsWith('alpha='))] = alpha;

    const base = `[${inputLabel}]drawtext=${parts.join(':')}[${outputLabel}_base]`;
    const chains = [base];
    let current = `${outputLabel}_base`;

    if (c.bold) {
      const next = `${outputLabel}_bold`;
      chains.push(`[${current}]drawtext=${parts.map((p) => p.startsWith('x=') ? `x=(${buildX(c, canvasScale)}+${0.9 * canvasScale})` : p).join(':')}[${next}]`);
      current = next;
    }

    if (c.underline) {
      const next = `${outputLabel}_underline`;
      const underlineText = '_'.repeat(Math.max(1, Math.ceil(c.text.length * 0.75)));
      chains.push(`[${current}]drawtext=${fontOption(c.fontFamily)}:text='${underlineText}':fontcolor=${color(c.fontColor)}:fontsize=${Math.max(1, Math.round(c.fontSize * (c.scale ?? 1) * 0.5 * canvasScale))}:${alpha ? alpha : `alpha=${c.opacity}`}:x=${buildX(c, canvasScale)}:y=${Math.round((c.position.y + c.fontSize * 0.92) * canvasScale)}[${next}]`);
      current = next;
    }

    if (current !== outputLabel) chains.push(`[${current}]null[${outputLabel}]`);
    return chains.join(';');
  }
}

export function validateTextConfig(c: TextOverlayConfig): void {
  if (!c.text.trim()) throw new Error('Teks overlay tidak boleh kosong.');
  if (c.fontSize < 8 || c.fontSize > 512) throw new Error('Ukuran font harus 8–512.');
  if (c.opacity < 0 || c.opacity > 1) throw new Error('Opacity teks harus 0–1.');
  if (c.fadeInSec !== undefined && (!Number.isFinite(c.fadeInSec) || c.fadeInSec < 0 || c.fadeInSec > 30)) throw new Error('Fade-in teks harus 0–30 detik.');
  if (c.strokeWidth < 0 || c.strokeWidth > 64) throw new Error('Stroke teks harus 0–64.');
  if (c.glowBlur < 0 || c.glowBlur > 64) throw new Error('Glow blur harus 0–64.');
  if (c.speed <= 0 || c.speed > 20) throw new Error('Kecepatan animasi harus >0 dan ≤20.');
  if ((c.scale ?? 1) < 0.1 || (c.scale ?? 1) > 12) throw new Error('Scale teks harus 0.1–12.');
  if ((c.rotation ?? 0) < -360 || (c.rotation ?? 0) > 360) throw new Error('Rotasi teks harus -360–360 derajat.');
  color(c.fontColor); color(c.strokeColor); color(c.glowColor);
  if (c.position.x < 0 || c.position.y < 0) throw new Error('Posisi teks tidak boleh negatif.');
  if (!c.fontFamily.trim()) throw new Error('Font harus dipilih.');
}
