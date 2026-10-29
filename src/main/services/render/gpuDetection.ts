import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectSettings } from '../../../shared/domain/projectTypes';
import type { GpuInfo } from '../../../shared/domain/settingsTypes';

const exec = promisify(execFile);
type GpuEncoder = NonNullable<ProjectSettings['gpuEncoder']>;
const detectionCache = new Map<string, { at: number; info: GpuInfo }>();

async function output(file: string, args: string[]): Promise<string> {
  try { return (await exec(file, args, { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch { return ''; }
}

export async function detectGpu(ffmpegPath: string, checkEncoder = true): Promise<GpuInfo> {
  const cacheKey = `${ffmpegPath}:${checkEncoder}`;
  const cached = detectionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 60_000) return cached.info;
  const encoders = checkEncoder ? await output(ffmpegPath, ['-hide_banner', '-encoders']) : '';
  const supported = (encoder: GpuEncoder): boolean => new RegExp(`\\b${encoder}\\b`).test(encoders);
  const nvidia = await output('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  let name = '', vramMb: number | null = null;
  if (nvidia) {
    const [gpuName, memory] = nvidia.split(/\r?\n/)[0]!.split(',').map((value) => value.trim());
    name = gpuName ?? ''; vramMb = Number.isFinite(Number(memory)) ? Number(memory) : null;
  }
  if (!name && process.platform === 'win32') {
    const data = await output('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress']);
    try {
      const parsed = JSON.parse(data) as { Name?: string; AdapterRAM?: number } | Array<{ Name?: string; AdapterRAM?: number }>;
      const cards = Array.isArray(parsed) ? parsed : [parsed];
      const card = cards.find((item) => /NVIDIA|AMD|Radeon|Intel/i.test(item.Name ?? '')) ?? cards[0];
      name = card?.Name ?? '';
      // Windows AdapterRAM may wrap at 4 GB. NVIDIA-SMI is preferred when available.
      vramMb = card?.AdapterRAM ? Math.round(card.AdapterRAM / 1048576) : null;
    } catch { /* GPU may be unavailable or PowerShell blocked. */ }
  }
  if (!name && process.platform === 'linux') {
    const cards = await output('lspci', ['-mm']);
    name = cards.split(/\r?\n/).find((line) => /VGA|3D controller/i.test(line))?.replace(/^.*?(VGA compatible controller|3D controller)"?\s*/, '').replace(/"/g, '').trim() ?? '';
  }
  const encoder: GpuEncoder | null = /NVIDIA/i.test(name) && supported('h264_nvenc') ? 'h264_nvenc'
    : /AMD|Radeon/i.test(name) && supported('h264_amf') ? 'h264_amf'
    : /Intel/i.test(name) && supported('h264_qsv') ? 'h264_qsv' : null;
  let working = false;
  if (encoder) {
    try {
      await exec(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1', '-frames:v', '1', '-c:v', encoder, '-f', 'null', '-'], { timeout: 7000, windowsHide: true, maxBuffer: 1024 * 1024 });
      working = true;
    } catch { /* Encoder listed by FFmpeg can still fail when a driver is absent. */ }
  }
  const info: GpuInfo = { name: name || 'GPU tidak terdeteksi', vramMb, encoder: working ? encoder : null, available: working,
    message: !name ? 'GPU tidak terdeteksi.' : !checkEncoder ? `${name} • ${vramMb === null ? 'VRAM tidak tersedia' : `${vramMb} MB VRAM`} • mode CPU (encoder GPU tidak diuji)` : working ? `${name} • ${vramMb === null ? 'VRAM tidak tersedia' : `${vramMb} MB VRAM`} • ${encoder} siap dipakai` : `${name} terdeteksi, tetapi encoder H.264 GPU belum berhasil diuji. Periksa driver dan FFmpeg.` };
  detectionCache.set(cacheKey, { at: Date.now(), info });
  return info;
}
