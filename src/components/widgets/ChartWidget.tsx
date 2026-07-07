/**
 * ChartWidget — vor-generiertes Reporting-Karten-Widget (Archetyp B).
 *
 * Ordnet die MENGEN-Achse: Verteilung pro Kategorie, Verlauf über Zeit, Anteil
 * am Ganzen. Die Karte, die eine Zahl AUFBRICHT — zwischen KPI-Punktwert
 * (StatCard/StatStrip) und exakter Tabelle (TableWidget). Compose; never
 * reimplement.
 *
 * @version 1.0.3
 * @since 2026-07-06  (1.0.3: EVERY bucket up to 6 gets its axis label — a
 *                     four-month axis reading „Apr. Mai Juli“ made Juni look
 *                     MISSING; the first/mid/last rule now starts at 7+.
 * @since 2026-07-06  (1.0.2: HUMAN TIME LABELS — the axis reads „Mai,
 *                     Juni, Juli“ / „5. Mai“ / „KW 23“ instead of numeric
 *                     stamps; the year appears only when the axis spans years
 *                     (the head range always carries it). First-glance
 *                     readability is the WIDGET's duty, never the agent's.
 * @since 2026-07-06  (1.0.1: HONEST EDGES — the head shows the RANGE, never
 *                     the bucket unit ("520 € · pro Monat" on a two-month
 *                     total was a false statement; the unit is an axis
 *                     notice); a running last bucket renders HOLLOW + an
 *                     "unvollständig" notice — a mid-month crash is an
 *                     artifact, not a trend.
 * @since 2026-07-06  (1.0.0: first release per docs/RESEARCH-CHART-WIDGET.md —
 *                     typed dimension/measure with the family's ChartRow
 *                     accessor signature, aggregation on RAW values inside the
 *                     widget, the mark FOLLOWS the dimension (category →
 *                     BarList, time → sparse line; a wrong chart type cannot
 *                     compile), head total that absorbs the metric's StatCard,
 *                     hard caps (8/12 categories + "Andere", 60 time buckets
 *                     with deterministic coarsening), calendar-complete time
 *                     axis, NOTHING-disappears notices, drill interaction,
 *                     focus value label, hand-rolled SVG — zero dependencies.)
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. The widget owns NO detail layer and NO filter state. A click REPORTS a
 *     segment (rowIds + test predicate); what "open" means is YOUR composition.
 *     Detail = <RecordOverlay> from RecordView — a SINGLE-record shell: map the
 *     segment's rowIds to records and page via onPrev/onNext + counter (see
 *     ./ChartWidget.example.tsx). RecordOverlay has NO rowIds/title prop.
 *  2. Never edit this file (nor ./primitives.ts); never import from a sister
 *     widget (the TableCellFormat TYPE import is the sanctioned exception).
 *     Gaps → `footer` (text only) + // TODO(widget-gap). Never fork.
 *  3. Data-agnostic: accessors read the typed row; every key is OPAQUE. The
 *     widget aggregates ITSELF — NEVER pass precomputed chart points.
 *  4. Raw-value contract: aggregation reads accessors, never formatted strings.
 *     `format` decides rendering only (head sum, list values, ticks, focus
 *     label). 'currency' renders via the shared family formatter
 *     (formatCurrency), like TableWidget.
 *  5. NOTHING disappears silently: null/'' category → "Ohne Angabe" row;
 *     non-finite measure and unparseable time strings → "n ohne Wert" notice;
 *     "Andere (N)" always visible and last; capped categories → "8 von N";
 *     coarsened time bucket → axis notice; the bucket unit is named on the
 *     axis; negative values render as |value| bars with the minus visible on
 *     the raw value.
 *  6. The chart ALWAYS receives the full rows of its question. Filtering rows
 *     by the chart's own segment collapses the card to one 100% bar — filtered
 *     rows go to SIBLING surfaces, never back into the chart.
 *
 * ─── ACCESSOR NORMALIZATION (category) — what the widget yields per shape ──
 *   string                     → the string        ('' → "Ohne Angabe")
 *   number / bool              → String / Ja/Nein (locale)
 *   { label: string, ... }     → label             (lookup & enriched applookup)
 *   any other object           → "Ohne Angabe"     (NEVER silently '')
 *   Array<any of the above>    → every item counts (multilookup; head shows
 *                                "N Nennungen" when mentions ≠ records)
 *   null / undefined           → "Ohne Angabe"
 * Pre-extract nothing: pass the enriched raw value; the widget normalizes.
 * Free-TEXT fields are NOT chart food (unbounded cardinality → everything
 * lands in "Andere") — chart lookups, applookups, bools, dates, numbers.
 *
 * ─── COMMON MISTAKES / NEVER LIST ──────────────────────────────────────
 *  · Multi-series / stacked / grouped / dual-axis / second dimension: NEVER —
 *    two ChartWidgets side by side (small multiples) or the escape clause.
 *  · Vertical axis bars / area: NEVER — the BarList reads better in both
 *    geometries; area is a line sub-variant without a new question.
 *  · Zoom/brush, multi-select filter, sequential color scales, free sorting,
 *    custom tooltips, renderSegment slots, sparkline/mini mode: NEVER — the
 *    mini slot is StatCard's `footer`, not a chart mode.
 *  · Export (image/CSV/print), realtime/auto-refresh/polling: NEVER.
 *  · Hand-built recharts charts: rejected — one render stack, one theming;
 *    recharts is sanctioned ONLY for StatCard footer sparklines.
 *  · Non-existent props (by design): yMin/domain, free colors/hex,
 *    valueFormatter functions, legend config, series arrays, interpolate,
 *    sort switches, a free chart-type enum.
 */
