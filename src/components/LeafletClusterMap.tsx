'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { FullscreenControl, ScaleControl } from './map/MapControls';


// ── Types ──────────────────────────────────────────────────────────────────

export interface ClusterMapPoint {
    lat: number;
    lon: number;
    magnitude: number;
    depth: number;
    time: Date | string;
    locality?: string;
    isSelected: boolean;
    originalIndex: number;
    cluster: number;
    color: string;
    eventID?: string;
}

interface LeafletClusterMapProps {
    points: ClusterMapPoint[];
    onPointClick: (index: number) => void;
    onMapClick?: () => void;
}

// ── Tooltip generator ────────────────────────────────────────────────────────

function buildTooltipHTML(point: ClusterMapPoint): string {
    const timeStr = new Date(point.time).toLocaleString();
    const clusterText = point.cluster >= 0 ? `Cluster ${point.cluster}` : 'Noise';
    
    return `
        <div style="min-width:200px;font-family:'Inter','Segoe UI',sans-serif;padding:2px;">
            <div style="font-weight:700;font-size:16px;padding-bottom:6px;margin-bottom:6px;
                        border-bottom:2px solid ${point.color};color:#1f2937;">
                ${point.locality || 'Unknown location'}
            </div>
            <div style="font-size:13px;color:#4b5563;line-height:1.6;">
                <p style="margin:2px 0;"><strong>M${point.magnitude.toFixed(1)}</strong></p>
                <p style="margin:2px 0;">Event ID: ${point.eventID || 'N/A'}</p>
                <p style="margin:2px 0;">${timeStr}</p>
                <p style="margin:2px 0;">Depth: ${point.depth.toFixed(1)} km</p>
                <p style="margin:2px 0;">Lat: ${point.lat.toFixed(2)}°, Lon: ${point.lon.toFixed(2)}°</p>
                <p style="margin:4px 0;font-style:italic;color:${point.color};font-weight:bold;">${clusterText}</p>
            </div>
        </div>
    `;
}

// ── Inner Component ─────────────────────────────────────────────────────────

