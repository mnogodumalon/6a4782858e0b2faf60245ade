import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichWartungsprotokolle } from '@/lib/enrich';
import type { EnrichedWartungsprotokolle } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconTool, IconRefresh, IconCheck, IconPlus, IconSettings, IconClock, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordAttachments,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import {
  TableWidget,
  TableSkeleton,
  TableError,
  TableEmpty,
  type TableColumn,
  type TableRow,
  type TableTone,
} from '@/components/widgets/TableWidget';
import {
  ChartWidget,
  ChartSkeleton,
  type ChartRow,
  type ChartSegment,
} from '@/components/widgets/ChartWidget';
import { WartungsprotokolleDialog } from '@/components/dialogs/WartungsprotokolleDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';

const APPGROUP_ID = '6a4782858e0b2faf60245ade';
const REPAIR_ENDPOINT = '/claude/build/repair';

// ─── Überfällig-Check ────────────────────────────────────────────────────────
function isUeberfaellig(r: EnrichedWartungsprotokolle, today: Date): boolean {
  if (!r.fields.naechste_wartung) return false;
  if (lookupKey(r.fields.status) === 'erledigt') return false;
  try {
    return isBefore(parseISO(r.fields.naechste_wartung), startOfDay(today));
  } catch {
    return false;
  }
}

