import { Menu } from 'electron';

/**
 * Legacy compatibility entry point.
 *
 * Magic Render Pro intentionally does not install an Electron native
 * application menu. File/Help navigation is rendered by React and the
 * window controls are rendered by the custom React title bar.
 */
export function installApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}
