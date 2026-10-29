import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import type { AiCredentialsStatus, SeoContext, YoutubeSeoResult } from '../../shared/domain/aiTypes';
import type { GlobalSettings } from '../../shared/domain/settingsTypes';

type Goal = NonNullable<SeoContext['optimizationGoals']>[number];
type Style = NonNullable<SeoContext['titleStyle']>;
type Template = { id: string; keyword: string; context: SeoContext; analysisSource: 'main' | 'manual'; analysisMediaPath?: string | null };
type SeoResultTab = 'titles' | 'description' | 'tags' | 'hashtags';
const SEO_RESULT_TABS: Array<{ id: SeoResultTab; label: string }> = [{ id: 'titles', label: 'Judul' }, { id: 'description', label: 'Deskripsi' }, { id: 'tags', label: 'Tags' }, { id: 'hashtags', label: 'Hashtag' }];
const TEMPLATE_KEY = 'magic-render-pro:seo-templates:v2';
const PREVIOUS_KEY = 'magic-render-pro:seo-templates:v1';
const GOALS: Array<{ id: Goal; label: string }> = [
  { id: 'youtube-search', label: 'YouTube Search' }, { id: 'suggested-videos', label: 'Suggested Videos' },
  { id: 'browse-features', label: 'Browse Features' }, { id: 'brand-awareness', label: 'Brand Awareness' },
  { id: 'balanced', label: 'Seimbang' },
];
const STYLES: Array<{ id: Style; label: string }> = [
  { id: 'seo-friendly', label: 'SEO Friendly' }, { id: 'cinematic', label: 'Cinematic' },
  { id: 'informative', label: 'Informatif' }, { id: 'curiosity', label: 'Curiosity' },
  { id: 'natural', label: 'Natural' },
];
const CONTENT_TYPES = ['Musik', 'Musik instrumental', 'Nature ambience', 'Tutorial', 'Gaming', 'Travel', 'Podcast', 'Relaksasi'];
const COUNTRIES = [
  { value: 'Amerika Serikat (US)', language: 'English (US)' },
  { value: 'Indonesia', language: 'Bahasa Indonesia' },
  { value: 'Inggris (UK)', language: 'English (UK)' },
  { value: 'Kanada', language: 'English (CA)' },
  { value: 'Australia', language: 'English (AU)' },
];
const DEFAULT_GOALS = GOALS.map((item) => item.id);

function readTemplates(): Template[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]');
    if (Array.isArray(saved) && saved.length) return saved.filter((item): item is Template => !!item && typeof item.id === 'string' && typeof item.keyword === 'string' && !!item.context && typeof item.context === 'object').slice(0, 20);
    const previous: unknown = JSON.parse(localStorage.getItem(PREVIOUS_KEY) ?? '[]');
    return Array.isArray(previous) ? previous.filter((item) => !!item && typeof item.keyword === 'string').slice(0, 20).map((item) => ({ id: String(item.id), keyword: item.keyword, context: { contentType: 'Musik', nicheGenre: item.nicheGenre, targetCountry: COUNTRIES[0]!.value, targetLanguage: COUNTRIES[0]!.language, optimizationGoals: [...DEFAULT_GOALS], titleStyle: 'seo-friendly' as const }, analysisSource: 'main' as const })) : [];
  } catch { return []; }
}

