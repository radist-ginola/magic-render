import { randomUUID } from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc';
import type { BulkRenderRequest } from '../../shared/domain/bulkTypes';
import { registerIpcHandler } from './loggedHandler';
import { showOpenDialog } from './dialogHelper';
import { addTracklist, listTracklists, removeTracklist } from '../services/bulk/tracklistStore';
import { prepareBulkRender } from '../services/bulk/bulkPlanner';
import { settingsService } from './settingsHandlers';

export function registerBulkIpcHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.TRACKLIST_LIST, () => listTracklists());
  registerIpcHandler(IPC_CHANNELS.TRACKLIST_ADD, async () => {
    const result=await showOpenDialog({title:'Pilih folder tracklist MP3',defaultPath:settingsService.get().assetDir,properties:['openDirectory']});
    return result.canceled ? null : addTracklist(result.filePaths[0]!, settingsService.get().assetDir);
  });
  registerIpcHandler(IPC_CHANNELS.TRACKLIST_REMOVE, (_event,id:unknown) => {
    if (typeof id!=='string' || !id.trim()) throw new Error('ID tracklist tidak valid.');
    return removeTracklist(id);
  });
  registerIpcHandler(IPC_CHANNELS.BULK_CHOOSE_MEDIA, async (_event,type:unknown) => {
    if (type!=='image' && type!=='video') throw new Error('Tipe media bulk tidak valid.');
    const extensions=type==='image' ? ['png','jpg','jpeg'] : ['mp4','mov','mkv','webm'];
    const result=await showOpenDialog({title:`Pilih ${type==='image'?'gambar':'video'} untuk Bulk Render`,properties:['openFile','multiSelections'],filters:[{name:type==='image'?'Gambar':'Video',extensions}]});
    return result.canceled ? [] : result.filePaths.map((filePath)=>({id:randomUUID(),path:filePath,type}));
  });
  registerIpcHandler(IPC_CHANNELS.BULK_PREPARE, (_event,request:BulkRenderRequest) => prepareBulkRender(request));
}