import { useMemo, useState, type ReactNode, type ComponentType } from 'react';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { addDays, addMonths, addWeeks, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarISOWeeks, endOfISOWeek, endOfMonth, format, isValid, parseISO, startOfDay, startOfISOWeek, startOfMonth } from 'date-fns';
import { de as dfnsDe } from 'date-fns/locale';
import { formatCurrency } from '@/lib/formatters';
import { TONE_TEXT, labelOf, type WidgetTone } from './primitives';
import type { TableCellFormat } from './TableWidget';

// Closed tone enum — const array export (family KANBAN_TONES pattern).
export const CHART_TONES = ['default', 'primary', 'success', 'warning', 'destructive'] as const;
export type ChartTone = (typeof CHART_TONES)[number];
// Parity lock against primitives (MapWidget precedent): if WidgetTone ever
// drifts, this line stops compiling.
const _toneParity: Record<ChartTone, WidgetTone> = { default: 'default', primary: 'primary', success: 'success', warning: 'warning', destructive: 'destructive' };
void _toneParity;

/** Getypte Records — Familien-Konvention, identisch Table/Kanban/Map.
 *  id = `entity:${record_id}` (die einzige ID-Quelle). */
export interface ChartRow<T> { id: string; data: T }

/** Geteiltes Format-Vokabular — per Extract TYP-GEBUNDEN ans Familien-Enum,
 *  keine Kopie: benennt TableWidget ein Literal um, bricht dieser Build.
 *  'percent' ist chart-lokal (Anteil ist eine Aggregat-Eigenschaft, kein
 *  Record-Feld — es gehört bewusst nicht ins Record-Vokabular). */
export type ChartValueFormat = Extract<TableCellFormat, 'number' | 'currency'> | 'percent';

/** Sprach-Texte des Widgets (Familien-Muster: eingebaute UI-Map + locale). */
export interface ChartTexts {
  countLabel: string;        // "Anzahl" / "Count"   (Kopf bei measure weggelassen)
  otherLabel: string;        // "Andere" / "Other"
  missingLabel: string;      // "Ohne Angabe" / "Not specified"
  noValueNotice: string;     // "{n} ohne Wert"
  cappedNotice: string;      // "{shown} von {total} Kategorien"
  mentionsLabel: string;     // "{n} Nennungen"
  coarsenedNotice: string;   // "gebündelt pro {unit}"
  partialNotice: string;     // "{label} unvollständig" (laufender Rand-Bucket)
  emptyLabel: string;        // "Keine Daten"
}

/** EINE Dimensions-Achse. `kind` ist das semantische Typ-Signal (Vega-Lite-
 *  Prinzip): Skala, Sortierung, Lücken-Behandlung leitet das WIDGET ab. Die
 *  Mark folgt der Dimension — category→BarList, time→Linie; ein Zeit-Donut
 *  oder ein „falscher Chart-Typ" ist per Typsystem unbaubar.
 *  SIGNATUR: accessor nimmt (row: ChartRow<T>) — EXAKT wie TableWidget. */
export type ChartDimension<T> =
  | { kind: 'category';
      accessor: (row: ChartRow<T>) => unknown;
      label?: string }
  | { kind: 'time';
      accessor: (row: ChartRow<T>) => string | null;  // ISO-Rohstring; invalid ≡ null
      label?: string;
      bucket?: 'day' | 'week' | 'month' | 'auto' };   // Default 'auto'; Hard-Cap 60

/** EINE Mess-Serie. WEGGELASSEN = count. sum/avg ERZWINGEN `value` + `label`. */
export type ChartMeasure<T> =
  | { aggregate?: 'count'; label?: string; format?: ChartValueFormat }
  | { aggregate: 'sum' | 'avg'; label: string;
      value: (row: ChartRow<T>) => number | null;     // ROHZAHL; null/NaN → Notice
      format?: ChartValueFormat };

/** Post-Aggregation. Das Widget besitzt die Bucket-Semantik (Top-N, „Andere",
 *  Zeit-Buckets) — also liefert ES Prädikat und Mitglieds-Snapshot. Der
 *  Konsument re-implementiert NIE Bucket-Logik. */
