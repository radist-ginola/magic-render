import type { MagicRenderApi } from '../shared/ipc';

declare global {
  interface Window {
    magicRender: MagicRenderApi;
    /** Backward-compatible alias used by older renderer modules. */
    electronAPI: MagicRenderApi;
  }
}

export {};
