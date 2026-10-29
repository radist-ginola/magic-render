import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import type { ProjectData } from '../../../shared/domain/projectTypes';
import type { MediaMetadata } from '../../../shared/domain/mediaTypes';
import { MediaProbe } from './mediaProbe';
import { MediaImporter } from './mediaImporter';
import { validateMediaPath } from './mediaValidator';
import { buildImageToVideoCommand, type SpawnCommand } from '../ffmpegEngine/commandBuilder';
import { getResolution } from '../ffmpegEngine/resolutionMap';
import { runFfmpeg } from '../ffmpegEngine/ffmpegRunner';
import { logger } from '../../utils/logger';
export class MainMediaService {
  private readonly probeService: MediaProbe;
  private readonly importer: MediaImporter;
  constructor(private readonly ffmpegExecutable:string, ffprobeExecutable:string){this.probeService=new MediaProbe(ffprobeExecutable);this.importer=new MediaImporter(this.probeService);}
  async probeMedia(filePath:string):Promise<MediaMetadata>{return this.importer.importMainMedia(filePath);}
  async applyToProject(project:ProjectData,filePath:string):Promise<ProjectData>{const metadata=await this.probeMedia(filePath); logger.info(`[INPUT] Video Utama dimasukkan: ${path.basename(metadata.path)}`); return {...project,updatedAt:new Date().toISOString(),mainMedia:{type:metadata.type,metadata,path:metadata.path,durationSeconds:metadata.durationSeconds,resize:{width:1920,height:1080},position:{x:0,y:0},rotation:0,fade:{fadeInSec:project.mainMedia?.fade.fadeInSec ?? 0,fadeOutSec:project.mainMedia?.fade.fadeOutSec ?? 0},autoMute:metadata.hasAudioTrack}};}
  async buildImageToVideo(inputPath:string,durationSeconds:number,resolution:ProjectData['settings']['resolution'],outputPath?:string):Promise<SpawnCommand>{validateMediaPath(inputPath,'image');if(!(durationSeconds>0)||!Number.isFinite(durationSeconds))throw new Error('Target duration gambar harus lebih besar dari 0 detik.');const absoluteInput=path.resolve(inputPath);await fs.access(absoluteInput);const target=outputPath?path.resolve(outputPath):path.join(app.getPath('temp'),'MagicRenderPro',`${path.basename(inputPath,path.extname(inputPath))}-${Date.now()}.mp4`);await fs.mkdir(path.dirname(target),{recursive:true});const {width,height}=getResolution(resolution);return buildImageToVideoCommand(this.ffmpegExecutable,absoluteInput,target,durationSeconds,width,height);}
  async convertImageToVideo(inputPath:string,durationSeconds:number,resolution:ProjectData['settings']['resolution'],outputPath?:string):Promise<MediaMetadata>{const command=await this.buildImageToVideo(inputPath,durationSeconds,resolution,outputPath);const result=await runFfmpeg(command);if(result.exitCode!==0)throw new Error(`Konversi gambar ke video gagal: ${result.stderr.trim()||`exit ${result.exitCode}`}`);return this.probeService.probe(command.args.at(-1)!);}
}
