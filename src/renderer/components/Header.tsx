import type { JSX } from 'react';
import { APP_NAME } from '../../shared/app';

export function Header(): JSX.Element {
  return (
    <header className="mrp-header">
      <div className="mrp-header__inner">
        <div className="mrp-brand">
          <img className="mrp-brand__logo" src="./assets/magic-render-pro-logo.png" alt="Magic Render Pro logo" />
          <div className="mrp-brand__copy">
            <h1>{APP_NAME}</h1>
            <div className="mrp-brand__tagline">CREATE <span>•</span> RENDER <span>•</span> INSPIRE</div>
          </div>
        </div>
      </div>
    </header>
  );
}
