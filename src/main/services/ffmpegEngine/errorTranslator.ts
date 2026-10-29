import type { RenderStage } from '../../../shared/domain/renderTypes';

export type FfmpegErrorContext = {
  stage?: RenderStage;
  stderr?: string;
  exitCode?: number | null;
};

export type TranslatedFfmpegError = {
  title: string;
  message: string;
  solution: string;
  code: string;
};

type Rule = {
  code: string;
  priority: number;
  matches: (text: string, context: FfmpegErrorContext) => boolean;
  translate: (context: FfmpegErrorContext) => TranslatedFfmpegError;
};

const RULES: readonly Rule[] = [
  {
    code: 'MOOV_ATOM_NOT_FOUND',
    priority: 100,
    matches: (text) => /moov atom not found|invalid data found when processing input/i.test(text),
    translate: (context) => ({
      code: 'MOOV_ATOM_NOT_FOUND',
      title: 'File video tidak dapat dibaca',
      message: 'File video utama rusak atau struktur MP4/MOV-nya tidak lengkap.',
      solution: 'Coba import ulang file sumber atau gunakan salinan video yang dapat diputar normal di pemutar lain.',
    }),
  },
  {
    code: 'INPUT_FILE_MISSING',
    priority: 90,
    matches: (text) => /no such file or directory|cannot open input|error opening input file/i.test(text),
    translate: () => ({
      code: 'INPUT_FILE_MISSING',
      title: 'File input tidak ditemukan',
      message: 'FFmpeg tidak dapat membuka salah satu file sumber.',
      solution: 'Periksa apakah file masih berada di lokasi semula dan import ulang asset yang hilang.',
    }),
  },
  {
    code: 'PERMISSION_DENIED',
    priority: 85,
    matches: (text) => /permission denied|access is denied|operation not permitted/i.test(text),
    translate: () => ({
      code: 'PERMISSION_DENIED',
      title: 'Akses file ditolak Windows',
      message: 'Aplikasi tidak memiliki izin membaca sumber atau menulis output.',
      solution: 'Pilih folder output yang dapat ditulis dan pastikan file sumber tidak sedang dikunci aplikasi lain.',
    }),
  },
  {
    code: 'DISK_FULL',
    priority: 80,
    matches: (text) => /no space left on device|disk full|not enough space/i.test(text),
    translate: () => ({
      code: 'DISK_FULL',
      title: 'Ruang penyimpanan tidak cukup',
      message: 'FFmpeg tidak dapat menyelesaikan render karena storage hampir penuh.',
      solution: 'Kosongkan ruang pada drive output/temp lalu jalankan render kembali.',
    }),
  },
  {
    code: 'UNKNOWN_ENCODER',
    priority: 75,
    matches: (text) => /unknown encoder|encoder .* not found|codec .* not found/i.test(text),
    translate: () => ({
      code: 'UNKNOWN_ENCODER',
      title: 'Encoder FFmpeg tidak tersedia',
      message: 'Biner FFmpeg yang digunakan tidak menyediakan encoder yang diperlukan oleh render ini.',
      solution: 'Gunakan biner FFmpeg resmi yang lengkap dan pastikan konfigurasi bundled FFmpeg sesuai paket aplikasi.',
    }),
  },
  {
    code: 'INVALID_FILTER',
    priority: 70,
    matches: (text, context) => /error initializing complex filters|error reinitializing filters|invalid argument/i.test(text) && context.stage !== 'main-media-preparation',
    translate: (context) => ({
      code: 'INVALID_FILTER',
      title: 'Parameter filter visual tidak valid',
      message: `FFmpeg gagal membangun filter pada tahap ${stageLabel(context.stage)}.${filterDiagnostic(context.stderr)}`,
      solution: 'Periksa detail filter di Console Log dan nilai terakhir pada overlay, sticker, partikel, atau visualizer.',
    }),
  },
  {
    code: 'OUTPUT_WRITE_FAILED',
    priority: 65,
    matches: (text) => /error writing trailer|could not write header|muxer does not support/i.test(text),
    translate: () => ({
      code: 'OUTPUT_WRITE_FAILED',
      title: 'Output video gagal ditulis',
      message: 'FFmpeg tidak dapat menyelesaikan file output akhir.',
      solution: 'Periksa izin folder output, ruang disk, dan apakah file tujuan sedang dipakai aplikasi lain.',
    }),
  },
];

export function translateFfmpegError(rawError: string, context: FfmpegErrorContext = {}): TranslatedFfmpegError {
  const text = [rawError, context.stderr ?? ''].filter(Boolean).join('\n');
  const matched = [...RULES].sort((a, b) => b.priority - a.priority).find((rule) => rule.matches(text, context));
  if (matched) return matched.translate(context);

  return {
    code: 'FFMPEG_UNKNOWN_ERROR',
    title: 'Render gagal diproses',
    message: `FFmpeg gagal pada tahap ${stageLabel(context.stage)}${context.exitCode == null ? '' : ` (exit code ${context.exitCode})`}.${filterDiagnostic(context.stderr || rawError)}`,
    solution: 'Periksa rincian FFmpeg di Console Log, file sumber, dan parameter pada tahap tersebut.',
  };
}

export function getErrorRules(): readonly Pick<Rule, 'code' | 'priority'>[] {
  return RULES.map(({ code, priority }) => ({ code, priority }));
}

function stageLabel(stage?: RenderStage): string {
  switch (stage) {
    case 'main-media-preparation': return 'persiapan media utama';
    case 'visual-layer-composition': return 'komposisi visual';
    case 'content-flow': return 'alur konten';
    case 'audio-management': return 'manajemen audio';
    case 'output': return 'encoding output';
    default: return 'render';
  }
}

function filterDiagnostic(stderr?: string): string {
  if (!stderr) return '';
  const candidates = stderr.split(/\r?\n/).map((line) => line.trim()).filter((line) => /error|failed|invalid|out of range|no such filter|option not found|cannot|unable/i.test(line));
  const concrete = candidates.filter((line) => !/^(?:error (?:initializing|reinitializing) complex filters|invalid argument|conversion failed!?|error while filtering)/i.test(line));
  const details = (concrete.length ? concrete : candidates).slice(-2).map((line) => line.replace(/\s+/g,' ').slice(0,220));
  return details.length ? ` Rincian FFmpeg: ${details.join(' | ')}` : '';
}
