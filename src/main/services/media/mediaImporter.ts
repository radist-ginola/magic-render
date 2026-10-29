import type { MediaMetadata } from '../../../shared/domain/mediaTypes';
import { MediaProbe } from './mediaProbe';
import { validateMediaPath } from './mediaValidator';

export class MediaImporter {
  constructor(private readonly probe: MediaProbe) {}

  async importMainMedia(filePath: string): Promise<MediaMetadata> {
    validateMediaPath(filePath);
    return this.probe.probe(filePath);
  }
}
