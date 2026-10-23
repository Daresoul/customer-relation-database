import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { labInboxService } from '@/services/labInboxService';
import { invalidateLabInboxData, invalidateLabResultRecords } from './invalidation';
import type { DiscardReason, LabInboxState } from '@/types/labInbox';

/** New results also invalidate these (see useDeviceDataListener); the poll is a safety net. */
const POLL_MS = 60_000;

export function useLabInbox(state: LabInboxState) {
  return useQuery({
    queryKey: ['lab-inbox', state],
    queryFn: () => labInboxService.list(state),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
}

export function useLabInboxCount() {
  return useQuery({
    queryKey: ['lab-inbox-count'],
    queryFn: () => labInboxService.countWaiting(),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
}

export function useDiscardLabResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, reason, note }: { fileId: string; reason: DiscardReason; note?: string }) =>
      labInboxService.discard(fileId, reason, note),
    onSuccess: () => invalidateLabInboxData(queryClient),
  });
}

export function useRestoreLabResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => labInboxService.restore(fileId),
    onSuccess: () => invalidateLabInboxData(queryClient),
  });
}

export function useMoveLabResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attachmentId, targetRecordId }: { attachmentId: number; targetRecordId: number }) =>
      labInboxService.move(attachmentId, targetRecordId),
    onSuccess: () => invalidateLabResultRecords(queryClient),
  });
}

/** Refresh the inbox and its badge when a machine sends a result or a failed read. */
export function useLabInboxLiveUpdates(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    const stops: Array<() => void> = [];
    for (const name of ['device-data-received', 'device-event']) {
      listen(name, () => invalidateLabInboxData(queryClient)).then((stop) => {
        if (cancelled) stop();
        else stops.push(stop);
      });
    }
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [queryClient]);
}
