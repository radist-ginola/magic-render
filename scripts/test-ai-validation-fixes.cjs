const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => true } };
  if (request === 'electron-store') return { __esModule: true, default: class { constructor() { this.store = {}; } } };
  return originalLoad.call(this, request, parent, isMain);
};
const { validateProvider, listProviderModels, AiProviderHttpError } = require('../src/main/services/aiService/aiProviderClient.ts');
const { validateAvailableModel } = require('../src/main/services/settingsService.ts');
Module._load = originalLoad;

const success = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
const failure = (status, body) => ({ ok: false, status, headers: { get: () => 'req_test' }, json: async () => body, text: async () => JSON.stringify(body) });

(async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/models?')) return success({ models: [
      { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
    ] });
    if (String(url).includes('gemini-2.5-flash-lite:')) return failure(404, { error: { code: 404, message: 'Model unavailable for new users' } });
    if (String(url).includes('gemini-3.5-flash-lite:')) return success({ candidates: [{ content: { parts: [{ text: '{"scene":"blue circle"}' }] } }] });
    if (String(url).includes('/chat/completions')) return failure(400, { error: { code: 'invalid_request_error', message: 'Image input is below minimum size for this model' } });
    throw new Error(`Unexpected request: ${url}`);
  };
  assert.deepEqual(await listProviderModels('gemini', 'fake-key', true), ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
  assert.equal(await validateAvailableModel('gemini', 'gemini-2.5-flash-lite', 'fake-key'), 'gemini-3.5-flash-lite');
  assert.equal(calls.filter((call) => call.url.includes('gemini-2.5-flash-lite:')).length, 1);
  assert.equal(calls.filter((call) => call.url.includes('gemini-3.5-flash-lite:')).length, 1);
  await assert.rejects(validateProvider('groq', 'qwen/qwen3.8-27b', 'fake-key'), (error) => {
    assert(error instanceof AiProviderHttpError);
    assert.match(error.message, /Image input is below minimum size/);
    assert.match(error.message, /req_test/);
    return true;
  });
  const payload = JSON.parse(calls.at(-1).options.body);
  assert.equal(payload.reasoning_effort, 'none');
  assert.equal(payload.temperature, 0.7);
  assert.equal(payload.max_completion_tokens, 512);
  assert.equal(payload.max_tokens, undefined);
  const png = Buffer.from(payload.messages[0].content[1].image_url.url.split(',')[1], 'base64');
  assert.equal(png.readUInt32BE(16), 96);
  assert.equal(png.readUInt32BE(20), 96);
  console.log('AI validation: legacy Gemini fallback, catalog, Groq payload and HTTP 400 detail PASSED');
})().catch((error) => { console.error(error); process.exitCode = 1; });
