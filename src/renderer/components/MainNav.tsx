import type { JSX } from 'react';

type MainPage = 'Home' | 'Render' | 'Bulk Render' | 'Asset' | 'Setting' | 'Help';

const navMeta: Record<MainPage, { label: string }> = {
  Home: { label: 'Home' },
  Render: { label: 'Render' },
  'Bulk Render': { label: 'Bulk Render' },
  Asset: { label: 'Asset' },
  Setting: { label: 'Setting' },
  Help: { label: 'Help' },
};

function NavIcon({ page }: { page: MainPage }): JSX.Element {
  const path = {
    Home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    Render: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 8 6 4-6 4Z" /></>,
    'Bulk Render': <><rect x="2" y="5" width="14" height="12" rx="2"/><path d="M6 9h6M6 13h4M18 8h3v12a2 2 0 0 1-2 2H8v-2"/></>,
    Asset: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M7 7V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3M7 12h10M7 16h7" /></>,
    Setting: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.82.55l-.05.07h-3.4l-.03-.08a1.7 1.7 0 0 0-1.5-1.06 1.7 1.7 0 0 0-1.51 1.06l-.03.08H6.27l-.05-.07a1.7 1.7 0 0 0-1.82-.55l-.08.02-1.7-2.94.06-.06A1.7 1.7 0 0 0 3.02 15a1.7 1.7 0 0 0-1.05-1.5l-.08-.03v-3.4l.08-.03a1.7 1.7 0 0 0 1.05-1.5 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-2.94.08.02a1.7 1.7 0 0 0 1.82-.55l.05-.07h3.4l.03.08a1.7 1.7 0 0 0 1.5 1.06 1.7 1.7 0 0 0 1.51-1.06l.03-.08h3.4l.05.07a1.7 1.7 0 0 0 1.82.55l.08-.02 1.7 2.94-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 1.05 1.5l.08.03v3.4l-.08.03A1.7 1.7 0 0 0 19.4 15Z" /></>,
    Help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.1-2.5 4.5M12 17.5h.01" /></>,
  }[page];
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
}

type MainNavProps = {
  activeTab: MainPage;
  onSelect: (tab: MainPage) => void;
};

export function MainNav({ activeTab, onSelect }: MainNavProps): JSX.Element {
  const tabs = Object.keys(navMeta) as MainPage[];
  return <nav className="mrp-nav" aria-label="Main navigation">
    <div className="mrp-nav__title">WORKSPACE</div>
    <div className="mrp-nav__items">
      {tabs.map((tab) => {
        const active = activeTab === tab;
        const meta = navMeta[tab];
        return <button key={tab} type="button" aria-label={`Open ${meta.label}`} title={meta.label} aria-current={active ? 'page' : undefined} onClick={() => onSelect(tab)} className={`mrp-nav__item${active ? ' is-active' : ''}`}>
          <span className="mrp-nav__icon" aria-hidden="true"><NavIcon page={tab} /></span>
          <span className="mrp-nav__label">{meta.label}</span>
        </button>;
      })}
    </div>
  </nav>;
}
