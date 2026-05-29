'use client';

import { EarthquakeData } from '@/types/earthquake';
import { useMemo, useRef, memo } from 'react';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import { safeMin, safeMax } from '@/utils/arrayMath';
import { getFieldUnit } from '@/utils/fieldUnits';

// '' = no grouping; 'depthClass'/'magClass'/'year' = seismological presets;
// any other string is treated as a field name and auto-bucketed.
export type HistogramGroupBy = string;

interface GenericHistogramProps {
    earthquakes: EarthquakeData[];
    fields: string[];
    bins?: number;
    title?: string;
    /** Split the primary field into colored sub-series by this dimension. */
    groupBy?: HistogramGroupBy;
    /** Logarithmic count axis — standard for frequency–magnitude (Gutenberg–Richter). */
    logY?: boolean;
    /** Overlay the reverse-cumulative curve N(≥ value) on a secondary axis. */
    cumulative?: boolean;
    /** Normalize each series: probability density (incremental) / fraction (cumulative). */
    density?: boolean;
}

// --- Seismological grouping helpers -------------------------------------------------

const DEPTH_ORDER = ['Shallow (<70 km)', 'Intermediate (70–300 km)', 'Deep (≥300 km)'];
const MAG_ORDER = ['M < 3', 'M 3–4', 'M 4–5', 'M 5–6', 'M ≥ 6'];

// At most this many sub-series, so the overlay stays legible. Continuous fields are
// quantile-binned into QUANTILE_GROUPS; categorical fields keep their top values and
// fold the rest into "Other".
const MAX_GROUPS = 8;
const QUANTILE_GROUPS = 5;

/** A grouping strategy: assigns each event a label (or null to drop it) plus a display order. */
interface Grouper {
    labelOf: (eq: EarthquakeData) => string | null;
    order: string[];
}

