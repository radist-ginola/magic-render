import type { AiProvider, Keyframe } from '../../../shared/domain/aiTypes';

export type AiGenerateResponse = { text: string };

type ProviderSpec = { label: string; baseUrl: string; style: 'gemini' | 'openai-compatible' };

const PROVIDERS: Record<AiProvider, ProviderSpec> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', style: 'openai-compatible' },
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', style: 'gemini' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', style: 'openai-compatible' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', style: 'openai-compatible' },
  mistral: { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', style: 'openai-compatible' },
  ollama: { label: 'Ollama lokal', baseUrl: 'http://127.0.0.1:11434/v1', style: 'openai-compatible' },
};

const FREE_VISION_MODELS: Partial<Record<AiProvider, string[]>> = {
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  groq: ['qwen/qwen3.8-27b'],
};

function authHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
  return provider === 'ollama' || provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey.trim()}` };
}

// A real 96x96 PNG exercises vision support without uploading user media.
// The former 2x2 image could be refused as too small by vision endpoints.
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAByUlEQVR4nO3bwU3DQBBG4QTRAh1QBsVQBhdOXCiDYiiDDri4BA6WkIUID7H/7A7S+87IHr2MHYXE523bTrrsavUA3RkIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIGAgYCBgIXK8e4HR7//rzH7y93M2Z5FvnJf9yxSiXzI81O9Cf0xzNzDQvUCTN0ZxMMwLF0xxVZyp/FyutM+H4tYGqp59wlqpLbE6aLyout5INWlKn6Lz5QKvqFJ3djxogHGjt+lTMkAzUoc4uOEksUJ86u9Q83oNAJlC39dlFpnKDQCBQz/XZjc/mBoHRQJ3XZzc4oRsEDATWf6uxe398jhzn5ukhcpxPQxvU/wa0G5nTSwwYCBgIGAgYCBgIGAgYCBgIGAgMBVr726/fG5nTDQIGAgYCo4H634YGJ3SDQCBQ5yUan80NAplAPZcoMpUbBGKBui1Rap7wr1ybfM8RfLXCl1iHPcrO4D0I5AOtXaL42Us2aFWjivPWPu0z7Z5d95LU3oPmrFLpWcpv0tWNqo/vE4fAZ1aBTz2DNYGOfG7+f/OjBjAQMBAwEDAQMBAwEDAQMBAwEDAQMBAwEDAQMBAwEDAQMBAwEDAQMBAwEDAQ+ADMfYrYn4ruFAAAAABJRU5ErkJggg==';

function imagePart(provider: AiProvider, dataUrl: string): Record<string, unknown> {
  // Mistral accepts the URL string; the other compatible APIs use {url}.
  return { type: 'image_url', image_url: provider === 'mistral' ? dataUrl : { url: dataUrl } };
}

export class AiProviderHttpError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'AiProviderHttpError'; }
}

export class AiProviderOutputError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); this.name = 'AiProviderOutputError'; }
}

function outputText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    const value = part as Record<string, unknown>;
    return typeof value.text === 'string' ? value.text : '';
  }).filter(Boolean).join('\n').trim();
}

function outputFailure(label: string, payload: Record<string, unknown>): AiProviderOutputError {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
  const reason = typeof first.finish_reason === 'string' ? first.finish_reason : '';
  const usage = payload.usage && typeof payload.usage === 'object' ? payload.usage as Record<string, unknown> : {};
  const details = usage.completion_tokens_details && typeof usage.completion_tokens_details === 'object' ? usage.completion_tokens_details as Record<string, unknown> : {};
  const error = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : {};
  const safeModel = typeof payload.model === 'string' ? payload.model.slice(0, 100) : '';
  if (typeof error.message === 'string' && error.message.trim()) return new AiProviderOutputError(`${label} menolak generasi: ${error.message.slice(0, 240)}${safeModel ? ` (model: ${safeModel})` : ''}`, false);
  if (typeof message.refusal === 'string' && message.refusal.trim()) return new AiProviderOutputError(`${label} menolak permintaan: ${message.refusal.slice(0, 240)}`, false);
  if (reason === 'length') return new AiProviderOutputError(`${label} menghentikan keluaran karena batas token (finish_reason=length; output ${String(usage.completion_tokens ?? '?')}, reasoning ${String(details.reasoning_tokens ?? '?')}). Pilih model dengan batas keluaran lebih besar atau nonaktifkan reasoning.`, true);
  if (reason === 'content_filter') return new AiProviderOutputError(`${label} menyaring keluaran (finish_reason=content_filter). Periksa media dan prompt.`, false);
  return new AiProviderOutputError(`${label} tidak mengembalikan teks${safeModel ? ` dari model ${safeModel}` : ''}${reason ? ` (finish_reason=${reason})` : ''}. Coba model vision lain; router gratis dapat memilih model dengan batas keluaran berbeda.`, reason === 'stop' || !reason);
}

async function providerHttpError(response: Response, label: string): Promise<AiProviderHttpError> {
  let code = '';
  let errorType = '';
  let providerMessage = '';
  try {
    const payload = await response.json() as { error?: { code?: string; type?: string; message?: string } };
    code = String(payload.error?.code || '');
    errorType = String(payload.error?.type || '');
    providerMessage = String(payload.error?.message || '');
  } catch { /* The status still gives a useful message for non-JSON responses. */ }
  const safeCode = /^[\w-]{1,80}$/.test(code) ? code : '';
  const requestId = response.headers?.get('x-request-id') || '';
  const suffix = `${safeCode ? ` Kode: ${safeCode}.` : ''}${/^[\w-]{1,120}$/.test(requestId) ? ` ID permintaan: ${requestId}.` : ''}`;
  const fail = (message: string) => new AiProviderHttpError(`${label} HTTP ${response.status}: ${message}${suffix}`, response.status, safeCode || errorType);
  if (response.status === 429) {
    if (/credit_balance_exhausted|billing_hard_limit_reached|spend_limit|usage_limit|insufficient_quota/i.test(code || errorType))
      return fail(`${code === 'insufficient_quota' || (!code && errorType === 'insufficient_quota') ? 'kuota generasi API tidak tersedia; penyebab pastinya perlu dicek di dashboard.' : 'kredit atau batas pemakaian API tercapai.'} Periksa Billing, Usage, dan Limits pada organisasi/project ${label === 'OpenAI' ? 'di platform.openai.com' : 'provider'}. Membuat key baru tidak menambah kredit API.`);
    if (/rate_limit|requests|tokens|slow_down/i.test(code || errorType))
      return fail(`batas laju permintaan/token tercapai. Tunggu sesuai Retry-After jika tersedia, lalu coba lagi.`);
    return fail('permintaan generasi dibatasi. Periksa kode error, Billing/Usage/Limits, dan batas laju pada dashboard provider.');
  }
  if (response.status === 401) return fail('API key tidak valid atau telah dicabut. Periksa kembali kunci project.');
  if (response.status === 403) return fail('project atau kunci tidak memiliki akses ke model ini.');
  if (response.status === 404) return fail(label === 'Gemini' ? 'model tidak tersedia bagi project ini. Model Gemini 2.5 dibatasi untuk pengguna lama; pilih gemini-3.5-flash-lite atau model vision terbaru pada Muat Model.' : 'model tidak ditemukan atau tidak tersedia untuk project ini.');
  if (response.status === 400) {
    const detail = providerMessage.replace(/AIza[\w-]{15,}|sk-[\w-]{15,}|gsk_[\w-]{15,}/gi, '[KUNCI DISEMBUNYIKAN]').replace(/https?:\/\/\S+/g, '[URL]').replace(/[\r\n]+/g, ' ').slice(0, 300);
    return fail(`permintaan ditolak oleh provider${detail ? `: ${detail}` : '. Periksa model dan format gambar pada dashboard provider'}.`);
  }
  return fail('periksa model, akses API, dan jaringan.');
}

/** No generation or image tokens. A successful lookup proves authentication and model visibility, not billing readiness. */
export async function authenticateProvider(provider: AiProvider, model: string, apiKey: string): Promise<void> {
  if (provider !== 'ollama' && !apiKey.trim()) throw new Error('API key kosong.');
  if (!model.trim()) throw new Error('Model AI kosong.');
  const spec = PROVIDERS[provider];
  if (provider === 'ollama') {
    const models = await listProviderModels('ollama', '', false);
    if (!models.includes(model.trim())) throw new Error(`Model ${model} belum terpasang di Ollama. Jalankan: ollama pull ${model}`);
    return;
  }
  if (provider !== 'openai') return;
  let response: Response;
  try { response = await fetch(`${spec.baseUrl}/models/${encodeURIComponent(model.trim())}`, { headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('Autentikasi OpenAI gagal: koneksi atau waktu tunggu habis.'); }
  if (!response.ok) throw await providerHttpError(response, spec.label);
}

/** Read the provider catalog at runtime so new model IDs appear without an app update. */
export async function listProviderModels(provider: AiProvider, apiKey: string, freeOnly = false): Promise<string[]> {
  if (provider !== 'ollama' && !apiKey.trim()) throw new Error('Masukkan atau simpan API key untuk memuat daftar model.');
  const spec = PROVIDERS[provider];
  if (provider === 'ollama') {
    let response: Response;
    try { response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('Ollama lokal belum berjalan. Instal Ollama dan jalankan: ollama serve'); }
    if (!response.ok) throw await providerHttpError(response, spec.label);
    const payload = await response.json() as { models?: Array<{ name?: string; details?: { family?: string } }> };
    const installed = (payload.models ?? []).map((item) => item.name ?? '').filter(Boolean);
    return freeOnly ? installed.filter((id) => /gemma3|llava|qwen.*vl|moondream|minicpm-v/i.test(id)) : installed;
  }
  const ids = new Set<string>();
  let pageToken = '';
  for (let page = 0; page < (provider === 'gemini' ? 20 : 1); page += 1) {
    const url = provider === 'gemini'
      ? `${spec.baseUrl}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      : `${spec.baseUrl}/models`;
    let response: Response;
    try { response = await fetch(url, { headers: authHeaders(provider, apiKey), signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`Daftar model ${spec.label} gagal dimuat: koneksi atau waktu tunggu.`); }
    if (!response.ok) throw await providerHttpError(response, spec.label);
    const payload = await response.json() as { data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[] } }>; models?: Array<{ name?: string; supportedGenerationMethods?: string[]; supportedActions?: string[] }>; nextPageToken?: string };
    if (provider === 'gemini') {
      for (const model of payload.models ?? []) {
        if (model.supportedGenerationMethods?.includes('generateContent') || model.supportedActions?.includes('generateContent')) {
          if (model.name?.startsWith('models/')) { const id = model.name.slice(7); if (!freeOnly || FREE_VISION_MODELS.gemini?.includes(id)) ids.add(id); }
        }
      }
      pageToken = payload.nextPageToken ?? '';
      if (!pageToken) break;
    } else {
      for (const model of payload.data ?? []) {
        if (typeof model.id !== 'string' || (provider === 'openai' && !model.id.startsWith('gpt-'))) continue;
        if (freeOnly && provider === 'openrouter' && !(model.id === 'openrouter/free' || (model.id.endsWith(':free') && Number(model.pricing?.prompt) === 0 && Number(model.pricing?.completion) === 0 && model.architecture?.input_modalities?.includes('image')))) continue;
        if (freeOnly && provider !== 'openrouter' && !FREE_VISION_MODELS[provider]?.includes(model.id)) continue;
        ids.add(model.id);
      }
      break;
    }
  }
  // The documented free router selects a vision-capable free model for an image request.
  if (provider === 'openrouter' && freeOnly) ids.add('openrouter/free');
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function validateProvider(provider: AiProvider, model: string, apiKey: string): Promise<void> {
  if (provider !== 'ollama' && !apiKey.trim()) throw new Error('API key kosong.');
  if (!model.trim()) throw new Error('Model AI kosong.');
  const spec = PROVIDERS[provider];
  try {
    // A 200 with an empty choice is not a valid model check. Exercise the
    // exact multimodal parser used by real SEO requests.
    await generateMultimodal(provider, model, apiKey, 'Return ONLY JSON: {"scene":"one short observed detail"}.', [{ timestampSec: 0, mimeType: 'image/png', base64: TEST_IMAGE }], 512);
  } catch (error) {
    if (error instanceof AiProviderHttpError || error instanceof AiProviderOutputError) throw error;
    throw new Error(`Validasi ${spec.label} gagal: koneksi tidak tersedia atau waktu tunggu habis.`);
  }
}