export interface ChartSegment<T> {
  key: string;       // deterministisch: slug(normalisiertes Label); Sonderfälle
                     // '__other__', '__missing__'; Zeit: ISO-Bucket-Key.
  label: string;
  value: number;
  share: number;     // value / Σ|values| ∈ [0,1]
  rowIds: string[];  // Mitglieds-Snapshot — das Drill-Futter
  isOther: boolean;
  test: (row: ChartRow<T>) => boolean;
}

/** OPTIONAL — weggelassen = display-only (der sichere Default). v1: nur
 *  'drill'; 'filter' ist eine v1.1-Union-Erweiterung. */
export type ChartInteraction<T> =
  | { mode: 'drill'; onSegmentClick: (seg: ChartSegment<T>) => void };

export interface ChartWidgetProps<T> {
  title: string;                    // Pflicht — die Karte trägt ihre Frage; aria-label
  rows: ChartRow<T>[];              // IMMER die vollen Rows der Frage (HARD RULE 6)
  dimension: ChartDimension<T>;
  measure?: ChartMeasure<T>;        // weggelassen = count
  interaction?: ChartInteraction<T>;
  maxCategories?: number;           // Default 8, Hard-Cap 12; Überschuss IMMER → „Andere"
  tone?: (seg: ChartSegment<T>) => ChartTone;  // Zustand, nie Deko
  timeStart?: string;               // ISO — Domain-Ausdehnung (nur kind:'time')
  timeEnd?: string;                 // „bis heute" reicht die SEITE herein
  footer?: ReactNode;               // NUR Text/Inline-Kontext — nie Chart/Tabelle
  emptyLabel?: string;
  locale?: 'de' | 'en';
  texts?: Partial<ChartTexts>;
  className?: string;
}

// ── built-in strings ─────────────────────────────────────────────────────
const TEXTS: Record<'de' | 'en', ChartTexts> = {
  de: {
    countLabel: 'Anzahl', otherLabel: 'Andere', missingLabel: 'Ohne Angabe',
    noValueNotice: '{n} ohne Wert', cappedNotice: '{shown} von {total} Kategorien',
    mentionsLabel: '{n} Nennungen', coarsenedNotice: 'gebündelt pro {unit}',
    partialNotice: '{label} unvollständig', emptyLabel: 'Keine Daten',
  },
  en: {
    countLabel: 'Count', otherLabel: 'Other', missingLabel: 'Not specified',
    noValueNotice: '{n} without value', cappedNotice: '{shown} of {total} categories',
    mentionsLabel: '{n} mentions', coarsenedNotice: 'bucketed per {unit}',
    partialNotice: '{label} incomplete', emptyLabel: 'No data',
  },
};
const UNIT: Record<'de' | 'en', Record<'day' | 'week' | 'month', string>> = {
  de: { day: 'Tag', week: 'Woche', month: 'Monat' },
  en: { day: 'day', week: 'week', month: 'month' },
};
const YESNO: Record<'de' | 'en', [string, string]> = { de: ['Ja', 'Nein'], en: ['Yes', 'No'] };
const tpl = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// ── normalization + keys ─────────────────────────────────────────────────
const MISSING = '__missing__';
const OTHER = '__other__';

function slug(label: string): string {
  const s = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'x';
}

/** Normalisiert EIN Kategorie-Item auf sein Label — oder null für "Ohne
 *  Angabe" (Header-Tabelle; ein fremdes Objekt wird NIE still ''). */
function categoryLabelOf(item: unknown, locale: 'de' | 'en'): string | null {
  if (item == null || item === '') return null;
  if (typeof item === 'boolean') return YESNO[locale][item ? 0 : 1];
  if (typeof item === 'number') return String(item);
  if (typeof item === 'string') return item;
  const l = labelOf(item);            // {label}-Objekte (lookup/enriched applookup)
  return l === '' ? null : l;
}

// ── aggregation pipeline (the ONE place transforms live) ─────────────────
type Agg<T> = {
  segments: ChartSegment<T>[];
  headValue: number | null;   // count → rows.length; sum → Σ; avg → Ø (über Rows)
  mentions: number;           // Kategorie-Nennungen (Multilookup-Notice)
  noValueCount: number;       // Rows ohne Mess-/Zeitwert
  cappedTotal: number | null; // Gesamt-Kategorienzahl, wenn gedeckelt
  coarsenedTo: 'week' | 'month' | null;
  unit: 'day' | 'week' | 'month' | null;   // Zeitachse
  partialLast: boolean;      // letzter Bucket läuft noch (Achsen-Ende < Bucket-Ende)
  rangeLabel: string | null; // "06.2026–07.2026" für den Kopf (statt der Einheit)
};

function measureOf<T>(measure: ChartMeasure<T> | undefined, row: ChartRow<T>): number | null {
  // 'value' in measure narrowt die Union: nur sum/avg tragen den Accessor.
  if (!measure || !('value' in measure)) return 1;
  const v = measure.value(row);
  return v == null || !Number.isFinite(v) ? null : v;
}