export default function DashboardOverview() {
  const {
    wartungsarten, wartungsprotokolle, setWartungsprotokolle,
    wartungsartenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // ─── ALL hooks before early returns ─────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedWartungsprotokolle | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'offen' | 'ueberfaellig' | 'erledigt'>('all');

  const overlay = useRecordOverlayStack<{ id: string }>();

  const enrichedProtokolle = useMemo(
    () => enrichWartungsprotokolle(wartungsprotokolle, { wartungsartenMap }),
    [wartungsprotokolle, wartungsartenMap],
  );

  const today = startOfDay(clock);

  const ueberfaellige = useMemo(
    () => enrichedProtokolle.filter(r => isUeberfaellig(r, today)),
    [enrichedProtokolle, today],
  );

  const offene = useMemo(
    () => enrichedProtokolle.filter(r => lookupKey(r.fields.status) === 'offen'),
    [enrichedProtokolle],
  );

  const erledigte = useMemo(
    () => enrichedProtokolle.filter(r => lookupKey(r.fields.status) === 'erledigt'),
    [enrichedProtokolle],
  );

  const gesamtkosten = useMemo(
    () => enrichedProtokolle.reduce((s, r) => s + (r.fields.kosten ?? 0), 0),
    [enrichedProtokolle],
  );

  // ─── Advance: "Erledigt" setzen ─────────────────────────────────────────
  const markErledigt = useCallback(async (r: EnrichedWartungsprotokolle) => {
    const snapshot = wartungsprotokolle.slice();
    setWartungsprotokolle(prev =>
      prev.map(p => p.record_id === r.record_id
        ? { ...p, fields: { ...p.fields, status: LOOKUP_OPTIONS['wartungsprotokolle']['status'].find(o => o.key === 'erledigt') ?? p.fields.status } }
        : p),
    );
    undoToast(`„${r.fields.titel ?? 'Protokoll'}" als Erledigt markiert`, async () => {
      setWartungsprotokolle(snapshot);
      await LivingAppsService.updateWartungsprotokolleEntry(r.record_id, { status: 'offen' }).catch(() => fetchAll());
    });
    await LivingAppsService.updateWartungsprotokolleEntry(r.record_id, { status: 'erledigt' }).catch(() => {
      setWartungsprotokolle(snapshot);
      fetchAll();
    });
  }, [wartungsprotokolle, setWartungsprotokolle, fetchAll]);

  // ─── Tabellen-Rows ────────────────────────────────────────────────────────
  const tableRows = useMemo<TableRow<EnrichedWartungsprotokolle>[]>(() => {
    let source = enrichedProtokolle;
    if (statusFilter === 'offen') source = source.filter(r => lookupKey(r.fields.status) === 'offen');
    else if (statusFilter === 'erledigt') source = source.filter(r => lookupKey(r.fields.status) === 'erledigt');
    else if (statusFilter === 'ueberfaellig') source = ueberfaellige;
    return source.map(r => ({
      id: `wp:${r.record_id}`,
      data: r,
      tone: (isUeberfaellig(r, today) ? 'destructive' : lookupKey(r.fields.status) === 'erledigt' ? 'success' : 'default') as TableTone,
    }));
  }, [enrichedProtokolle, ueberfaellige, statusFilter, today]);

  // ─── Chart-Rows (immer alle — HARD RULE 6) ───────────────────────────────
  const chartRows = useMemo<ChartRow<EnrichedWartungsprotokolle>[]>(
    () => enrichedProtokolle.map(r => ({ id: `wp:${r.record_id}`, data: r })),
    [enrichedProtokolle],
  );

  // Drill state für Chart
  const [chartDrill, setChartDrill] = useState<{ seg: ChartSegment<EnrichedWartungsprotokolle>; i: number } | null>(null);
  const chartDrillRecord = chartDrill
    ? enrichedProtokolle.find(r => `wp:${r.record_id}` === chartDrill.seg.rowIds[chartDrill.i])
    : undefined;

  // ─── Overlay-Record ───────────────────────────────────────────────────────
  const overlayRecord = overlay.top
    ? enrichedProtokolle.find(r => r.record_id === overlay.top!.id)
    : undefined;

  // ─── Spalten ─────────────────────────────────────────────────────────────
  const columns = useMemo<TableColumn<EnrichedWartungsprotokolle>[]>(() => [
    {
      key: 'titel',
      label: 'Titel',
      accessor: r => r.data.fields.titel ?? '',
      format: 'text',
      priority: 100,
    },
    {
      key: 'wartungsart',
      label: 'Wartungsart',
      accessor: r => r.data.wartungsartName,
      format: 'pill',
      filterable: true,
      priority: 100,
    },
    {
      key: 'datum_wartung',
      label: 'Wartung am',
      accessor: r => r.data.fields.datum_wartung ?? null,
      format: 'date',
    },
    {
      key: 'naechste_wartung',
      label: 'Nächste Wartung',
      accessor: r => r.data.fields.naechste_wartung ?? null,
      format: 'date',
      priority: 80,
    },
    {
      key: 'kosten',
      label: 'Kosten',
      accessor: r => r.data.fields.kosten ?? null,
      format: 'currency',
      aggregate: 'sum',
      priority: 80,
    },
    {
      key: 'techniker',
      label: 'Techniker',
      accessor: r => r.data.fields.techniker ?? '',
      format: 'text',
    },
    {
      key: 'status',
      label: 'Status',
      accessor: r => lookupKey(r.data.fields.status) ?? '',
      format: 'pill',
      filterable: true,
      priority: 90,
    },
    {
      key: 'erledigt_btn',
      label: '',
      accessor: r => lookupKey(r.data.fields.status) ?? '',
      format: 'text',
      priority: 100,
      responsive: 'keep' as const,
      renderCell: (_value, row, ctx) => {
        const status = lookupKey(row.data.fields.status);
        const ueberfaellig = isUeberfaellig(row.data, today);
        if (status === 'erledigt') return null;
        return (
          <Button
            size="sm"
            variant={ueberfaellig ? 'default' : 'outline'}
            className={ueberfaellig ? 'bg-destructive hover:bg-destructive/90 text-white shrink-0' : 'shrink-0'}
            onClick={e => { e.stopPropagation(); ctx.stopRowClick(); void markErledigt(row.data); }}
          >
            <IconCircleCheck size={14} className="mr-1 shrink-0" />
            Erledigt
          </Button>
        );
      },
    },
  ], [markErledigt, today]);

  // ─── WorkList: überfällige ────────────────────────────────────────────────
  const ueberfaelligItems = useMemo(() => ueberfaellige.map(r => ({
    id: r.record_id,
    title: r.fields.titel ?? '—',
    secondLine: (
      <>
        <span className="font-medium text-destructive">Überfällig</span>
        {r.fields.naechste_wartung && (
          <span className="text-muted-foreground"> · seit {formatDate(r.fields.naechste_wartung)}</span>
        )}
        {r.wartungsartName && (
          <span className="text-muted-foreground"> · {r.wartungsartName}</span>
        )}
      </>
    ),
    icon: <IconAlertTriangle size={16} className="text-destructive shrink-0" />,
    action: { label: '✓ Erledigt', onClick: () => void markErledigt(r) },
  })), [ueberfaellige, markErledigt]);

  // ─── Hero: erster überfälliger ────────────────────────────────────────────
  const ersterUeberfaelliger = ueberfaellige[0];

  // ─── Context-Satz ─────────────────────────────────────────────────────────
  const contextLine = useMemo(() => {
    if (enrichedProtokolle.length === 0) return 'Noch keine Wartungsprotokolle vorhanden.';
    if (ueberfaellige.length > 0) {
      const arten = [...new Set(ueberfaellige.map(r => r.wartungsartName).filter(Boolean))];
      return `${ueberfaellige.length} Wartung${ueberfaellige.length !== 1 ? 'en' : ''} überfällig — ${arten.length > 0 ? arten.slice(0, 2).join(', ') : 'sofort handeln'}.`;
    }
    if (offene.length > 0) return `${offene.length} offene Wartung${offene.length !== 1 ? 'en' : ''} — alles im Zeitplan.`;
    return 'Alle Wartungen erledigt — alles in Ordnung.';
  }, [enrichedProtokolle, ueberfaellige, offene]);

  // ─── Early returns NACH allen Hooks ─────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (enrichedProtokolle.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <IconSettings size={48} className="text-muted-foreground" />
        <h2 className="text-xl font-semibold">Wartungsdokumentation starten</h2>
        <p className="text-muted-foreground max-w-sm">Erfasse dein erstes Wartungsprotokoll — Datum, Kosten, Techniker und nächste Fälligkeit.</p>
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
          <IconPlus size={16} className="mr-1" />
          Erstes Protokoll anlegen
        </Button>
        <WartungsprotokolleDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSubmit={async fields => { await LivingAppsService.createWartungsprotokolleEntry(fields); fetchAll(); }}
          wartungsartenList={wartungsarten}
          enablePhotoScan={AI_PHOTO_SCAN['Wartungsprotokolle']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Wartungsprotokolle']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <Button onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
          <IconPlus size={16} className="mr-1 shrink-0" />
          Protokoll anlegen
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ersterUeberfaelliger ? (
            <HeroBanner
              tone="destructive"
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: 'Erledigt melden',
                onClick: () => void markErledigt(ersterUeberfaelliger),
              }}
            >
              <b>{ersterUeberfaelliger.fields.titel ?? 'Wartung'}</b> überfällig — nächste Wartung war am {formatDate(ersterUeberfaelliger.fields.naechste_wartung)}{ersterUeberfaelliger.wartungsartName ? ` (${ersterUeberfaelliger.wartungsartName})` : ''}.{ueberfaellige.length > 1 ? ` Und ${ueberfaellige.length - 1} weitere.` : ''}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title="Gesamt"
              value={enrichedProtokolle.length}
              icon={<IconSettings size={16} className="text-muted-foreground" />}
              onClick={() => setStatusFilter(f => f === 'all' ? 'all' : 'all')}
              active={statusFilter === 'all'}
            />
            <StatStripItem
              title="Offen"
              value={offene.length}
              icon={<IconClock size={16} className="text-muted-foreground" />}
              tone={offene.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'offen' ? 'all' : 'offen')}
              active={statusFilter === 'offen'}
            />
            <StatStripItem
              title="Überfällig"
              value={ueberfaellige.length}
              icon={<IconAlertTriangle size={16} className="text-muted-foreground" />}
              tone={ueberfaellige.length > 0 ? 'destructive' : 'default'}
              onClick={() => setStatusFilter(f => f === 'ueberfaellig' ? 'all' : 'ueberfaellig')}
              active={statusFilter === 'ueberfaellig'}
            />
            <StatStripItem
              title="Erledigt"
              value={erledigte.length}
              icon={<IconCircleCheck size={16} className="text-muted-foreground" />}
              tone={erledigte.length > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'erledigt' ? 'all' : 'erledigt')}
              active={statusFilter === 'erledigt'}
            />
            <StatStripItem
              title="Gesamtkosten"
              value={formatCurrency(gesamtkosten)}
              icon={<IconSettings size={16} className="text-muted-foreground" />}
            />
          </StatStrip>
        }
        primary={
          tableRows.length === 0 ? (
            <TableEmpty title="Keine Protokolle" description="Kein Eintrag entspricht dem gewählten Filter." />
          ) : (
            <TableWidget<EnrichedWartungsprotokolle>
              columns={columns}
              rows={tableRows}
              groupBy="wartungsart"
              onRowClick={row => {
                const id = row.id.split(':')[1] ?? '';
                overlay.replace({ id });
              }}
              toneForRow={row => row.tone ?? 'default'}
              locale="de"
              toolbarEnd={
                <Button size="sm" variant="outline" onClick={() => { setEditRecord(null); setDialogOpen(true); }}>
                  <IconPlus size={14} className="mr-1" />
                  Neu
                </Button>
              }
            />
          )
        }
        aside={
          <>
            <WorkList
              title="Überfällige Wartungen"
              icon={<IconAlertTriangle size={16} className="text-destructive shrink-0" />}
              items={ueberfaelligItems}
              onItemClick={id => overlay.replace({ id })}
              max={6}
              empty={
                ueberfaellige.length === 0
                  ? { text: 'Alles im Zeitplan — keine überfälligen Wartungen.' }
                  : undefined
              }
            />
            <ChartWidget<EnrichedWartungsprotokolle>
              title="Wartungskosten pro Monat"
              rows={chartRows}
              dimension={{ kind: 'time', accessor: r => r.data.fields.datum_wartung ?? null, label: 'Monat', bucket: 'month' }}
              measure={{ aggregate: 'sum', label: 'Kosten', value: r => r.data.fields.kosten ?? null, format: 'currency' }}
              timeEnd={format(clock, "yyyy-MM-dd'T'HH:mm")}
              interaction={{ mode: 'drill', onSegmentClick: seg => setChartDrill({ seg, i: 0 }) }}
              locale="de"
            />
          </>
        }
      />

      {/* Protokoll-Dialog (Anlegen / Bearbeiten) */}
      <WartungsprotokolleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRecord(null); }}
        onSubmit={async fields => {
          if (editRecord) {
            await LivingAppsService.updateWartungsprotokolleEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createWartungsprotokolleEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRecord?.fields}
        recordId={editRecord?.record_id}
        wartungsartenList={wartungsarten}
        enablePhotoScan={AI_PHOTO_SCAN['Wartungsprotokolle']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Wartungsprotokolle']}
      />

      {/* Overlay: Protokoll-Detail */}
      <RecordOverlay
        open={overlay.open}
        onClose={overlay.close}
        onEdit={overlayRecord ? () => { setEditRecord(overlayRecord); setDialogOpen(true); } : undefined}
        footer={
          overlayRecord && lookupKey(overlayRecord.fields.status) !== 'erledigt' ? (
            <Button onClick={() => { void markErledigt(overlayRecord); overlay.close(); }} className="w-full">
              <IconCircleCheck size={16} className="mr-1" />
              Als Erledigt markieren
            </Button>
          ) : undefined
        }
      >
        {overlayRecord && (
          <>
            <RecordHeader
              title={overlayRecord.fields.titel ?? '—'}
              subtitle={overlayRecord.wartungsartName || undefined}
              badges={
                overlayRecord.fields.status ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    lookupKey(overlayRecord.fields.status) === 'erledigt'
                      ? 'bg-green-100 text-green-700'
                      : isUeberfaellig(overlayRecord, today)
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}>{overlayRecord.fields.status.label}</span>
                ) : undefined
              }
            />
            <RecordSection title="Wartungsdetails" cols={2}>
              <RecordField label="Wartungsart" value={overlayRecord.wartungsartName} />
              <RecordField label="Status" value={overlayRecord.fields.status?.label} />
              <RecordField label="Datum Wartung" value={overlayRecord.fields.datum_wartung} format="date" />
              <RecordField label="Nächste Wartung" value={overlayRecord.fields.naechste_wartung} format="date" />
              <RecordField label="Kosten" value={overlayRecord.fields.kosten} format="currency" />
              <RecordField label="Techniker" value={overlayRecord.fields.techniker} />
            </RecordSection>
            {overlayRecord.fields.notizen && (
              <RecordSection title="Notizen">
                <RecordField label="" value={overlayRecord.fields.notizen} format="longtext" />
              </RecordSection>
            )}
            <RecordAttachments appId={APP_IDS.WARTUNGSPROTOKOLLE} recordId={overlayRecord.record_id} />
          </>
        )}
      </RecordOverlay>

      {/* Chart-Drill Overlay */}
      {chartDrill && chartDrillRecord && (
        <RecordOverlay
          open={!!chartDrill}
          onClose={() => setChartDrill(null)}
          counter={chartDrill.seg.rowIds.length > 1 ? `${chartDrill.i + 1} / ${chartDrill.seg.rowIds.length}` : undefined}
          onPrev={chartDrill.i > 0 ? () => setChartDrill(d => d ? { ...d, i: d.i - 1 } : null) : undefined}
          onNext={chartDrill.i < chartDrill.seg.rowIds.length - 1 ? () => setChartDrill(d => d ? { ...d, i: d.i + 1 } : null) : undefined}
        >
          <RecordHeader
            title={chartDrillRecord.fields.titel ?? '—'}
            subtitle={chartDrillRecord.wartungsartName || undefined}
          />
          <RecordSection title="Wartungsdetails" cols={2}>
            <RecordField label="Datum" value={chartDrillRecord.fields.datum_wartung} format="date" />
            <RecordField label="Kosten" value={chartDrillRecord.fields.kosten} format="currency" />
            <RecordField label="Techniker" value={chartDrillRecord.fields.techniker} />
            <RecordField label="Status" value={chartDrillRecord.fields.status?.label} />
          </RecordSection>
          <RecordAttachments appId={APP_IDS.WARTUNGSPROTOKOLLE} recordId={chartDrillRecord.record_id} />
        </RecordOverlay>
      )}
    </>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <TableSkeleton />
    </div>
  );
}

// ─── Error ───────────────────────────────────────────────────────────────────
function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) { setRepairing(false); setRepairFailed(true); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          if (content.startsWith('[DONE]')) { setRepairDone(true); setRepairing(false); }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) setRepairFailed(true);
        }
      }
    } catch { setRepairing(false); setRepairFailed(true); }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte lade die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktiere den Support.</p>}
    </div>
  );
}
