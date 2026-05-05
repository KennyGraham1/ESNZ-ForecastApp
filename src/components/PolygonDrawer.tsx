'use client';

import { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap, LayersControl, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';

import 'leaflet-draw/dist/leaflet.draw.css';
import { X, Save, Eraser } from 'lucide-react';
import { parsePolygonString } from '@/lib/polygonUtils';

// Fix for default marker icons in Next.js
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Load leaflet-draw dynamically to avoid SSR issues if possible, 
// but since we are in 'use client' and inside useEffect, we can import if available.
// However, leaflet-draw extends L, so we just need to make sure require('leaflet-draw') happens on client.
if (typeof window !== 'undefined') {
    require('leaflet-draw');
}

interface PolygonDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (wkt: string) => void;
    initialWkt?: string;
}

// Inner component to handle map logic and controls
function DrawControl({ onPolygonCreated, initialPolygon }: { onPolygonCreated: (layer: L.Layer) => void, initialPolygon?: [number, number][] }) {
    const map = useMap();
    const drawControlRef = useRef<L.Control.Draw | null>(null);
    const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

    useEffect(() => {
        if (!map) return;

        // Initialize display group for drawn items
        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;

        // Handle initial polygon if present
        if (initialPolygon && initialPolygon.length > 0) {
            // Leaflet expects [lat, lon], but our parsing Utils return [lon, lat]
            const latLngs: L.LatLngExpression[] = initialPolygon.map(p => [p[1], p[0]]);
            const polygonLayer = L.polygon(latLngs, { color: '#3b82f6' });
            drawnItems.addLayer(polygonLayer);

            // Auto-zoom to the polygon
            try {
                const bounds = polygonLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50] });
                }
            } catch (e) {
                console.warn("Could not fit bounds to initial polygon", e);
            }
        }

        // Initialize draw control
        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: drawnItems,
                remove: false,
                edit: false
            },
            draw: {
                polygon: {
                    allowIntersection: false,
                    drawError: {
                        color: '#e1e100',
                        message: '<strong>Oh snap!<strong> you can\'t draw that!'
                    },
                    shapeOptions: {
                        color: '#3b82f6'
                    }
                },
                // Disable other shapes
                polyline: false,
                circle: false,
                rectangle: false,
                circlemarker: false,
                marker: false
            }
        } as any);

        map.addControl(drawControl);
        drawControlRef.current = drawControl;

        // Event listeners
        map.on(L.Draw.Event.CREATED, (e: any) => {
            const layer = e.layer;
            drawnItems.clearLayers(); // Only allow one polygon
            drawnItems.addLayer(layer);
            onPolygonCreated(layer);
        });

        // Handle edits
        map.on(L.Draw.Event.EDITED, (e: any) => {
            const layers = e.layers;
            // Since we only allow one polygon, we just need to grab the first one
            // But realistically, e.layers contains the modified layers.
            // We should find the layer in our featureGroup and trigger update.
            // Actually, existing logic was doing 'layers.eachLayer(layer => onPolygonCreated(layer))'

            // With edit, we might have multiple layers technically if we allowed it, but here we clear.
            // Just notify about the first layer in the feature group to be safe
            drawnItems.eachLayer((layer: any) => {
                onPolygonCreated(layer);
            });
        });

        // Handle delete
        map.on(L.Draw.Event.DELETED, (e: any) => {
            // If deleted, we effectively have no polygon
            // Pass a dummy "empty" response or handle in parent?
            // Actually, parent state stays unless updated.
            // But the draw control's 'onPolygonCreated' converts layer to WKT.
            // We can't pass 'null' easily to onPolygonCreated the way it is typed/used.
            // Ideally we should handle this, but for now user can just draw again. 
        });

        // Cleanup
        return () => {
            map.removeControl(drawControl);
            map.removeLayer(drawnItems);
        };
    }, [map, onPolygonCreated]); // initialPolygon only used on mount/open

    return null;
}

export default function PolygonDrawer({ isOpen, onClose, onSave, initialWkt }: PolygonDrawerProps) {
    const [currentPolygon, setCurrentPolygon] = useState<string | null>(null);

    // Parse initial WKT for display
    const parsedInitialPolygon = useRef<[number, number][] | undefined>(undefined);

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setCurrentPolygon(initialWkt || null);
            if (initialWkt) {
                const result = parsePolygonString(initialWkt);
                if (result.polygon) {
                    parsedInitialPolygon.current = result.polygon;
                } else {
                    parsedInitialPolygon.current = undefined;
                }
            } else {
                parsedInitialPolygon.current = undefined;
            }
        }
    }, [isOpen, initialWkt]);

    if (!isOpen) return null;

    const handlePolygonCreated = (layer: any) => {
        // Convert to WKT
        // LatLngs are usually nested arrays for polygons [[lat, lng], ...]
        // Leaflet 1.x: getLatLngs() returns Array<Array<LatLng>> for Polygon (rings)

        let latlngs: any = layer.getLatLngs();

        // Handle nested arrays (multipolygon support vs simple polygon)
        // Usually for a simple drawing it is [ [LatLng, LatLng...] ]
        if (Array.isArray(latlngs) && Array.isArray(latlngs[0]) && !('lat' in latlngs[0])) {
            latlngs = latlngs[0];
        }

        if (!latlngs || latlngs.length === 0) return;

        // Leaflet LatLng -> WKT format: POLYGON((lng lat, lng lat, ...))
        // Close the loop by repeating the first point
        const coords = latlngs.map((ll: any) => `${ll.lng.toFixed(6)} ${ll.lat.toFixed(6)}`);

        // Check if closed already? Leaflet usually doesn't repeat last point in internal structure
        coords.push(`${latlngs[0].lng.toFixed(6)} ${latlngs[0].lat.toFixed(6)}`); // Close loop

        const wkt = `POLYGON((${coords.join(', ')}))`;
        setCurrentPolygon(wkt);
    };

    const handleSave = () => {
        if (currentPolygon) {
            onSave(currentPolygon);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Draw Filter Polygon</h3>
                        <p className="text-sm text-gray-500">Draw a shape to filter earthquakes within that area.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Map Container */}
                <div className="flex-grow relative">
                    <MapContainer
                        center={[-41.2865, 174.7762]} // Wellington default
                        zoom={5}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <LayersControl position="topright">
                            <LayersControl.BaseLayer checked name="OpenStreetMap">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                            </LayersControl.BaseLayer>

                            <LayersControl.BaseLayer name="Satellite (Esri)">
                                <TileLayer
                                    attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                />
                            </LayersControl.BaseLayer>
                        </LayersControl>

                        <DrawControl
                            onPolygonCreated={handlePolygonCreated}
                            initialPolygon={parsedInitialPolygon.current}
                        />
                    </MapContainer>
                </div>

                {/* Footer / Controls */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm font-mono text-gray-600 truncate max-w-md">
                        {currentPolygon ? currentPolygon : 'No polygon drawn yet'}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!currentPolygon}
                            className={`flex items-center gap-2 px-6 py-2 text-white rounded-lg font-medium transition-colors ${currentPolygon
                                ? 'bg-blue-600 hover:bg-blue-700 shadow-md'
                                : 'bg-gray-400 cursor-not-allowed'
                                }`}
                        >
                            <Save className="w-4 h-4" />
                            Apply Filter
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