function aggregateCategory<T>(
  rows: ChartRow<T>[], dim: Extract<ChartDimension<T>, { kind: 'category' }>,
  measure: ChartMeasure<T> | undefined, maxCategories: number, locale: 'de' | 'en', texts: ChartTexts,
): Agg<T> {
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const isAvg = measure?.aggregate === 'avg';
  type Bucket = { label: string; sum: number; n: number; rowIds: string[] };
  const map = new Map<string, Bucket>();     // key: normalisiertes Label ('' = missing)
  let mentions = 0, noValueCount = 0, headSum = 0, headN = 0;

  for (const row of rows) {
    const m = measureOf(measure, row);
    if (m === null) { noValueCount++; continue; }   // sum/avg ohne Wert: Notice, nie still
    headSum += m; headN++;
    const raw = dim.accessor(row);
    const items = Array.isArray(raw) ? (raw.length ? raw : [null]) : [raw];
    for (const item of items) {
      const label = categoryLabelOf(item, locale);
      mentions += label === null ? 0 : 1;
      const k = label ?? '';
      const b = map.get(k) ?? { label: label ?? texts.missingLabel, sum: 0, n: 0, rowIds: [] };
      b.sum += m; b.n++; b.rowIds.push(row.id);
      map.set(k, b);
    }
  }

  const finish = (b: Bucket) => (isAvg ? (b.n ? b.sum / b.n : 0) : b.sum);
  const missing = map.get('');
  map.delete('');
  // Sortierung: absteigend nach Wert; Tie-Break Label aufsteigend, FIXIERTES Locale.
  const ranked = Array.from(map.entries())
    .map(([k, b]) => ({ norm: k, b, v: finish(b) }))
    .sort((a, z) => z.v - a.v || a.b.label.localeCompare(z.b.label, 'de-DE'));

  const cap = Math.min(Math.max(1, maxCategories), 12);
  const top = ranked.length > cap ? ranked.slice(0, cap - 1) : ranked;
  const rest = ranked.length > cap ? ranked.slice(cap - 1) : [];

  // Slug-Keys deterministisch eindeutig (Kollision → -2, -3 in Rangfolge).
  const used = new Set<string>();
  const keyOf = (label: string) => {
    let k = slug(label), i = 2;
    while (used.has(k)) k = `${slug(label)}-${i++}`;
    used.add(k); return k;
  };

  const topKeyByNorm = new Map<string, string>();
  const segs: ChartSegment<T>[] = top.map(({ norm, b, v }) => {
    const key = keyOf(b.label);
    topKeyByNorm.set(norm, key);
    return {
      key, label: b.label, value: v, share: 0, rowIds: [...new Set(b.rowIds)], isOther: false,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? raw : [raw];
        return items.some(i => (categoryLabelOf(i, locale) ?? '') === norm);
      },
    };
  });
  if (rest.length) {
    const ids = [...new Set(rest.flatMap(r => r.b.rowIds))];
    const v = rest.reduce((s, r) => s + finish(r.b), 0);
    const restNorms = new Set(rest.map(r => r.norm));
    segs.push({
      key: OTHER, label: `${texts.otherLabel} (${rest.length})`, value: v, share: 0,
      rowIds: ids, isOther: true,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? raw : [raw];
        return items.some(i => restNorms.has(categoryLabelOf(i, locale) ?? '§none'));
      },
    });
  }
  if (missing) {
    segs.push({
      key: MISSING, label: texts.missingLabel, value: finish(missing), share: 0,
      rowIds: [...new Set(missing.rowIds)], isOther: false,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? (raw.length ? raw : [null]) : [raw];
        return items.some(i => categoryLabelOf(i, locale) === null);
      },
    });
  }
  const denom = segs.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  for (const s of segs) s.share = Math.abs(s.value) / denom;

  return {
    segments: segs,
    headValue: isCount ? rows.length - noValueCount : isAvg ? (headN ? headSum / headN : null) : headSum,
    mentions, noValueCount,
    cappedTotal: rest.length ? ranked.length : null,
    coarsenedTo: null, unit: null, partialLast: false, rangeLabel: null,
  };
}

