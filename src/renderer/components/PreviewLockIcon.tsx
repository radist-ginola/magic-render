import type { JSX } from 'react';

export function PreviewLockIcon({ locked }: { locked: boolean }): JSX.Element {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="10" width="14" height="11" rx="2" />
    {locked ? <path d="M8 10V7a4 4 0 0 1 8 0v3" /> : <path d="M8 10V7a4 4 0 0 1 7.5-2" />}
    <circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none" />
  </svg>;
}
