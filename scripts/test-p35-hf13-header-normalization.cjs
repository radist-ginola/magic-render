const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/main/index.ts');
const runtimePath = path.join(root, 'dist/main/index.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const runtime = fs.readFileSync(runtimePath, 'utf8');

// The Electron protocol callback receives Fetch Headers, while the service's
// contract deliberately remains a plain Record so it is easy to unit-test.
assert.match(source, /const headers:\s*Record<string,\s*string>\s*=\s*\{\s*\};\s*request\.headers\.forEach\(\(value,\s*key\)\s*=>\s*\{\s*headers\[key\.toLowerCase\(\)\]\s*=\s*value;\s*\}\);/s);
assert.match(runtime, /const headers\s*=\s*\{\s*\};\s*request\.headers\.forEach\(\(value,\s*key\)\s*=>\s*\{\s*headers\[key\.toLowerCase\(\)\]\s*=\s*value;\s*\}\);/s);
assert.match(source, /serveLocalMediaRequest\(\{\s*url:\s*request\.url,\s*method:\s*request\.method,\s*headers\s*\}\)/s);
assert.match(runtime, /serveLocalMediaRequest\)\(\{\s*url:\s*request\.url,\s*method:\s*request\.method,\s*headers\s*\}\)/s);
assert.doesNotMatch(source, /headers:\s*request\.headers\s*\}/);
assert.doesNotMatch(runtime, /headers:\s*request\.headers\s*\}/);

// Exercise the exact normalization strategy against the Fetch Headers API.
const requestHeaders = new Headers({ Range: 'bytes=10-19', 'Content-Type': 'video/mp4' });
const normalized = {};
requestHeaders.forEach((value, key) => { normalized[key.toLowerCase()] = value; });
assert.deepEqual(normalized, { range: 'bytes=10-19', 'content-type': 'video/mp4' });

console.log('PASS P35-HF13: Electron Fetch Headers are normalized to the Record<string, string> expected by the local media protocol service.');
