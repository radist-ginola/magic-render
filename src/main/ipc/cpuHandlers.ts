import { registerIpcHandler } from './loggedHandler';

import { IPC_CHANNELS } from '../../shared/ipc';
import { assertCpuLoadPercent } from './validation';
import { getCpuAllocation } from '../services/cpuController';

export function registerCpuIpcHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.CPU_GET_ALLOCATION, async () => getCpuAllocation(75));
  registerIpcHandler(IPC_CHANNELS.CPU_CALCULATE, async (_event, cpuLoadPercent: unknown) => {
    const percent = assertCpuLoadPercent(cpuLoadPercent);
    return getCpuAllocation(percent);
  });
}