export async function generateMultimodal(provider: AiProvider, model: string, apiKey: string, prompt: string, keyframes: Keyframe[], maxOutputTokens = 3500): Promise<AiGenerateResponse> {
  if (provider === 'gemini') return generateGemini(model, apiKey, prompt, keyframes, maxOutputTokens);
  return generateOpenAiCompatible(provider, model, apiKey, prompt, keyframes, maxOutputTokens);
}

async function generateOpenAiCompatible(provider: AiProvider, model: string, apiKey: string, prompt: string, keyframes: Keyframe[], maxOutputTokens: number): Promise<AiGenerateResponse> {
  const spec = PROVIDERS[provider];
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
  for (const frame of keyframes) content.push(imagePart(provider, `data:${frame.mimeType};base64,${frame.base64}`));
  const response = await fetch(`${spec.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { ...authHeaders(provider, apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], ...(!['openai','openrouter'].includes(provider) || /^gpt-4/i.test(model) ? { temperature: provider === 'groq' && model.startsWith('qwen/') ? 0.7 : 0.25 } : {}), ...(provider === 'openrouter' ? { reasoning: { effort: 'low' } } : {}), ...(provider === 'groq' && model.startsWith('qwen/') ? { reasoning_effort: 'none' } : {}), ...(['openai', 'groq'].includes(provider) ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }) }),
    signal: AbortSignal.timeout(90000),
  });
  const json = await parseJsonResponse(response, spec.label);
  const choices = json.choices;
  if (!Array.isArray(choices)) throw outputFailure(spec.label, json);
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== 'object') continue;
    const text = outputText((message as Record<string, unknown>).content);
    if (text) return { text };
  }
  throw outputFailure(spec.label, json);
}

async function generateGemini(model: string, apiKey: string, prompt: string, keyframes: Keyframe[], maxOutputTokens: number): Promise<AiGenerateResponse> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const frame of keyframes) parts.push({ inlineData: { mimeType: frame.mimeType, data: frame.base64 } });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens, ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } }),
    signal: AbortSignal.timeout(90000),
  });
  const json = await parseJsonResponse(response, 'Gemini');
  const candidates = json.candidates;
  if (!Array.isArray(candidates)) throw new AiProviderOutputError(`Gemini tidak mengembalikan kandidat. ${JSON.stringify(json.promptFeedback ?? {}).slice(0, 180)}`, false);
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    const texts = parts.filter((part): part is Record<string, unknown> => Boolean(part && typeof part === 'object')).map((part) => typeof part.text === 'string' ? part.text : '').filter(Boolean);
    if (texts.length) return { text: texts.join('\n') };
  }
  const first = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] as Record<string, unknown> : {};
  const reason = typeof first.finishReason === 'string' ? first.finishReason : 'tidak diketahui';
  throw new AiProviderOutputError(`Gemini tidak mengembalikan teks (finishReason=${reason}). ${reason === 'MAX_TOKENS' ? 'Batas output habis; pilih model dengan kapasitas lebih besar.' : 'Periksa blokir keselamatan atau model vision.'}`, reason === 'MAX_TOKENS');
}

async function parseJsonResponse(response: Response, provider: string): Promise<Record<string, unknown>> {
  const payload = await response.text();
  if (!response.ok) {
    const copy = { status: response.status, headers: response.headers, json: async () => JSON.parse(payload) } as Response;
    throw await providerHttpError(copy, provider);
  }
  try { return JSON.parse(payload) as Record<string, unknown>; } catch { throw new Error(`${provider} API mengembalikan payload non-JSON.`); }
}
