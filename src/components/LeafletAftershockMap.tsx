'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { FullscreenControl, ScaleControl } from './map/MapControls';

import { ColorPaletteName, getColorStops } from '@/utils/colorPalette';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AftershockMapPoint {
    lat: number;
    lon: number;
    magnitude: number;
    depth: number;
    daysSince: number;
    date: string;
    index: number;
    eventID?: string;
    isSelected: boolean;
}

export interface MainEventPoint {
    latitude: number;
    longitude: number;
    magnitude: number;
    name: string;
    eventID?: string;
}

interface LeafletAftershockMapProps {
    points: AftershockMapPoint[];
    mainEvent: MainEventPoint;
    radiusKm: number;
    colorPalette: ColorPaletteName;
    minDays: number;
    maxDays: number;
    onPointClick: (index: number) => void;
    fitMapTrigger?: number;
}

// ── Color Interpolation ──────────────────────────────────────────────────────

function parseRgba(colorStr: string): [number, number, number, number] {
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return [0, 0, 0, 1];
    return [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        match[4] ? parseFloat(match[4]) : 1
    ];
}

function interpolateColor(val: number, min: number, max: number, palette: ColorPaletteName): string {
    const norm = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
    const stops = getColorStops(palette);
    
    if (norm <= stops[0][0]) return stops[0][1];
    if (norm >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    
    for (let i = 0; i < stops.length - 1; i++) {
        const [stop1, col1] = stops[i];
        const [stop2, col2] = stops[i + 1];
        
        if (norm >= stop1 && norm <= stop2) {
            const t = (norm - stop1) / (stop2 - stop1);
            const [r1, g1, b1, a1] = parseRgba(col1);
            const [r2, g2, b2, a2] = parseRgba(col2);
            
            const r = Math.round(r1 + t * (r2 - r1));
            const g = Math.round(g1 + t * (g2 - g1));
            const b = Math.round(b1 + t * (b2 - b1));
            const a = a1 + t * (a2 - a1);
            
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
    }
    return stops[0][1];
}

function darkenHex(rgbaStr: string, amount: number): string {
    const [r, g, b, a] = parseRgba(rgbaStr);
    return `rgba(${Math.max(0, r - amount)}, ${Math.max(0, g - amount)}, ${Math.max(0, b - amount)}, ${a})`;
}

// ── Shared Tooltips ─────────────────────────────────────────────────────────

function buildTooltipHTML(point: AftershockMapPoint): string {
    return `
        <div style="padding: 4px; font-family:'Inter','Segoe UI',sans-serif;">
            <div style="font-weight:bold; margin-bottom: 2px;">
                M${point.magnitude?.toFixed(1) || 'N/A'}
            </div>
            <div>Event ID: ${point.eventID || 'N/A'}</div>
            <div>Depth: ${point.depth?.toFixed(1) || 'N/A'} km</div>
            <div>Days since main event: ${point.daysSince?.toFixed(1) || 'N/A'}</div>
            <div>Lat: ${point.lat?.toFixed(4) || 'N/A'}°</div>
            <div>Lon: ${point.lon?.toFixed(4) || 'N/A'}°</div>
            <div style="color:#6b7280; margin-top: 2px; font-size: 0.9em;">${point.date || 'N/A'}</div>
        </div>
    `;
}

// ── Inner Map Logic ─────────────────────────────────────────────────────────

function AftershockLayers({
    points,
    mainEvent,
    radiusKm,
    colorPalette,
    minDays,
    maxDays,
    onPointClickRef,
    fitMapTrigger
}: {
    points: AftershockMapPoint[];
    mainEvent: MainEventPoint;
    radiusKm: number;
    colorPalette: ColorPaletteName;
    minDays: number;
    maxDays: number;
    onPointClickRef: React.MutableRefObject<(idx: number) => void>;
    fitMapTrigger?: number;
}) {
    const map = useMap();
    const layerGroupRef = useRef<L.LayerGroup | null>(null);
    const lastFitTrigger = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (layerGroupRef.current) {
            layerGroupRef.current.removeFrom(map);
        }

        const group = L.layerGroup().addTo(map);
        layerGroupRef.current = group;

        const bounds = L.latLngBounds([]);

        // 1. Draw radius circle if main event coords are valid
        if (typeof mainEvent.latitude === 'number' && typeof mainEvent.longitude === 'number') {
            const wrappedMainLon = mainEvent.longitude < 0 ? mainEvent.longitude + 360 : mainEvent.longitude;
            const mainLatLng = L.latLng(mainEvent.latitude, wrappedMainLon);
            bounds.extend(mainLatLng);

            // Radius is in meters for L.circle
            const circle = L.circle(mainLatLng, {
                radius: radiusKm * 1000,
                color: '#ff0000',
                weight: 2,
                fill: false,
                dashArray: '5, 5',
                interactive: false, // Circle shouldn't capture clicks
            });
            group.addLayer(circle);

            // Add main event marker
            const mainEventMarker = L.circleMarker(mainLatLng, {
                radius: 8,
                fillColor: '#ff0000',
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1,
            });
            mainEventMarker.bindTooltip(`
                <div style="padding:4px;">
                    <strong>${mainEvent.name}</strong><br/>
                    Event ID: ${mainEvent.eventID || 'N/A'}<br/>
                    M${mainEvent.magnitude.toFixed(1)}<br/>
                    Lat: ${mainEvent.latitude.toFixed(4)}°<br/>
                    Lon: ${mainEvent.longitude.toFixed(4)}°<br/>
                    Main Event
                </div>
            `, { sticky: true, className: 'eq-map-tooltip' });
            group.addLayer(mainEventMarker);
        }

        // 2. Draw aftershock points
        if (points && points.length > 0) {
            const renderer = L.canvas({ padding: 0.5 });

            points.forEach(p => {
                const wrappedLon = p.lon < 0 ? p.lon + 360 : p.lon;
                const latLng = L.latLng(p.lat, wrappedLon);
                bounds.extend(latLng);

                const baseColor = interpolateColor(p.daysSince, minDays, maxDays, colorPalette);
                const color = p.isSelected ? '#ef4444' : baseColor;
                const border = p.isSelected ? '#dc2626' : darkenHex(baseColor, 40);
                const radius = p.isSelected ? Math.max(3, p.magnitude * 1.5) * 1.5 : Math.max(3, p.magnitude * 1.5);
                const weight = p.isSelected ? 2 : 1;
                const opacity = p.isSelected ? 1 : 0.7;

                const circle = L.circleMarker(latLng, {
                    renderer,
                    radius,
                    fillColor: color,
                    color: border,
                    weight,
                    fillOpacity: opacity,
                    bubblingMouseEvents: false,
                });

                circle.bindTooltip(buildTooltipHTML(p), {
                    sticky: true,
                    className: 'eq-map-tooltip',
                    offset: [10, 0],
                });

                circle.on('mouseover', function (this: L.CircleMarker) {
                    this.setStyle({ weight: 2, color: '#000000', fillOpacity: 1, radius: radius + 2 });
                    this.bringToFront();
                });
                circle.on('mouseout', function (this: L.CircleMarker) {
                    this.setStyle({ weight, color: border, fillOpacity: opacity, radius });
                });

                circle.on('click', e => {
                    L.DomEvent.stopPropagation(e);
                    onPointClickRef.current(p.index);
                });

                group.addLayer(circle);
            });
        }

        // Fit map bounds on first load or when trigger increments
        if ((points.length > 0 || mainEvent.latitude) && (!(map as any).hasLoadedBounds || (fitMapTrigger && fitMapTrigger !== lastFitTrigger.current))) {
            // Pad bounds slightly
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
            (map as any).hasLoadedBounds = true;
            lastFitTrigger.current = fitMapTrigger;
        }

        return () => {
            if (layerGroupRef.current) {
                layerGroupRef.current.removeFrom(map);
                layerGroupRef.current = null;
            }
        };
    }, [map, points, mainEvent, radiusKm, colorPalette, minDays, maxDays, onPointClickRef, fitMapTrigger]);

    return null;
}