export function YoutubeSeoPanel({ project, onProjectChange, onMessage, onOpenSettings, statusLine = 'SEO belum dijalankan.', autoGenerating = false, latestResult = null, onStatus = () => undefined }: {
  project: ProjectData;
  onProjectChange: (project: ProjectData) => void;
  onMessage: (message: string) => void;
  onOpenSettings: () => void;
  statusLine?: string;
  autoGenerating?: boolean;
  latestResult?: YoutubeSeoResult | null;
  onStatus?: (message: string) => void;
}): JSX.Element {
  const [result, setResult] = useState<YoutubeSeoResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<SeoResultTab>('titles');
  const [aiStatus, setAiStatus] = useState<AiCredentialsStatus | null>(null);
  const [aiSettings, setAiSettings] = useState<Pick<GlobalSettings, 'aiProvider' | 'aiModel'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(readTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const mode = project.youtubeSEO.mode ?? 'timestamp';
  const keyword = project.youtubeSEO.mainKeyword;
  const context = project.youtubeSEO.context ?? {};
  const contentType = context.contentType ?? 'Musik';
  const country = context.targetCountry ?? COUNTRIES[0]!.value;
  const goals = context.optimizationGoals ?? DEFAULT_GOALS;
  const style = context.titleStyle ?? 'seo-friendly';
  const analysisSource = project.youtubeSEO.analysisSource ?? 'main';
  const analysisMediaPath = analysisSource === 'manual' ? project.youtubeSEO.analysisMediaPath : project.mainMedia?.path;
  useEffect(() => { setResult(latestResult); setActiveResultTab('titles'); }, [latestResult, project.projectId]);
  useEffect(() => {
    let active = true;
    void window.magicRender.getSettings().then(async (settings) => {
      if (!active) return;
      setAiSettings({ aiProvider: settings.aiProvider, aiModel: settings.aiModel });
      const status = await window.magicRender.getSettingsAiStatus(settings.aiProvider, settings.aiModel, undefined, true);
      if (active) setAiStatus(status);
    }).catch((error) => { if (active) onMessage(error instanceof Error ? error.message : 'Status AI tidak dapat dibaca.'); });
    return () => { active = false; };
  }, []);

  function update(patch: Partial<ProjectData['youtubeSEO']>): void { onProjectChange({ ...project, youtubeSEO: { ...project.youtubeSEO, ...patch } }); }
  function updateContext(patch: Partial<SeoContext>): void { update({ context: { ...context, ...patch } }); }
  function saveTemplates(value: Template[]): boolean {
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(value)); setTemplates(value); return true; }
    catch { onMessage('Template gagal disimpan. Periksa penyimpanan aplikasi.'); return false; }
  }
  function saveTemplate(): void {
    if (!keyword.split(',').some((item) => item.trim())) { onMessage('Isi topik atau keyword utama sebelum menyimpan template.'); return; }
    const id = `${contentType.toLocaleLowerCase()}|${keyword.trim().toLocaleLowerCase()}|${country.toLocaleLowerCase()}`;
    const next = [{ id, keyword: keyword.trim(), context: { ...context, contentType, targetCountry: country, targetLanguage: context.targetLanguage || COUNTRIES.find((item) => item.value === country)?.language || 'English (US)', optimizationGoals: [...goals], titleStyle: style }, analysisSource, analysisMediaPath: analysisSource === 'manual' ? analysisMediaPath : null }, ...templates.filter((item) => item.id !== id)].slice(0, 20);
    if (saveTemplates(next)) { setSelectedTemplate(id); onMessage('Template SEO disimpan untuk project berikutnya.'); }
  }
  function applyTemplate(id: string): void {
    setSelectedTemplate(id);
    const item = templates.find((value) => value.id === id);
    if (item) update({ mainKeyword: item.keyword, context: { ...context, ...item.context }, analysisSource: item.analysisSource, analysisMediaPath: item.analysisMediaPath ?? null });
  }
  function toggleGoal(goal: Goal): void {
    const next = goals.includes(goal) ? goals.filter((item) => item !== goal) : [...goals, goal];
    if (!next.length) { onMessage('Pilih setidaknya satu tujuan optimasi.'); return; }
    updateContext({ optimizationGoals: next });
  }
  async function chooseAnalysisMedia(): Promise<void> {
    try { const file = await window.magicRender.chooseSeoMedia(); if (file) update({ analysisSource: 'manual', analysisMediaPath: file }); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Gagal memilih media untuk analisis.'); }
  }
  async function generate(): Promise<void> {
    if (mode !== 'timestamp-seo') return;
    if (project.youtubeSEO.customPromptEnabled && !(project.youtubeSEO.customPrompt ?? '').trim()) { onMessage('Prompt khusus aktif tetapi isinya masih kosong. Isi instruksi prompt atau matikan opsi prompt khusus.'); return; }
    if (!keyword.split(',').some((item) => item.trim())) { onMessage('Isi topik atau keyword utama.'); return; }
    if (!contentType.trim() || !country.trim()) { onMessage('Isi jenis konten dan negara target sebelum generate.'); return; }
    if (!COUNTRIES.some((item) => item.value === country) && !context.targetLanguage?.trim()) { onMessage('Isi bahasa metadata untuk negara target lainnya.'); return; }
    if (!analysisMediaPath) { onMessage(analysisSource === 'manual' ? 'Upload gambar atau video untuk analisis.' : 'Import media utama sebelum membuat YouTube SEO.'); return; }
    setBusy(true); onStatus('Menyiapkan prompt visual dan provider AI...');
    try {
      const settings = await window.magicRender.getSettings();
      setAiSettings({ aiProvider: settings.aiProvider, aiModel: settings.aiModel });
      const status = await window.magicRender.getSettingsAiStatus(settings.aiProvider, settings.aiModel, undefined, true);
      setAiStatus(status);
      if (!status.configured || !status.authenticated) { onStatus(status.message); onMessage(status.message); return; }
      const effectiveProject = { ...project, youtubeSEO: { ...project.youtubeSEO, provider: settings.aiProvider, model: settings.aiModel, context: { ...context, contentType, targetCountry: country, targetLanguage: context.targetLanguage || COUNTRIES.find((item) => item.value === country)?.language || 'English (US)', optimizationGoals: [...goals], titleStyle: style } } };
      const value = await window.magicRender.generateYoutubeSeo(effectiveProject);
      setResult(value); setActiveResultTab('titles');
      onStatus(`Selesai • ${value.titles.length} judul • ${value.outputFiles.seoTxt}`);
      onMessage(`YouTube SEO selesai. File: ${value.outputFiles.seoTxt}`);
    } catch (error) { const message = error instanceof Error ? error.message : 'AI SEO gagal.'; onStatus(`Gagal • ${message}`); onMessage(message); }
    finally { setBusy(false); }
  }
  async function copyText(value: string, label: string): Promise<void> {
    if (!value.trim()) { onMessage(`Tidak ada ${label.toLocaleLowerCase()} untuk disalin.`); return; }
    try {
      await navigator.clipboard.writeText(value);
      onMessage(`${label} disalin ke clipboard.`);
    } catch {
      onMessage(`Gagal menyalin ${label.toLocaleLowerCase()}. Periksa izin clipboard aplikasi.`);
    }
  }

  const providerName = aiSettings?.aiProvider ?? 'Memuat provider';
  const modelName = aiSettings?.aiModel || 'Model belum dipilih';
  const aiReady = Boolean(aiStatus?.configured && aiStatus?.authenticated && aiStatus?.valid);
  const selectedSourceLabel = analysisSource === 'manual' ? 'Media unggahan' : 'Main content';
  const keywordCount = keyword.split(',').map((item) => item.trim()).filter(Boolean).length;

  return <div className={`mrp-youtube-seo-workspace${mode === 'timestamp-seo' ? ' is-seo-active' : ' is-timestamp-only'}`}><section className="mrp-seo-config-panel" aria-label="Pengaturan SEO dan timestamp">
    <header className="mrp-seo-hero">
      <div className="mrp-seo-hero__copy">
        
        <h3>YouTube SEO <span>&amp; Timestamp</span></h3>
        
      </div>
      <div className={`mrp-seo-hero__state${mode === 'timestamp-seo' ? ' is-ai' : ''}`}>
        <span className="mrp-seo-hero__state-icon" aria-hidden="true">{mode === 'timestamp-seo' ? '✦' : '≋'}</span>
        <div><strong>{mode === 'timestamp-seo' ? 'AI SEO aktif' : mode === 'none' ? 'Tanpa metadata' : 'Timestamp aktif'}</strong><small>{mode === 'timestamp-seo' ? 'Menghasilkan youtubeseo.txt' : mode === 'none' ? 'Video tanpa file .txt tambahan' : 'Menghasilkan timestamp.txt tanpa AI'}</small></div>
      </div>
    </header>

    <section className="mrp-seo-section mrp-seo-mode-section" aria-labelledby="mrp-seo-mode-heading">
      <div className="mrp-seo-section-heading"><span className="mrp-seo-step">01</span><div><h4 id="mrp-seo-mode-heading">Pilih alur metadata</h4></div></div>
      <div className="mrp-seo-mode-grid" role="radiogroup" aria-labelledby="mrp-seo-mode-heading">
        <label className={`mrp-seo-mode-card${mode === 'timestamp' ? ' is-selected' : ''}`}><input type="radio" name="seo-mode" checked={mode === 'timestamp'} onChange={() => update({ mode: 'timestamp', enabled: false })}/><span className="mrp-seo-mode-card__content"><strong>timestamp.txt</strong></span></label>
        <label className={`mrp-seo-mode-card${mode === 'timestamp-seo' ? ' is-selected is-ai' : ''}`}><input type="radio" name="seo-mode" checked={mode === 'timestamp-seo'} onChange={() => update({ mode: 'timestamp-seo', enabled: true })}/><span className="mrp-seo-mode-card__content"><strong>youtubeseo.txt</strong></span></label>
        <label className={`mrp-seo-mode-card${mode === 'none' ? ' is-selected' : ''}`}><input type="radio" name="seo-mode" checked={mode === 'none'} onChange={() => update({ mode: 'none', enabled: false })}/><span className="mrp-seo-mode-card__content"><strong>Tidak Ada</strong></span></label>
      </div>
    </section>

    {mode === 'timestamp-seo' && <div className="mrp-seo-workflow">
      <section className="mrp-seo-section mrp-seo-context" aria-labelledby="mrp-seo-input-heading">
        <div className="mrp-seo-section-heading"><span className="mrp-seo-step">02</span><div><h4 id="mrp-seo-input-heading">Sumber analisis &amp; konteks video</h4><p>Pastikan media dan target penonton sesuai dengan video yang akan dipublikasikan.</p></div></div>

        <fieldset className="mrp-seo-field mrp-seo-source-card">
          <legend className="mrp-seo-caption">1. Gambar utama</legend>
          <div className="mrp-seo-source-options">
            <label className={`mrp-seo-source-choice${analysisSource === 'main' ? ' is-selected' : ''}`}><input type="radio" name="seo-source" checked={analysisSource === 'main'} onChange={() => update({ analysisSource: 'main' })}/><span><strong>Ambil dari main content</strong><small>Gunakan media utama project saat ini.</small></span></label>
            <label className={`mrp-seo-source-choice${analysisSource === 'manual' ? ' is-selected' : ''}`}><input type="radio" name="seo-source" checked={analysisSource === 'manual'} onChange={() => update({ analysisSource: 'manual' })}/><span><strong>Upload gambar/video</strong><small>Pilih media referensi lain untuk analisis visual.</small></span></label>
          </div>
          {analysisSource === 'manual' && <button type="button" className="mrp-btn mt-3" onClick={() => void chooseAnalysisMedia()}>Pilih media analisis</button>}
          {analysisMediaPath && <div className="mrp-seo-source-preview" aria-label="Preview sumber visual">{/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(analysisMediaPath) ? <video src={`mrp-media://local?path=${encodeURIComponent(analysisMediaPath)}`} muted playsInline preload="metadata" /> : <img src={`mrp-media://local?path=${encodeURIComponent(analysisMediaPath)}`} alt="Preview media sumber SEO" />}</div>}
          <div className="mrp-seo-source-action-row"><span className="mrp-seo-source-action is-selected">▣ Main Content</span><button type="button" className="mrp-btn" onClick={() => void chooseAnalysisMedia()}>⇧ Upload</button></div>
          <div className={`mrp-seo-media-summary${analysisMediaPath ? ' is-ready' : ' is-empty'}`}><span className="mrp-seo-media-summary__icon" aria-hidden="true">{analysisMediaPath ? '▣' : '!'}</span><div><strong>{analysisMediaPath ? selectedSourceLabel : 'Media analisis belum tersedia'}</strong><span title={analysisMediaPath ?? ''}>{analysisMediaPath ?? (analysisSource === 'manual' ? 'Pilih gambar atau video untuk melanjutkan.' : 'Import media utama pada tab Media terlebih dahulu.')}</span></div><span className="mrp-seo-media-summary__status">{analysisMediaPath ? 'READY' : 'NEEDED'}</span></div>
        </fieldset>

        <div className="mrp-seo-form-grid mt-3">
          <label>2. Jenis konten video<select value={CONTENT_TYPES.includes(contentType) ? contentType : 'other'} onChange={(e) => updateContext({ contentType: e.target.value === 'other' ? '' : e.target.value })}>{CONTENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}<option value="other">Lainnya...</option></select>{!CONTENT_TYPES.includes(contentType) && <input maxLength={120} value={contentType} onChange={(e) => updateContext({ contentType: e.target.value })} placeholder="Tulis jenis konten" />}</label>
          <label>3. Topik atau keyword utama<input maxLength={500} value={keyword} onChange={(e) => update({ mainKeyword: e.target.value })} placeholder="whiskey blues, late night blues" aria-label="Main Keyword / Topik atau keyword utama" /><small>{keywordCount} keyword terdeteksi · pisahkan beberapa keyword dengan koma.</small></label>
          <label>4. Bahasa &amp; target penonton<select value={COUNTRIES.some((item) => item.value === country) ? country : 'other'} onChange={(e) => { const entry = COUNTRIES.find((item) => item.value === e.target.value); updateContext({ targetCountry: entry?.value ?? '', targetLanguage: entry?.language ?? '' }); }}>{COUNTRIES.map((item) => <option key={item.value} value={item.value}>{item.value} • {item.language}</option>)}<option value="other">Negara lain...</option></select>{!COUNTRIES.some((item) => item.value === country) && <><input maxLength={80} value={country} onChange={(e) => updateContext({ targetCountry: e.target.value })} placeholder="Tulis negara target" /><input maxLength={80} value={context.targetLanguage ?? ''} onChange={(e) => updateContext({ targetLanguage: e.target.value })} placeholder="Bahasa metadata (mis. Español)" /></>}</label>
        </div>

        <fieldset className="mrp-seo-field mt-3"><legend className="mrp-seo-caption">5. Tujuan Optimasi</legend><div className="mrp-seo-choice-grid">{GOALS.map(({ id, label }) => <label key={id} className="mrp-seo-choice"><input type="checkbox" checked={goals.includes(id)} onChange={() => toggleGoal(id)}/><span>{label}</span></label>)}</div></fieldset>
        <fieldset className="mrp-seo-field mt-3"><legend className="mrp-seo-caption">6. Gaya Judul</legend><div className="mrp-seo-choice-grid">{STYLES.map(({ id, label }) => <label key={id} className={`mrp-seo-choice${style === id ? ' is-selected' : ''}`}><input type="radio" name="seo-title-style" checked={style === id} onChange={() => updateContext({ titleStyle: id })}/><span>{label}</span></label>)}</div></fieldset>

        <div className="mrp-seo-template-bar"><div><strong>Template SEO</strong><small>Simpan kombinasi keyword dan konteks untuk project berikutnya.</small></div><div className="mrp-seo-template-actions"><select className="mrp-seo-template-select" aria-label="Template SEO tersimpan" value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)}><option value="">Pilih template tersimpan</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.keyword} • {item.context.contentType ?? 'Musik'}</option>)}</select><button type="button" className="mrp-btn" onClick={saveTemplate}>Simpan sebagai template</button><button type="button" className="mrp-btn" disabled={!selectedTemplate} onClick={() => { saveTemplates(templates.filter((item) => item.id !== selectedTemplate)); setSelectedTemplate(''); }}>Hapus</button></div></div>
        
      </section>

      <section className="mrp-seo-section mrp-seo-generate-section" aria-labelledby="mrp-seo-generate-heading">
        <div className="mrp-seo-section-heading"><span className="mrp-seo-step">03</span><div><h4 id="mrp-seo-generate-heading">Provider &amp; proses generasi</h4><p>Periksa provider aktif sebelum memulai analisis dan pembuatan metadata.</p></div></div>
        <fieldset className="mrp-seo-field mrp-seo-custom-prompt-field">
          <legend className="mrp-seo-caption">Prompt untuk metadata</legend>
          <label className="mrp-seo-custom-prompt-toggle"><input type="checkbox" checked={Boolean(project.youtubeSEO.customPromptEnabled)} onChange={(event) => update({ customPromptEnabled: event.target.checked })} /><span><strong>Gunakan prompt khusus</strong><small>Instruksi tambahan untuk judul, deskripsi, tag, dan hashtag.</small></span></label>
          {project.youtubeSEO.customPromptEnabled && <label className="mrp-seo-custom-prompt-editor">Instruksi prompt<textarea maxLength={6000} rows={4} value={project.youtubeSEO.customPrompt ?? ''} onChange={(event) => update({ customPrompt: event.target.value })} placeholder="Contoh: gunakan gaya bahasa natural, hindari clickbait, masukkan keyword utama secara wajar, dan utamakan audiens slow rock klasik." aria-label="Prompt khusus untuk judul deskripsi tag dan hashtag" /><small>{(project.youtubeSEO.customPrompt ?? '').length}/6000 karakter. Instruksi ini digunakan saat menghasilkan metadata dan tetap tunduk pada validasi SEO aplikasi.</small></label>}
        </fieldset>
        <div className={`mrp-seo-ai-status${aiReady ? ' is-ready' : aiStatus && !aiStatus.valid ? ' is-warning' : ''}`} aria-live="polite"><span className="mrp-seo-ai-status__icon" aria-hidden="true">{aiReady ? '✓' : '!'}</span><div><small>{providerName} · {modelName}</small></div><button type="button" className="mrp-btn" onClick={onOpenSettings}>Buka Setting AI</button></div>
        <div className="mrp-seo-generate-actions"><button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void generate()} disabled={mode !== 'timestamp-seo' || busy || autoGenerating || !keyword.split(',').some((item) => item.trim()) || !analysisMediaPath || (Boolean(project.youtubeSEO.customPromptEnabled) && !(project.youtubeSEO.customPrompt ?? '').trim())}>{(busy || autoGenerating) && <span role="status" aria-label="AI sedang memproses" className="mrp-seo-spinner"/>}{busy || autoGenerating ? 'Menganalisis / menulis...' : 'Generate YouTube SEO'}</button></div>
        <div role="status" aria-live="polite" title={statusLine} className="mrp-seo-status-line"><span className="mrp-seo-status-line__dot" aria-hidden="true"/><span>[SEO]</span><strong>{statusLine}</strong></div>
      </section>
    </div>}

    </section><aside className="mrp-seo-results-panel" aria-label="Hasil SEO untuk ditinjau">
      <section className={`mrp-seo-results${result ? ' has-result' : ' is-empty'}`} aria-labelledby="mrp-seo-results-heading">
        <header className="mrp-seo-results__header">
          <div><h4 id="mrp-seo-results-heading">Hasil SEO</h4><p>{result ? 'Pindah tab untuk meninjau judul, deskripsi, tags dan hashtag.' : 'Hasil generasi akan muncul pada tab yang dipilih.'}</p></div>
          {result ? <button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void copyText([`#judul`, ...result.titles.map((item, index) => `${index + 1}. ${item}`), '', '#deskripsi', result.readyDescription ?? '', '', '#tag', result.tags.join(', '), '', '#hashtag', result.hashtags.join(' ')].join('\n'), 'Paket SEO')}>Salin paket SEO</button> : <span className="mrp-seo-count">10 pilihan</span>}
        </header>
        {result && <div className="mrp-seo-result-stats"><div><span>Judul</span><strong>{result.titles.length}</strong></div><div><span>Tags</span><strong>{result.tags.length}</strong></div><div><span>Hashtag</span><strong>{result.hashtags.length}</strong></div><div><span>Keyword</span><strong>{result.keywordsPrimary.length + result.keywordsSecondary.length + result.keywordsLongTail.length}</strong></div></div>}
        <div className="mrp-seo-result-tabs" role="tablist" aria-label="Jenis hasil SEO">
          {SEO_RESULT_TABS.map((tab) => <button key={tab.id} type="button" role="tab" id={`mrp-seo-tab-${tab.id}`} aria-controls="mrp-seo-result-tabpanel" aria-selected={activeResultTab === tab.id} className={`mrp-seo-result-tab${activeResultTab === tab.id ? ' is-active' : ''}`} onClick={() => setActiveResultTab(tab.id)}>{tab.label}{result && <span>{tab.id === 'titles' ? result.titles.length : tab.id === 'tags' ? result.tags.length : tab.id === 'hashtags' ? result.hashtags.length : ''}</span>}</button>)}
        </div>
        <div className="mrp-seo-result-tabpanel" id="mrp-seo-result-tabpanel" role="tabpanel" aria-labelledby={`mrp-seo-tab-${activeResultTab}`}>
          {!result && <div className="mrp-seo-result-placeholder"><span className="mrp-seo-result-placeholder__icon">{SEO_RESULT_TABS.findIndex((tab) => tab.id === activeResultTab) + 1}</span><div><strong>{activeResultTab === 'titles' ? 'Pilihan judul' : activeResultTab === 'description' ? 'Deskripsi video' : activeResultTab === 'tags' ? 'Tags dan keyword' : 'Hashtag publikasi'}</strong><p>Jalankan Generate YouTube SEO untuk menampilkan hasil aktual pada tab ini. Contoh tidak dibuat sebagai hasil AI palsu.</p></div></div>}
          {result && activeResultTab === 'titles' && <section className="mrp-seo-result-section mrp-seo-title-results"><div className="mrp-seo-result-section__heading"><div><span className="mrp-seo-kicker">TITLE OPTIONS</span><h5>{result.titles.length} pilihan judul</h5></div><span className="mrp-seo-count">{result.titles.length} judul</span></div>
            {result.titles.map((title, index) => { const isBest = typeof result.bestTitleIndex === 'number' && index === result.bestTitleIndex; return <article key={`${index}-${title}`} className={`mrp-seo-title-card${isBest ? ' is-best' : ''}`}><div className="mrp-seo-title-card__top"><span className="mrp-seo-title-card__number">{String(index + 1).padStart(2, '0')}</span>{isBest && <span className="mrp-seo-best-badge">Pilihan terbaik</span>}<span className="mrp-seo-title-card__length">{Array.from(title).length} karakter</span><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(title, `Judul ${index + 1}`)} aria-label={`Salin judul ${index + 1}`}>Salin</button></div><p>{title}</p>{result.titleNotes?.[index] && <small>{result.titleNotes[index]}</small>}</article>; })}
          </section>}
          {result && activeResultTab === 'description' && <section className="mrp-seo-result-section"><div className="mrp-seo-result-section__heading"><div><span className="mrp-seo-kicker">DESCRIPTION</span><h5>Deskripsi siap tempel</h5></div><button type="button" className="mrp-btn" onClick={() => void copyText(result.readyDescription ?? '', 'Deskripsi')}>Salin deskripsi</button></div>{result.readyDescription ? <p className="mrp-seo-ready-description">{result.readyDescription}</p> : <p className="mrp-seo-empty-result">Deskripsi siap tempel belum tersedia pada hasil ini.</p>}
            <details className="mrp-seo-description-variants"><summary>Tinjau varian deskripsi lainnya</summary><div className="mrp-seo-description-list"><article><div><strong>SEO Rich</strong><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.descriptions.seoRich, 'Deskripsi SEO Rich')}>Salin</button></div><p>{result.descriptions.seoRich}</p></article><article><div><strong>Engagement</strong><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.descriptions.engagement, 'Deskripsi Engagement')}>Salin</button></div><p>{result.descriptions.engagement}</p></article><article><div><strong>Premium</strong><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.descriptions.premium, 'Deskripsi Premium')}>Salin</button></div><p>{result.descriptions.premium}</p></article></div></details>
          </section>}
          {result && activeResultTab === 'tags' && <section className="mrp-seo-result-section"><div className="mrp-seo-result-section__heading"><div><span className="mrp-seo-kicker">TAGS &amp; KEYWORDS</span><h5>Tags dan kelompok keyword</h5></div><button type="button" className="mrp-btn" onClick={() => void copyText([...result.tags, ...result.keywordsPrimary, ...result.keywordsSecondary, ...result.keywordsLongTail].join(', '), 'Tags dan keyword')}>Salin semua</button></div><div className="mrp-seo-tag-block"><div><strong>Tags YouTube</strong><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.tags.join(', '), 'Tags')}>Salin tags</button></div><p>{result.tags.join(', ') || 'Belum ada tags.'}</p></div><div className="mrp-seo-keyword-group"><strong>Utama</strong><div>{result.keywordsPrimary.map((item, index) => <span key={`p-${index}-${item}`}>{item}</span>)}</div></div><div className="mrp-seo-keyword-group"><strong>Sekunder</strong><div>{result.keywordsSecondary.map((item, index) => <span key={`s-${index}-${item}`}>{item}</span>)}</div></div><div className="mrp-seo-keyword-group"><strong>Long-tail</strong><div>{result.keywordsLongTail.map((item, index) => <span key={`l-${index}-${item}`}>{item}</span>)}</div></div></section>}
          {result && activeResultTab === 'hashtags' && <section className="mrp-seo-result-section"><div className="mrp-seo-result-section__heading"><div><span className="mrp-seo-kicker">HASHTAGS</span><h5>Hashtag publikasi</h5></div><button type="button" className="mrp-btn" onClick={() => void copyText(result.hashtags.join(' '), 'Hashtag')}>Salin hashtag</button></div><div className="mrp-seo-hashtag-list">{result.hashtags.length ? result.hashtags.map((tag, index) => <span key={`${index}-${tag}`}>{tag}</span>) : <p className="mrp-seo-empty-result">Belum ada hashtag.</p>}</div></section>}
        </div>
        {result && <details className="mrp-seo-extra-details"><summary>Analisis visual, intent penonton &amp; file hasil</summary><div className="mrp-seo-analysis-body"><p>{result.visualAnalysis}</p><p><strong>Intent audiens:</strong> {result.audienceIntent}</p><div className="mrp-seo-evidence-grid"><div><strong>Teramati</strong><p>{result.visualEvidence?.observed.join('; ') || 'Tidak ada item.'}</p></div><div><strong>Interpretasi</strong><p>{result.visualEvidence?.interpreted.join('; ') || 'Tidak ada item.'}</p></div><div><strong>Perlu diperiksa</strong><p>{result.visualEvidence?.uncertain.join('; ') || 'Tidak ada item.'}</p></div><div><strong>Teks terlihat</strong><p>{result.visualEvidence?.visibleText.join('; ') || 'Tidak ada teks terdeteksi.'}</p></div></div><div className="mrp-seo-output-files"><div><span className="mrp-seo-output-files__icon" aria-hidden="true">TXT</span><div><strong>File hasil SEO</strong><span title={result.outputFiles.seoTxt}>{result.outputFiles.seoTxt}</span></div><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.outputFiles.seoTxt, 'Lokasi file SEO')}>Salin path</button></div>{result.outputFiles.timestampTxt && <div><span className="mrp-seo-output-files__icon" aria-hidden="true">TXT</span><div><strong>File timestamp</strong><span title={result.outputFiles.timestampTxt}>{result.outputFiles.timestampTxt}</span></div><button type="button" className="mrp-seo-copy-btn" onClick={() => void copyText(result.outputFiles.timestampTxt, 'Lokasi file timestamp')}>Salin path</button></div>}</div></div></details>}
      </section>
    </aside></div>;
}
