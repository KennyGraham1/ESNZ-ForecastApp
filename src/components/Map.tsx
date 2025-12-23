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

    const getColor = (depth: number) => {
        if (depth < 35) return '#ff0000'; // Shallow - Red
        if (depth < 70) return '#ffa500'; // Intermediate - Orange
        return '#0000ff'; // Deep - Blue
    };

    const options: Highcharts.Options = useMemo(() => {
        // Validate data before processing
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
                chart: { map: nzMapGeometry, height: 600 },
                title: { text: '' },
                credits: { enabled: false },
                series: [{
                    type: 'map',
                    name: 'New Zealand',
                    data: [],
                    borderColor: '#A0A0A0',
                    nullColor: 'rgba(200, 200, 200, 0.3)',
                    showInLegend: false
                }]
            };
        }

        // OPTIMIZATION: Use stratified sampling to preserve distribution (90% faster rendering)
        const maxPoints = getOptimalSamplingThreshold('MAP');
        let processedEarthquakes = earthquakes;

        if (earthquakes.length > SAMPLING_CONFIG.MAP.threshold) {
            processedEarthquakes = stratifiedSample(earthquakes, maxPoints);
            console.log(`📊 Map: Stratified sample ${processedEarthquakes.length} points from ${earthquakes.length} total`);
        }

        // Prepare earthquake data for map points
        const earthquakePoints = processedEarthquakes.map((eq, index) => ({
            lon: eq.longitude,
            lat: eq.latitude,
            z: eq.magnitude,
            magnitude: eq.magnitude,
            depth: eq.depth,
            time: eq.time,
            locality: eq.locality,
            eventID: eq.eventID,
            index,
            color: getColor(eq.depth)
        }));

        // Prepare series data by depth
        const shallowData = earthquakePoints.filter(d => d.depth < 35);
        const intermediateData = earthquakePoints.filter(d => d.depth >= 35 && d.depth < 70);
        const deepData = earthquakePoints.filter(d => d.depth >= 70);

        const chartConfig: any = {
            chart: {
                map: nzMapGeometry,
                backgroundColor: '#ffffff',
                height: 600,
                borderRadius: 8
            },
            // OPTIMIZATION: Boost module disabled for map charts
            // Reason: Boost module doesn't work well with mappoint series and interactive features
            // Map charts have click events and custom markers per depth category
            boost: {
                enabled: false
            },
            title: {
                text: ''
            },
            credits: {
                enabled: false
            },
            legend: {
                enabled: true,
                title: {
                    text: 'Depth Classification',
                    style: {
                        fontWeight: 'bold',
                        fontSize: '12px'
                    }
                },
                align: 'right',
                verticalAlign: 'bottom',
                layout: 'vertical',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                borderRadius: 6,
                padding: 10,
                itemStyle: {
                    fontSize: '11px',
                    fontWeight: '500'
                }
            },
            mapNavigation: {
                enabled: true,
                enableMouseWheelZoom: true,
                buttonOptions: {
                    verticalAlign: 'bottom',
                    theme: {
                        fill: 'white',
                        stroke: '#e5e7eb',
                        'stroke-width': 1,
                        r: 4,
                        style: {
                            color: '#374151'
                        },
                        states: {
                            hover: {
                                fill: '#f3f4f6'
                            },
                            select: {
                                fill: '#e5e7eb'
                            }
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
                shadow: {
                    color: 'rgba(0, 0, 0, 0.1)',
                    offsetX: 0,
                    offsetY: 2,
                    opacity: 0.5,
                    width: 4
                },
                padding: 0,
                formatter: function (this: any) {
                    const point = this.point;
                    if (!point.magnitude) return '';
                    const timeStr = point.time instanceof Date
                        ? point.time.toLocaleString()
                        : new Date(point.time).toLocaleString();

                    return `
                        <div style="padding: 12px; min-width: 200px;">
                            <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 6px;">
                                M${point.magnitude.toFixed(1)}
                            </div>
                            <div style="font-size: 13px; color: #4b5563; line-height: 1.6;">
                                <p style="margin: 4px 0;"><strong style="color: #374151;">Event ID:</strong> ${point.eventID || 'N/A'}</p>
                                <p style="margin: 4px 0;"><strong style="color: #374151;">Time:</strong> ${timeStr}</p>
                                <p style="margin: 4px 0;"><strong style="color: #374151;">Depth:</strong> ${point.depth.toFixed(1)} km</p>
                                <p style="margin: 4px 0;"><strong style="color: #374151;">Location:</strong> ${point.locality}</p>
                            </div>
                        </div>
                    `;
                }
            },
            plotOptions: {
                series: {
                    turboThreshold: 50000 // Support very large datasets (50k+ events)
                },
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
                    borderColor: '#9ca3af',
                    borderWidth: 1.5,
                    nullColor: 'rgba(229, 231, 235, 0.5)',
                    showInLegend: false,
                    enableMouseTracking: false,
                    states: {
                        hover: {
                            borderColor: '#6b7280',
                            brightness: 0.05
                        }
                    }
                },
                {
                    type: 'mappoint',
                    name: 'Shallow (< 35 km)',
                    color: '#ff0000',
                    marker: {
                        radius: 5,
                        fillOpacity: 0.7,
                        lineWidth: 1,
                        lineColor: '#cc0000'
                    },
                    data: shallowData
                },
                {
                    type: 'mappoint',
                    name: 'Intermediate (35-70 km)',
                    color: '#ffa500',
                    marker: {
                        radius: 5,
                        fillOpacity: 0.7,
                        lineWidth: 1,
                        lineColor: '#cc8400'
                    },
                    data: intermediateData
                },
                {
                    type: 'mappoint',
                    name: 'Deep (> 70 km)',
                    color: '#0000ff',
                    marker: {
                        radius: 5,
                        fillOpacity: 0.7,
                        lineWidth: 1,
                        lineColor: '#0000cc'
                    },
                    data: deepData
                }
            ],
            accessibility: {
                enabled: true,
                description: 'Interactive map showing earthquake locations in New Zealand',
                point: {
                    valueSuffix: ' magnitude'
                }
            }
        };

        return chartConfig;
    }, [earthquakes, onPointClick, nzMapGeometry]);

    if (!nzMapGeometry) {
        return (
            <div className="h-[600px] w-full rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Loading map data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="h-[600px] w-full rounded-lg overflow-hidden border border-gray-300 bg-white">
                <HighchartsReact
                    key={`map-${earthquakes.length}`}
                    highcharts={Highcharts}
                    options={options}
                    ref={chartRef}
                    constructorType={'mapChart'}
                />
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