// Ensure bounds reload works if needed
function MapInstanceCapture() {
    const map = useMap();
    useEffect(() => {
        return () => {
            (map as any).hasLoadedBounds = false;
        };
    }, [map]);
    return null;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LeafletAftershockMap({
    points,
    mainEvent,
    radiusKm,
    colorPalette,
    minDays,
    maxDays,
    onPointClick,
    fitMapTrigger
}: LeafletAftershockMapProps) {
    const onPointClickRef = useRef(onPointClick);
    onPointClickRef.current = onPointClick;

    const center: [number, number] = [-41.2865, 174.7762];
    
    return (
        <MapContainer
            center={center}
            zoom={5}
            style={{ height: '100%', width: '100%', backgroundColor: '#f3f4f6' }}
            zoomControl={true}
        >
            <MapInstanceCapture />
            <FullscreenControl />
            <ScaleControl />

            <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="CartoDB Light">
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        subdomains="abcd"
                        maxZoom={19}
                    />
                </LayersControl.BaseLayer>

                <LayersControl.BaseLayer name="OpenStreetMap">
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={19}
                    />
                </LayersControl.BaseLayer>

                <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                        attribution="Tiles &copy; Esri"
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={17}
                    />
                </LayersControl.BaseLayer>
            </LayersControl>

            <AftershockLayers 
                points={points} 
                mainEvent={mainEvent}
                radiusKm={radiusKm}
                colorPalette={colorPalette}
                minDays={minDays}
                maxDays={maxDays}
                onPointClickRef={onPointClickRef} 
                fitMapTrigger={fitMapTrigger}
            />
        </MapContainer>
    );
}
