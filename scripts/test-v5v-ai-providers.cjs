const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { generateMultimodal, validateProvider } = require('../src/main/services/aiService/aiProviderClient.ts');
const { filterDriveShellStderr } = require('./launch-electron.cjs');
const frame = [{ timestampSec: 0, mimeType: 'image/png', base64: 'YWJj' }];
const calls = [];
const reply = (payload) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(payload) });
global.fetch = async (url, options) => {
  calls.push({ url: String(url), request: JSON.parse(options.body) });
  return reply(String(url).includes('generativelanguage')
    ? { candidates: [{ content: { parts: [{ text: '{"seen":"lamp"}' }] } }] }
    : { choices: [{ message: { content: [{ type: 'text', text: '{"seen":"lamp"}' }] } }] });
};

(async () => {
  for (const provider of ['openai', 'openrouter', 'groq', 'mistral', 'ollama', 'gemini']) {
    const result = await generateMultimodal(provider, provider === 'gemini' ? 'gemini-2.5-flash-lite' : 'vision-model', 'demo', 'Describe this', frame);
    assert.equal(result.text, '{"seen":"lamp"}', `${provider} response`);
    await validateProvider(provider, provider === 'gemini' ? 'gemini-2.5-flash-lite' : 'vision-model', 'demo');
    const call = calls.at(-1);
    if (provider === 'gemini') assert.equal(call.request.contents[0].parts[1].inlineData.mimeType, 'image/png');
    else {
      assert.equal(call.request.messages[0].content[1].type, 'image_url');
      if (provider === 'mistral') assert.equal(typeof call.request.messages[0].content[1].image_url, 'string');
      if (provider === 'openrouter') assert.equal(call.request.reasoning.effort, 'low');
    }
  }
  global.fetch = async () => reply({ choices: [{ finish_reason: 'length', message: { content: '' } }], usage: { completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 100 } } });
  await assert.rejects(generateMultimodal('openrouter', 'free', 'demo', 'x', frame), /batas token.*finish_reason=length/);
  await assert.rejects(validateProvider('openrouter', 'free', 'demo'), /batas token/);
  global.fetch = async () => reply({ error: { message: 'Provider unavailable' } });
  await assert.rejects(generateMultimodal('openrouter', 'free', 'demo', 'x', frame), /Provider unavailable/);
  global.fetch = async () => reply({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] });
  await assert.rejects(generateMultimodal('gemini', 'flash', 'demo', 'x', frame), /MAX_TOKENS/);
  const state = { pending: '', driveTrace: 0 }; const output = [];
  filterDriveShellStderr(Buffer.from('WARNING: Logging before InitGoogle() is written to STDERR\nE0000 00:00:1791120225.229817    5688 ctxmenu.cc:225] NOT_FOUND: Can\'t connect to socket at: \\\\.\\Pipe\\GoogleDriveFSPipe_Desktop_shell [type.googleapis.com/drive.ds.Status=\'UNAVAILABLE_RESOURCE\']\n=== Source Location Trace: ===\napps/drive/fs/ipc/shell_ipc_client.cc:644\nApplication render failed\n'), state, (line) => output.push(line));
  assert.deepEqual(output, ['Application render failed\n'], 'Real stderr errors must remain visible');
  console.log('V5V: six AI providers, empty response diagnostics, vision payloads and narrow Drive warning filter PASSED');
})().catch((error) => { console.error(error); process.exitCode = 1; });
