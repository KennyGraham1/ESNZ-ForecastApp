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

// Depth colour scale: bright cyan → teal → dark navy
const DEPTH_CATEGORIES = [
    { label: '< 15',    min: -Infinity, max: 15,  color: '#00e5ff', border: '#00b8cc' },
    { label: '15 - 40', min: 15,        max: 40,  color: '#26c6da', border: '#0097a7' },
    { label: '40 - 100',min: 40,        max: 100, color: '#00838f', border: '#005f6b' },
    { label: '100 - 200',min: 100,      max: 200, color: '#00695c', border: '#004d40' },
    { label: '>= 200',  min: 200,       max: Infinity, color: '#1a3a4a', border: '#0d1f28' },
];

// Magnitude size scale
const MAG_SIZES = [
    { label: '>= 7', min: 7,   radius: 20 },
    { label: '6 - 7', min: 6,  radius: 14 },
    { label: '5 - 6', min: 5,  radius: 10 },
    { label: '4 - 5', min: 4,  radius: 7  },
    { label: '3 - 4', min: 3,  radius: 5  },
    { label: '2 - 3', min: 2,  radius: 3  },
    { label: '< 2',   min: -Infinity, radius: 2 },
];

function getDepthCategory(depth: number) {
    return DEPTH_CATEGORIES.find(c => depth >= c.min && depth < c.max) ?? DEPTH_CATEGORIES[DEPTH_CATEGORIES.length - 1];
}

function getMagnitudeRadius(mag: number): number {
    return (MAG_SIZES.find(m => mag >= m.min) ?? MAG_SIZES[MAG_SIZES.length - 1]).radius;
}

function MapComponent({ earthquakes, onPointClick }: MapProps) {
    const chartRef = useRef<HighchartsReact.RefObject>(null);
    const [nzMapGeometry, setNzMapGeometry] = useState<any>(null);

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

        // Build per-depth-category data arrays with per-point magnitude radius
        const categoryData: Record<number, any[]> = {};
        DEPTH_CATEGORIES.forEach((_, i) => { categoryData[i] = []; });

        processedEarthquakes.forEach((eq, index) => {
            const catIdx = DEPTH_CATEGORIES.findIndex(c => eq.depth >= c.min && eq.depth < c.max);
            const idx = catIdx === -1 ? DEPTH_CATEGORIES.length - 1 : catIdx;
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
                    lineColor: getDepthCategory(eq.depth).border
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

        const chartConfig: any = {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#a8d8ea', // ocean blue
                height: 600,
            },
            boost: { enabled: false },
            title: { text: '' },
            credits: { enabled: false },
            legend: { enabled: false }, // replaced by custom HTML legend
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
                series: { turboThreshold: 50000 },
                mappoint: {
                    point: {
                        events: {
                            click: function (this: any) {
                                const point = this;
                                if (onPointClick && point.index !== undefined) {
                                    const eq = earthquakes[point.index];
                                    onPointClick(eq);
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
                    nullColor: '#e8dcc8', // beige land
                    showInLegend: false,
                    enableMouseTracking: false,
                    states: { hover: { brightness: 0.05 } }
                },
                ...DEPTH_CATEGORIES.map((cat, i) => ({
                    type: 'mappoint',
                    name: cat.label,
                    color: cat.color,
                    marker: {
                        fillOpacity: 0.75,
                        lineWidth: 0.5,
                        lineColor: cat.border
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
    }, [earthquakes, onPointClick, nzMapGeometry]);

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
                        immutable={true}
                    />
                </div>

                {/* Custom legend panel */}
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 text-xs select-none shrink-0 w-36">
                    <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Magnitude</p>
                    <div className="flex flex-col gap-1.5 mb-4">
                        {MAG_SIZES.map(m => (
                            <div key={m.label} className="flex items-center gap-2">
                                <span className="flex items-center justify-center" style={{ width: 24, height: 24 }}>
                                    <span
                                        className="rounded-full border border-gray-400 bg-white inline-block"
                                        style={{ width: m.radius * 2, height: m.radius * 2 }}
                                    />
                                </span>
                                <span className="text-gray-600">{m.label}</span>
                            </div>
                        ))}
                    </div>

                    <p className="font-bold text-gray-700 mb-2 text-[11px] uppercase tracking-wide">Depth (km)</p>
                    <div className="flex flex-col gap-1.5">
                        {DEPTH_CATEGORIES.map(cat => (
                            <div key={cat.label} className="flex items-center gap-2">
                                <span
                                    className="rounded-full shrink-0"
                                    style={{ width: 14, height: 14, backgroundColor: cat.color, border: `1.5px solid ${cat.border}` }}
                                />
                                <span className="text-gray-600">{cat.label}</span>
                            </div>
                        ))}
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

// Export memoized version to prevent unnecessary re-renders
export default memo(MapComponent);
