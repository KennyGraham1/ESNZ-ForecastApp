'use client';

import { useRef, useMemo, useEffect, useState, memo } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import Highcharts from '@/utils/highchartsInit';
import HighchartsReact from 'highcharts-react-official';
import ChartExportButtons from './ChartExportButtons';
import { stratifiedSample } from '@/utils/dataOptimization';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold } from '@/config/performance';

interface MapProps {
    earthquakes: EarthquakeData[];
    onPointClick?: (earthquake: EarthquakeData) => void;
}

// Depth ranges — labels and bounds only; colours come from the active palette.
const DEPTH_CATEGORIES = [
    { label: '< 15',      min: -Infinity, max: 15       },
    { label: '15 – 40',   min: 15,        max: 40       },
    { label: '40 – 100',  min: 40,        max: 100      },
    { label: '100 – 200', min: 100,       max: 200      },
    { label: '≥ 200',     min: 200,       max: Infinity },
];

// Magnitude size scale
const MAG_SIZES = [
    { label: '>= 7', min: 7,          radius: 20 },
    { label: '6 – 7', min: 6,         radius: 14 },
    { label: '5 – 6', min: 5,         radius: 10 },
    { label: '4 – 5', min: 4,         radius: 7  },
    { label: '3 – 4', min: 3,         radius: 5  },
    { label: '2 – 3', min: 2,         radius: 3  },
    { label: '< 2',   min: -Infinity, radius: 2  },
];

// ── Depth colour palettes ─────────────────────────────────────────────────────

export type MapDepthPaletteName = 'ocean' | 'heat' | 'viridis' | 'magma' | 'cividis' | 'plasma';

interface DepthColor { color: string; border: string; }

// 5 entries per palette — index 0 = shallowest, index 4 = deepest.
const MAP_DEPTH_PALETTES: Record<MapDepthPaletteName, DepthColor[]> = {
    ocean: [       // cyan → teal → dark navy (original scheme)
        { color: '#00e5ff', border: '#00b8cc' },
        { color: '#26c6da', border: '#0097a7' },
        { color: '#00838f', border: '#005f6b' },
        { color: '#00695c', border: '#004d40' },
        { color: '#1a3a4a', border: '#0d1f28' },
    ],
    heat: [        // warm (shallow) → cool (deep) — classic seismology
        { color: '#ef4444', border: '#b91c1c' },
        { color: '#f97316', border: '#c2410c' },
        { color: '#eab308', border: '#a16207' },
        { color: '#22c55e', border: '#15803d' },
        { color: '#3b82f6', border: '#1d4ed8' },
    ],
    viridis: [     // yellow → green → teal → blue → purple
        { color: '#fde725', border: '#c8b820' },
        { color: '#5ec962', border: '#4aab52' },
        { color: '#21918c', border: '#17756e' },
        { color: '#3b528b', border: '#2e3f70' },
        { color: '#440154', border: '#2d0044' },
    ],
    magma: [       // pale yellow → orange → red → dark purple → near-black
        { color: '#fcffa4', border: '#d4d488' },
        { color: '#fc8961', border: '#d4714f' },
        { color: '#bb3754', border: '#922b42' },
        { color: '#56106e', border: '#3d0950' },
        { color: '#0d0221', border: '#060110' },
    ],
    cividis: [     // yellow → grey → dark blue (colorblind-friendly)
        { color: '#fee838', border: '#d4c230' },
        { color: '#a2a475', border: '#848770' },
        { color: '#4c5473', border: '#3b4060' },
        { color: '#252a3a', border: '#14192a' },
        { color: '#00204d', border: '#001038' },
    ],
    plasma: [      // yellow → orange → pink → purple → dark blue
        { color: '#f0f921', border: '#c8c91a' },
        { color: '#fc8961', border: '#d4714f' },
        { color: '#cc4778', border: '#a33560' },
        { color: '#7201a8', border: '#5a0188' },
        { color: '#0d0887', border: '#07005e' },
    ],
};

