import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AiCredentialsStatus, AiProvider } from '../../shared/domain/aiTypes';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { GlobalSettings, GpuInfo } from '../../shared/domain/settingsTypes';

type ThemeMode = 'dark' | 'light';
type Props = { project: ProjectData | null; onProjectChange: (project: ProjectData, options?: { mode?: 'record' | 'replace'; label?: string }) => void; onMessage: (message: string) => void; themeMode: ThemeMode; onThemeModeChange: (theme: ThemeMode) => void };
const providerDefaults: Record<AiProvider, string> = { openai: 'gpt-4o-mini', gemini: 'gemini-3.5-flash-lite', openrouter: 'openrouter/free', groq: 'qwen/qwen3.8-27b', mistral: 'pixtral-large-latest', ollama: 'gemma3:4b' };
const providerLabels: Record<AiProvider, string> = { openai: 'OpenAI', gemini: 'Gemini', openrouter: 'OpenRouter', groq: 'Groq', mistral: 'Mistral', ollama: 'Ollama lokal' };
const providerNotes: Record<AiProvider, string> = { openai: 'API key dan penagihan mengikuti akun OpenAI.', gemini: 'Periksa batas pemakaian dan kuota Gemini.', openrouter: 'Pilih model dan periksa status free/paid-nya.', groq: 'Ketersediaan model mengikuti plan Groq.', mistral: 'Model dan batas API mengikuti akun Mistral.', ollama: 'Model berjalan lokal tanpa API key provider.' };
const providerGlyphs: Record<AiProvider, string> = { openai: '◎', gemini: '✦', openrouter: '↗', groq: 'G', mistral: 'M', ollama: '◉' };
const providerOrder: AiProvider[] = ['openai', 'openrouter', 'gemini', 'groq', 'mistral', 'ollama'];

