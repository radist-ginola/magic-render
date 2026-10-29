import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaults = ['Arial', 'Calibri', 'Consolas', 'Segoe UI', 'Times New Roman'];

export async function listDeviceFonts(): Promise<string[]> {
  try {
    const { stdout } = process.platform === 'win32'
      ? await execFileAsync('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-Command',
          'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }',
        ], { timeout: 12000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })
      : await execFileAsync('fc-list', ['--format=%{family}\n'], { timeout: 12000, maxBuffer: 2 * 1024 * 1024 });
    const names = stdout.split(/\r?\n/).flatMap((line) => line.split(',')).map((name) => name.trim()).filter(Boolean);
    return [...new Set([...defaults, ...names])].sort((a, b) => a.localeCompare(b));
  } catch {
    return defaults;
  }
}
