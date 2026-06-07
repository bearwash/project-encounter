import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ble,
  type BleDebugSnapshot,
  type BleMode,
  type BleStatus,
} from '@/lib/tauri/ble';

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

function useBleAction(action: () => Promise<void>, optimisticMode: BleMode) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: STATUS_KEY });
      qc.setQueryData<BleStatus>(STATUS_KEY, (current) => {
        if (!current) return current;
        const active = optimisticMode !== 'idle';
        return {
          ...current,
          mode: optimisticMode,
          advertise_active: active ? current.advertise_active : false,
          scan_active: active ? current.scan_active : false,
          last_error: null,
        };
      });
      qc.setQueryData<BleDebugSnapshot>(DEBUG_KEY, (current) => {
        if (!current) return current;
        return {
          ...current,
          mode: optimisticMode,
        };
      });
    },
    onSuccess: () => {
      window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: STATUS_KEY });
        qc.invalidateQueries({ queryKey: DEBUG_KEY });
      }, 250);
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      qc.invalidateQueries({ queryKey: DEBUG_KEY });
    },
  });
}

export const useStartBle = () => useBleAction(ble.start, 'normal');
export const useStopBle = () => useBleAction(ble.stop, 'idle');
export const useStartWalkBle = () => useBleAction(ble.walkStart, 'walk');
export const useStopWalkBle = () => useBleAction(ble.walkStop, 'normal');
