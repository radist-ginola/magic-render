import type { JSX, ReactNode } from 'react';

export type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/** Consistent section heading for screens and cards; no navigation/state behavior. */
export function SectionHeader({ title, eyebrow, description, actions, className = '' }: SectionHeaderProps): JSX.Element {
  return (
    <header className={['mrp-ui-section-header', className].filter(Boolean).join(' ')}>
      <div className="mrp-ui-section-header__copy">
        {eyebrow && <span className="mrp-ui-section-header__eyebrow">{eyebrow}</span>}
        <h2 className="mrp-ui-section-header__title">{title}</h2>
        {description && <p className="mrp-ui-section-header__description">{description}</p>}
      </div>
      {actions != null && <div className="mrp-ui-section-header__actions">{actions}</div>}
    </header>
  );
}
