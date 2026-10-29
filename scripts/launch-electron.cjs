// Filter only the known, unrelated Google Drive for desktop Windows shell
// extension diagnostic. Every other Electron stderr line remains visible.
const { spawn } = require('node:child_process');
const electron = require('electron');

function isDriveShellNoise(line) {
  return /^WARNING: Logging before InitGoogle\(\) is written to STDERR\r?$/.test(line)
    || /^E\d+ .*ctxmenu\.cc:\d+\] NOT_FOUND: Can't connect to socket at: \\\\.\\Pipe\\GoogleDriveFSPipe_Desktop_shell .*\r?$/.test(line);
}

function filterDriveShellStderr(chunk, state, write) {
  state.pending += chunk.toString();
  const lines = state.pending.split('\n');
  state.pending = lines.pop() || '';
  for (const line of lines) {
    if (isDriveShellNoise(line)) {
      if (line.includes('GoogleDriveFSPipe_Desktop_shell')) state.driveTrace = 2;
      continue;
    }
    if (state.driveTrace && (/^=== Source Location Trace: ===\r?$/.test(line) || /^apps\/drive\/fs\/ipc\/shell_ipc_client\.cc:\d+\r?$/.test(line))) {
      state.driveTrace -= 1;
      continue;
    }
    state.driveTrace = 0;
    write(`${line}\n`);
  }
}

if (require.main === module) {
  const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'pipe'], windowsHide: false });
  const state = { pending: '', driveTrace: 0 };
  child.stderr.on('data', (chunk) => filterDriveShellStderr(chunk, state, (line) => process.stderr.write(line)));
  child.stderr.on('end', () => { if (state.pending && !isDriveShellNoise(state.pending)) process.stderr.write(state.pending); });
  child.on('error', (error) => { process.stderr.write(`Electron gagal dijalankan: ${error.message}\n`); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });
}

module.exports = { isDriveShellNoise, filterDriveShellStderr };
