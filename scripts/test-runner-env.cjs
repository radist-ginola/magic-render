const path = require('node:path');

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
}

/** Prepend a path entry without creating a second PATH/Path on Windows. */
function prependPathEntry(env, entry, platform = process.platform) {
  if (!entry) return env;
  const delimiter = platform === 'win32' ? path.win32.delimiter : path.posix.delimiter;
  const pathKey = getPathKey(env);
  const current = String(env[pathKey] ?? env.PATH ?? '');
  const normalizedEntry = platform === 'win32' ? entry.replace(/\\+$/, '').toLowerCase() : entry;
  const contains = current.split(delimiter).some((value) =>
    (platform === 'win32' ? value.replace(/\\+$/, '').toLowerCase() : value) === normalizedEntry,
  );
  const merged = contains ? current : [entry, current].filter(Boolean).join(delimiter);
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' && key !== pathKey) delete env[key];
  env[pathKey] = merged;
  return env;
}

/** Put the active Node and npm launcher folders on a child-process PATH. */
function ensureNpmOnPath(env, nodeExecutable, npmCli, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const delimiter = platform === 'win32' ? path.win32.delimiter : path.posix.delimiter;
  const current = String(env[getPathKey(env)] ?? env.PATH ?? '');
  const required = [pathApi.dirname(nodeExecutable)];
  // npm_execpath points to npm-cli.js. Its folder can help nonstandard installs;
  // the Node executable folder is where npm.cmd normally lives on Windows.
  if (npmCli) required.push(pathApi.dirname(npmCli));
  const seen = new Set();
  const normalize = (value) => platform === 'win32' ? value.replace(/\\+$/, '').toLowerCase() : value;
  const merged = [];
  for (const value of [...required, ...current.split(delimiter).filter(Boolean)]) {
    if (!value) continue;
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' && key !== getPathKey(env)) delete env[key];
  env[getPathKey(env)] = merged.join(delimiter);
  return env;
}

module.exports = { ensureNpmOnPath, prependPathEntry, getPathKey };