function ClusterMarkersLayer({
    points,
    onPointClickRef
}: {
    points: ClusterMapPoint[];
    onPointClickRef: React.MutableRefObject<(idx: number) => void>;
}) {
    const map = useMap();
    const layerGroupRef = useRef<L.LayerGroup | null>(null);
    const rendererRef = useRef<L.Canvas | null>(null);

    // One persistent canvas renderer for the lifetime of the map. Creating a new
    // L.canvas() on every `points` change leaks renderers: each stays subscribed to
    // the map's move/zoom events, and after its canvas is torn down the next pan/zoom
    // calls _ctx.save()/clearRect() on an undefined context — the repeating crash.
    if (!rendererRef.current) {
        rendererRef.current = L.canvas({ padding: 0.5 });
    }

    useEffect(() => {
        // Remove previous layer
        if (layerGroupRef.current) {
            layerGroupRef.current.removeFrom(map);
        }

        if (!points || points.length === 0) return;

        const group = L.layerGroup().addTo(map);
        layerGroupRef.current = group;

        const renderer = rendererRef.current!;
        let bounds = L.latLngBounds([]);
        const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

        // Canvas renderer paints in insertion order — render unselected first so
        // selected points always appear on top.
        const sortedPoints = [...points].sort((a, b) => {
            if (a.isSelected === b.isSelected) return 0;
            return a.isSelected ? 1 : -1;
        });

        sortedPoints.forEach(p => {
            const wrappedLon = p.lon < 0 ? p.lon + 360 : p.lon;
            const latLng = L.latLng(p.lat, wrappedLon);
            bounds.extend(latLng);

            const color = p.isSelected ? '#ef4444' : p.color;
            const border = p.isSelected ? '#dc2626' : darkenHex(p.color, 40);
            const radius = p.isSelected ? 7 : 4;
            const weight = p.isSelected ? 2 : 1;
            const opacity = p.isSelected ? 1 : 0.8;

            // Glowing halo ring rendered behind the main marker for selected points
            if (p.isSelected) {
                const halo = L.circleMarker(latLng, {
                    renderer,
                    radius: radius + 5,
                    fillColor: 'transparent',
                    color: '#ef4444',
                    weight: 2.5,
                    fillOpacity: 0,
                    opacity: 0.35,
                    interactive: false,
                    bubblingMouseEvents: false,
                } as L.CircleMarkerOptions);
                group.addLayer(halo);
            }

            const circle = L.circleMarker(latLng, {
                renderer,
                radius,
                fillColor: color,
                color: border,
                weight,
                fillOpacity: opacity,
                bubblingMouseEvents: false,
            });

            if (isTouch) {
                // On touch screens use a popup (opened by tap) so it doesn't
                // compete with pan gestures.
                circle.bindPopup(buildTooltipHTML(p), {
                    className: 'eq-map-tooltip',
                    closeButton: true,
                    maxWidth: 260,
                });
            } else {
                circle.bindTooltip(buildTooltipHTML(p), {
                    sticky: true,
                    className: 'eq-map-tooltip',
                    offset: [10, 0],
                });
                // Hover highlight only makes sense on pointer devices
                circle.on('mouseover', function (this: L.CircleMarker) {
                    this.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 1 });
                });
                circle.on('mouseout', function (this: L.CircleMarker) {
                    this.setStyle({ weight, color: border, fillOpacity: opacity });
                });
            }

            circle.on('click', e => {
                L.DomEvent.stopPropagation(e);
                onPointClickRef.current(p.originalIndex);
            });

            group.addLayer(circle);
        });

        // Fit map bounds if this is the first substantial load
        if (points.length > 0 && !(map as any).hasLoadedBounds) {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
            (map as any).hasLoadedBounds = true;
        }

        return () => {
            if (layerGroupRef.current) {
                layerGroupRef.current.removeFrom(map);
                layerGroupRef.current = null;
            }
        };
    }, [map, points, onPointClickRef]);

    // Tear down the persistent renderer when the layer unmounts so it stops
    // listening to the map's move/zoom events.
    useEffect(() => {
        return () => {
            if (rendererRef.current) {
                map.removeLayer(rendererRef.current);
                rendererRef.current = null;
            }
        };
    }, [map]);

    return null;
}

// MapInstanceCapture to clear bounds state on unmount if needed
function MapInstanceCapture() {
    const map = useMap();
    useEffect(() => {
        return () => {
            (map as any).hasLoadedBounds = false;
        };
    }, [map]);
    return null;
}

function EmptyMapClickHandler({ onMapClick }: { onMapClick?: () => void }) {
    const map = useMap();
    useEffect(() => {
        if (!onMapClick) return;

        const handleClick = () => {
            onMapClick();
        };

        map.on('click', handleClick);
        return () => {
            map.off('click', handleClick);
        };
    }, [map, onMapClick]);

    return null;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function LeafletClusterMap({ points, onPointClick, onMapClick }: LeafletClusterMapProps) {
    const onPointClickRef = useRef(onPointClick);
    onPointClickRef.current = onPointClick;

    // Default NZ Center 
    const center: [number, number] = [-41.2865, 174.7762];
    
    return (
        <MapContainer
            center={center}
            zoom={5}
            style={{ height: '100%', width: '100%', backgroundColor: '#f3f4f6' }}
            zoomControl={true}
        >
            <MapInstanceCapture />
            <EmptyMapClickHandler onMapClick={onMapClick} />
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

            <ClusterMarkersLayer points={points} onPointClickRef={onPointClickRef} />
        </MapContainer>
    );
}

// --- Helper ---

function darkenHex(color: string, amount: number): string {
    return '#' + color.replace(/^#/, '').match(/.{2}/g)?.map(c => {
        return Math.max(0, parseInt(c, 16) - amount).toString(16).padStart(2, '0');
    }).join('') || color;
}
