import { ipcMain } from 'electron';

/**
 * Register an IPC endpoint without polluting the user Console Log with
 * low-value transport tracing. Real application,
 * FFmpeg and error events are logged by their owning services.
 */
export function registerIpcHandler(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(channel, listener);
}
