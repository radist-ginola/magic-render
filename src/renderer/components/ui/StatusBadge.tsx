import type { HTMLAttributes, JSX } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

/** Small status indicator; status text remains supplied by the caller. */
export function StatusBadge({ tone = 'neutral', className = '', ...props }: StatusBadgeProps): JSX.Element {
  const classes = ['mrp-ui-badge', tone === 'neutral' ? '' : `mrp-ui-badge--${tone}`, className].filter(Boolean).join(' ');
  return <span className={classes} {...props} />;
}
