import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { AiProvider } from '../../../shared/domain/aiTypes';

type StoredCredentials = Partial<Record<AiProvider, { model: string; encryptedApiKey: string }>>;

export class AiCredentialStore {
  private readonly store = new Store<{ credentials: StoredCredentials }>({
    name: 'magic-render-pro-ai',
    defaults: { credentials: {} },
  });

  set(provider: AiProvider, model: string, apiKey: string): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage OS tidak tersedia untuk API key pada perangkat ini.');
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) throw new Error('API key tidak boleh kosong.');
    const encryptedApiKey = safeStorage.encryptString(trimmedKey).toString('base64');
    const credentials = this.store.get('credentials');
    this.store.set('credentials', { ...credentials, [provider]: { model: model.trim(), encryptedApiKey } });
  }

  get(provider: AiProvider): { model: string; apiKey: string } | null {
    const entry = this.store.get('credentials')[provider];
    if (!entry) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return { model: entry.model, apiKey: safeStorage.decryptString(Buffer.from(entry.encryptedApiKey, 'base64')) };
    } catch {
      return null;
    }
  }

  clear(provider: AiProvider): void {
    const credentials = { ...this.store.get('credentials') };
    delete credentials[provider];
    this.store.set('credentials', credentials);
  }
}