export function SettingsPanel({ project, onProjectChange, onMessage, themeMode, onThemeModeChange }: Props): JSX.Element {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiCredentialsStatus | null>(null);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelMessage, setModelMessage] = useState('Simpan API key atau klik Muat Model.');
  const [loadingModels, setLoadingModels] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cleaningCache, setCleaningCache] = useState(false);
  const [testingEngine, setTestingEngine] = useState(false);
  const [detectingGpu, setDetectingGpu] = useState(false);
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const outputCommit = useRef<Promise<void> | null>(null);
  const [engineCheck, setEngineCheck] = useState<Awaited<ReturnType<typeof window.magicRender.testRenderEngine>> | null>(null);
  const [outputValidation, setOutputValidation] = useState<Awaited<ReturnType<typeof window.magicRender.validateOutput>> | null>(null);
  useEffect(() => { let mounted = true; void window.magicRender.getSettings().then(async (loaded) => {
    if (!mounted) return;
    setSettings(loaded);
    const result = await window.magicRender.testRenderEngine(loaded.ffmpegPath, loaded.ffprobePath);
    if (mounted) setEngineCheck(result);
  }).catch((error) => { if (mounted) onMessage(error instanceof Error ? error.message : 'Gagal memuat Settings.'); }); return () => { mounted = false; }; }, []);
  useEffect(() => { if (!settings) return; let active = true; const provider = settings.aiProvider; const model = settings.aiModel; setAiStatus(null); void window.magicRender.getSettingsAiStatus(provider, model, undefined, true).then((status) => { if (active) setAiStatus(status); }).catch(() => { if (active) setAiStatus(null); }); return () => { active = false; }; }, [settings?.aiProvider]);
  useEffect(() => { if (!settings) return; let active = true; setAiModels([]); if (settings.aiProvider !== 'ollama' && !aiStatus?.configured) { setLoadingModels(false); setModelMessage(aiStatus === null ? 'Memeriksa API key tersimpan...' : 'Masukkan dan simpan API key provider ini untuk memuat daftar model.'); return; } setModelMessage('Memuat model dari provider...'); setLoadingModels(true); void window.magicRender.listSettingsAiModels(settings.aiProvider, undefined, freeOnly).then((models) => { if (active) { setAiModels(models); setModelMessage(`${models.length} model ${freeOnly ? 'kandidat gratis dengan input gambar' : 'tersedia'} dari ${providerLabels[settings.aiProvider]}. Ketersediaan gratis tetap mengikuti batas akun/provider.`); } }).catch((error) => { if (active) setModelMessage(error instanceof Error ? error.message : 'Model belum dapat dimuat.'); }).finally(() => { if (active) setLoadingModels(false); }); return () => { active = false; }; }, [settings?.aiProvider, freeOnly, aiStatus?.configured]);
  if (!settings) return <div className="mrp-section-card text-xs text-white/45">Loading persistent settings...</div>;
  const currentSettings: GlobalSettings = settings;
  const patch = (value: Partial<GlobalSettings>) => {
    if (value.ffmpegPath !== undefined || value.ffprobePath !== undefined) { setEngineCheck(null); setGpuInfo(null); }
    if (value.outputDir !== undefined || value.resolution !== undefined || value.bitrateKbps !== undefined) setOutputValidation(null);
    setSettings((current) => current ? { ...current, ...value } : current);
  };
  async function persistOutputDir(folder: string): Promise<void> {
    if (!folder.trim()) return;
    setOutputValidation(null);
    if (outputCommit.current) await outputCommit.current;
    const pending = (async () => {
      try {
        const saved = await window.magicRender.updateSettings({ outputDir: folder });
        setSettings((current) => current ? { ...current, outputDir: saved.outputDir } : current);
        if (project) {
          const updated = await window.magicRender.saveProject({ ...project, settings: { ...project.settings, outputDir: saved.outputDir } });
          onProjectChange(updated.project, { mode: 'replace', label: 'Save output folder' });
        }
        onMessage('Output Export Folder tersimpan.');
      } catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal menyimpan folder output.'); }
    })();
    outputCommit.current = pending;
    await pending;
    if (outputCommit.current === pending) outputCommit.current = null;
  }
  async function validateOutputSettings(): Promise<void> {
    if (!project) {
      onMessage('Buka atau buat project terlebih dahulu untuk memvalidasi konfigurasi output.');
      return;
    }
    setOutputValidation(null);
    try {
      const candidate = { ...project, settings: { ...project.settings, outputDir: currentSettings.outputDir, resolution: currentSettings.resolution, bitrateKbps: currentSettings.bitrateKbps } };
      const result = await window.magicRender.validateOutput(candidate);
      setOutputValidation(result);
      onMessage(result.valid ? 'Konfigurasi output valid.' : `Output belum valid: ${result.errors.join(' ')}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Validasi output gagal.');
    }
  }

  async function browse(kind: 'ffmpeg'|'ffprobe'|'upload'|'output'|'asset'): Promise<void> { try { const chosen = kind === 'ffmpeg' ? await window.magicRender.chooseSettingsFfmpeg() : kind === 'ffprobe' ? await window.magicRender.chooseSettingsFfprobe() : kind === 'upload' ? await window.magicRender.chooseSettingsUploadDirectory() : kind === 'asset' ? await window.magicRender.chooseSettingsAssetDirectory() : await window.magicRender.chooseSettingsOutputDirectory(); if (!chosen) return; if (kind === 'output') { await persistOutputDir(chosen); } else patch(kind === 'ffmpeg' ? { ffmpegPath: chosen } : kind === 'ffprobe' ? { ffprobePath: chosen } : kind === 'asset' ? { assetDir: chosen } : { uploadDir: chosen }); } catch (error) { onMessage(error instanceof Error ? error.message : 'Dialog folder/file gagal.'); } }
  async function save(): Promise<void> { setBusy(true); try { await outputCommit.current; const saved = await window.magicRender.updateSettings(currentSettings); setSettings(saved); onMessage('Semua pengaturan tersimpan. API key boleh kosong; kunci yang sudah tersimpan tidak berubah.'); if (project) { const next = { ...project, settings: { ...project.settings, outputDir: saved.outputDir, resolution: saved.resolution, cpuLoadPercent: saved.cpuLoadPercent, bitrateKbps: saved.bitrateKbps, bitrateMode: saved.bitrateMode, fps: saved.fps, renderPreset: saved.renderPreset }, youtubeSEO: { ...project.youtubeSEO, provider: saved.aiProvider, model: saved.aiModel } }; try { const stored = await window.magicRender.saveProject(next); onProjectChange(stored.project, { mode: 'replace', label: 'Save global settings' }); } catch (error) { onMessage(`Pengaturan global tersimpan, tetapi project gagal disimpan: ${error instanceof Error ? error.message : String(error)}`); } } void window.magicRender.testRenderEngine(saved.ffmpegPath, saved.ffprobePath).then(setEngineCheck).catch(() => setEngineCheck(null)); } catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal menyimpan settings.'); } finally { setBusy(false); } }
  async function saveAi(): Promise<void> { if (currentSettings.aiProvider !== 'ollama' && !apiKey.trim()) return; setBusy(true); try { const result = await window.magicRender.configureSettingsAi(currentSettings.aiProvider, currentSettings.aiModel, currentSettings.aiProvider === 'ollama' ? '' : apiKey); setApiKey(''); setSettings(result.settings); const message = `${result.modelChangeNote ? `${result.modelChangeNote} ` : ''}${result.validationError ? `API key dan model dikenali, tetapi generasi belum siap. ${result.validationError}` : currentSettings.aiProvider === 'ollama' ? 'Ollama lokal siap digunakan.' : 'API key tersimpan dan siap digunakan.'}`; setAiStatus({ provider: result.settings.aiProvider, model: result.settings.aiModel, configured: true, valid: !result.validationError, authenticated: true, checkedAt: new Date().toISOString(), message }); void window.magicRender.listSettingsAiModels(result.settings.aiProvider, undefined, freeOnly).then((models) => { setAiModels(models); setModelMessage(`${models.length} model tersedia.`); }).catch(() => undefined); if (project) { const updated = await window.magicRender.saveProject({ ...project, youtubeSEO: { ...project.youtubeSEO, provider: result.settings.aiProvider, model: result.settings.aiModel } }); onProjectChange(updated.project, { mode: 'replace', label: 'Apply AI settings' }); } onMessage(message); } catch (error) { const detail = error instanceof Error ? error.message : 'Konfigurasi AI gagal.'; setAiStatus({ provider: currentSettings.aiProvider, model: currentSettings.aiModel, configured: !!aiStatus?.configured, valid: false, checkedAt: new Date().toISOString(), message: detail }); onMessage(detail); } finally { setBusy(false); } }
  async function saveAiUnverified(): Promise<void> { if (!apiKey.trim()) return; setBusy(true); try { const result = await window.magicRender.configureSettingsAi(currentSettings.aiProvider, currentSettings.aiModel, apiKey, false); setApiKey(''); setSettings(result.settings); if (project) { const updated = await window.magicRender.saveProject({ ...project, youtubeSEO: { ...project.youtubeSEO, provider: result.settings.aiProvider, model: result.settings.aiModel } }); onProjectChange(updated.project, { mode: 'replace', label: 'Save AI settings' }); } const message = 'Kunci disimpan terenkripsi, tetapi belum tervalidasi. Periksa Billing/Limits lalu klik Check API Key sebelum Generate YouTube SEO.'; setAiStatus({ provider: result.settings.aiProvider, model: result.settings.aiModel, configured: true, valid: false, checkedAt: null, message }); onMessage(message); } catch (error) { onMessage(error instanceof Error ? error.message : 'Kunci gagal disimpan.'); } finally { setBusy(false); } }
  async function loadModels(): Promise<void> { if (currentSettings.aiProvider !== 'ollama' && !apiKey.trim() && !aiStatus?.configured) { setModelMessage('Masukkan API key lalu klik Simpan & Validasi, atau gunakan kunci yang sudah tersimpan untuk provider ini.'); return; } setLoadingModels(true); try { const models = await window.magicRender.listSettingsAiModels(currentSettings.aiProvider, apiKey.trim() || undefined, freeOnly); setAiModels(models); setModelMessage(`${models.length} model ${freeOnly ? 'kandidat gratis dengan input gambar' : 'tersedia'} dari ${providerLabels[currentSettings.aiProvider]}.`); } catch (error) { setModelMessage(error instanceof Error ? error.message : 'Daftar model gagal dimuat.'); } finally { setLoadingModels(false); } }
  async function checkAi(): Promise<void> { setBusy(true); try { const status = await window.magicRender.getSettingsAiStatus(currentSettings.aiProvider, currentSettings.aiModel, apiKey.trim() || undefined); setAiStatus(status); if (status.valid && status.configured && !apiKey.trim()) { const saved = await window.magicRender.updateSettings({ aiProvider: status.provider, aiModel: status.model }); setSettings(saved); if (project) { const updated = await window.magicRender.saveProject({ ...project, youtubeSEO: { ...project.youtubeSEO, provider: status.provider, model: status.model } }); onProjectChange(updated.project, { mode: 'replace', label: 'Apply AI model' }); } } onMessage(status.message); } catch (error) { const detail = error instanceof Error ? error.message : 'Pengecekan AI gagal.'; setAiStatus({ provider: currentSettings.aiProvider, model: currentSettings.aiModel, configured: !!aiStatus?.configured, valid: false, checkedAt: new Date().toISOString(), message: detail }); onMessage(detail); } finally { setBusy(false); } }
  async function clearAi(): Promise<void> {
    setBusy(true);
    try {
      await window.magicRender.clearSettingsAi(currentSettings.aiProvider);
      setApiKey('');
      setConfirmClearKey(false);
      setAiStatus({ provider: currentSettings.aiProvider, model: currentSettings.aiModel, configured: false, valid: false, checkedAt: null, message: 'API key belum dikonfigurasi.' });
      onMessage('API key dihapus dari secure storage.');
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal menghapus API key.'); }
    finally { setBusy(false); }
  }
  function chooseProvider(value: AiProvider): void { setApiKey(''); setConfirmClearKey(false); setAiStatus(null); setAiModels([]); setModelMessage('Pilih atau muat model dari provider ini.'); patch({ aiProvider: value, aiModel: providerDefaults[value] }); }
  async function clearCache(): Promise<void> {
    setCleaningCache(true);
    try {
      const result = await window.magicRender.clearApplicationCache();
      onMessage(`Cache dibersihkan: ${result.jobsRemoved} pekerjaan dan ${result.filesRemoved} file sementara. Asset tersimpan tetap aman.${result.failures.length ? ` ${result.failures.length} file gagal dibersihkan.` : ''}`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Pembersihan cache gagal.');
    } finally { setCleaningCache(false); }
  }
  async function checkEngine(): Promise<void> {
    setTestingEngine(true);
    try { setEngineCheck(await window.magicRender.testRenderEngine(currentSettings.ffmpegPath, currentSettings.ffprobePath)); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Uji FFmpeg gagal.'); }
    finally { setTestingEngine(false); }
  }
  async function checkGpu(): Promise<void> {
    setDetectingGpu(true);
    try { setGpuInfo(await window.magicRender.detectGpu(currentSettings.ffmpegPath)); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Deteksi GPU gagal.'); }
    finally { setDetectingGpu(false); }
  }

  const engineReady = !!engineCheck && engineCheck.ffmpegReady && engineCheck.ffprobeReady && engineCheck.progressReady;
  const aiStatusTone = aiStatus?.valid ? 'is-valid' : aiStatus?.configured && !aiStatus.valid ? 'is-warning' : aiStatus?.checkedAt ? 'is-error' : '';
  const aiStatusTitle = settings.aiProvider === 'ollama'
    ? (aiStatus?.valid ? 'Ollama siap digunakan' : aiStatus?.checkedAt ? 'Ollama perlu diperiksa' : 'Uji koneksi Ollama')
    : aiStatus?.valid ? 'Provider tervalidasi' : aiStatus?.configured ? 'Key tersimpan · perlu validasi' : aiStatus?.checkedAt ? 'Validasi gagal' : 'Belum dikonfigurasi';
  const aiCheckedAt = aiStatus?.checkedAt ? new Date(aiStatus.checkedAt).toLocaleString() : 'Belum diperiksa';
  return <div className="mrp-settings-workspace">
    <header className="mrp-settings-heading">
      <div><span className="mrp-kicker">GLOBAL CONFIGURATION</span><h2>Pengaturan Aplikasi</h2><p>Kelola folder, engine render, kualitas output, dan koneksi AI dari satu tempat.</p></div>
      <div className="mrp-settings-heading__badges"><span className="mrp-settings-info-pill"><b>{settings.resolution}</b><small>Resolusi</small></span><span className="mrp-settings-info-pill"><b>{settings.fps} FPS</b><small>Frame rate</small></span><span className={`mrp-settings-info-pill ${engineReady ? 'is-ready' : engineCheck ? 'is-warning' : ''}`}><b>{engineReady ? 'Engine siap' : engineCheck ? 'Perlu diperiksa' : 'Engine belum diuji'}</b><small>FFmpeg / FFprobe</small></span></div>
    </header>
    <div className="mrp-settings-toolbar"><span className="mrp-settings-toolbar__hint">Semua bagian pengaturan ditampilkan</span><div className="mrp-settings-toolbar__actions"><button type="button" role="switch" aria-checked={themeMode === 'light'} className="mrp-btn mrp-theme-switch" onClick={() => onThemeModeChange(themeMode === 'dark' ? 'light' : 'dark')}><span aria-hidden="true">{themeMode === 'dark' ? '☀' : '☾'}</span>{themeMode === 'dark' ? 'Tema terang' : 'Tema gelap'}</button><button type="button" disabled={cleaningCache} className="mrp-btn mrp-btn--danger" onClick={() => void clearCache()}>{cleaningCache ? 'Membersihkan...' : 'Bersihkan Cache'}</button></div></div>
    <div className="mrp-settings-grid">
    <section className="mrp-settings-card" id="settings-panel-folders"><header><span className="mrp-kicker">01 • ENGINE & FOLDERS</span><h2>Folder, Path & Export</h2><p>Konfigurasi executable dan lokasi penyimpanan yang dipakai oleh aplikasi.</p></header>
      <label>FFmpeg Path<div className="mrp-field-row"><input value={settings.ffmpegPath} onChange={(e) => patch({ ffmpegPath: e.target.value })}/><button className="mrp-btn" onClick={() => void browse('ffmpeg')}>Pilih</button></div></label>
      <label>FFprobe Path<div className="mrp-field-row"><input value={settings.ffprobePath} onChange={(e) => patch({ ffprobePath: e.target.value })}/><button className="mrp-btn" onClick={() => void browse('ffprobe')}>Pilih</button></div></label>
      <button type="button" className="mrp-btn" disabled={testingEngine} onClick={() => void checkEngine()}>{testingEngine ? 'Menguji FFmpeg...' : 'Uji FFmpeg & Monitor'}</button>
      <div className={`mrp-ai-status ${!engineCheck ? '' : engineCheck.ffmpegReady && engineCheck.ffprobeReady && engineCheck.progressReady ? 'is-valid' : 'is-error'}`} role="status">
        {engineCheck ? <>{engineCheck.message}{engineCheck.ffmpegVersion && <div className="mt-1 text-white/45">{engineCheck.ffmpegVersion}</div>}</> : 'Klik Uji FFmpeg & Monitor untuk memeriksa path saat ini.'}
      </div>
      <label>Default Project Save Folder<div className="mrp-field-row"><input value={settings.uploadDir} onChange={(e) => patch({ uploadDir: e.target.value })}/><button className="mrp-btn" onClick={() => void browse('upload')}>Pilih</button></div><small className="text-white/45">Lokasi awal saat membuat project baru.</small></label>
      <label>Folder Asset Library<div className="mrp-field-row"><input value={settings.assetDir} onChange={(e) => patch({ assetDir: e.target.value })}/><button className="mrp-btn" onClick={() => void browse('asset')}>Pilih</button></div><small className="text-white/45">Asset dan folder tracklist baru disalin ke lokasi ini saat ditambahkan. Asset lama tetap di lokasi sebelumnya. Klik Simpan Setting setelah memilih.</small></label>
      <label>Output Export Folder<div className="mrp-field-row"><input value={settings.outputDir} onChange={(e) => patch({ outputDir: e.target.value })} onBlur={(e) => { void persistOutputDir(e.target.value); }}/><button className="mrp-btn" onClick={() => void browse('output')}>Pilih</button></div><small className="text-white/45">Folder tersimpan saat dipilih atau setelah selesai mengetik.</small></label>
      <section className="mrp-settings-output-check" aria-labelledby="mrp-settings-output-check-title">
        <div className="mrp-settings-output-check__heading"><div><h3 id="mrp-settings-output-check-title">Validasi Output</h3><p>Periksa format, izin tulis dan kapasitas folder untuk konfigurasi output aktif.</p></div><button type="button" className="mrp-btn" disabled={!project || busy} onClick={() => void validateOutputSettings()}>Validasi</button></div>
        {!project && <small className="mrp-settings-output-check__hint">Buka project untuk memvalidasi output project tersebut.</small>}
        {outputValidation && <div className="mrp-settings-output-check__result" data-valid={outputValidation.valid ? 'true' : 'false'} role="status" aria-live="polite">
          <div className="mrp-settings-output-check__summary"><strong>{outputValidation.valid ? 'OUTPUT VALID' : 'OUTPUT PERLU DIPERIKSA'}</strong><span>{outputValidation.extension.toUpperCase()} · {outputValidation.writable ? 'Folder dapat ditulis' : 'Folder belum dapat ditulis'}</span></div>
          <div className="mrp-settings-output-check__facts"><span>Folder ada: {outputValidation.exists ? 'Ya' : 'Tidak'}</span><span>Ruang tersedia: {outputValidation.availableBytes === null ? 'Tidak diketahui' : `${(outputValidation.availableBytes / (1024 ** 3)).toFixed(2)} GB`}</span><span>Kapasitas: {outputValidation.sufficientStorage === null ? 'Tidak diketahui' : outputValidation.sufficientStorage ? 'Cukup' : 'Tidak cukup'}</span></div>
          {outputValidation.warnings.length > 0 && <p>{outputValidation.warnings.join(' ')}</p>}
          {outputValidation.errors.length > 0 && <p className="mrp-settings-output-check__errors">{outputValidation.errors.join(' ')}</p>}
        </div>}
      </section>
    </section>
    <section className="mrp-settings-card" id="settings-panel-quality"><header><span className="mrp-kicker">02 • RENDER ENGINE</span><h2>Kualitas & Kecepatan</h2><p>Perangkat encoder dan target kualitas video untuk render berikutnya.</p></header>
      <label>GPU Mode / Perangkat Render<select value={settings.renderDevice} onChange={(e) => patch({ renderDevice: e.target.value as GlobalSettings['renderDevice'] })}><option value="cpu">CPU — libx264</option><option value="gpu">GPU — H.264 hardware encoder</option></select></label>
      <div className="mrp-field-row"><button type="button" className="mrp-btn" disabled={detectingGpu} onClick={() => void checkGpu()}>{detectingGpu ? 'Mendeteksi...' : 'Detect GPU'}</button><div className="text-[10px] text-white/65" role="status">{gpuInfo?.message ?? 'Klik Detect GPU untuk melihat nama VGA, VRAM dan encoder FFmpeg.'}</div></div>
      <label>Resolution<select value={settings.resolution} onChange={(e) => patch({ resolution: e.target.value as GlobalSettings['resolution'] })}><option value="720p">720p — 1280×720</option><option value="1080p">1080p — 1920×1080</option><option value="2K">2K — 2560×1440</option><option value="4K">4K — 3840×2160</option></select></label>
      <label>FPS Output<select value={settings.fps} onChange={(e) => patch({ fps: Number(e.target.value) as GlobalSettings['fps'] })}>{[24,25,30,50,60].map(fps => <option key={fps} value={fps}>{fps} fps</option>)}</select></label>
      <label>CPU Load Control<div className="mrp-slider-row"><input type="range" min="1" max="100" value={settings.cpuLoadPercent} onChange={(e) => patch({ cpuLoadPercent: Number(e.target.value) })}/><b>{settings.cpuLoadPercent}%</b></div><small className="text-white/45">Batas inti FFmpeg (perkiraan). Pilih 100% jika prioritasnya waktu render dan perangkat mampu; simpan pengaturan sebelum render.</small></label>
      <label>FFmpeg Render Preset<select value={(settings as GlobalSettings & { renderPreset?: string }).renderPreset ?? 'standard'} onChange={(e) => patch({ renderPreset: e.target.value } as Partial<GlobalSettings>)}><option value="fast">Cepat — H.264 veryfast</option><option value="standard">Standar — H.264 veryfast / kualitas CRF 20</option><option value="slow">Pelan — H.264 slow, kompresi lebih baik</option></select></label>
      <label>Video Bitrate (kbps)<input type="number" min="1" max="1000000" value={settings.bitrateKbps} onChange={(e) => patch({ bitrateKbps: Number(e.target.value) })}/></label>
      <label>Mode Bitrate<select value={settings.bitrateMode} onChange={(e) => patch({ bitrateMode: e.target.value as GlobalSettings['bitrateMode'] })}><option value="vbr">VBR — ukuran efisien, batas bitrate</option><option value="cbr">CBR — target bitrate tetap</option></select></label>
      <div className="mrp-inline-note">Audio playlist digabung terlebih dulu; video, overlay, sticker, dan intro dikode satu kali dengan H.264. Sticker normal memakai jalur komposisi langsung untuk mengurangi pemrosesan alfa per frame. GPU Mode memakai hardware encoder yang cocok bila driver dan FFmpeg mendukungnya. Filter komposisi masih dapat memakai CPU.</div>
    </section>
    <section className="mrp-settings-card mrp-settings-card--ai" id="settings-panel-ai">
      <header><span className="mrp-kicker">03 • AI CONFIGURATION</span><h2>Provider, Model & Kredensial</h2><p>Pilih provider, atur model, lalu validasi akses. API key yang tersimpan tidak pernah ditampilkan kembali.</p></header>
      <div className="mrp-ai-config-layout">
        <div className="mrp-ai-config-main">
          <section className="mrp-ai-config-section" aria-labelledby="mrp-ai-provider-title">
            <div className="mrp-ai-section-heading"><div><span className="mrp-kicker">STEP 01</span><h3 id="mrp-ai-provider-title">Provider AI</h3><p>Pilih layanan cloud atau model lokal di perangkat ini.</p></div><span className="mrp-ai-current-provider">{providerLabels[settings.aiProvider]}</span></div>
            <div className="mrp-ai-provider-grid" role="group" aria-label="Pilih provider AI">
              {providerOrder.map((provider) => <button key={provider} type="button" className={`mrp-ai-provider${settings.aiProvider === provider ? ' is-selected' : ''}`} aria-pressed={settings.aiProvider === provider} onClick={() => chooseProvider(provider)}>
                <span className={`mrp-ai-provider__glyph mrp-ai-provider__glyph--${provider}`} aria-hidden="true">{providerGlyphs[provider]}</span><b>{providerLabels[provider]}</b><small>{provider === 'ollama' ? 'Lokal' : provider === 'openrouter' ? 'Multi-model' : provider === 'gemini' ? 'Cloud API' : provider === 'openai' ? 'Cloud API' : provider === 'groq' ? 'Cloud API' : 'Cloud API'}</small>
              </button>)}
            </div>
            <p className="mrp-ai-provider-note">{providerNotes[settings.aiProvider]}</p>
          </section>

          <section className="mrp-ai-config-section" aria-labelledby="mrp-ai-model-title">
            <div className="mrp-ai-section-heading"><div><span className="mrp-kicker">STEP 02</span><h3 id="mrp-ai-model-title">Model AI</h3><p>Daftar model merupakan hasil provider; ID manual tetap didukung.</p></div></div>
            <label className="mrp-ai-free-filter"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)}/><span>Filter daftar model gratis yang mendukung gambar</span></label>
            <label>Model tersedia<div className="mrp-field-row"><select aria-label="Pilih model AI" value={aiModels.includes(settings.aiModel) ? settings.aiModel : '__custom__'} onChange={(e) => { if (e.target.value !== '__custom__') { setAiStatus(null); patch({ aiModel: e.target.value }); } }}><option value="__custom__">{aiModels.length ? 'Model manual / pilihan belum ada di daftar' : 'Daftar model belum dimuat'}</option>{aiModels.map((model) => <option key={model} value={model}>{model}</option>)}</select><button type="button" className="mrp-btn" disabled={loadingModels || busy} onClick={() => void loadModels()}>{loadingModels ? 'Memuat…' : 'Muat Model'}</button></div><small>{modelMessage}</small></label>
            <label>ID model manual<input autoComplete="off" spellCheck={false} value={settings.aiModel} onChange={(e) => { setAiStatus(null); patch({ aiModel: e.target.value }); }}/><small>Gunakan ID persis dari provider. Model untuk analisis keyframe YouTube SEO perlu mendukung input gambar.</small></label>
          </section>

          <section className="mrp-ai-config-section" aria-labelledby="mrp-ai-credentials-title">
            <div className="mrp-ai-section-heading"><div><span className="mrp-kicker">STEP 03</span><h3 id="mrp-ai-credentials-title">Kredensial & Validasi</h3><p>Kunci ditangani oleh secure storage di main process; input ini hanya untuk memasukkan kunci baru.</p></div></div>
            {settings.aiProvider !== 'ollama' ? <label className="mrp-ai-key-field">API Key Baru<input type="password" autoComplete="new-password" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={aiStatus?.configured ? 'Kunci tersimpan · masukkan hanya untuk mengganti' : 'Tempel API key provider di sini'}/><small>{aiStatus?.configured ? 'Kredensial tersimpan. Nilai aslinya tidak dapat dibaca kembali dari UI. Kosongkan untuk mempertahankan kunci yang tersimpan.' : 'Belum ada kunci tersimpan yang terkonfirmasi untuk provider ini.'}</small></label> : <div className="mrp-ai-ollama-instructions"><b>Provider lokal · tanpa API key cloud</b><p>Pastikan Ollama terpasang dan sedang berjalan pada <code>127.0.0.1:11434</code>. Model default: <code>{settings.aiModel || 'gemma3:4b'}</code>.</p><code>ollama pull {settings.aiModel || 'gemma3:4b'}</code><small>Performa bergantung pada CPU/GPU dan memori komputer ini.</small></div>}
            <div className="mrp-ai-actions">
              <button type="button" disabled={busy || (settings.aiProvider !== 'ollama' && !apiKey.trim())} className="mrp-btn mrp-btn--primary" onClick={() => void saveAi()}>{busy ? 'Memproses…' : settings.aiProvider === 'ollama' ? 'Uji & Simpan Model Lokal' : 'Simpan & Validasi'}</button>
              {settings.aiProvider !== 'ollama' && <button type="button" disabled={busy || !apiKey.trim()} className="mrp-btn" onClick={() => void saveAiUnverified()}>Simpan Key Saja</button>}
              <button type="button" disabled={busy} className="mrp-btn" onClick={() => void checkAi()}>{busy ? 'Memeriksa…' : settings.aiProvider === 'ollama' ? 'Uji Ollama' : 'Check API Key'}</button>
              {settings.aiProvider !== 'ollama' && <button type="button" disabled={busy || !aiStatus?.configured} className="mrp-btn mrp-btn--danger" onClick={() => setConfirmClearKey(true)}>Hapus Key</button>}
            </div>
            {confirmClearKey && <div className="mrp-ai-clear-confirm" role="alert"><span>Hapus kredensial {providerLabels[settings.aiProvider]} dari secure storage? Tindakan ini tidak bisa dibatalkan.</span><div><button type="button" className="mrp-btn" disabled={busy} onClick={() => setConfirmClearKey(false)}>Batalkan</button><button type="button" className="mrp-btn mrp-btn--danger" disabled={busy} onClick={() => void clearAi()}>{busy ? 'Menghapus…' : 'Ya, hapus key'}</button></div></div>}
          </section>
        </div>

        <aside className="mrp-ai-config-aside" aria-label="Status koneksi AI">
          <section className={`mrp-ai-connection-card ${aiStatusTone}`} role="status" aria-live="polite">
            <span className="mrp-kicker">CONNECTION STATUS</span><div className="mrp-ai-connection-card__title"><span className="mrp-ai-status-indicator" aria-hidden="true"/><h3>{aiStatusTitle}</h3></div>
            <p>{aiStatus?.message ?? (settings.aiProvider === 'ollama' ? 'Klik Uji Ollama untuk memeriksa layanan lokal.' : 'Masukkan API key, lalu pilih Simpan & Validasi untuk memeriksa akses provider.')}</p>
            <dl><div><dt>Provider</dt><dd>{providerLabels[settings.aiProvider]}</dd></div><div><dt>Model</dt><dd>{settings.aiModel || 'Belum dipilih'}</dd></div><div><dt>Kredensial</dt><dd>{settings.aiProvider === 'ollama' ? 'Tidak memakai API key cloud' : aiStatus?.configured ? 'Tersimpan (tersamarkan)' : 'Belum dikonfirmasi tersimpan'}</dd></div><div><dt>Pemeriksaan terakhir</dt><dd>{aiCheckedAt}</dd></div></dl>
          </section>
          <section className="mrp-ai-seo-info"><div className="mrp-ai-seo-info__icon" aria-hidden="true">YT</div><div><h3>Untuk YouTube SEO</h3><p>Analisis keyframe membutuhkan model yang menerima input gambar. Filter model adalah petunjuk awal, bukan jaminan kuota atau biaya provider.</p></div><ul><li>Validasi key dan model sebelum Generate.</li><li>Periksa billing/limits jika provider menolak permintaan.</li><li>Ollama berjalan lokal dan menggunakan sumber daya komputer.</li></ul></section>
        </aside>
      </div>
    </section>
    </div>
    <footer className="mrp-settings-savebar"><div><b>Simpan pengaturan global</b><small>Perubahan konfigurasi umum diterapkan ke project aktif jika tersedia. Kredensial AI dikelola melalui tombol khusus pada tab AI.</small></div><button disabled={busy} className="mrp-btn mrp-btn--primary" data-shortcut-save onClick={() => void save()}>{busy ? 'Menyimpan...' : 'Simpan Semua Settings'}</button></footer>
  </div>;
}
