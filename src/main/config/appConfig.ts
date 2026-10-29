import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, APP_NAME, APP_ID } from '../../shared/app';
import type { RuntimeConfig } from './environment';

export type ApplicationConfig = Readonly<{
  appName: typeof APP_NAME;
  appId: typeof APP_ID;
  window: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
  };
  runtime: RuntimeConfig;
}>;

export function createApplicationConfig(runtime: RuntimeConfig): ApplicationConfig {
  return Object.freeze({
    appName: APP_NAME,
    appId: APP_ID,
    window: {
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
      minWidth: MIN_WINDOW_SIZE.width,
      minHeight: MIN_WINDOW_SIZE.height,
    },
    runtime,
  });
}
