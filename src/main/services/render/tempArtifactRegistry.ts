import fs from 'node:fs/promises';
import path from 'node:path';
import { TemporaryArtifactRegistry } from '../ffmpegEngine/artifactRegistry';

export class RenderArtifactRegistry extends TemporaryArtifactRegistry {
  constructor(private readonly renderRoot: string) {
    super();
  }

  registerRenderArtifact(filePath: string): string {
    const absolute = path.resolve(filePath);
    if (!absolute.toLowerCase().startsWith(path.resolve(this.renderRoot).toLowerCase())) {
      throw new Error('Temporary render artifact harus berada di render job directory.');
    }
    return this.register(absolute);
  }

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.renderRoot, { recursive: true });
  }
}
