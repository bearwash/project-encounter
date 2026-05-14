import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ble, type BleStatus } from '@/lib/tauri/ble';

const STATUS_KEY = ['ble', 'status'] as const;

export function useBleStatus() {
  return useQuery<BleStatus>({
    queryKey: STATUS_KEY,
    queryFn: ble.status,
    refetchInterval: 3000,
  });
}

function useBleAction(action: () => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });
}

export const useStartBle = () => useBleAction(ble.start);
export const useStopBle = () => useBleAction(ble.stop);
export const useStartWalkBle = () => useBleAction(ble.walkStart);
export const useStopWalkBle = () => useBleAction(ble.walkStop);
