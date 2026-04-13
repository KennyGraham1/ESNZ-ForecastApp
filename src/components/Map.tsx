'use client';

import { useRef, useMemo, useState, memo, useEffect, useCallback } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stratifiedSample } from '@/utils/dataOptimization';
import { SAMPLING_CONFIG, getOptimalSamplingThreshold } from '@/config/performance';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapProps {
    earthquakes: EarthquakeData[];
    onPointClick?: (earthquake: EarthquakeData) => void;
}

// ── Depth categories ──────────────────────────────────────────────────────────

const DEPTH_CATEGORIES = [
    { label: '< 15',      min: -Infinity, max: 15       },
    { label: '15 – 40',   min: 15,        max: 40       },
    { label: '40 – 100',  min: 40,        max: 100      },
    { label: '100 – 200', min: 100,       max: 200      },
    { label: '≥ 200',     min: 200,       max: Infinity },
] as const;

// ── Magnitude → marker radius ─────────────────────────────────────────────────

const MAG_SIZES = [
    { label: '>= 7', min: 7,          radius: 20 },
    { label: '6 – 7', min: 6,         radius: 14 },
    { label: '5 – 6', min: 5,         radius: 10 },
    { label: '4 – 5', min: 4,         radius: 7  },
    { label: '3 – 4', min: 3,         radius: 5  },
    { label: '2 – 3', min: 2,         radius: 3  },
    { label: '< 2',   min: -Infinity, radius: 2  },
] as const;

// ── Colour palettes ───────────────────────────────────────────────────────────

export type MapDepthPaletteName = 'ocean' | 'heat' | 'viridis' | 'magma' | 'cividis' | 'plasma';

interface DepthColor { color: string; border: string; }

