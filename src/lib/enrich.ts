import type { EnrichedWartungsprotokolle } from '@/types/enriched';
import type { Wartungsarten, Wartungsprotokolle } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface WartungsprotokolleMaps {
  wartungsartenMap: Map<string, Wartungsarten>;
}

export function enrichWartungsprotokolle(
  wartungsprotokolle: Wartungsprotokolle[],
  maps: WartungsprotokolleMaps
): EnrichedWartungsprotokolle[] {
  return wartungsprotokolle.map(r => ({
    ...r,
    wartungsartName: resolveDisplay(r.fields.wartungsart, maps.wartungsartenMap, 'bezeichnung'),
  }));
}
