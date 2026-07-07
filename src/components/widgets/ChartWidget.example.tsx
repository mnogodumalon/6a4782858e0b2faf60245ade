/**
 * ChartWidget.example.tsx — the single copyable wiring truth for ChartWidget.
 *
 * STATIC (no Jinja2, no conditional emission), compiled by the contract
 * tsc-gate against the frozen hotel fixture (entity `buchung`: gast, anreise,
 * preis, the static lookup `status`, the enriched applookup `zimmer`). It
 * shows the full wiring the agent reproduces: rows = typed records, dimension
 * names the axis, measure names the number — the widget aggregates ITSELF.
 *
 * The one rule that bites: `value` returns the RAW number, never a formatted
 * string — the aggregation sums it. `formatCurrency(x)` inside `value` breaks
 * every total; `format: 'currency'` is how euros appear.
 *
 * WRONG vs RIGHT (HARD RULE 6 — the chart owns its own breakdown):
 *   // WRONG — feeding the chart rows filtered by its own segment collapses
 *   // the card to one 100% bar:
 *   //   <ChartWidget rows={rows.filter(seg.test)} … />
 *   // RIGHT — the chart ALWAYS gets the full rows of its question; a selected
 *   // segment filters SIBLING surfaces (a table, a list), never the chart:
 *   //   <ChartWidget rows={rows} … />  +  tableRows.filter(seg.test)
 */
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Buchung } from '@/types/app';
import { useClock } from '@/lib/polish';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
} from './RecordView';
import {
  ChartWidget,
  ChartSkeleton,
  ChartError,
  type ChartRow,
  type ChartSegment,
} from './ChartWidget';

const ROW_PREFIX = 'buchung';

export function HotelChartExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Drill state: the clicked segment + the index we are paging at.
  const [drill, setDrill] = useState<{ seg: ChartSegment<Buchung>; i: number } | null>(null);
  const clock = useClock();

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setBuchungen(await LivingAppsService.getBuchung());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);

  // Records → typed rows. `data` is the REAL record — accessors are tsc-checked.
  const rows = useMemo<ChartRow<Buchung>[]>(
    () => buchungen.map(b => ({ id: `${ROW_PREFIX}:${b.record_id}`, data: b })),
    [buchungen],
  );
  const byId = useMemo(() => new Map(buchungen.map(b => [`${ROW_PREFIX}:${b.record_id}`, b])), [buchungen]);

  // State trias BEFORE the widget (sibling components, never props):
  if (loading) return <ChartSkeleton />;
  if (error) return <ChartError error={error} onRetry={() => void reload()} />;

  const drillRecord = drill ? byId.get(drill.seg.rowIds[drill.i]) : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 1) Distribution with a sum measure + drill. The accessor passes the
             ENRICHED raw lookup object — the widget normalizes to its label
             (NEVER pre-extract ?.label). Head shows "Umsatz gesamt: 12.480 €"
             and absorbs that metric's StatCard. */}
      <ChartWidget<Buchung>
        title="Umsatz nach Status"
        rows={rows}
        dimension={{ kind: 'category', accessor: r => r.data.fields.status, label: 'Status' }}
        // RAW number in `value` — never a formatted string, the aggregation sums it.
        measure={{ aggregate: 'sum', label: 'Umsatz', value: r => r.data.fields.preis ?? null, format: 'currency' }}
        tone={seg => (seg.key === 'angefragt' ? 'warning' : 'default')}
        interaction={{ mode: 'drill', onSegmentClick: seg => setDrill({ seg, i: 0 }) }}
        footer={<>Stand: {format(clock, 'dd.MM.yyyy')}</>}
      />

      {/* 2) Trend, measure omitted = count. `timeEnd` comes from the PAGE
             (useClock) so the axis runs "bis heute" — otherwise it would end
             at the last booking and hide the recent lull. The applookup case:
             an enriched `zimmer` object would go through the SAME accessor
             shape — dimension={{ kind: 'category', accessor: r => r.data.fields.zimmer }}. */}
      <ChartWidget<Buchung>
        title="Buchungen pro Monat"
        rows={rows}
        dimension={{ kind: 'time', accessor: r => r.data.fields.anreise ?? null, bucket: 'month', label: 'Anreise' }}
        timeEnd={format(clock, 'yyyy-MM-dd')}
      />

      {/* Drill overlay — RecordOverlay is a SINGLE-record shell (no rowIds/title
          prop): page through the segment's records via onPrev/onNext + counter. */}
      {drill && drillRecord && (
        <RecordOverlay
          open
          onClose={() => setDrill(null)}
          ariaLabel={`${drill.seg.label} — ${drill.i + 1} / ${drill.seg.rowIds.length}`}
          counter={`${drill.i + 1} / ${drill.seg.rowIds.length}`}
          onPrev={drill.i > 0 ? () => setDrill({ ...drill, i: drill.i - 1 }) : undefined}
          onNext={drill.i < drill.seg.rowIds.length - 1 ? () => setDrill({ ...drill, i: drill.i + 1 }) : undefined}
        >
          <RecordHeader title={drillRecord.fields.gast ?? 'Ohne Gast'} subtitle={drill.seg.label} />
          <RecordSection title="Details" cols={2}>
            <RecordField label="Anreise" value={drillRecord.fields.anreise} format="date" />
            <RecordField label="Preis" value={drillRecord.fields.preis} format="currency" />
            <RecordField label="Status" value={drillRecord.fields.status} format="pill" />
          </RecordSection>
        </RecordOverlay>
      )}
    </div>
  );
}