function aggregateTime<T>(
  rows: ChartRow<T>[], dim: Extract<ChartDimension<T>, { kind: 'time' }>,
  measure: ChartMeasure<T> | undefined, timeStart: string | undefined, timeEnd: string | undefined,
  locale: 'de' | 'en',
): Agg<T> {
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const isAvg = measure?.aggregate === 'avg';
  const parsed: { row: ChartRow<T>; d: Date; m: number }[] = [];
  let noValueCount = 0, headSum = 0, headN = 0;
  for (const row of rows) {
    const m = measureOf(measure, row);
    const s = dim.accessor(row);
    const d = s ? parseISO(s) : null;
    if (m === null || !d || !isValid(d)) { noValueCount++; continue; }   // invalid ≡ null (Rule 5)
    parsed.push({ row, d, m }); headSum += m; headN++;
  }
  const empty: Agg<T> = { segments: [], headValue: null, mentions: 0, noValueCount, cappedTotal: null, coarsenedTo: null, unit: null, partialLast: false, rangeLabel: null };
  if (!parsed.length) return empty;

  const extra: Date[] = [];
  for (const s of [timeStart, timeEnd]) { if (s) { const d = parseISO(s); if (isValid(d)) extra.push(d); } }
  const all = [...parsed.map(p => p.d), ...extra];
  const min = new Date(Math.min(...all.map(d => d.getTime())));
  const max = new Date(Math.max(...all.map(d => d.getTime())));

  // Bucket-Wahl: Wunsch (Default 'auto') → Hard-Cap 60 → deterministische
  // Vergröberung day→week→month. Reine Funktion der Datenspanne.
  const counts = {
    day: differenceInCalendarDays(max, min) + 1,
    week: differenceInCalendarISOWeeks(max, min) + 1,
    month: differenceInCalendarMonths(max, min) + 1,
  };
  const wish = dim.bucket && dim.bucket !== 'auto' ? dim.bucket
    : counts.day <= 60 ? 'day' : counts.week <= 60 ? 'week' : 'month';
  const order: ('day' | 'week' | 'month')[] = ['day', 'week', 'month'];
  let unit = wish as 'day' | 'week' | 'month';
  while (counts[unit] > 60 && order.indexOf(unit) < 2) unit = order[order.indexOf(unit) + 1];
  const coarsenedTo = unit !== wish ? (unit as 'week' | 'month') : null;

  // Kalender-Parität: ISO-Wochen (weekStartsOn Montag), identisch zur
  // Kalender-Geometrie der Familie. Erwartung (Beispiel):
  //   2026-06-30 (Di) → week-Key '2026-W27', floor Montag 2026-06-29.
  const floor = (d: Date) => unit === 'day' ? startOfDay(d) : unit === 'week' ? startOfISOWeek(d) : startOfMonth(d);
  const step = (d: Date) => unit === 'day' ? addDays(d, 1) : unit === 'week' ? addWeeks(d, 1) : addMonths(d, 1);
  const keyOf = (d: Date) => unit === 'day' ? format(d, 'yyyy-MM-dd') : unit === 'week' ? format(d, "RRRR-'W'II") : format(d, 'yyyy-MM');
  // Achsen-Labels sind MENSCHLICH („Mai“, „5. Mai“, „KW 23“) — erste-Blick-
  // Lesbarkeit ist Widget-Pflicht, keine Agenten-Aufgabe. Das Jahr erscheint
  // nur, wenn die Achse Jahre überspannt (der Kopf-Zeitraum trägt es immer).
  const dfnsLoc = locale === 'de' ? dfnsDe : undefined;
  const spansYears = min.getFullYear() !== max.getFullYear();
  const labelOfBucket = (d: Date) =>
    unit === 'month' ? format(d, spansYears ? 'MMM yy' : 'MMM', { locale: dfnsLoc })
    : unit === 'week' ? `${locale === 'de' ? 'KW' : 'W'} ${format(d, 'II')}${spansYears ? ` '${format(d, 'RR')}` : ''}`
    : format(d, spansYears ? (locale === 'de' ? 'd. MMM yy' : 'MMM d yy') : (locale === 'de' ? 'd. MMM' : 'MMM d'), { locale: dfnsLoc });

  type B = { d: Date; sum: number; n: number; rowIds: string[] };
  const byKey = new Map<string, B>();
  // Kalendarisch VOLLSTÄNDIG: leere Buckets existieren (count/sum→0; avg→Lücke).
  for (let d = floor(min); d.getTime() <= max.getTime(); d = step(d)) {
    byKey.set(keyOf(d), { d, sum: 0, n: 0, rowIds: [] });
  }
  for (const p of parsed) {
    const b = byKey.get(keyOf(floor(p.d)));
    if (b) { b.sum += p.m; b.n++; b.rowIds.push(p.row.id); }
  }
  const segs: ChartSegment<T>[] = Array.from(byKey.entries()).map(([key, b]) => ({
    key,
    label: labelOfBucket(b.d),
    // avg mit leerem Bucket = LÜCKE (NaN markiert; 0 wäre eine Lüge) — der
    // Pfad-Builder unterbricht dort.
    value: isAvg ? (b.n ? b.sum / b.n : Number.NaN) : b.sum,
    share: 0,
    rowIds: b.rowIds,
    isOther: false,
    test: (row: ChartRow<T>) => {
      const s = dim.accessor(row);
      const d = s ? parseISO(s) : null;
      return !!d && isValid(d) && keyOf(floor(d)) === key;
    },
  }));
  const denom = segs.reduce((s, x) => s + (Number.isFinite(x.value) ? Math.abs(x.value) : 0), 0) || 1;
  for (const s of segs) s.share = Number.isFinite(s.value) ? Math.abs(s.value) / denom : 0;

  // Laufender Rand-Bucket: das Achsen-Ende (Daten-Max bzw. timeEnd) erreicht
  // das KALENDARISCHE Ende des letzten Buckets nicht — der letzte Wert ist
  // eine Zwischensumme, kein Trend-Punkt. Deterministisch (keine Widget-Uhr).
  const lastStart = floor(max);
  const bucketEnd = unit === 'day' ? lastStart : unit === 'week' ? endOfISOWeek(lastStart) : endOfMonth(lastStart);
  const partialLast = unit !== 'day' && startOfDay(max).getTime() < startOfDay(bucketEnd).getTime();
  const first = segs[0], last = segs[segs.length - 1];
  // Der Kopf-Zeitraum trägt IMMER das Jahr (die Achse darf es weglassen).
  const yearSuffix = spansYears ? '' : ` ${format(max, 'yyyy')}`;
  return {
    segments: segs,
    headValue: isCount ? headN : isAvg ? (headN ? headSum / headN : null) : headSum,
    mentions: 0, noValueCount, cappedTotal: null, coarsenedTo, unit, partialLast,
    rangeLabel: first && last && first !== last
      ? `${first.label}–${last.label}${yearSuffix}`
      : first ? `${first.label}${yearSuffix}` : null,
  };
}

