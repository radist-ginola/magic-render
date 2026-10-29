export const FFMPEG_WASM_ENABLED = true;
export type WasmPreviewAdapter = { available: boolean; reason?: string };

export async function loadOptionalWasmPreview(): Promise<WasmPreviewAdapter> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
    await dynamicImport('@ffmpeg/ffmpeg');
    return { available: true };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : 'FFmpeg.wasm tidak tersedia.' };
  }
}
