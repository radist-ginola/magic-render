import { useEffect, useState, type JSX } from 'react';
import { APP_NAME } from '../../shared/app';

export function WindowChrome(): JSX.Element {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let active = true;
    void window.magicRender.isWindowMaximized().then((value) => { if (active) setMaximized(value); });
    return () => { active = false; };
  }, []);
  async function toggleMaximize(): Promise<void> { setMaximized(await window.magicRender.toggleMaximizeWindow()); }
  return <div className="mrp-window-chrome" role="banner">
    <div className="mrp-window-chrome__app">
      <img src="./assets/magic-render-pro-logo.png" alt="" aria-hidden="true" />
      <span aria-label={APP_NAME}>Magic Render <strong>Pro</strong></span>
    </div>
    <div className="mrp-window-chrome__controls" aria-label="Window controls">
      <button type="button" aria-label="Minimize" title="Minimize" onClick={() => void window.magicRender.minimizeWindow()}>−</button>
      <button type="button" aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void toggleMaximize()}>{maximized ? '❐' : '□'}</button>
      <button type="button" className="is-close" aria-label="Close" title="Close" onClick={() => void window.magicRender.closeWindow()}>×</button>
    </div>
  </div>;
}
