import type { JSX } from 'react';
import type { RuntimeInfo } from '../../shared/ipc';

type FoundationStatusProps = {
  runtimeInfo: RuntimeInfo | null;
  pingStatus: 'idle' | 'ok' | 'error';
  onPing: () => Promise<void>;
};

export function FoundationStatus({ runtimeInfo, pingStatus, onPing }: FoundationStatusProps): JSX.Element {
  const bridgeLabel = pingStatus === 'ok' ? 'IPC OK' : pingStatus === 'error' ? 'IPC ERROR' : 'TEST IPC';
  const bridgeClass = pingStatus === 'ok' ? 'text-cyber-cyan' : pingStatus === 'error' ? 'text-red-300' : 'text-white/70';

  return (
    <div className="flex items-center gap-3">
      <div className="hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right md:block">
        <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">Runtime</div>
        <div className="mt-1 text-xs text-white/70">
          {runtimeInfo ? `${runtimeInfo.environment} / ${runtimeInfo.platform}` : 'offline'}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onPing()}
        className={`rounded-xl border border-cyber-violet/40 bg-cyber-violet/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] transition hover:bg-cyber-violet/10 ${bridgeClass}`}
      >
        {bridgeLabel}
      </button>
    </div>
  );
}