// ── value rendering (head, list values, ticks, focus label) ─────────────
function formatValue(v: number, fmt: ChartValueFormat | undefined, locale: 'de' | 'en'): string {
  if (fmt === 'currency') return formatCurrency(v);
  if (fmt === 'percent') return `${(v * 100).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })} %`;
  return v.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 });
}

/** nice max für die y-Achse: kleinste 1/2/5·10^k ≥ max (triviale Arithmetik —
 *  Erwartungstabelle: 7→10, 23→50? nein: 23→25? Regel: 1/2/2.5/5-Stufen:
 *  7→10, 23→25, 40→50, 90→100, 130→200, 480→500. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) { if (v <= m * mag) return m * mag; }
  return 10 * mag;
}

// ── the widget ───────────────────────────────────────────────────────────
export function ChartWidget<T>({
  title, rows, dimension, measure, interaction, maxCategories = 8, tone,
  timeStart, timeEnd, footer, emptyLabel, locale = 'de', texts, className,
}: ChartWidgetProps<T>) {
  const t: ChartTexts = { ...TEXTS[locale], ...texts };
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const agg = useMemo<Agg<T>>(() => (
    dimension.kind === 'category'
      ? aggregateCategory(rows, dimension, measure, maxCategories, locale, t)
      : aggregateTime(rows, dimension, measure, timeStart, timeEnd, locale)
    // t ist aus locale+texts abgeleitet — die Ableitungs-Inputs stehen in den Deps.
  ), [rows, dimension, measure, maxCategories, locale, texts, timeStart, timeEnd]);

  const fmt = measure?.format;
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const headLabel = isCount ? (measure?.label ?? t.countLabel) : measure.label;
  const toneOf = (seg: ChartSegment<T>): ChartTone => tone?.(seg) ?? 'default';
  const clickable = !!interaction;

  const notices: string[] = [];
  if (agg.noValueCount > 0) notices.push(tpl(t.noValueNotice, { n: agg.noValueCount }));
  if (agg.cappedTotal !== null) notices.push(tpl(t.cappedNotice, { shown: Math.min(Math.max(1, maxCategories), 12) - 1, total: agg.cappedTotal }));
  if (dimension.kind === 'category' && agg.mentions > rows.length - agg.noValueCount) {
    notices.push(tpl(t.mentionsLabel, { n: agg.mentions }));
  }
  if (agg.coarsenedTo) notices.push(tpl(t.coarsenedNotice, { unit: UNIT[locale][agg.coarsenedTo] }));
  else if (agg.unit) notices.push(`${locale === 'de' ? 'pro' : 'per'} ${UNIT[locale][agg.unit]}`);
  if (agg.partialLast && agg.segments.length) notices.push(tpl(t.partialNotice, { label: agg.segments[agg.segments.length - 1].label }));

  const empty = agg.segments.length === 0;
  const axisName = dimension.label ?? '';
  // Der Kopf trägt den ZEITRAUM (die Summe gilt für ihn) — nie die Bucket-
  // Einheit ("520 € · pro Monat" wäre eine Falschaussage; sie steht als Notice).

  return (
    <div className={`rounded-[27px] bg-card shadow-lg overflow-hidden${className ? ` ${className}` : ''}`} role="group" aria-label={title}>
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {agg.headValue !== null && (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">{formatValue(agg.headValue, fmt, locale)}</span>
            <span className="text-sm text-muted-foreground">{headLabel}{axisName ? ` · ${axisName}` : ''}{agg.rangeLabel ? ` · ${agg.rangeLabel}` : ''}</span>
          </p>
        )}
      </div>

      {empty ? (
        <div className="px-6 pb-8 pt-2 text-center text-sm text-muted-foreground">{emptyLabel ?? t.emptyLabel}</div>
      ) : dimension.kind === 'category' ? (
        <div className="flex flex-col pb-4">
          {agg.segments.map(seg => {
            const dim = seg.isOther || seg.key === MISSING;
            const toneCls = TONE_TEXT[toneOf(seg)];
            const inner = (
              <>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`truncate text-sm ${dim ? 'text-muted-foreground' : 'text-foreground'}`} title={seg.label}>{seg.label}</span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {formatValue(seg.value, fmt, locale)}
                      <span className="ml-2 hidden text-xs text-muted-foreground tabular-nums sm:inline">{Math.round(seg.share * 100)} %</span>
                    </span>
                  </div>
                  <div className={`mt-1 h-2 w-full overflow-hidden rounded-full bg-muted ${toneCls === 'text-muted-foreground' ? 'text-primary' : toneCls} ${dim ? 'opacity-60' : ''}`}>
                    <div className="h-full rounded-full bg-current" style={{ width: `${(seg.share * 100).toFixed(2)}%` }} />
                  </div>
                </div>
              </>
            );
            return clickable ? (
              <button
                key={seg.key}
                type="button"
                onClick={() => interaction.onSegmentClick(seg)}
                className="block w-full px-6 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                {inner}
              </button>
            ) : (
              <div key={seg.key} className="px-6 py-1.5">{inner}</div>
            );
          })}
        </div>
      ) : (
        <TimeMark segments={agg.segments} fmt={fmt} locale={locale} clickable={clickable} partialLast={agg.partialLast}
          onClick={seg => interaction?.onSegmentClick(seg)} focusKey={focusKey} setFocusKey={setFocusKey}
          toneOf={toneOf} title={title} />
      )}

      {notices.length > 0 && !empty && (
        <div className="px-6 pb-3 -mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {notices.map((n, i) => <span key={i} className="text-xs text-muted-foreground">{n}</span>)}
        </div>
      )}
      {footer && <div className="border-t border-border px-6 py-2.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

// ── the sparse line (time) — hand-rolled SVG, fixed height, deterministic ──
function TimeMark<T>({ segments, fmt, locale, clickable, onClick, focusKey, setFocusKey, toneOf, title, partialLast }: {
  segments: ChartSegment<T>[]; fmt: ChartValueFormat | undefined; locale: 'de' | 'en';
  clickable: boolean; onClick: (seg: ChartSegment<T>) => void;
  focusKey: string | null; setFocusKey: (k: string | null) => void;
  toneOf: (seg: ChartSegment<T>) => ChartTone; title: string; partialLast: boolean;
}) {
  const W = 600, H = 150, PAD_X = 8, PAD_TOP = 8, PAD_BOTTOM = 22;
  const innerW = W - PAD_X * 2, innerH = H - PAD_TOP - PAD_BOTTOM;
  const finite = segments.filter(s => Number.isFinite(s.value));
  const rawMax = Math.max(0, ...finite.map(s => s.value));
  const rawMin = Math.min(0, ...finite.map(s => s.value));
  const yMax = niceMax(Math.max(rawMax, Math.abs(rawMin)) || 1);
  // Domain: [0, niceMax] — mit negativen Werten symmetrisch [-niceMax, niceMax]
  // (Balken-Äquivalent von "Baseline 0"; negative wachsen nach unten).
  const yLo = rawMin < 0 ? -yMax : 0;
  const yOf = (v: number) => PAD_TOP + innerH - ((v - yLo) / (yMax - yLo)) * innerH;
  const xOf = (i: number) => PAD_X + (segments.length === 1 ? innerW / 2 : (i / (segments.length - 1)) * innerW);

  // Pfad mit Lücken (avg-Gaps unterbrechen das Segment).
  let d = '';
  let pen = false;
  segments.forEach((s, i) => {
    if (!Number.isFinite(s.value)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(2)},${yOf(s.value).toFixed(2)}`;
    pen = true;
  });

  // x-Labels: bis 6 Buckets wird JEDER beschriftet (ein fehlender Monat liest
  // sich als fehlender Datenpunkt); erst darüber die Spartanik-Regel
  // erster/Mitte/letzter — sie existiert für 60-Tage-Achsen, nicht für vier Monate.
  const xIdx = segments.length <= 6 ? segments.map((_, i) => i)
    : [0, Math.floor((segments.length - 1) / 2), segments.length - 1];
  const yTicks = [0, yMax / 2, yMax];

  const focus = focusKey ? segments.find(s => s.key === focusKey) : null;
  const focusIdx = focus ? segments.indexOf(focus) : -1;

  return (
    <div className="relative px-6 pb-2 text-primary">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`${title}: ${segments.filter(s => Number.isFinite(s.value)).map(s => `${s.label} ${formatValue(s.value, fmt, locale)}`).join(', ')}`}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD_X} x2={W - PAD_X} y1={yOf(v).toFixed(2)} y2={yOf(v).toFixed(2)} className="stroke-border" strokeWidth="1" />
            <text x={PAD_X + 2} y={(yOf(v) - 3).toFixed(2)} className="fill-muted-foreground" fontSize="9">{formatValue(v, fmt, locale)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {segments.map((s, i) => Number.isFinite(s.value) && (
          // Der laufende Rand-Bucket ist HOHL — eine Zwischensumme, kein Trend-Punkt.
          <circle key={s.key} cx={xOf(i).toFixed(2)} cy={yOf(s.value).toFixed(2)} r={focusKey === s.key ? 4 : 2.5}
            className={TONE_TEXT[toneOf(s)] === 'text-muted-foreground' ? '' : TONE_TEXT[toneOf(s)]}
            fill={partialLast && i === segments.length - 1 ? 'var(--card)' : 'currentColor'}
            stroke="currentColor" strokeWidth={partialLast && i === segments.length - 1 ? 1.5 : 0} />
        ))}
        {xIdx.map(i => (
          <text key={i} x={xOf(i).toFixed(2)} y={H - 6} textAnchor={i === 0 ? 'start' : i === segments.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground" fontSize="9">{segments[i].label}</text>
        ))}
        {/* Fokus-/Hover-Hit-Zonen: EIN Mechanismus für Maus + Tastatur (kein
            freier Tooltip-Layer — das Label clampt ins Karten-Chrome). */}
        {segments.map((s, i) => (
          <rect key={s.key} x={(xOf(i) - innerW / segments.length / 2).toFixed(2)} y={0}
            width={(innerW / segments.length).toFixed(2)} height={H} fill="transparent"
            tabIndex={clickable || Number.isFinite(s.value) ? 0 : -1}
            onMouseEnter={() => setFocusKey(s.key)} onMouseLeave={() => setFocusKey(null)}
            onFocus={() => setFocusKey(s.key)} onBlur={() => setFocusKey(null)}
            onClick={clickable ? () => onClick(s) : undefined}
            onKeyDown={clickable ? (e => { if (e.key === 'Enter') onClick(s); }) : undefined}
          />
        ))}
      </svg>
      {focus && Number.isFinite(focus.value) && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
          style={{ left: `${Math.min(Math.max((focusIdx / Math.max(1, segments.length - 1)) * 100, 8), 78)}%` }}
        >
          <span className="text-muted-foreground">{focus.label}</span>{' '}
          <span className="font-medium tabular-nums">{formatValue(focus.value, fmt, locale)}</span>{' '}
          <span className="text-muted-foreground tabular-nums">({Math.round(focus.share * 100)} %)</span>
        </div>
      )}
      {/* A11y-Fallback: die Daten als visually-hidden Tabelle. */}
      <table className="sr-only">
        <tbody>
          {segments.map(s => (
            <tr key={s.key}><th scope="row">{s.label}</th><td>{Number.isFinite(s.value) ? formatValue(s.value, fmt, locale) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── siblings (family pattern: consumer branches BEFORE the widget) ───────

export function ChartSkeleton() {
  return (
    <div className="rounded-[27px] bg-card shadow-lg overflow-hidden animate-pulse" aria-busy="true">
      <div className="px-6 pt-5 pb-3">
        <div className="h-3 w-40 rounded bg-muted" />
        <div className="mt-2 h-7 w-28 rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-3 px-6 pb-6">
        {['w-full', 'w-4/5', 'w-3/5', 'w-2/5', 'w-1/4'].map(w => (
          <div key={w} className={`h-2 rounded-full bg-muted ${w}`} />
        ))}
      </div>
    </div>
  );
}

type ChartErrorProps = {
  error: Error | string;
  locale?: 'de' | 'en';
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ComponentType<{ size?: number | string; stroke?: number | string }>;
  className?: string;
};

export function ChartError({ error, locale = 'de', title, onRetry, retryLabel, icon: Icon = IconAlertCircle, className }: ChartErrorProps) {
  const message = typeof error === 'string' ? error : error.message;
  const heading = title ?? (locale === 'de' ? 'Auswertung konnte nicht geladen werden' : 'Chart failed to load');
  const retryText = retryLabel ?? (locale === 'de' ? 'Erneut versuchen' : 'Try again');
  return (
    <div className={`flex flex-col items-center justify-center gap-4 rounded-[27px] bg-card shadow-lg py-16 text-center${className ? ` ${className}` : ''}`}>
      <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive"><Icon size={22} /></div>
      <div className="flex flex-col gap-1 max-w-md px-6">
        <h3 className="font-semibold text-foreground">{heading}</h3>
        <p className="text-sm text-muted-foreground break-words">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
          <IconRefresh size={15} className="mr-1.5" />{retryText}
        </button>
      )}
    </div>
  );
}