const PALETTE_LABELS: Record<MapDepthPaletteName, string> = {
    ocean:   'Ocean',
    heat:    'Heat',
    viridis: 'Viridis',
    magma:   'Magma',
    cividis: 'Cividis',
    plasma:  'Plasma',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDepthCategoryIndex(depth: number): number {
    const idx = DEPTH_CATEGORIES.findIndex(c => depth >= c.min && depth < c.max);
    return idx === -1 ? DEPTH_CATEGORIES.length - 1 : idx;
}

function getMagnitudeRadius(mag: number): number {
    return (MAG_SIZES.find(m => mag >= m.min) ?? MAG_SIZES[MAG_SIZES.length - 1]).radius;
}

// ── Component ─────────────────────────────────────────────────────────────────

function MapComponent({ earthquakes, onPointClick }: MapProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);
    const [nzMapGeometry, setNzMapGeometry] = useState<any>(null);

    // Which depth category indices are currently hidden (toggled off by the user).
    const [hiddenDepths, setHiddenDepths] = useState<number[]>([]);

    // Active colour palette for depth colouring.
    const [activePalette, setActivePalette] = useState<MapDepthPaletteName>('ocean');

    // Ref so useMemo can always read the latest palette without it being a dep.
    // This way palette changes do NOT trigger chart.update() — which crashes
    // in Highcharts mappoint series by accessing point.graphic before it exists.
    // Instead, palette changes are applied via series.update() in a useEffect.
    const activePaletteRef = useRef<MapDepthPaletteName>('ocean');
    activePaletteRef.current = activePalette;

    const toggleDepth = (idx: number) => {
        setHiddenDepths(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    // Load New Zealand map data
    useEffect(() => {
        const loadMapData = async () => {
            try {
                const mapModule = await import('@highcharts/map-collection/countries/nz/nz-all.geo.json');
                const nzMap = mapModule.default || mapModule;
                setNzMapGeometry(nzMap);
            } catch (error) {
                console.error('Failed to load New Zealand map:', error);
            }
        };
        loadMapData();
    }, []);

    // Fallback: ensure Kermadec zoom is applied once the chart is in the DOM.
    useEffect(() => {
        if (!nzMapGeometry) return;
        const timer = setTimeout(() => {
            const chart = (chartRef.current as any)?.chart;
            const mapView = chart?.mapView;
            if (!mapView || typeof mapView.lonLatToProjectedUnits !== 'function') return;
            try {
                const sw = mapView.lonLatToProjectedUnits({ lon: 163, lat: -49 });
                const ne = mapView.lonLatToProjectedUnits({ lon: 179.9, lat: -30 });
                mapView.fitToBounds({ x1: sw.x, y1: sw.y, x2: ne.x, y2: ne.y }, '2%');
            } catch (e) {
                console.error('Map fitToBounds fallback error:', e);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [nzMapGeometry]);

    const options: Highcharts.Options = useMemo(() => {
        if (!nzMapGeometry) {
            return {
                chart: { height: 600 },
                title: { text: '' },
                credits: { enabled: false },
                series: []
            };
        }

        if (!earthquakes || earthquakes.length === 0) {
            return {
                chart: { map: nzMapGeometry, height: 600, backgroundColor: '#a8d8ea' },
                title: { text: '' },
                credits: { enabled: false },
                series: [{
                    type: 'map',
                    name: 'New Zealand',
                    data: [],
                    borderColor: '#8aabb8',
                    nullColor: '#e8dcc8',
                    showInLegend: false
                }]
            };
        }

        // OPTIMIZATION: Use stratified sampling to preserve distribution
        const maxPoints = getOptimalSamplingThreshold('MAP');
        let processedEarthquakes = earthquakes;

        if (earthquakes.length > SAMPLING_CONFIG.MAP.threshold) {
            processedEarthquakes = stratifiedSample(earthquakes, maxPoints);
            console.log(`📊 Map: Stratified sample ${processedEarthquakes.length} points from ${earthquakes.length} total`);
        }

        // Read palette from ref so activePalette is NOT a useMemo dep —
        // palette changes must not trigger chart.update().
        const paletteColors = MAP_DEPTH_PALETTES[activePaletteRef.current];

        // Build per-depth-category data arrays.
        // lineColor is intentionally NOT included per-point; it lives at the
        // series level so palette changes can update it via series.update()
        // without touching individual point objects.
        const categoryData: Record<number, any[]> = {};
        DEPTH_CATEGORIES.forEach((_, i) => { categoryData[i] = []; });

        processedEarthquakes.forEach((eq, index) => {
            const idx = getDepthCategoryIndex(eq.depth);
            categoryData[idx].push({
                lon: eq.longitude,
                lat: eq.latitude,
                magnitude: eq.magnitude,
                depth: eq.depth,
                time: eq.time,
                locality: eq.locality,
                eventID: eq.eventID,
                index,
                marker: {
                    radius: getMagnitudeRadius(eq.magnitude),
                    fillOpacity: 0.75,
                    lineWidth: 0.5,
                    // lineColor lives at series level (see series config below)
                }
            });
        });

        const tooltipFormatter = function (this: any) {
            const point = this.point;
            if (!point.magnitude) return '';
            const timeStr = point.time instanceof Date
                ? point.time.toLocaleString()
                : new Date(point.time).toLocaleString();
            return `
                <div style="padding: 12px; min-width: 200px;">
                    <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px; color: #1f2937; border-bottom: 2px solid #00838f; padding-bottom: 6px;">
                        M${point.magnitude.toFixed(1)}
                    </div>
                    <div style="font-size: 13px; color: #4b5563; line-height: 1.6;">
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Event ID:</strong> ${point.eventID || 'N/A'}</p>
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Time:</strong> ${timeStr}</p>
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Depth:</strong> ${point.depth.toFixed(1)} km</p>
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Location:</strong> ${point.locality}</p>
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Lat:</strong> ${point.lat.toFixed(4)}°</p>
                        <p style="margin: 4px 0;"><strong style="color: #374151;">Lon:</strong> ${point.lon.toFixed(4)}°</p>
                    </div>
                </div>
            `;
        };

        const fitToNZWithKermadec = function (this: any) {
            const mapView = this.mapView;
            if (!mapView || typeof mapView.lonLatToProjectedUnits !== 'function') return;
            try {
                const sw = mapView.lonLatToProjectedUnits({ lon: 163, lat: -49 });
                const ne = mapView.lonLatToProjectedUnits({ lon: 179.9, lat: -30 });
                mapView.fitToBounds({ x1: sw.x, y1: sw.y, x2: ne.x, y2: ne.y }, '2%');
            } catch (e) {
                console.error('Map fitToBounds error:', e);
            }
        };

        const chartConfig: any = {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#a8d8ea',
                height: 600,
                // Explicit animation: false here (belt-and-suspenders on top of the
                // global Highcharts.setOptions in Providers.tsx) — prevents the
                // "Cannot read properties of undefined (reading 'graphic')" crash
                // that occurs when chart.update() redraws series before their DOM
                // elements exist.
                animation: false,
                events: { load: fitToNZWithKermadec },
            },
            boost: { enabled: false },
            title: { text: '' },
            credits: { enabled: false },
            legend: { enabled: false },
            mapNavigation: {
                enabled: true,
                enableMouseWheelZoom: true,
                buttonOptions: {
                    verticalAlign: 'bottom',
                    theme: {
                        fill: 'white',
                        stroke: '#d1d5db',
                        'stroke-width': 1,
                        r: 4,
                        style: { color: '#374151' },
                        states: {
                            hover: { fill: '#f3f4f6' },
                            select: { fill: '#e5e7eb' }
                        }
                    }
                }
            },
            tooltip: {
                useHTML: true,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderColor: '#e5e7eb',
                borderRadius: 8,
                borderWidth: 1,
                shadow: { color: 'rgba(0,0,0,0.1)', offsetX: 0, offsetY: 2, opacity: 0.5, width: 4 },
                padding: 0,
                formatter: tooltipFormatter
            },
            plotOptions: {
                series: { animation: false, turboThreshold: 50000 },
                mappoint: {
                    point: {
                        events: {
                            click: function (this: any) {
                                const point = this;
                                if (onPointClick && point.index !== undefined) {
                                    onPointClick(earthquakes[point.index]);
                                }
                            }
                        }
                    }
                }
            },
            series: [
                {
                    type: 'map',
                    name: 'New Zealand',
                    borderColor: '#8aabb8',
                    borderWidth: 1,
                    nullColor: '#e8dcc8',
                    showInLegend: false,
                    enableMouseTracking: false,
                    states: { hover: { brightness: 0.05 } }
                },
                ...DEPTH_CATEGORIES.map((cat, i) => ({
                    type: 'mappoint',
                    name: cat.label,
                    color: paletteColors[i].color,
                    // Visibility is controlled via series.setVisible() in a
                    // useEffect — NOT via chart.update() — to avoid the
                    // 'graphic' animation crash.
                    showInLegend: false,
                    marker: {
                        symbol: 'circle',
                        fillOpacity: 0.75,
                        lineWidth: 0.5,
                        lineColor: paletteColors[i].border,
                    },
                    data: categoryData[i]
                }))
            ],
            accessibility: {
                enabled: true,
                description: 'Interactive map showing earthquake locations in New Zealand',
                point: { valueSuffix: ' magnitude' }
            }
        };

        return chartConfig;
    // activePalette and hiddenDepths are intentionally omitted:
    //   • activePalette → applied via series.update() in a useEffect (no chart.update())
    //   • hiddenDepths  → applied via series.setVisible() in a useEffect (no chart.update())
    // Both paths avoid the mappoint 'graphic' crash that chart.update() causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [earthquakes, onPointClick, nzMapGeometry]);

    // ── Palette change: update series colours without chart.update() ─────────
    // series.update({ color }, false) updates the existing series objects in-place,
    // preserving point.graphic references. chart.update() would recreate mappoint
    // series from scratch, giving points no graphic → crash in drawPoints().
    useEffect(() => {
        const chart = (chartRef.current as any)?.chart;
        if (!chart) return;
        const colors = MAP_DEPTH_PALETTES[activePalette];
        DEPTH_CATEGORIES.forEach((_, i) => {
            const series = chart.series[i + 1]; // index 0 is the base map layer
            if (!series) return;
            series.update(
                { color: colors[i].color, marker: { lineColor: colors[i].border } },
                false  // batch — no redraw yet
            );
        });
        chart.redraw(false); // single pass, no animation
    }, [activePalette]);

    // ── Depth toggle: show/hide series without chart.update() ────────────────
    // Runs when the user toggles a depth range OR after a data rebuild (options
    // dep) to re-apply any previously hidden ranges.
    useEffect(() => {
        const chart = (chartRef.current as any)?.chart;
        if (!chart) return;
        let changed = false;
        DEPTH_CATEGORIES.forEach((_, i) => {
            const series = chart.series[i + 1];
            if (!series) return;
            const shouldBeVisible = !hiddenDepths.includes(i);
            if (series.visible !== shouldBeVisible) {
                series.setVisible(shouldBeVisible, false); // batch
                changed = true;
            }
        });
        if (changed) chart.redraw(false);
    }, [hiddenDepths, options]);

    if (!nzMapGeometry) {
        return (
            <div className="h-[600px] w-full rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading map data...</p>
                </div>
            </div>
        );
    }

    const paletteColors = MAP_DEPTH_PALETTES[activePalette];

    return (
        <div className="w-full">
            <div className="flex gap-3 items-start">
                {/* Map chart */}
                <div className="flex-1 rounded-lg overflow-hidden border border-gray-300" style={{ minWidth: 0 }}>
                    <HighchartsReact
                        highcharts={Highcharts}
                        options={options}
                        ref={chartRef}
                        constructorType={'mapChart'}
                        updateArgs={[true, true, false]}
                    />
                </div>

                {/* Legend panel */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 text-xs select-none shrink-0 w-40">

                    {/* ── Magnitude ── */}
                    <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Magnitude</p>
                    <div className="flex flex-col gap-1.5 mb-4">
                        {MAG_SIZES.map(m => (
                            <div key={m.label} className="flex items-center gap-2">
                                <div className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <div
                                        style={{
                                            width: m.radius * 2,
                                            height: m.radius * 2,
                                            borderRadius: '50%',
                                            border: '1px solid #9ca3af',
                                            backgroundColor: 'white',
                                            flexShrink: 0,
                                        }}
                                    />
                                </div>
                                <span className="text-gray-600">{m.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* ── Depth — clickable to filter ── */}
                    <p className="font-bold text-gray-700 mb-0.5 text-[11px] uppercase tracking-wide">Depth (km)</p>
                    <p className="text-[10px] text-gray-400 mb-2">Click to show/hide</p>
                    <div className="flex flex-col gap-1">
                        {DEPTH_CATEGORIES.map((cat, i) => {
                            const isHidden = hiddenDepths.includes(i);
                            const c = paletteColors[i];
                            return (
                                <button
                                    key={cat.label}
                                    onClick={() => toggleDepth(i)}
                                    title={isHidden ? 'Click to show this depth range' : 'Click to hide this depth range'}
                                    className={`flex items-center gap-2 w-full text-left rounded px-1 py-0.5 transition-all cursor-pointer
                                        ${isHidden ? 'opacity-35' : 'opacity-100 hover:bg-gray-50'}`}
                                >
                                    <span
                                        className="rounded-full shrink-0 transition-all"
                                        style={{
                                            width: 14,
                                            height: 14,
                                            backgroundColor: isHidden ? '#d1d5db' : c.color,
                                            border: `1.5px solid ${isHidden ? '#9ca3af' : c.border}`,
                                        }}
                                    />
                                    <span className={`transition-colors ${isHidden ? 'text-gray-400 line-through decoration-gray-400' : 'text-gray-600'}`}>
                                        {cat.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {hiddenDepths.length > 0 && (
                        <button
                            onClick={() => setHiddenDepths([])}
                            className="mt-1.5 text-[10px] text-blue-500 hover:text-blue-700 underline"
                        >
                            Show all
                        </button>
                    )}

                    {/* ── Colour theme ── */}
                    <div className="mt-4 pt-3 border-t border-gray-200">
                        <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Colour Theme</p>
                        <div className="flex flex-col gap-1">
                            {(Object.entries(MAP_DEPTH_PALETTES) as [MapDepthPaletteName, DepthColor[]][]).map(([name, colors]) => (
                                <button
                                    key={name}
                                    onClick={() => setActivePalette(name)}
                                    className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors w-full
                                        ${activePalette === name
                                            ? 'bg-blue-50 ring-1 ring-blue-300'
                                            : 'hover:bg-gray-50'}`}
                                >
                                    {/* Mini swatch: 5 dots representing shallow→deep */}
                                    <div className="flex gap-0.5 shrink-0">
                                        {colors.map((c, i) => (
                                            <span
                                                key={i}
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    backgroundColor: c.color,
                                                    border: `1px solid ${c.border}`,
                                                    display: 'inline-block',
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-gray-600 text-[10px]">
                                        {PALETTE_LABELS[name]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <ChartExportButtons
                chartRef={chartRef}
                data={earthquakes}
                filename="earthquake-map"
            />
        </div>
    );
}

export default memo(MapComponent);
