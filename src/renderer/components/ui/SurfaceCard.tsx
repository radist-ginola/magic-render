import type { HTMLAttributes, JSX } from 'react';

export type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'normal' | 'raised' | 'inset';
  padding?: 'none' | 'compact' | 'normal';
};

/** Neutral surface primitive; intentionally contains no state or business logic. */
export function SurfaceCard({ tone = 'normal', padding = 'normal', className = '', ...props }: SurfaceCardProps): JSX.Element {
  const classes = [
    'mrp-ui-card',
    tone === 'normal' ? '' : `mrp-ui-card--${tone}`,
    padding === 'none' ? '' : padding === 'compact' ? 'mrp-ui-card--compact' : 'mrp-ui-card--padded',
    className,
  ].filter(Boolean).join(' ');
  return <div className={classes} {...props} />;
}
