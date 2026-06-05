import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ble, type BleDebugSnapshot, type BleStatus } from '@/lib/tauri/ble';

const STATUS_KEY = ['ble', 'status'] as const;
const DEBUG_KEY = ['ble', 'debug'] as const;

export function useBleStatus() {
  return useQuery<BleStatus>({
    queryKey: STATUS_KEY,
    queryFn: ble.status,
    refetchInterval: 3000,
  });
}

export function useBleDebugSnapshot() {
  return useQuery<BleDebugSnapshot>({
    queryKey: DEBUG_KEY,
    queryFn: ble.debugSnapshot,
    refetchInterval: 3000,
  });
}

function useBleAction(action: () => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      qc.invalidateQueries({ queryKey: DEBUG_KEY });
    },
  });
}

export const useStartBle = () => useBleAction(ble.start);
export const useStopBle = () => useBleAction(ble.stop);
export const useStartWalkBle = () => useBleAction(ble.walkStart);
export const useStopWalkBle = () => useBleAction(ble.walkStop);
