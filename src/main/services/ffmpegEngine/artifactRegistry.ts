import fs from 'node:fs/promises';

export class TemporaryArtifactRegistry {
  private readonly artifacts = new Set<string>();

  register(filePath: string): string {
    this.artifacts.add(filePath);
    return filePath;
  }

  has(filePath: string): boolean {
    return this.artifacts.has(filePath);
  }

  list(): string[] {
    return [...this.artifacts];
  }

  async cleanup(): Promise<void> {
    const entries = [...this.artifacts].reverse();
    for (const filePath of entries) {
      await unlinkWithRetry(filePath);
      this.artifacts.delete(filePath);
    }
  }
}

async function unlinkWithRetry(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'ENOENT') return;
      if (attempt === 2) return;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
