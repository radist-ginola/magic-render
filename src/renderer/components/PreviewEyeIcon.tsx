import type { JSX } from 'react';

export function PreviewEyeIcon({ hidden }: { hidden: boolean }): JSX.Element {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    {hidden && <path d="M3 21 21 3" strokeWidth="2.4" />}
  </svg>;
}
