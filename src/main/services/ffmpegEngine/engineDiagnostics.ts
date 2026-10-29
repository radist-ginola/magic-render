import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FfmpegProcess } from './ffmpegRunner';

const execFileAsync = promisify(execFile);

export type EngineDiagnostic = {
  ffmpegReady: boolean;
  ffprobeReady: boolean;
  progressReady: boolean;
  ffmpegVersion: string | null;
  progressSamples: number;
  message: string;
};

async function version(executable: string): Promise<string> {
  const { stdout } = await execFileAsync(executable, ['-version'], {
    timeout: 8000, windowsHide: true, maxBuffer: 256 * 1024,
  });
  return stdout.split(/\r?\n/, 1)[0]?.trim() || 'Versi tidak diketahui';
}

export async function testEngine(ffmpegPath: string, ffprobePath: string): Promise<EngineDiagnostic> {
  let ffmpegVersion: string | null = null;
  let ffprobeReady = false;
  const problems: string[] = [];
  try { ffmpegVersion = await version(ffmpegPath); }
  catch { problems.push('FFmpeg tidak dapat dijalankan. Pilih lokasi ffmpeg.exe yang benar.'); }
  try { await version(ffprobePath); ffprobeReady = true; }
  catch { problems.push('FFprobe tidak dapat dijalankan. Pilih lokasi ffprobe.exe yang benar.'); }

  let progressSamples = 0;
  let progressReady = false;
  if (ffmpegVersion) {
    const process = new FfmpegProcess();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        process.run({ executable: ffmpegPath, args: [
          '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30',
          '-t', '1', '-f', 'null', '-',
        ] }, { onProgress: (sample) => {
          if (sample.outTimeSec !== null && sample.progress !== null) progressSamples += 1;
        } }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => { process.cancel(); reject(new Error('Pengujian progres melampaui 12 detik.')); }, 12000);
        }),
      ]);
      progressReady = result.exitCode === 0 && progressSamples > 0;
      if (!progressReady) problems.push('FFmpeg berjalan tetapi tidak mengirim progres. Periksa versi atau ganti ffmpeg.exe.');
    } catch {
      problems.push('Uji keluaran progres FFmpeg gagal. Periksa executable dan dukungan filter lavfi.');
    } finally { if (timeout) clearTimeout(timeout); }
  }
  return {
    ffmpegReady: Boolean(ffmpegVersion), ffprobeReady, progressReady,
    ffmpegVersion, progressSamples,
    message: problems.length ? problems.join(' ') : `FFmpeg dan FFprobe siap. Monitor menerima ${progressSamples} pembaruan progres.`,
  };
}