// 5 entries per palette — index 0 = shallowest, index 4 = deepest.
const MAP_DEPTH_PALETTES: Record<MapDepthPaletteName, DepthColor[]> = {
    ocean: [
        { color: '#00e5ff', border: '#00b8cc' },
        { color: '#26c6da', border: '#0097a7' },
        { color: '#00838f', border: '#005f6b' },
        { color: '#00695c', border: '#004d40' },
        { color: '#1a3a4a', border: '#0d1f28' },
    ],
    heat: [
        { color: '#ef4444', border: '#b91c1c' },
        { color: '#f97316', border: '#c2410c' },
        { color: '#eab308', border: '#a16207' },
        { color: '#22c55e', border: '#15803d' },
        { color: '#3b82f6', border: '#1d4ed8' },
    ],
    viridis: [
        { color: '#fde725', border: '#c8b820' },
        { color: '#5ec962', border: '#4aab52' },
        { color: '#21918c', border: '#17756e' },
        { color: '#3b528b', border: '#2e3f70' },
        { color: '#440154', border: '#2d0044' },
    ],
    magma: [
        { color: '#fcffa4', border: '#d4d488' },
        { color: '#fc8961', border: '#d4714f' },
        { color: '#bb3754', border: '#922b42' },
        { color: '#56106e', border: '#3d0950' },
        { color: '#0d0221', border: '#060110' },
    ],
    cividis: [
        { color: '#fee838', border: '#d4c230' },
        { color: '#a2a475', border: '#848770' },
        { color: '#4c5473', border: '#3b4060' },
        { color: '#252a3a', border: '#14192a' },
        { color: '#00204d', border: '#001038' },
    ],
    plasma: [
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

// Full NZ + Kermadecs bounding box
const NZ_BOUNDS: L.LatLngBoundsExpression = [[-49, 163], [-28, 183]];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getDepthCategoryIndex(depth: number): number {
    const idx = DEPTH_CATEGORIES.findIndex(c => depth >= c.min && depth < c.max);
    return idx === -1 ? DEPTH_CATEGORIES.length - 1 : idx;
}

function getMagnitudeRadius(mag: number): number {
    return (MAG_SIZES.find(m => mag >= m.min) ?? MAG_SIZES[MAG_SIZES.length - 1]).radius;
}

/** Build an HTML tooltip string for a single earthquake. */
function buildTooltipHTML(eq: EarthquakeData): string {
    const timeStr = eq.time instanceof Date
        ? eq.time.toLocaleString()
        : new Date(eq.time).toLocaleString();

    return `
        <div style="min-width:200px;font-family:'Inter','Segoe UI',sans-serif;padding:2px;">
            <div style="font-weight:700;font-size:18px;padding-bottom:6px;margin-bottom:8px;
                        border-bottom:2px solid #00838f;color:#1f2937;">
                M${eq.magnitude.toFixed(1)}
            </div>
            <div style="font-size:13px;color:#4b5563;line-height:1.7;">
                <p style="margin:3px 0;"><strong style="color:#374151;">Event ID:</strong> ${eq.eventID || 'N/A'}</p>
                <p style="margin:3px 0;"><strong style="color:#374151;">Time:</strong> ${timeStr}</p>
                <p style="margin:3px 0;"><strong style="color:#374151;">Depth:</strong> ${eq.depth.toFixed(1)} km</p>
                <p style="margin:3px 0;"><strong style="color:#374151;">Location:</strong> ${eq.locality ?? 'N/A'}</p>
                <p style="margin:3px 0;"><strong style="color:#374151;">Lat:</strong> ${eq.latitude.toFixed(4)}°</p>
                <p style="margin:3px 0;"><strong style="color:#374151;">Lon:</strong> ${eq.longitude.toFixed(4)}°</p>
            </div>
        </div>
    `;
}

// ── Inner Leaflet sub-components ──────────────────────────────────────────────

/** Captures the live Leaflet map instance into a parent-provided ref. */
function MapInstanceCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
    const map = useMap();
    useEffect(() => {
        mapRef.current = map;
        // Fit to NZ on the very first mount
        map.fitBounds(NZ_BOUNDS, { animate: false });
    }, [map, mapRef]);
    return null;
}

interface EarthquakeLayerProps {
    earthquakes: EarthquakeData[];
    /** Current palette colours (5 entries). */
    palette: DepthColor[];
    /** Depth category indices that should be hidden. */
    hiddenDepths: number[];
    /** Stable ref to the current onPointClick to avoid rebuilding markers on callback identity change. */
    onPointClickRef: React.MutableRefObject<((eq: EarthquakeData) => void) | undefined>;
}

/**
 * Manages five separate Leaflet LayerGroups — one per depth category.
 *
 * Two separate effects are used:
 *  1. Rebuild everything when earthquake data or the colour palette changes.
 *  2. Only show/hide group layers when `hiddenDepths` toggles — zero marker rebuilds.
 */
function EarthquakeLayer({
    earthquakes,
    palette,
    hiddenDepths,
    onPointClickRef,
}: EarthquakeLayerProps) {
    const map = useMap();

    // One LayerGroup per depth category — persisted across renders.
    const groupsRef = useRef<L.LayerGroup[]>([]);

    // ── Effect 1: Rebuild markers when data or palette changes ────────────────
    useEffect(() => {
        // Remove and discard existing groups.
        groupsRef.current.forEach(g => g.removeFrom(map));
        groupsRef.current = [];

        if (earthquakes.length === 0) return;

        // A single shared canvas renderer for the whole layer set.
        // This gives a massive performance boost for large datasets (>1 k points)
        // by bypassing per-element SVG DOM nodes entirely.
        const renderer = L.canvas({ padding: 0.5 });

        // Create one group per category — already added to the map so that
        // hiddenDepths effect can simply call addTo/removeFrom without caring
        // about whether the group was ever rendered.
        const groups: L.LayerGroup[] = DEPTH_CATEGORIES.map(() => L.layerGroup().addTo(map));

        earthquakes.forEach(eq => {
            const depthIdx = getDepthCategoryIndex(eq.depth);
            const { color, border } = palette[depthIdx];
            const radius = getMagnitudeRadius(eq.magnitude);

            const wrappedLon = eq.longitude < 0 ? eq.longitude + 360 : eq.longitude;
            const circle = L.circleMarker([eq.latitude, wrappedLon], {
                renderer,
                radius,
                fillColor: color,
                color: border,
                weight: 0.8,
                fillOpacity: 0.78,
                // Prevent click/mouseover from bubbling to the map tile layer.
                bubblingMouseEvents: false,
            });

            circle.bindTooltip(buildTooltipHTML(eq), {
                sticky: true,
                className: 'eq-map-tooltip',
                offset: [12, 0],
            });

            // Hover highlight
            circle.on('mouseover', function (this: L.CircleMarker) {
                this.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 1 });
                this.bringToFront();
            });
            circle.on('mouseout', function (this: L.CircleMarker) {
                this.setStyle({ weight: 0.8, color: border, fillOpacity: 0.78 });
            });

            // Click — always read from ref so callback identity changes never
            // trigger a full marker rebuild.
            circle.on('click', e => {
                L.DomEvent.stopPropagation(e);
                onPointClickRef.current?.(eq);
            });

            groups[depthIdx].addLayer(circle);
        });

        groupsRef.current = groups;

        return () => {
            groups.forEach(g => g.removeFrom(map));
        };
        // onPointClickRef is intentionally excluded — it is a stable ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, earthquakes, palette]);

    // ── Effect 2: Toggle group visibility — NO marker rebuild ─────────────────
    useEffect(() => {
        groupsRef.current.forEach((group, i) => {
            if (!group) return;
            if (hiddenDepths.includes(i)) {
                group.removeFrom(map);
            } else {
                group.addTo(map);
            }
        });
    }, [map, hiddenDepths]);

    return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

function MapComponent({ earthquakes, onPointClick }: MapProps) {
    const mapRef = useRef<L.Map | null>(null);

    // Keep a stable ref for the callback so EarthquakeLayer never rebuilds
    // markers purely because the parent re-renders and creates a new function.
    const onPointClickRef = useRef(onPointClick);
    onPointClickRef.current = onPointClick;

    const [hiddenDepths, setHiddenDepths] = useState<number[]>([]);
    const [activePalette, setActivePalette] = useState<MapDepthPaletteName>('ocean');
    const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);

    // ── Stratified sampling for large datasets ────────────────────────────────
    const processedEarthquakes = useMemo(() => {
        if (earthquakes.length > SAMPLING_CONFIG.MAP.threshold) {
            const maxPoints = getOptimalSamplingThreshold('MAP');
            console.log(`📊 Map: Stratified sample ${maxPoints} from ${earthquakes.length} total`);
            return stratifiedSample(earthquakes, maxPoints);
        }
        return earthquakes;
    }, [earthquakes]);

    const paletteColors = MAP_DEPTH_PALETTES[activePalette];

    const toggleDepth = useCallback((idx: number) => {
        setHiddenDepths(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    }, []);

    // ── Fit-to-bounds helpers ─────────────────────────────────────────────────

    const fitToData = useCallback(() => {
        const map = mapRef.current;
        if (!map || earthquakes.length === 0) return;

        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        for (const eq of earthquakes) {
            const wrappedLon = eq.longitude < 0 ? eq.longitude + 360 : eq.longitude;
            if (eq.latitude  < minLat) minLat = eq.latitude;
            if (eq.latitude  > maxLat) maxLat = eq.latitude;
            if (wrappedLon < minLon) minLon = wrappedLon;
            if (wrappedLon > maxLon) maxLon = wrappedLon;
        }
        const pad = 0.5;
        map.fitBounds(
            [[minLat - pad, minLon - pad], [maxLat + pad, maxLon + pad]],
            { animate: true, padding: [10, 10] }
        );
    }, [earthquakes]);

    const fitToNZ = useCallback(() => {
        mapRef.current?.fitBounds(NZ_BOUNDS, { animate: true });
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="w-full">
            <div className="flex gap-3 items-start">

                {/* ── Leaflet Map ─────────────────────────────────────────── */}
                <div
                    className="flex-1 rounded-lg overflow-hidden border border-gray-300 shadow-sm"
                    style={{ height: 600, minWidth: 0 }}
                >
                    <MapContainer
                        // Initial view; MapInstanceCapture will call fitBounds on mount.
                        center={[-41, 174]}
                        zoom={5}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl
                        attributionControl
                    >
                        {/* Capture the live map instance into mapRef */}
                        <MapInstanceCapture mapRef={mapRef} />

                        {/* ── Tile layers ─────────────────────────────────── */}
                        <LayersControl position="topright">
                            <LayersControl.BaseLayer checked name="CartoDB Light">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                    subdomains="abcd"
                                    maxZoom={19}
                                />
                            </LayersControl.BaseLayer>

                            <LayersControl.BaseLayer name="OpenStreetMap">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    maxZoom={19}
                                />
                            </LayersControl.BaseLayer>

                            <LayersControl.BaseLayer name="Satellite (Esri)">
                                <TileLayer
                                    attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    maxZoom={17}
                                />
                            </LayersControl.BaseLayer>

                            <LayersControl.BaseLayer name="CartoDB Dark">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                    subdomains="abcd"
                                    maxZoom={19}
                                />
                            </LayersControl.BaseLayer>
                        </LayersControl>

                        {/* ── Earthquake markers ───────────────────────────── */}
                        <EarthquakeLayer
                            earthquakes={processedEarthquakes}
                            palette={paletteColors}
                            hiddenDepths={hiddenDepths}
                            onPointClickRef={onPointClickRef}
                        />
                    </MapContainer>
                </div>

                {/* ── Legend panel ────────────────────────────────────────── */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 text-xs select-none shrink-0 w-40">

                    {/* View controls */}
                    <div className="flex flex-col gap-1 mb-4">
                        <button
                            onClick={fitToData}
                            title="Zoom to fit all displayed earthquake data"
                            className="flex items-center gap-1.5 w-full rounded px-2 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 font-medium transition-colors"
                        >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                            Fit to Data
                        </button>
                        <button
                            onClick={fitToNZ}
                            title="Reset to full New Zealand view"
                            className="flex items-center gap-1.5 w-full rounded px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 font-medium transition-colors"
                        >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Reset NZ View
                        </button>
                    </div>
                    <div className="border-t border-gray-100 mb-3" />

                    {/* Event count */}
                    <p className="text-[10px] text-gray-400 mb-3 text-center">
                        {processedEarthquakes.length.toLocaleString()} events displayed
                        {earthquakes.length > SAMPLING_CONFIG.MAP.threshold && (
                            <span className="block text-orange-400">
                                (sampled from {earthquakes.length.toLocaleString()})
                            </span>
                        )}
                    </p>

                    {/* Magnitude legend */}
                    <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Magnitude</p>
                    <div className="flex flex-col gap-1.5 mb-4">
                        {MAG_SIZES.filter(m => m.min >= 3).map(m => (
                            <div key={m.label} className="flex items-center gap-2">
                                <div className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <div
                                        style={{
                                            width:  m.radius * 2,
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

                    {/* Depth filter — click to show/hide */}
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
                                            width:  14,
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

                    {/* Colour theme */}
                    <div className="mt-4 pt-3 border-t border-gray-200 relative mb-4">
                        <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Colour Theme</p>
                        <button
                            onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                            className="flex items-center justify-between w-full rounded px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex gap-0.5 shrink-0">
                                    {MAP_DEPTH_PALETTES[activePalette].map((c, i) => (
                                        <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color, border: `1px solid ${c.border}`, display: 'inline-block' }} />
                                    ))}
                                </div>
                                <span className="text-[10px] uppercase font-medium tracking-wide text-gray-600">{PALETTE_LABELS[activePalette]}</span>
                            </div>
                            <svg className={`w-3 h-3 text-gray-500 transition-transform ${isThemeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        
                        {isThemeDropdownOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-[1000] py-1 flex flex-col gap-0.5" style={{ minWidth: '100%' }}>
                                {(Object.entries(MAP_DEPTH_PALETTES) as [MapDepthPaletteName, DepthColor[]][]).map(([name, colors]) => (
                                    <button
                                        key={name}
                                        onClick={() => { setActivePalette(name); setIsThemeDropdownOpen(false); }}
                                        className={`flex items-center gap-2 px-2 py-1.5 text-left w-full transition-colors ${activePalette === name ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                    >
                                        <div className="flex gap-0.5 shrink-0">
                                            {colors.map((c, i) => (
                                                <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color, border: `1px solid ${c.border}`, display: 'inline-block' }} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] uppercase font-medium">{PALETTE_LABELS[name]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default memo(MapComponent);
