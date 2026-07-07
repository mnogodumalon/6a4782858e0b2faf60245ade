import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Wartungsarten, Wartungsprotokolle } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

/** Dashboard data + the OPTIMISTIC-WRITE API.
 *
 *  The per-entity setters (`set<Entity>`) are exported for exactly one job:
 *  optimistic updates on drag writes (onEventDrop / onEventResize /
 *  onCardMove). Call the setter FIRST — the bar/card lands instantly — then
 *  fire the PATCH in the background and call `fetchAll()` ONLY in the catch.
 *  Never await the PATCH before updating state (the UI freezes for the full
 *  round-trip on every drag) and never refetch after a successful write.
 *  There is no other mechanism (no `__optimistic`, no `mutate`).
 */
export function useDashboardData() {
  const [wartungsarten, setWartungsarten] = useState<Wartungsarten[]>([]);
  const [wartungsprotokolle, setWartungsprotokolle] = useState<Wartungsprotokolle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [wartungsartenData, wartungsprotokolleData] = await Promise.all([
        LivingAppsService.getWartungsarten(),
        LivingAppsService.getWartungsprotokolle(),
      ]);
      setWartungsarten(wartungsartenData);
      setWartungsprotokolle(wartungsprotokolleData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [wartungsartenData, wartungsprotokolleData] = await Promise.all([
          LivingAppsService.getWartungsarten(),
          LivingAppsService.getWartungsprotokolle(),
        ]);
        setWartungsarten(wartungsartenData);
        setWartungsprotokolle(wartungsprotokolleData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const wartungsartenMap = useMemo(() => {
    const m = new Map<string, Wartungsarten>();
    wartungsarten.forEach(r => m.set(r.record_id, r));
    return m;
  }, [wartungsarten]);

  return { wartungsarten, setWartungsarten, wartungsprotokolle, setWartungsprotokolle, loading, error, fetchAll, wartungsartenMap };
}