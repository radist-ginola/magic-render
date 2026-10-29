import { useState, type JSX } from 'react';
import type { ProjectData } from '../../shared/domain/projectTypes';
import { ChevronIcon, ResetLayerIcon } from './LayerActionIcons';
import type { MainEffectKind, MainMediaEffect, ParticleEffect, ParticleKind, ParticleMotion } from '../../shared/domain/effectTypes';
import { defaultVisualizer, type StereoVisualizerStyle, type VisualizerEffect } from '../../shared/domain/visualizerTypes';

const mainNames: Record<MainEffectKind,string> = { blink:'Berkedip', pulse:'Berdenyut', sway:'Bergoyang', shake:'Berguncang', zoom:'Zoom in/out', light:'Cahaya', glitch:'Glitch', flicker:'Kelap-kelip', float:'Melayang', tint:'Pergeseran warna', wobble:'Oleng halus' };
const particleNames: Record<ParticleKind,string> = { firefly:'Kunang-kunang', dust:'Debu', smoke:'Asap', stars:'Bintang', colors:'Bintik warna', lines:'Garis-garis', rain:'Hujan', snow:'Salju', embers:'Bara api', petals:'Kelopak', sparks:'Percikan', bubbles:'Gelembung', confetti:'Konfeti', leaves:'Daun', fire:'Lidah api', meteor:'Meteor', glitter:'Kilau halus', firefliesBlue:'Kunang biru', pollen:'Serbuk sari', ash:'Abu melayang', ice:'Kristal es', neon:'Neon', hearts:'Kelip hati', diamonds:'Berlian', twinkle:'Kelip bintang' };
const motionNames: Record<ParticleMotion,string> = { spread:'Menyebar', fall:'Jatuh', drift:'Berjalan', evaporate:'Menguap', orbit:'Mengorbit', spiral:'Spiral', zigzag:'Zigzag turun', bounce:'Memantul', rise:'Naik' };
const particleGlyphs: Partial<Record<ParticleKind,string>> = { firefly:'✦', dust:'·', smoke:'≈', stars:'✧', rain:'╱', snow:'❄', embers:'✹', petals:'❀', sparks:'✳', bubbles:'○', confetti:'▪', leaves:'❧', fire:'♨', meteor:'☄', glitter:'✧', firefliesBlue:'✦', pollen:'∘', ash:'·', ice:'❆', neon:'✦', hearts:'♡', diamonds:'◇', twinkle:'✴' };
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const slider = (name:string, value:number, min:number, max:number, step:number, update:(v:number)=>void) => <label>{name} <b>{value}</b><input type="range" min={min} max={max} step={step} value={value} onChange={(e)=>update(Number(e.target.value))}/></label>;

