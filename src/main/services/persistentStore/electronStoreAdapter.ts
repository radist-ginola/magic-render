type ElectronStoreOptions = {
  name: string;
  clearInvalidConfig?: boolean;
  defaults: Record<string, unknown>;
  schema?: Record<string, unknown>;
};

type ElectronStoreLike = {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
};

type ElectronStoreModule = { default: new (options: ElectronStoreOptions) => ElectronStoreLike };

let cachedStorePromise: Promise<ElectronStoreLike> | null = null;

async function loadElectronStore(): Promise<ElectronStoreLike> {
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      const dynamicImport = new Function('specifier', 'return import(specifier);') as (specifier: string) => Promise<ElectronStoreModule>;
      const module = await dynamicImport('electron-store');
      return new module.default({
        name: 'magic-render-pro-global',
        clearInvalidConfig: false,
        defaults: { lockedAssets: [] },
      });
    })();
  }
  return cachedStorePromise;
}

export async function getElectronStore(): Promise<ElectronStoreLike> {
  return loadElectronStore();
}
