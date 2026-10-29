import { BrowserWindow, dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron';

export function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}
