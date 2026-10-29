import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { BulkPreparedItem, BulkRenderRequest } from '../../../shared/domain/bulkTypes';
import type { ProjectSticker } from '../../../shared/domain/stickerTypes';
import type { StickerSchedule } from '../../../shared/domain/stickerTypes';
import type { LockedAsset, LockedAssetMenu } from '../../../shared/domain/lockedAssetTypes';
import { createDefaultProject } from '../../domain/project/projectFactory';
import { MediaProbe } from '../media/mediaProbe';
import { probeAudioFile } from '../audio/audioProbe';
import { defaultStickerConfig } from '../stickerService';
import { overlayAssetPreset, stickerAssetPreset } from '../../../shared/domain/assetPreset';
import { validateStickerSchedule } from '../stickerScheduler';
import { timestampToSecondsForValidation } from '../stickerScheduler';
import { settingsService } from '../../ipc/settingsHandlers';
import { listLockedAssets } from '../persistentStore';
import { validateLockedAssetPath } from '../persistentStore/lockedAssetValidator';
import { listTracklists, pickTracks } from './tracklistStore';
import { activeIntroMediaPath } from '../../../shared/domain/introTypes';

const mediaExtension = { image: new Set(['.png','.jpg','.jpeg']), video: new Set(['.mp4','.mov','.mkv','.webm']) };
const assetVideo = (file: string) => ['.mp4','.mov','.mkv','.webm','.gif'].includes(path.extname(file).toLowerCase());
const execFileAsync = promisify(execFile);
async function stickerSourceDuration(ffprobePath: string, assetPath: string, mediaProbe: MediaProbe): Promise<number> {
  if (path.extname(assetPath).toLowerCase() !== '.gif') return (await mediaProbe.probe(assetPath)).durationSeconds ?? 3;
  const { stdout } = await execFileAsync(ffprobePath,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',assetPath],{timeout:30000,windowsHide:true});
  const duration=Number(stdout.trim());
  return Number.isFinite(duration) && duration>0 ? duration : 3;
}
const compatibleAsset = (menu:LockedAssetMenu,file:string) => {
  const ext=path.extname(file).toLowerCase();
  return menu==='intro' ? ['.png','.jpg','.jpeg','.mp4','.mov','.mkv','.webm'].includes(ext)
    : menu==='overlay' ? ['.png','.jpg','.jpeg','.webp','.gif','.mp4','.mov','.mkv','.webm'].includes(ext)
    : ['.png','.jpg','.jpeg','.webp','.gif','.mp4','.mov','.mkv','.webm'].includes(ext);
};

/** Bulk stickers never open on frame zero; the regular editor keeps its own schedule semantics. */
export function bulkStickerPlacement(schedule:StickerSchedule,totalDurationSec:number):{schedule:StickerSchedule;continuousSec?:number} {
  const first=Math.min(30,Math.max(1,totalDurationSec/2),Math.max(.1,totalDurationSec-.1));
  if(schedule.mode==='full-duration')return {schedule:{mode:'timestamp',iterativeCount:null,timestamps:[String(first)]},continuousSec:Math.max(.1,totalDurationSec-first)};
  if(schedule.mode==='iterative') {
    const interval=(schedule.iterativeCount??3)*60;
    const timestamps:string[]=[];
    for(let start=first;start<totalDurationSec && timestamps.length<100;start+=interval)timestamps.push(String(start));
    return {schedule:{mode:'timestamp',iterativeCount:null,timestamps}};
  }
  return {schedule:{...schedule,timestamps:schedule.timestamps.map((stamp)=>String(Math.max(1,timestampToSecondsForValidation(stamp))))}};
}

export async function prepareBulkRender(request: BulkRenderRequest): Promise<BulkPreparedItem[]> {
  if (!request || !Array.isArray(request.media) || !request.media.length || request.media.length > 100) throw new Error('Unggah 1–100 gambar atau video untuk Bulk Render.');
  if (!request.media.every((item) => item && typeof item.id === 'string' && typeof item.path === 'string' && (item.type === 'image' || item.type === 'video'))) throw new Error('Daftar media bulk tidak valid.');
  if (new Set(request.media.map((item)=>item.id)).size !== request.media.length || new Set(request.media.map((item)=>item.path.toLowerCase())).size !== request.media.length || new Set(request.media.map((item)=>item.type)).size !== 1) throw new Error('Media bulk harus unik dan tidak boleh mencampur gambar dengan video.');
  if (!request.options || typeof request.tracklistId !== 'string' || !Number.isInteger(request.mp3Count)) throw new Error('Pengaturan Bulk Render tidak valid.');
  const metadataMode = request.options.metadataMode ?? 'timestamp';
  if (!['timestamp', 'timestamp-seo', 'none'].includes(metadataMode)) throw new Error('Pilihan file metadata Bulk Render tidak valid.');
  if (metadataMode === 'timestamp-seo' && (!request.seoTemplate || !request.seoTemplate.mainKeyword?.split(',').some((keyword) => keyword.trim()))) throw new Error('Untuk membuat youtubeseo.txt pada Bulk Render, buka project dengan keyword SEO terisi, lalu pilih mode Timestamp + YouTube SEO.');
  for (const key of ['overlay','intro','fadeIn','fadeOut','sticker'] as const) if (typeof request.options[key] !== 'boolean') throw new Error(`Opsi ${key} tidak valid.`);
  for (const key of ['fadeInSec','fadeOutSec'] as const) if (!Number.isFinite(request.options[key]) || request.options[key] < 0 || request.options[key] > 30) throw new Error(`Durasi ${key} harus 0–30 detik.`);
  if (request.options.fadeInStyle !== undefined && !['dark','blur'].includes(request.options.fadeInStyle)) throw new Error('Gaya fade in bulk tidak valid.');
  if (request.options.fadeInBlur !== undefined && (!Number.isFinite(request.options.fadeInBlur) || request.options.fadeInBlur < 0 || request.options.fadeInBlur > 30)) throw new Error('Defokus bulk harus 0–30.');
  if (request.options.fadeInBrightness !== undefined && (!Number.isFinite(request.options.fadeInBrightness) || request.options.fadeInBrightness < -0.7 || request.options.fadeInBrightness > 0.7)) throw new Error('Kecerahan bulk harus -70% sampai 70%.');
  if (request.options.stickerDurationSec != null && (!Number.isFinite(request.options.stickerDurationSec) || request.options.stickerDurationSec <= 0 || request.options.stickerDurationSec > 3600)) throw new Error('Durasi sticker Bulk harus 0–3600 detik.');
  if (request.options.sticker && request.options.stickerSchedule) validateStickerSchedule(request.options.stickerSchedule);
  const folders = await listTracklists();
  const folder = folders.find((item)=>item.id===request.tracklistId);
  if (!folder || !folder.mp3Paths.length) throw new Error('Folder tracklist kosong atau tidak ditemukan.');
  if (request.mp3Count > folder.mp3Paths.length * 2 || request.mp3Count < 1 || request.mp3Count > 100) throw new Error('Jumlah MP3 melebihi batas dua salinan per lagu.');
  const settings = settingsService.get();
  const mediaProbe = new MediaProbe(settings.ffprobePath);
  const assets = await listLockedAssets();
  const pools = new Map<LockedAssetMenu,LockedAsset[]>();
  for (const menu of ['overlay','intro','stickerSubscribe'] as const) {
    if (!request.options[menu === 'stickerSubscribe' ? 'sticker' : menu]) continue;
    const saved = assets.filter((asset)=>asset.menu===menu);
    const available:LockedAsset[] = [];
    for (const asset of saved) if (compatibleAsset(menu,asset.path) && (await validateLockedAssetPath(menu,asset.path)).valid) available.push(asset);
    if (!available.length) throw new Error(`Asset ${menu} kosong atau file hilang. Tambahkan asset di Asset Library.`);
    pools.set(menu,available);
  }
  const pickAsset = (menu:LockedAssetMenu) => { const pool = pools.get(menu)!; return pool[Math.floor(Math.random()*pool.length)]!; };
  const audioCache = new Map<string,number>();
  const stickerDurationCache = new Map<string,number>();
  const introDurationCache = new Map<string,number>();
  const prepared:BulkPreparedItem[] = [];
  for (const [index, media] of request.media.entries()) {
    if (!mediaExtension[media.type].has(path.extname(media.path).toLowerCase())) throw new Error(`Format media tidak didukung: ${path.basename(media.path)}`);
    const metadata = await mediaProbe.probe(media.path);
    if (metadata.type !== media.type) throw new Error(`Tipe media tidak sesuai: ${path.basename(media.path)}`);
    const selected = pickTracks(folder.mp3Paths,request.mp3Count);
    for (const file of selected) if (!audioCache.has(file)) audioCache.set(file,(await probeAudioFile(settings.ffprobePath,file)).durationSeconds);
    const tracks = selected.map((file,order)=>({path:file,order,durationSeconds:audioCache.get(file)!}));
    const basename = path.basename(media.path,path.extname(media.path)).slice(0,90);
    const project = createDefaultProject(`Bulk ${basename}`,settings.outputDir, {outputDir:settings.outputDir,resolution:settings.resolution,fps:settings.fps,cpuLoadPercent:settings.cpuLoadPercent,renderPreset:settings.renderPreset,bitrateKbps:settings.bitrateKbps,bitrateMode:settings.bitrateMode,aiProvider:settings.aiProvider,aiModel:settings.aiModel});
    project.exportFileName = `${String(index+1).padStart(3,'0')}-${basename}-${media.id.slice(0,8)}`;
    project.youtubeSEO = { ...project.youtubeSEO, ...(request.seoTemplate ?? {}), mode: metadataMode, provider: settings.aiProvider, model: settings.aiModel, analysisSource: 'main', analysisMediaPath: null }; 
    project.bulkItemId = media.id;
    project.finalFadeOutSec = request.options.fadeOut ? request.options.fadeOutSec : 0;
    project.mainMedia = { type:media.type,path:metadata.path,metadata,durationSeconds:metadata.durationSeconds ?? 3,resize:{width:1920,height:1080},position:{x:0,y:0},rotation:0,fade:{fadeInSec:0,fadeOutSec:0},autoMute:true };
    project.playlistTracks = tracks;
    project.playlist = {files:selected,shuffle:false,playbackOrder:selected};
    const introAssetPath = request.options.intro ? pickAsset('intro').path : null;
    const fadeMode = !request.options.intro && request.options.fadeIn;
    project.intro = {enabled: Boolean(introAssetPath || fadeMode),mode:introAssetPath ? 'media' : fadeMode ? 'fade' : 'none',path:introAssetPath,fallbackFadeInSec:fadeMode ? request.options.fadeInSec : 0,fallbackStyle:request.options.fadeInStyle ?? 'blur',fallbackBlur:request.options.fadeInBlur ?? 12,fallbackBrightness:request.options.fadeInBrightness ?? -0.25,fadeInSec:request.options.fadeIn ? request.options.fadeInSec : 0};
    if (request.options.overlay) { const asset=pickAsset('overlay'); project.overlays=[{id:randomUUID(),path:asset.path,type:assetVideo(asset.path)?'video':'image',config:overlayAssetPreset(asset)}]; }
    if (request.options.sticker) {
      const asset=pickAsset('stickerSubscribe');
      const ext=path.extname(asset.path).toLowerCase();
      const type=ext==='.gif'?'gif':assetVideo(asset.path)?'video':'image';
      if (type!=='image' && !stickerDurationCache.has(asset.path)) {
        stickerDurationCache.set(asset.path, await stickerSourceDuration(settings.ffprobePath, asset.path, mediaProbe));
      }
      const activeIntroPath = activeIntroMediaPath(project);
      if(activeIntroPath && !introDurationCache.has(activeIntroPath)) introDurationCache.set(activeIntroPath,(await mediaProbe.probe(activeIntroPath)).durationSeconds??3);
      const totalDurationSec=tracks.reduce((sum,track)=>sum+track.durationSeconds,0)+(activeIntroPath?introDurationCache.get(activeIntroPath)??3:0);
      const placement=bulkStickerPlacement(request.options.stickerSchedule ?? defaultStickerConfig().schedule,totalDurationSec);
      const durationSec = placement.continuousSec ?? request.options.stickerDurationSec ?? (type==='image'?3:stickerDurationCache.get(asset.path) ?? 3);
      const config = { ...stickerAssetPreset(asset), schedule: placement.schedule, durationSec: Math.max(0.1,Math.min(3600,durationSec)) };
      const sticker:ProjectSticker={id:randomUUID(),path:asset.path,type,config}; project.stickerSubscribes=[sticker]; project.stickerSubscribe=sticker;
    }
    prepared.push({media,tracks:selected,project});
  }
  return prepared;
}
