import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { usePatientDetail } from '@/hooks/usePatient';
import { rememberPatient } from './recentPatients';

/**
 * Adds the patient whose page is open to "Recently viewed", however the page
 * was reached (search, table, link, chip scan). Shares the page's query cache.
 */
export function useRememberOpenedPatient(): void {
  const { pathname } = useLocation();
  const id = Number(matchPath('/patients/:id', pathname)?.params.id ?? 0);
  const { data } = usePatientDetail(id);

  useEffect(() => {
    if (!id || !data || data.id !== id) return;
    const owner = data.household?.primaryContact;
    const ownerName = owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() : '';
    rememberPatient({
      id,
      name: data.name ?? null,
      species: data.species ?? null,
      ownerName: ownerName || null,
    });
  }, [id, data]);
}
