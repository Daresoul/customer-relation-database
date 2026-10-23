import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/services/invoke';

interface GoogleCalendarStatus {
  connected?: boolean;
  needs_reauth?: boolean;
}

/** True when Google refused the stored login and the sync waits for Reconnect. */
export function useGoogleNeedsReauth(): boolean {
  const { data } = useQuery({
    queryKey: ['google-calendar-settings', 'status'],
    queryFn: () => invoke<GoogleCalendarStatus>('get_google_calendar_settings'),
    // Rechecked on every mount and focus, so coming back from Reconnect clears it.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return !!data?.needs_reauth;
}