function quantileSorted(sorted: number[], q: number): number {
    if (sorted.length === 0) return NaN;
    if (q <= 0) return sorted[0];
    if (q >= 1) return sorted[sorted.length - 1];
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Build a grouping strategy for any dimension:
 *  - named seismological presets (depth/magnitude class, year);
 *  - categorical fields (strings, or numerics with few distinct values) → by value,
 *    capped at MAX_GROUPS with an "Other" bucket;
 *  - continuous numeric fields → quantile bins with readable range labels.
 * Returns null when the dimension yields nothing usable.
 */
function buildGrouper(earthquakes: EarthquakeData[], groupBy: HistogramGroupBy): Grouper | null {
    if (!groupBy) return null;

    if (groupBy === 'depthClass') {
        return {
            labelOf: (eq) => {
                const d = eq.depth;
                if (typeof d !== 'number' || isNaN(d)) return null;
                return d < 70 ? DEPTH_ORDER[0] : d < 300 ? DEPTH_ORDER[1] : DEPTH_ORDER[2];
            },
            order: DEPTH_ORDER,
        };
    }
    if (groupBy === 'magClass') {
        return {
            labelOf: (eq) => {
                const m = eq.magnitude;
                if (typeof m !== 'number' || isNaN(m)) return null;
                return m < 3 ? MAG_ORDER[0] : m < 4 ? MAG_ORDER[1] : m < 5 ? MAG_ORDER[2] : m < 6 ? MAG_ORDER[3] : MAG_ORDER[4];
            },
            order: MAG_ORDER,
        };
    }
    if (groupBy === 'year') {
        const years = [...new Set(earthquakes.map(eq => new Date(eq.time).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => a - b);
        return {
            labelOf: (eq) => { const y = new Date(eq.time).getFullYear(); return isNaN(y) ? null : String(y); },
            order: years.map(String),
        };
    }

    // Generic field. Inspect values to decide categorical vs. continuous.
    const field = groupBy;
    const numeric: number[] = [];
    const stringCounts = new Map<string, number>();
    let hasNumber = false;
    let hasString = false;
    earthquakes.forEach(eq => {
        const v = eq[field];
        if (typeof v === 'number' && !isNaN(v)) { numeric.push(v); hasNumber = true; }
        else if (v !== null && v !== undefined && v !== '') {
            hasString = true;
            const k = String(v);
            stringCounts.set(k, (stringCounts.get(k) || 0) + 1);
        }
    });

    // Categorical strings (or numerics with very few distinct values).
    const distinctNums = hasNumber ? new Set(numeric) : new Set<number>();
    if (hasString && !hasNumber) {
        const sorted = [...stringCounts.entries()].sort((a, b) => b[1] - a[1]);
        const kept = sorted.slice(0, MAX_GROUPS - 1).map(e => e[0]);
        const keep = new Set(kept);
        const order = [...kept];
        if (sorted.length > kept.length) order.push('Other');
        return {
            labelOf: (eq) => {
                const v = eq[field];
                if (v === null || v === undefined || v === '') return null;
                const k = String(v);
                return keep.has(k) ? k : 'Other';
            },
            order,
        };
    }
    if (hasNumber && distinctNums.size <= MAX_GROUPS) {
        const order = [...distinctNums].sort((a, b) => a - b).map(String);
        return {
            labelOf: (eq) => {
                const v = eq[field];
                return typeof v === 'number' && !isNaN(v) ? String(v) : null;
            },
            order,
        };
    }

    // Continuous numeric → quantile bins.
    if (numeric.length === 0) return null;
    const sorted = [...numeric].sort((a, b) => a - b);
    const rawEdges: number[] = [];
    for (let i = 0; i <= QUANTILE_GROUPS; i++) rawEdges.push(quantileSorted(sorted, i / QUANTILE_GROUPS));
    // Collapse duplicate edges (heavily skewed fields), keeping strictly increasing.
    const edges = rawEdges.filter((e, i) => i === 0 || e > rawEdges[i - 1]);
    if (edges.length < 2) return null;
    const k = edges.length - 1;
    const span = edges[k] - edges[0];
    const decimals = span < 10 ? 2 : span < 100 ? 1 : 0;
    const unit = getFieldUnit(field);
    const order = Array.from({ length: k }, (_, i) => `${edges[i].toFixed(decimals)}–${edges[i + 1].toFixed(decimals)}${unit}`);
    return {
        labelOf: (eq) => {
            const v = eq[field];
            if (typeof v !== 'number' || isNaN(v)) return null;
            let idx = k - 1;
            for (let i = 0; i < k; i++) { if (v < edges[i + 1]) { idx = i; break; } }
            return order[idx];
        },
        order,
    };
}

// --- Value extraction & binning -----------------------------------------------------

/** Single per-event numeric value for a field (null when unavailable). */
function singleValue(eq: EarthquakeData, field: string): number | null {
    if (field === 'time') {
        const t = new Date(eq.time).getTime();
        return isNaN(t) ? null : t;
    }
    if (field === 'hour') return new Date(eq.time).getHours();
    const v = eq[field];
    return typeof v === 'number' && !isNaN(v) ? v : null;
}

/** All values for a field across the catalog (handles 'time', 'hour', 'gap'). */
function fieldValues(earthquakes: EarthquakeData[], field: string): number[] {
    if (field === 'gap') {
        const sorted = earthquakes
            .map(eq => new Date(eq.time).getTime())
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);
        const out: number[] = [];
        for (let i = 1; i < sorted.length; i++) out.push((sorted[i] - sorted[i - 1]) / 60000);
        return out;
    }
    return earthquakes
        .map(eq => singleValue(eq, field))
        .filter((v): v is number => v !== null);
}

interface BinDef { min: number; numBins: number; binSize: number; edges: number[]; }

function makeBins(values: number[], field: string, bins: number): BinDef {
    const isDiscrete = field === 'hour';
    const min = safeMin(values);
    const max = safeMax(values);
    const numBins = isDiscrete ? 24 : bins;
    // Guard against a zero-width range (constant field / single value).
    const binSize = isDiscrete ? 1 : ((max - min) / numBins) || 1;
    const edges = new Array(numBins + 1).fill(0).map((_, i) => min + i * binSize);
    return { min, numBins, binSize, edges };
}

function binCounts(values: number[], { min, numBins, binSize }: BinDef): number[] {
    const hist = new Array(numBins).fill(0);
    values.forEach(v => {
        const idx = Math.min(Math.floor((v - min) / binSize), numBins - 1);
        if (idx >= 0) hist[idx]++;
    });
    return hist;
}

function prettyName(field: string): string {
    if (field === 'hour') return 'Hour of Day';
    if (field === 'gap') return 'Inter-event Time (min)';
    return field.charAt(0).toUpperCase() + field.slice(1);
}

// 10-colour categorical palette (cycles for many groups). Borders are solid; fills
// are made semi-transparent so overlaid bars blend rather than occlude.
const PALETTE = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0891b2', '#7c3aed', '#65a30d', '#db2777', '#0d9488', '#9333ea'];

function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const GenericHistogram = memo(function GenericHistogram({
    earthquakes,
    fields,
    bins = 20,
    title,
    groupBy = '',
    logY = false,
    cumulative = false,
    density = false,
}: GenericHistogramProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);

    const chartOptions: Highcharts.Options = useMemo(() => {
        if (!earthquakes.length || fields.length === 0) return { title: { text: '' } };

        // Grouping splits the PRIMARY field into sub-series. 'gap' can't be grouped
        // per event (it's a between-events quantity), so we ignore grouping for it.
        const grouper = groupBy && fields[0] !== 'gap' ? buildGrouper(earthquakes, groupBy) : null;
        const grouped = !!grouper;

        // Build the series value-arrays plus the field that defines each one's x-domain.
        let seriesValues: { name: string; values: number[]; field: string }[];
        let domainField = '';

        if (grouped && grouper) {
            domainField = fields[0];
            const groups = new Map<string, number[]>();
            earthquakes.forEach(eq => {
                const v = singleValue(eq, domainField);
                if (v === null) return;
                const g = grouper.labelOf(eq);
                if (g === null) return;
                const arr = groups.get(g);
                if (arr) arr.push(v); else groups.set(g, [v]);
            });
            // Preserve the grouper's intended order; drop groups that ended up empty.
            seriesValues = grouper.order
                .filter(name => groups.has(name))
                .map(name => ({ name, values: groups.get(name)!, field: domainField }));
        } else {
            domainField = fields.length === 1 ? fields[0] : '';
            seriesValues = fields
                .map(f => ({ name: prettyName(f), values: fieldValues(earthquakes, f), field: f }))
                .filter(s => s.values.length > 0);
        }

        if (seriesValues.length === 0) return { title: { text: title || 'Distribution Analysis' } };

        // Shared bins when every series lives on the same axis (grouped, or one field);
        // multi-field overlays keep their own per-field bins.
        const useSharedBins = grouped || seriesValues.length === 1;
        const sharedBinDef = useSharedBins
            ? makeBins(seriesValues.flatMap(s => s.values), domainField || seriesValues[0].field, bins)
            : null;

        const binName = (field: string, edges: number[], b: number): string => {
            if (field === 'hour') return `${Math.floor(edges[b])}:00 – ${Math.floor(edges[b]) + 1}:00`;
            if (field === 'time') {
                const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return `${fmt(new Date(edges[b]))} – ${fmt(new Date(edges[b + 1]))}`;
            }
            return `${edges[b].toFixed(2)} – ${edges[b + 1].toFixed(2)}`;
        };

        const series: Highcharts.SeriesOptionsType[] = [];

        seriesValues.forEach((s, i) => {
            const binDef = sharedBinDef ?? makeBins(s.values, s.field, bins);
            const counts = binCounts(s.values, binDef);
            const total = s.values.length || 1;
            const stroke = PALETTE[i % PALETTE.length];
            const fill = hexToRgba(stroke, 0.5);

            // Incremental: density = count / (N · binWidth) → integrates to 1.
            const colData = counts.map((c, b) => {
                let y: number | null = density ? c / (total * binDef.binSize) : c;
                if (logY && (y === 0)) y = null; // log axis can't render zero
                return { x: binDef.edges[b] + binDef.binSize / 2, y, name: binName(s.field, binDef.edges, b) };
            });

            series.push({
                type: 'column',
                name: s.name,
                data: colData,
                color: fill,
                borderColor: stroke,
                borderWidth: 1,
                yAxis: 0,
            });

            // Reverse-cumulative N(≥ lower edge); density → survival fraction.
            if (cumulative) {
                const cum = new Array(binDef.numBins);
                let run = 0;
                for (let b = binDef.numBins - 1; b >= 0; b--) { run += counts[b]; cum[b] = run; }
                const lineData = cum.map((c, b) => {
                    let y: number | null = density ? c / total : c;
                    if (logY && y === 0) y = null;
                    return { x: binDef.edges[b] + binDef.binSize / 2, y };
                });
                series.push({
                    type: 'line',
                    name: `${s.name} (cum ≥)`,
                    data: lineData,
                    color: stroke,
                    yAxis: 1,
                    dashStyle: 'ShortDash',
                    lineWidth: 2,
                    marker: { enabled: false },
                });
            }
        });

        const xField = grouped ? domainField : (fields.length === 1 ? fields[0] : '');
        const isDatetime = xField === 'time';
        const xTitle = xField ? `${prettyName(xField)}${getFieldUnit(xField)}` : 'Value';
        const yType = logY ? 'logarithmic' : 'linear';

        const yAxis: Highcharts.YAxisOptions[] = [
            {
                type: yType,
                title: { text: density ? 'Probability density' : 'Count', style: { color: '#4B5563', fontWeight: '500' } },
                gridLineWidth: 0,
                labels: { style: { color: '#6B7280' } },
            },
        ];
        if (cumulative) {
            yAxis.push({
                type: yType,
                opposite: true,
                title: { text: density ? 'Cumulative fraction (≥)' : 'Cumulative N (≥)', style: { color: '#4B5563', fontWeight: '500' } },
                gridLineWidth: 0,
                labels: { style: { color: '#6B7280' } },
            });
        }

        return {
            chart: {
                type: 'column',
                // No fixed height — fills its container (see containerProps below) so the
                // panel grows with the available space instead of being pinned at 400px.
                backgroundColor: 'transparent',
                style: { fontFamily: 'Instrument Sans, sans-serif' },
                spacing: [20, 20, 20, 20],
                zooming: { type: 'x' },
            },
            title: { text: title || 'Distribution Analysis', style: { fontSize: '18px', fontWeight: '600', color: '#111827' } },
            subtitle: grouped ? { text: `Distribution of ${prettyName(domainField)}, split into ${seriesValues.length} group(s)`, style: { color: '#6B7280', fontSize: '12px' } } : undefined,
            credits: { enabled: false },
            xAxis: {
                type: isDatetime ? 'datetime' : 'linear',
                title: { text: xTitle, style: { color: '#4B5563', fontWeight: '500' } },
                crosshair: { color: '#9CA3AF', dashStyle: 'Dash', width: 1 },
                gridLineWidth: 0,
                lineColor: '#E5E7EB',
                tickColor: '#E5E7EB',
                labels: { style: { color: '#6B7280' } },
            },
            yAxis,
            legend: {
                enabled: true,
                itemStyle: { color: '#374151', fontSize: '13px', fontWeight: '500' },
                itemHoverStyle: { color: '#111827' },
            },
            tooltip: {
                useHTML: true,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                borderColor: '#E5E7EB',
                borderRadius: 8,
                shadow: true,
                padding: 12,
                style: { color: '#374151', fontSize: '13px' },
                pointFormatter: function (this: any) {
                    const y = typeof this.y === 'number'
                        ? (density ? this.y.toExponential(2) : this.y.toLocaleString())
                        : '—';
                    const bin = this.name ? `<div style="font-weight:600;color:#111827;margin-bottom:4px;">${this.name}</div>` : '';
                    return `${bin}<span style="color:${this.color}">●</span> ${this.series.name}: <b>${y}</b>`;
                },
            },
            plotOptions: {
                column: {
                    grouping: false, // overlaid: bars share the x slot, transparency reveals overlap
                    shadow: false,
                    borderRadius: 1,
                    pointPadding: 0,
                    groupPadding: 0.05,
                    borderWidth: 1,
                },
                series: { turboThreshold: 0 },
            },
            series,
        };
    }, [earthquakes, fields, bins, title, groupBy, logY, cumulative, density]);

    return (
        <div className="w-full h-full">
            <HighchartsReact
                highcharts={Highcharts}
                options={chartOptions}
                ref={chartRef}
                containerProps={{ style: { height: '100%', width: '100%' } }}
                key={`${fields.join('-')}-${bins}-${groupBy}-${logY}-${cumulative}-${density}`}
            />
        </div>
    );
});

export default GenericHistogram;