export function MainMediaEffectsPanel({ project, onProjectChange }: { project:ProjectData; onProjectChange:(project:ProjectData)=>void }): JSX.Element {
  const [collapsed, setCollapsed] = useState(true);
  const effects = project.mainMediaEffects ?? [];
  const set = (next:MainMediaEffect[]) => onProjectChange({ ...project, mainMediaEffects:next });
  const patch = (index:number, value:Partial<MainMediaEffect>) => set(effects.map((effect,i)=>i===index?{...effect,...value}:effect));
  function addEffect(): void {
    set([...effects,{id:id(),kind:'pulse',opacity:0.5,axisX:1,axisY:1,speed:1,beatSync:true,fadeInSec:0}]);
    setCollapsed(false);
  }
  return <div className="mrp-effects-panel mrp-effects-panel--main">
    <div className="mrp-card-title-row mrp-main-media-effects__header">
      <div><span className="mrp-kicker">Efek Visual · {effects.length}/8</span><h3>Main Media Efex</h3></div>
      <div className="mrp-main-media-effects__actions">
        {effects.length > 0 && <button type="button" className="mrp-btn" aria-label="Reset Main Media Efex" title="Reset semua efek media" onClick={()=>set([])}><ResetLayerIcon /></button>}
        <button type="button" className="mrp-btn mrp-btn--primary" disabled={effects.length>=8} onClick={addEffect}>+ Tambahkan Efek</button>
        <button type="button" className="mrp-btn mrp-main-media-effects__collapse" aria-label={collapsed ? 'Tampilkan Main Media Efex' : 'Sembunyikan Main Media Efex'} title={collapsed ? 'Tampilkan Main Media Efex' : 'Sembunyikan Main Media Efex'} aria-controls="mrp-main-media-effects-controls" aria-expanded={!collapsed} onClick={()=>setCollapsed((value)=>!value)}><ChevronIcon expanded={!collapsed}/></button>
      </div>
    </div>
    <div id="mrp-main-media-effects-controls" className="mrp-main-media-effects__body" hidden={collapsed}>
      <p>Efek dapat ditumpuk. Sync bit memakai tempo audio yang dianalisis; bila tidak terdeteksi, 120 BPM digunakan.</p>
      {effects.map((effect,i)=><div className="mrp-effect-card" key={effect.id}><div className="mrp-effect-head"><strong>Efek {i+1}</strong><button type="button" className="mrp-btn mrp-btn--danger" onClick={()=>set(effects.filter((_,j)=>j!==i))}>Hapus</button></div><div className="mrp-effect-grid"><label>Jenis efek<select value={effect.kind} onChange={(e)=>patch(i,{kind:e.target.value as MainEffectKind})}>{Object.entries(mainNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{slider('Opacity/intensitas',effect.opacity,0,1,0.01,(v)=>patch(i,{opacity:v}))}{slider('Fade In (detik)',effect.fadeInSec ?? 0,0,30,0.1,(v)=>patch(i,{fadeInSec:v}))}{slider('Arah X',effect.axisX,-1,1,0.05,(v)=>patch(i,{axisX:v}))}{slider('Arah Y',effect.axisY,-1,1,0.05,(v)=>patch(i,{axisY:v}))}{slider('Kecepatan',effect.speed,0.25,4,0.05,(v)=>patch(i,{speed:v}))}<label className="mrp-check"><input type="checkbox" checked={effect.beatSync} onChange={(e)=>patch(i,{beatSync:e.target.checked})}/> Ikuti bit musik</label></div></div>)}
      {!effects.length && <div className="mrp-inline-note">Belum ada efek media. Tambahkan efek untuk menampilkan pengaturannya.</div>}
    </div>
  </div>;
}
export function ParticleEffectsPanel({ project, onProjectChange }: { project:ProjectData; onProjectChange:(project:ProjectData)=>void }): JSX.Element {
  const [collapsed, setCollapsed] = useState(true);
  const effects = project.particleEffects ?? [];
  const set = (next:ParticleEffect[]) => onProjectChange({ ...project, particleEffects:next });
  const patch = (index:number, value:Partial<ParticleEffect>) => set(effects.map((effect,i)=>i===index?{...effect,...value}:effect));
  return <section className="mrp-effects-panel mrp-effects-panel--particle" aria-labelledby="mrp-particle-effects-title">
    <div className="mrp-effects-panel__header">
      <div className="mrp-effects-panel__heading"><span className="mrp-effects-panel__icon" aria-hidden="true">✧</span><div><h3 id="mrp-particle-effects-title">Particle Effects <span className="mrp-effects-panel__count">{effects.length}/8</span></h3></div></div>
      <div className="mrp-effects-panel__actions">
        {effects.length > 0 && <button type="button" className="mrp-btn" aria-label="Reset Partikel Efex" title="Reset semua partikel" onClick={()=>set([])}><ResetLayerIcon /></button>}
        <button type="button" className="mrp-btn mrp-btn--primary" disabled={effects.length>=8} onClick={()=>{set([...effects,{id:id(),kind:'firefly',opacity:0.65,flipX:false,flipY:false,rotation:0,minCount:8,maxCount:14,minDistance:50,maxDistance:720,motion:'drift',speed:1,beatSync:true,fadeInSec:0}]);setCollapsed(false);}}>＋ Tambah Partikel</button>
        <button type="button" className="mrp-btn mrp-effects-panel__collapse" aria-label={collapsed?'Tampilkan kontrol partikel':'Sembunyikan kontrol partikel'} aria-controls="mrp-particle-effects-controls" aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}><ChevronIcon expanded={!collapsed}/></button>
      </div>
    </div>
    <div className="mrp-effects-panel__summary"><span className="mrp-effects-panel__summary-art" aria-hidden="true">✦</span><div><strong>{effects.length ? `${effects.length} efek partikel tersimpan` : 'Belum ada efek partikel'}</strong></div><span className="mrp-effects-panel__summary-state">{effects.length ? 'SIAP DIATUR' : 'KOSONG'}</span></div>
    {!collapsed && <div id="mrp-particle-effects-controls" className="mrp-effects-panel__body"><p className="mrp-effects-panel__note">Maksimal 40 partikel per efek untuk menjaga waktu render. Setiap perubahan tersimpan pada konfigurasi project yang sama.</p>
      {effects.map((effect,i)=><article className="mrp-effect-card mrp-effect-card--particle" key={effect.id}>
        <div className="mrp-effect-card__header"><div className="mrp-effect-card__identity"><span className="mrp-particle-swatch" style={{color:effect.color ?? '#7cefff'}} aria-hidden="true">{particleGlyphs[effect.kind] ?? '✦'}</span><div><strong>Partikel {i+1} · {particleNames[effect.kind]}</strong><small>{motionNames[effect.motion]} · {effect.maxCount} partikel maks.</small></div></div><button type="button" className="mrp-btn mrp-btn--danger" onClick={()=>set(effects.filter((_,j)=>j!==i))}>Hapus</button></div>
        <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>01</span><h4>Tampilan</h4></div><div className="mrp-effect-grid">
          <label>Jenis partikel<select value={effect.kind} onChange={(e)=>patch(i,{kind:e.target.value as ParticleKind})}>{Object.entries(particleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Warna partikel<div className="mrp-effects-color-control"><input type="color" aria-label="Warna partikel" value={effect.color ?? '#ffffff'} onChange={(e)=>patch(i,{color:e.target.value})}/><button type="button" className="mrp-btn" onClick={()=>patch(i,{color:undefined})}>Palet bawaan</button></div></label>
          {slider('Opacity',effect.opacity,0,1,0.01,(v)=>patch(i,{opacity:v}))}
          {slider('Fade In (detik)',effect.fadeInSec ?? 0,0,30,0.1,(v)=>patch(i,{fadeInSec:v}))}
          {slider('Rotasi',effect.rotation,-360,360,1,(v)=>patch(i,{rotation:v}))}
          {slider('Ukuran titik',effect.size ?? (effect.kind==='smoke'?72:18),8,110,1,(v)=>patch(i,{size:v}))}
        </div></section>
        <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>02</span><h4>Gerakan & kepadatan</h4></div><div className="mrp-effect-grid">
          <label>Arah gerak<select value={effect.motion} onChange={(e)=>patch(i,{motion:e.target.value as ParticleMotion})}>{Object.entries(motionNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          {slider('Jumlah min',effect.minCount,1,effect.maxCount,1,(v)=>patch(i,{minCount:v}))}
          {slider('Jumlah max',effect.maxCount,effect.minCount,40,1,(v)=>patch(i,{maxCount:v}))}
          {slider('Jarak min',effect.minDistance,0,effect.maxDistance,1,(v)=>patch(i,{minDistance:v}))}
          {slider('Jarak max',effect.maxDistance,effect.minDistance,2000,1,(v)=>patch(i,{maxDistance:v}))}
          {slider('Kecepatan',effect.speed,0.25,4,0.05,(v)=>patch(i,{speed:v}))}
          <label className="mrp-check"><input type="checkbox" checked={effect.flipX} onChange={(e)=>patch(i,{flipX:e.target.checked})}/> Flip X</label>
          <label className="mrp-check"><input type="checkbox" checked={effect.flipY} onChange={(e)=>patch(i,{flipY:e.target.checked})}/> Flip Y</label>
          <label className="mrp-check"><input type="checkbox" checked={effect.beatSync} onChange={(e)=>patch(i,{beatSync:e.target.checked})}/> Ikuti bit musik</label>
        </div></section>
      </article>)}
      {!effects.length && <div className="mrp-effects-panel__empty"><span aria-hidden="true">✧</span><strong>Tambahkan atmosfer ke video</strong><p>Pilih efek seperti Kunang-kunang, Debu, Hujan, Salju, Bara api, atau Neon untuk mulai.</p></div>}
    </div>}
  </section>;
}


const stereoVisualizerNames: Partial<Record<StereoVisualizerStyle, string>> = {
  'onix-analyzer':'Analyzer · Vertical Spectrum Bars', 'onix-classic':'Classic · Oscilloscope Glow', 'onix-modern':'Modern · Brand Gradient Spectrum', 'onix-plasma':'Plasma · Dual Wave Trails', 'onix-infinity':'Infinity · Circular Waveforms', 'onix-neon':'Neon · Counter-Rotating Crosses', 'onix-hawking':'Hawking · Spiked Ring', 'onix-core':'Onix · Pulsing Gradient Core', 'onix-reactor':'Reactor · Concentric Frequency Tower', 'onix-spotlight':'Spotlight · Ambient Reactor', 'onix-twirl':'Twirl · Rotating Spiral', 'onix-warp':'Warp · Radial Distortion Approximation', 'onix-ripple':'Ripple · Concentric Rings', 'onix-pulsar':'Pulsar · Mirrored Pulsing Waves', 'onix-hallucia':'Hallucia · Spectral Spiral', 'onix-logo':'Logo · Gambar statis di tengah', 'onix-album-art':'Album Art · Artwork statis di tengah', 'onix-blank':'Blank · Tanpa Visualizer',
  'vertical-spectrum-bars':'Vertical Spectrum Bars', 'circular-spectrum':'Circular Spectrum', 'circular-waveform':'Circular Waveform', 'radial-spectrum':'Radial Spectrum', oscilloscope:'Oscilloscope', lissajous:'Lissajous / Stereo Phase', 'waveform-progress':'Waveform Progress Bar',
  'basic-split':'Legacy · Stereo Split', mirrored:'Legacy · Mirrored Stereo', gap:'Legacy · Stereo Gap', 'split-colors':'Legacy · Split Channels', cqt:'Legacy · Constant-Q', rainbow:'Legacy · Rainbow Wave', glow:'Legacy · Glow Wave', reflection:'Legacy · Wave Reflection', vector:'Legacy · Vector Scope', spectrum:'Legacy · Scrolling Spectrum', frequency:'Legacy · Frequency Bars / Line / Dots', 'vu-meter':'Legacy · VU Meter', polar:'Legacy · Polar Scope',
};
const onixVisualizerStyles: Array<{ value: StereoVisualizerStyle; label: string }> = [
  {value:'onix-analyzer',label:stereoVisualizerNames['onix-analyzer']!}, {value:'onix-classic',label:stereoVisualizerNames['onix-classic']!}, {value:'onix-modern',label:stereoVisualizerNames['onix-modern']!}, {value:'onix-plasma',label:stereoVisualizerNames['onix-plasma']!}, {value:'onix-infinity',label:stereoVisualizerNames['onix-infinity']!}, {value:'onix-neon',label:stereoVisualizerNames['onix-neon']!}, {value:'onix-hawking',label:stereoVisualizerNames['onix-hawking']!}, {value:'onix-core',label:stereoVisualizerNames['onix-core']!}, {value:'onix-reactor',label:stereoVisualizerNames['onix-reactor']!}, {value:'onix-spotlight',label:stereoVisualizerNames['onix-spotlight']!}, {value:'onix-twirl',label:stereoVisualizerNames['onix-twirl']!}, {value:'onix-warp',label:stereoVisualizerNames['onix-warp']!}, {value:'onix-ripple',label:stereoVisualizerNames['onix-ripple']!}, {value:'onix-pulsar',label:stereoVisualizerNames['onix-pulsar']!}, {value:'onix-hallucia',label:stereoVisualizerNames['onix-hallucia']!}, {value:'onix-logo',label:stereoVisualizerNames['onix-logo']!}, {value:'onix-album-art',label:stereoVisualizerNames['onix-album-art']!}, {value:'onix-blank',label:stereoVisualizerNames['onix-blank']!},
  {value:'vertical-spectrum-bars',label:stereoVisualizerNames['vertical-spectrum-bars']!}, {value:'circular-spectrum',label:stereoVisualizerNames['circular-spectrum']!}, {value:'circular-waveform',label:stereoVisualizerNames['circular-waveform']!}, {value:'radial-spectrum',label:stereoVisualizerNames['radial-spectrum']!}, {value:'oscilloscope',label:stereoVisualizerNames.oscilloscope!}, {value:'lissajous',label:stereoVisualizerNames.lissajous!}, {value:'waveform-progress',label:stereoVisualizerNames['waveform-progress']!},
];

const visualizerNames = {
  mediaLogo: 'Media / Logo Reaktif',
  bars: 'Equalizer Bars', line: 'Garis Frekuensi', dots: 'Titik Spektrum', wave: 'Gelombang Audio', mirror: 'Gelombang Simetris', spectrum: 'Spektrum Pelangi',
  smoothBars: 'Bars Lembut', waveLine: 'Gelombang Garis', wavePoints: 'Gelombang Titik', spectrumFire: 'Spektrum Api', spectrumCool: 'Spektrum Dingin', spectrumScroll: 'Spektrum Mengalir',
  solidBars: 'Kolom Padat', sparkDots: 'Titik Neon', wavePeak: 'Gelombang Puncak', spectrumViridis: 'Spektrum Viridis', spectrumMagma: 'Spektrum Magma',
};
export function VisualizerPanel({ project, onProjectChange }: { project: ProjectData; onProjectChange: (project: ProjectData) => void }): JSX.Element {
  const [collapsed, setCollapsed] = useState(true);
  const effects = project.visualizers ?? [];
  const set = (next: VisualizerEffect[]) => onProjectChange({ ...project, visualizers: next });
  const patch = (index: number, change: Partial<VisualizerEffect>) => set(effects.map((item, i) => i === index ? { ...item, ...change } : item));
  return <section className="mrp-effects-panel mrp-effects-panel--visualizer" aria-labelledby="mrp-visualizer-title">
    <div className="mrp-effects-panel__header">
      <div className="mrp-effects-panel__heading"><span className="mrp-effects-panel__icon mrp-effects-panel__icon--audio" aria-hidden="true">▥</span><div><h3 id="mrp-visualizer-title">Audio Visualizer <span className="mrp-effects-panel__count">{effects.length}/4</span></h3></div></div>
      <div className="mrp-effects-panel__actions">
        {effects.length > 0 && <button type="button" className="mrp-btn" aria-label="Reset Visualizer" title="Hapus semua visualizer" onClick={() => set([])}><ResetLayerIcon /></button>}
        <button type="button" className="mrp-btn mrp-btn--primary" disabled={effects.length >= 4} onClick={() => { set([...effects, defaultVisualizer(id())]); setCollapsed(false); }}>＋ Tambah Visualizer</button>
        <button type="button" className="mrp-btn mrp-effects-panel__collapse" aria-label={collapsed ? 'Tampilkan kontrol visualizer' : 'Sembunyikan kontrol visualizer'} aria-controls="mrp-visualizer-controls" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><ChevronIcon expanded={!collapsed}/></button>
      </div>
    </div>
    <div className="mrp-effects-panel__summary"><span className="mrp-effects-panel__summary-art mrp-effects-panel__summary-art--bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></span><div><strong>{effects.length ? `${effects.length} visualizer tersimpan` : 'Belum ada visualizer'}</strong></div><span className="mrp-effects-panel__summary-state">{effects.length ? 'AUDIO REAKTIF' : 'KOSONG'}</span></div>
    {!collapsed && <div id="mrp-visualizer-controls" className="mrp-effects-panel__body"><p className="mrp-effects-panel__note">Pilih equalizer, gelombang, atau media/logo yang bereaksi terhadap musik. Kehalusan tinggi membuat gerakan lebih stabil.</p>
      {effects.map((effect, index) => {
        const stereoStyle = effect.stereoStyle ?? 'basic-split';
        const mediaLogo = effect.kind === 'mediaLogo';
        const staticArtworkStyle = mediaLogo && ['onix-logo','onix-album-art'].includes(stereoStyle);
        const mediaSourceStyle = staticArtworkStyle ? stereoStyle : mediaLogo ? 'mediaLogo' : stereoStyle;
        const spectrum = ['cqt','spectrum','frequency','onix-analyzer','onix-modern','onix-reactor','onix-spotlight','vertical-spectrum-bars','circular-spectrum','radial-spectrum'].includes(stereoStyle);
        const wave = ['basic-split','mirrored','gap','split-colors','rainbow','glow','reflection','onix-classic','onix-plasma','onix-infinity','onix-hawking','onix-pulsar','circular-waveform','oscilloscope','waveform-progress'].includes(stereoStyle);
        const crop = effect.sourceCrop ?? { left: 0, right: 0, top: 0, bottom: 0 };
        const mediaUrl = effect.sourcePath ? `mrp-media://local?path=${encodeURIComponent(effect.sourcePath)}` : '';
        return <article className="mrp-effect-card mrp-effect-card--visualizer" key={effect.id}>
          <div className="mrp-effect-card__header"><div className="mrp-effect-card__identity"><span className={`mrp-visualizer-swatch ${wave?'is-wave':'is-bars'} ${spectrum?'is-spectrum':''}`} style={{color:effect.color}} aria-hidden="true">{Array.from({length:9},(_,bar)=><i key={bar}/>)}</span><div><strong>Visualizer {index + 1} · {mediaLogo && !staticArtworkStyle ? visualizerNames.mediaLogo : (stereoVisualizerNames[stereoStyle] ?? 'Audio Visualizer')}</strong><small>{effect.size.width} × {effect.size.height} px · {effect.opacity.toLocaleString('id-ID',{style:'percent',maximumFractionDigits:0})} opacity</small></div></div><button type="button" className="mrp-btn mrp-btn--danger" onClick={() => set(effects.filter((_, i) => i !== index))}>Hapus</button></div>
          <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>01</span><h4>Gaya & warna</h4></div><div className="mrp-effect-grid">
            <label>Model visualizer<select value={mediaSourceStyle} onChange={(event) => { const value = event.target.value; if (value === 'mediaLogo') patch(index, { kind: 'mediaLogo', stereoStyle: 'onix-analyzer', mediaMotion: 'pulse-float' }); else if (value === 'onix-logo' || value === 'onix-album-art') patch(index, { kind: 'mediaLogo', stereoStyle: value as StereoVisualizerStyle, mediaMotion: 'none' }); else patch(index, { kind: 'wave', stereoStyle: value as StereoVisualizerStyle }); }}><option value="mediaLogo">Media / Logo Reaktif</option><optgroup label="ONIXLabs-inspired styles">{onixVisualizerStyles.filter((style) => !['onix-blank'].includes(style.value)).map(({value,label}) => <option key={value} value={value}>{label}</option>)}</optgroup><optgroup label="No visualization"><option value="onix-blank">Blank · Tanpa Visualizer</option></optgroup>{!onixVisualizerStyles.some((style)=>style.value===stereoStyle) && <optgroup label="Legacy project compatibility"><option value={stereoStyle}>{stereoVisualizerNames[stereoStyle] ?? stereoStyle}</option></optgroup>}</select></label>
            {!mediaLogo && wave && <label>Mode waveform<select value={effect.waveformMode ?? 'cline'} onChange={(event) => patch(index, { waveformMode: event.target.value as NonNullable<VisualizerEffect['waveformMode']> })}><option value="line">Line · tajam</option><option value="cline">Continuous line · halus</option><option value="p2p">Point-to-point</option><option value="point">Point · titik</option></select></label>}
            {!mediaLogo && ['spectrum','frequency','cqt'].includes(stereoStyle) && <label>Skala frekuensi<select value={effect.frequencyScale ?? 'log'} onChange={(event) => patch(index, { frequencyScale: event.target.value as NonNullable<VisualizerEffect['frequencyScale']> })}><option value="log">Logarithmic</option><option value="linear">Linear</option></select></label>}
            {!mediaLogo && ['basic-split','mirrored','gap','split-colors','rainbow','glow','reflection','spectrum','frequency','cqt'].includes(stereoStyle) && <label>Skala amplitudo<select value={effect.waveformScale ?? 'sqrt'} onChange={(event) => patch(index, { waveformScale: event.target.value as NonNullable<VisualizerEffect['waveformScale']> })}><option value="lin">Linear</option><option value="sqrt">Square root</option><option value="cbrt">Cube root</option><option value="log">Logarithmic</option></select></label>}
            {!mediaLogo && stereoStyle === 'spectrum' && <><label>Palet spektrum<select value={effect.palette ?? 'rainbow'} onChange={(event) => patch(index, { palette: event.target.value as NonNullable<VisualizerEffect['palette']> })}><option value="rainbow">Rainbow</option><option value="fire">Fire</option><option value="cool">Cool</option><option value="viridis">Viridis</option><option value="magma">Magma</option><option value="custom">Kanal</option></select></label><label>Arah spektrum<select value={effect.spectrumSlide ?? 'scroll'} onChange={(event) => patch(index, { spectrumSlide: event.target.value as NonNullable<VisualizerEffect['spectrumSlide']> })}><option value="scroll">Scroll ke kiri</option><option value="rscroll">Scroll ke kanan</option><option value="replace">Ganti frame</option></select></label></>}
            {!mediaLogo && stereoStyle === 'frequency' && <label>Gaya frekuensi<select value={effect.frequencyMode ?? 'bar'} onChange={(event) => patch(index, { frequencyMode: event.target.value as NonNullable<VisualizerEffect['frequencyMode']> })}><option value="bar">Bars</option><option value="line">Line</option><option value="dot">Dots</option></select></label>}
            {!mediaLogo && stereoStyle === 'vu-meter' && <><label>Mode level<select value={effect.volumeMode ?? 'peak'} onChange={(event) => patch(index, { volumeMode: event.target.value as NonNullable<VisualizerEffect['volumeMode']> })}><option value="peak">Peak</option><option value="rms">RMS</option></select></label><label>Orientasi meter<select value={effect.volumeOrientation ?? 'horizontal'} onChange={(event) => patch(index, { volumeOrientation: event.target.value as NonNullable<VisualizerEffect['volumeOrientation']> })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label></>}
            {!mediaLogo && ['vector','polar'].includes(stereoStyle) && <label>Gaya vectorscope<select value={stereoStyle === 'polar' ? 'polar' : (effect.vectorScopeMode ?? 'lissajous_xy')} onChange={(event) => { const value = event.target.value as NonNullable<VisualizerEffect['vectorScopeMode']>; patch(index, { vectorScopeMode: value, ...(value === 'polar' ? { stereoStyle: 'polar' as const } : { stereoStyle: 'vector' as const }) }); }}><option value="lissajous">Lissajous</option><option value="lissajous_xy">Lissajous XY</option><option value="polar">Polar</option></select></label>}
          </div></section>
          {mediaLogo && <section className="mrp-effect-section mrp-visualizer-media-source"><div className="mrp-effect-section__title"><span>02</span><h4>Media / logo & crop</h4></div><div className="mrp-effect-grid">
            <div className="mrp-visualizer-media-source__preview">{mediaUrl ? <img src={mediaUrl} alt="Sumber media visualizer" /> : <span>Pilih gambar/logo untuk digunakan sebagai visualizer</span>}</div>
            <button type="button" className="mrp-btn mrp-btn--primary" onClick={() => void window.magicRender.chooseVisualizerMedia().then((sourcePath) => { if (sourcePath) patch(index, { sourcePath, sourceCrop: effect.sourceCrop ?? { left:0, right:0, top:0, bottom:0 } }); }).catch((error) => { void window.magicRender.logActivity('ERROR', 'Gagal memilih gambar visualizer.', error instanceof Error ? error.message : String(error)); })}>Pilih media / logo</button>
            {slider('Crop kiri (%)', crop.left, 0, Math.max(0,95-crop.right), 1, (left) => patch(index,{sourceCrop:{...crop,left}}))}
            {slider('Crop kanan (%)', crop.right, 0, Math.max(0,95-crop.left), 1, (right) => patch(index,{sourceCrop:{...crop,right}}))}
            {slider('Crop atas (%)', crop.top, 0, Math.max(0,95-crop.bottom), 1, (top) => patch(index,{sourceCrop:{...crop,top}}))}
            {slider('Crop bawah (%)', crop.bottom, 0, Math.max(0,95-crop.top), 1, (bottom) => patch(index,{sourceCrop:{...crop,bottom}}))}
            <label>Mode blend<select value={effect.blendMode ?? 'normal'} onChange={(event) => patch(index, { blendMode: event.target.value as NonNullable<VisualizerEffect['blendMode']> })}><option value="normal">Normal</option><option value="screen">Screen</option><option value="lighten">Lighten</option><option value="add">Add</option><option value="multiply">Multiply</option><option value="overlay">Overlay</option></select></label>
            <label className="mrp-check"><input type="checkbox" checked={effect.chromaKeyEnabled ?? false} onChange={(event) => patch(index, { chromaKeyEnabled: event.target.checked })} /> Aktifkan Chroma Key</label>
            {effect.chromaKeyEnabled && <><label>Warna key<input type="color" value={effect.chromaKeyColor ?? '#00ff00'} onChange={(event) => patch(index,{chromaKeyColor:event.target.value})} /></label>{slider('Kemiripan warna',effect.chromaSimilarity ?? .12,0,1,.01,(chromaSimilarity)=>patch(index,{chromaSimilarity}))}{slider('Kelembutan key',effect.chromaBlend ?? .06,0,.5,.01,(chromaBlend)=>patch(index,{chromaBlend}))}</>}
            {!staticArtworkStyle && <><label>Gerakan media/logo<select value={effect.mediaMotion ?? 'pulse-float'} onChange={(event) => patch(index, { mediaMotion: event.target.value as NonNullable<VisualizerEffect['mediaMotion']> })}><option value="none">Diam</option><option value="pulse">Pulse / berdenyut</option><option value="float">Float / mengambang</option><option value="pulse-float">Pulse + Float</option><option value="rotate">Rotasi ringan</option></select></label>{effect.mediaMotion !== 'none' && <>{slider('Kekuatan gerakan',effect.motionAmount ?? .08,0,.3,.01,(motionAmount)=>patch(index,{motionAmount}))}{slider('Kecepatan gerakan',effect.motionSpeed ?? 1,.1,4,.1,(motionSpeed)=>patch(index,{motionSpeed}))}</>}</>}
          </div></section>}
          {!mediaLogo && <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>02</span><h4>Warna & bentuk visual</h4></div><div className="mrp-effect-grid">
            <label>Mode warna<select value={effect.colorMode ?? 'gradient'} onChange={(event)=>patch(index,{colorMode:event.target.value as NonNullable<VisualizerEffect['colorMode']>})}><option value="single">Single Color</option><option value="gradient">Gradient</option><option value="neon">Neon</option><option value="amber">Amber Vintage</option></select></label>
            <label>Warna utama<input type="color" value={effect.color ?? '#2cf9ff'} onChange={(event)=>patch(index,{color:event.target.value})}/></label>
            {slider('Ketebalan garis',effect.thickness ?? 2,1,12,0.5,(thickness)=>patch(index,{thickness}))}
            {slider('Jumlah bar / sampel',effect.barCount ?? effect.density ?? 64,16,256,8,(barCount)=>patch(index,{barCount, density:barCount <= 16 ? 16 : barCount <= 32 ? 32 : barCount <= 64 ? 64 : 128}))}
            {['onix-analyzer','onix-modern','vertical-spectrum-bars','frequency','spectrum','cqt'].includes(stereoStyle) && <>
              {slider('Jarak antarbar',effect.bandSpacing ?? .15,0,.8,.01,(bandSpacing)=>patch(index,{bandSpacing}))}
              <label className="mrp-check"><input type="checkbox" checked={effect.roundedTop ?? true} onChange={(event)=>patch(index,{roundedTop:event.target.checked})}/> Sudut atas melengkung</label>
              {effect.roundedTop !== false && slider('Radius sudut atas',effect.cornerRadius ?? 6,0,12,1,(cornerRadius)=>patch(index,{cornerRadius}))}
              <label className="mrp-check"><input type="checkbox" checked={effect.showPeakMarker ?? true} onChange={(event)=>patch(index,{showPeakMarker:event.target.checked})}/> Tampilkan titik puncak bar</label>
            </>}
            <label className="mrp-check"><input type="checkbox" checked={effect.symmetry ?? false} onChange={(event)=>patch(index,{symmetry:event.target.checked})}/> Simetri / cermin</label>
            {slider('Frekuensi minimum (Hz)',effect.frequencyMinHz ?? 40,20,2000,10,(frequencyMinHz)=>patch(index,{frequencyMinHz}))}
            {slider('Frekuensi maksimum (Hz)',effect.frequencyMaxHz ?? 16000,1000,20000,100,(frequencyMaxHz)=>patch(index,{frequencyMaxHz}))}
          </div></section>}
          <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>{mediaLogo ? '03' : '03'}</span><h4>Posisi & ukuran</h4></div><div className="mrp-effect-grid">
            {slider('Posisi X', effect.position.x, -1920, 1920, 1, (x) => patch(index, { position: { ...effect.position, x } }))}
            {slider('Posisi Y', effect.position.y, -1080, 1080, 1, (y) => patch(index, { position: { ...effect.position, y } }))}
            {slider('Lebar', effect.size.width, 32, 1920, 2, (width) => patch(index, { size: { ...effect.size, width } }))}
            {slider('Tinggi', effect.size.height, 16, 1080, 2, (height) => patch(index, { size: { ...effect.size, height } }))}
          </div></section>
          <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>{mediaLogo ? '04' : '03'}</span><h4>Respons audio & tampilan</h4></div><div className="mrp-effect-grid">
            {slider('Opacity', effect.opacity, 0, 1, 0.01, (opacity) => patch(index, { opacity }))}
            {slider('Fade In (detik)', effect.fadeInSec ?? 0, 0, 30, 0.1, (fadeInSec) => patch(index, { fadeInSec }))}
            {!mediaLogo && slider('Sensitivitas', effect.sensitivity, 0.2, 4, 0.05, (sensitivity) => patch(index, { sensitivity }))}
            {!mediaLogo && stereoStyle === 'glow' && slider('Glow', effect.glow ?? 2, 0, 5, 0.5, (glow) => patch(index, { glow }))}
            {!mediaLogo && slider('Kehalusan / anti-getar', effect.smoothing ?? 0.9, 0, 0.97, 0.01, (smoothing) => patch(index, { smoothing }))}
          </div></section>
          {!mediaLogo && <section className="mrp-effect-section"><div className="mrp-effect-section__title"><span>04</span><h4>Output render</h4></div><div className="mrp-visualizer-output-profile"><span><b>Resolusi</b>{project.settings.resolution}</span><span><b>Frame rate</b>{project.settings.fps ?? 30} FPS</span><span><b>Alpha sementara</b><label className="mrp-visualizer-alpha-select"><select aria-label="Format alpha sementara" value={effect.alphaFormat ?? 'rgba'} onChange={(event)=>patch(index,{alphaFormat:event.target.value as NonNullable<VisualizerEffect['alphaFormat']>})}><option value="rgba">RGBA · 8-bit</option><option value="yuva444p10le">YUVA444P10 · 10-bit</option></select></label></span><span><b>Codec akhir</b>{project.settings.gpuEncoder ? `GPU · ${project.settings.gpuEncoder}` : 'H.264 / libx264'}</span></div><p className="mrp-effects-panel__note">Output mengikuti pengaturan project. Format alpha hanya digunakan pada layer sementara; codec MP4 akhir dapat menghapus alpha jika format akhir tidak mendukung transparansi. Mode Logo dan Album Art memakai gambar yang dipilih pengguna, bukan mengekstrak artwork tertanam dari playlist secara otomatis.</p></section>}
        </article>;
      })}
      {!effects.length && <div className="mrp-effects-panel__empty"><span aria-hidden="true">▥</span><strong>Visualisasikan energi audio</strong><p>Tambahkan model stereo visualizer atau media/logo reaktif yang mengikuti audio.</p></div>}
    </div>}
  </section>;
}
