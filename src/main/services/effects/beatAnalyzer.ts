import { spawn } from 'node:child_process';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import { DEFAULT_BEAT, type BeatSync, type BeatSegment } from '../../../shared/domain/effectTypes';

/** Decode a bounded audio sample and estimate transient spacing. No third-party API. */
export async function analyzeProjectBeat(project: ProjectData, ffmpeg: string): Promise<BeatSync> {
  const tracks = project.playlistTracks?.length ? project.playlistTracks : project.playlist.files.map((file) => ({ path:file, durationSeconds:null }));
  if (tracks.length) {
    const order = project.playlist.playbackOrder;
    const ordered = order?.length === tracks.length ? order.map((file) => tracks.find((track) => track.path === file)).filter((track): track is typeof tracks[number] => !!track) : tracks;
    const segments: BeatSegment[] = [];
    let offset = 0;
    for (const track of ordered) {
      const detected = await analyzeFile(ffmpeg,track.path);
      const duration = track.durationSeconds && track.durationSeconds > 0 ? track.durationSeconds : 45;
      segments.push({ startSec:offset, endSec:offset+duration, bpm:detected.bpm, phaseSec:offset+detected.phaseSec, source:detected.source });
      offset += duration;
    }
    return { bpm:segments[0]?.bpm ?? 120, phaseSec:segments[0]?.phaseSec ?? 0, source:segments.some((s)=>s.source==='audio') ? 'audio' : 'fallback', segments };
  }
  const source = project.mainMedia?.type === 'video' && !project.mainMedia.autoMute ? project.mainMedia.path : null;
  return source ? analyzeFile(ffmpeg,source) : DEFAULT_BEAT;
}

async function analyzeFile(ffmpeg:string, source:string): Promise<BeatSync> {
  try {
    const pcm = await decodePcm(ffmpeg, source);
    const samples = new DataView(pcm.buffer, pcm.byteOffset, pcm.length);
    const step = 160; // 20ms at 8kHz
    const energy: number[] = [];
    for (let i = 0; i + step <= pcm.length / 2; i += step) {
      let sum = 0;
      for (let j = i; j < i + step; j += 1) sum += Math.abs(samples.getInt16(j * 2, true));
      energy.push(sum / step);
    }
    const peaks: number[] = [];
    let last = -100;
    for (let i = 6; i < energy.length - 6; i += 1) {
      const neighborhood = energy.slice(i - 6, i + 7);
      const average = neighborhood.reduce((a, b) => a + b, 0) / neighborhood.length;
      if ((energy[i] ?? 0) > Math.max(400, average * 1.7) && (energy[i] ?? 0) >= Math.max(...neighborhood) && i - last >= 15) { peaks.push(i * 0.02); last = i; }
    }
    const intervals = peaks.slice(1).map((time, index) => time - peaks[index]!).filter((gap) => gap >= 0.30 && gap <= 1.2).sort((a,b) => a - b);
    if (intervals.length < 4) return DEFAULT_BEAT;
    let period = intervals[Math.floor(intervals.length / 2)]!;
    while (period < 0.4) period *= 2;
    while (period > 0.85) period /= 2;
    const bpm = Math.round(60 / period);
    return { bpm: Math.max(70, Math.min(150, bpm)), phaseSec: Number(((peaks[0] ?? 0) % period).toFixed(3)), source: 'audio' };
  } catch { return DEFAULT_BEAT; }
}

function decodePcm(ffmpeg: string, file: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner','-loglevel','error','-i',file,'-t','45','-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'], { shell:false, windowsHide:true });
    const chunks: Buffer[] = []; let size = 0;
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 800000) child.kill(); else chunks.push(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 && size > 32000 ? resolve(Buffer.concat(chunks)) : reject(new Error('Sampel audio tidak tersedia.')));
  });
}
