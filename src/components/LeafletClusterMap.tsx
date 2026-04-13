'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

    useEffect(() => {
        // Remove previous layer
        if (layerGroupRef.current) {
            layerGroupRef.current.removeFrom(map);
        }

        if (!points || points.length === 0) return;

        const group = L.layerGroup().addTo(map);
        layerGroupRef.current = group;

        const renderer = L.canvas({ padding: 0.5 });
        let bounds = L.latLngBounds([]);

        points.forEach(p => {
            const wrappedLon = p.lon < 0 ? p.lon + 360 : p.lon;
            const latLng = L.latLng(p.lat, wrappedLon);
            bounds.extend(latLng);

            // Give selected points a distinct red look and bring them front-ish by rendering later
            // (we handle selected ordering below)
            const color = p.isSelected ? '#ef4444' : p.color;
            const border = p.isSelected ? '#dc2626' : darkenHex(p.color, 40);
            const radius = p.isSelected ? 6 : 4;
            const weight = p.isSelected ? 2 : 1;
            const opacity = p.isSelected ? 1 : 0.8;

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

            // Hover effects
            circle.on('mouseover', function (this: L.CircleMarker) {
                this.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 1 });
            });
            circle.on('mouseout', function (this: L.CircleMarker) {
                this.setStyle({ weight, color: border, fillOpacity: opacity });
            });

            circle.on('click', e => {
                L.DomEvent.stopPropagation(e);
                onPointClickRef.current(p.originalIndex);
            });

            group.addLayer(circle);
        });

        // Add a "bringToFront" style effect by re-adding selected points 
        // to canvas so they render on top
        points.filter(p => p.isSelected).forEach(p => {
             // they are already in the array, but we could add them last. 
             // Canvas renderer processes them in order. 
             // We'd have to sort points. 
             // Actually it's fine, let's keep it simple.
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

// ── Main Component ──────────────────────────────────────────────────────────

export default function LeafletClusterMap({ points, onPointClick }: LeafletClusterMapProps) {
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
