'use client';

import { useState, useMemo } from 'react';
import { EarthquakeData } from '@/types/earthquake';
import GenericScatterPlot from '@/components/sandbox/GenericScatterPlot';
import GenericHistogram from '@/components/sandbox/GenericHistogram';
import StatsPanel from '@/components/sandbox/StatsPanel';
import { safeMinMax } from '@/utils/arrayMath';
import Map from '@/components/Map';
import ThreeDVisualization from '@/components/ThreeDVisualization';
import MultiPanelTemporalPlot from '@/components/sandbox/MultiPanelTemporalPlot';
import DateRangeSlider from '@/components/common/DateRangeSlider';

interface SandboxProps {
    earthquakes: EarthquakeData[];
}

type PlotType = 'scatter' | 'map' | 'histogram' | '3d' | 'multi-temporal';

// Color Palettes
const PALETTES = {
    'Viridis': ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724'],
    'Magma': ['#000004', '#140e36', '#3b0f70', '#641a80', '#8c2981', '#b73779', '#de4968', '#f7705c', '#fe9f6d', '#fcfdbf'],
    'Inferno': ['#000004', '#160b39', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#fcffa4'],
    'Plasma': ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
    'Cividis': ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a59c74', '#c3b369', '#e1cc55', '#ffe945'],
    'Turbo': ['#23171b', '#4a41b5', '#2f74e6', '#22a4f4', '#1ad4cf', '#38f395', '#8cf85b', '#d3e433', '#ffa424', '#f14918'],
    'Twilight': ['#e2d9e2', '#9a7e9e', '#59446d', '#2e214d', '#130c2c', '#292135', '#5c546b', '#8d869e', '#bfb9c6', '#f2f2f2']
};

export default function Sandbox({ earthquakes }: SandboxProps) {
    // ---- State ----

    // DEBUG: Inspect incoming earthquake data fields
    useMemo(() => {
        if (earthquakes && earthquakes.length > 0) {
            console.log('🔍 Sandbox received data:', {
                count: earthquakes.length,
                keys: Object.keys(earthquakes[0]),
                sample: earthquakes[0]
            });
        }
    }, [earthquakes]);

    // Filters
    const [minMag, setMinMag] = useState<number>(0);
    const [maxDepth, setMaxDepth] = useState<number>(1000);
    const [startDate, setStartDate] = useState<string | undefined>(undefined);
    const [endDate, setEndDate] = useState<string | undefined>(undefined);

    // Visualization Config
    const [plotType, setPlotType] = useState<PlotType>('scatter');

    // Scatter Config
    const [xAxisField, setXAxisField] = useState<keyof EarthquakeData>('time');
    const [yAxisField, setYAxisField] = useState<keyof EarthquakeData>('magnitude');
    const [colorField, setColorField] = useState<keyof EarthquakeData | undefined>(undefined);
    const [scatterPalette, setScatterPalette] = useState<string>('Viridis');
    const [scatterSizeField, setScatterSizeField] = useState<keyof EarthquakeData | undefined>(undefined);

    // Histogram Config
    const [histFields, setHistFields] = useState<string[]>(['magnitude']); // Multi-select support
    const [histBins, setHistBins] = useState<number>(20);

    // 3D Config
    // 3D Config
    const [threeDX, setThreeDX] = useState<keyof EarthquakeData>('longitude');
    const [threeDY, setThreeDY] = useState<keyof EarthquakeData>('latitude');
    const [threeDZ, setThreeDZ] = useState<keyof EarthquakeData>('depth');
    const [threeDColor, setThreeDColor] = useState<keyof EarthquakeData>('magnitude');

    // Multi-Panel Config
    const [multiField1, setMultiField1] = useState<keyof EarthquakeData>('longitude');
    const [multiField2, setMultiField2] = useState<keyof EarthquakeData>('latitude');
    const [multiField3, setMultiField3] = useState<keyof EarthquakeData>('depth');

    // Sampling Config (Fast Render)
    const [isSamplingEnabled, setIsSamplingEnabled] = useState<boolean>(true);

    // Dynamic threshold based on plot type
    // 3D plots are more resource intensive, so we sample more aggressively (2500 vs 5000)
    const SAMPLING_THRESHOLD = plotType === '3d' ? 2500 : 5000;

    // ---- Data Filtering Logic ----
    const filteredData = useMemo(() => {
        return earthquakes.filter(eq => {
            if (eq.magnitude < minMag) return false;
            if (eq.depth > maxDepth) return false;

            // Only parse date if filters are set (optimization)
            if (startDate || endDate) {
                const eqTime = new Date(eq.time).getTime();
                if (startDate && eqTime < new Date(startDate).getTime()) return false;
                if (endDate && eqTime > new Date(endDate).getTime()) return false;
            }

            return true;
        });
    }, [earthquakes, minMag, maxDepth, startDate, endDate]);

    // ---- Sampling Logic ----
    const { displayData, exportData } = useMemo(() => {
        // If sampling is disabled or data is small, use full data for both
        if (!isSamplingEnabled || filteredData.length <= SAMPLING_THRESHOLD) {
            return { displayData: filteredData, exportData: filteredData };
        }

        // Random sampling
        // We create a random subset of SAMPLING_THRESHOLD events
        const sampled = [];
        const step = Math.max(1, Math.floor(filteredData.length / SAMPLING_THRESHOLD));

        // Use systematic sampling with random start for better distribution/performance than pure random shuffle
        for (let i = 0; i < filteredData.length; i += step) {
            if (sampled.length >= SAMPLING_THRESHOLD) break;
            sampled.push(filteredData[i]);
        }

        return { displayData: sampled, exportData: filteredData };
    }, [filteredData, isSamplingEnabled, SAMPLING_THRESHOLD]); // Added SAMPLING_THRESHOLD dependency

    // ---- Dynamic Field Extraction ----
    const numericFields = useMemo(() => {
        if (!earthquakes || earthquakes.length === 0) return ['magnitude', 'depth', 'latitude', 'longitude'];

        // Always include these core fields
        const core = new Set(['time', 'magnitude', 'depth', 'latitude', 'longitude', 'timeMs']);
        const dynamicFields = new Set<string>();

        // Scan up to 50 events to find available fields
        // This ensures we catch fields even if the first event is missing them
        const sampleSize = Math.min(earthquakes.length, 50);

        for (let i = 0; i < sampleSize; i++) {
            const eq = earthquakes[i];
            Object.keys(eq).forEach(key => {
                if (core.has(key)) return;

                // Check if value is number
                const val = (eq as any)[key];
                if (typeof val === 'number') {
                    dynamicFields.add(key);
                }
            });
        }

        return ['time', 'magnitude', 'depth', 'latitude', 'longitude', ...Array.from(dynamicFields).sort()];
    }, [earthquakes]);

    // ---- Global Data Range Calculation ----
    const globalDateRange = useMemo(() => {
        if (!earthquakes || earthquakes.length === 0) return { min: Date.now(), max: Date.now() };
        const times = earthquakes.map(eq => new Date(eq.time).getTime());
        // Use safeMinMax to avoid stack overflow with large arrays
        // was: Math.min(...times)
        const { min, max } = safeMinMax(times);
        return { min, max };
    }, [earthquakes]);



    return (
        <div className="flex flex-col h-full gap-4">

            {/* ---- Top Features: Real-time Stats ---- */}
            <StatsPanel earthquakes={filteredData} />

            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[600px]">
                {/* ---- Sidebar Controls ---- */}
                <div className="w-full lg:w-80 bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-y-auto shrink-0 space-y-8 h-fit max-h-[calc(120vh-300px)]">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <span>🧪</span> Sandbox Controls
                        </h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Experiment with data filters and visualization axes. These filters are local to this tab.
                        </p>

                    </div>
                    {/* Data Filters */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-700 border-b pb-2">Data Filters</h4>

                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-medium text-gray-700">Min Magnitude</label>
                                <span className="text-sm font-bold text-blue-600">{minMag}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="9"
                                step="0.1"
                                value={minMag}
                                onChange={(e) => setMinMag(parseFloat(e.target.value))}
                                className="w-full accent-blue-600"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-sm font-medium text-gray-700">Max Depth (km)</label>
                                <span className="text-sm font-bold text-blue-600">{maxDepth}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="700"
                                step="10"
                                value={maxDepth}
                                onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                                className="w-full accent-blue-600"
                            />
                        </div>

                        {/* Fast Render Toggle */}
                        <div className="flex items-center justify-between pt-2 border-t">
                            <div>
                                <label className="text-sm font-medium text-gray-700 block">Fast Render</label>
                                <span className="text-xs text-gray-500">Show sample ({SAMPLING_THRESHOLD}) points</span>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isSamplingEnabled}
                                onClick={() => setIsSamplingEnabled(!isSamplingEnabled)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${isSamplingEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSamplingEnabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                        {/* Removed duplicate count display */}

                        <div className="grid grid-cols-1 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Time Range</label>
                                <DateRangeSlider
                                    minDate={new Date(globalDateRange.min)}
                                    maxDate={new Date(globalDateRange.max)}
                                    startDate={startDate ? new Date(startDate) : undefined}
                                    endDate={endDate ? new Date(endDate) : undefined}
                                    onChange={(start, end) => {
                                        setStartDate(start.toISOString());
                                        setEndDate(end.toISOString());
                                    }}
                                />
                                <div className="flex justify-between items-center mt-1">
                                    <button
                                        onClick={() => { setStartDate(undefined); setEndDate(undefined); }}
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 underline"
                                    >
                                        Reset Range
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Visualization Controls */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-700 border-b pb-2">Visualization</h4>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Plot Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setPlotType('scatter')} className={`px-3 py-2 text-sm font-medium border rounded-md transition-colors ${plotType === 'scatter' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Scatter</button>
                                <button type="button" onClick={() => setPlotType('map')} className={`px-3 py-2 text-sm font-medium border rounded-md transition-colors ${plotType === 'map' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Map</button>
                                <button type="button" onClick={() => setPlotType('histogram')} className={`px-3 py-2 text-sm font-medium border rounded-md transition-colors ${plotType === 'histogram' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Histogram</button>
                                <button type="button" onClick={() => setPlotType('3d')} className={`px-3 py-2 text-sm font-medium border rounded-md transition-colors ${plotType === '3d' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>3D View</button>
                                <button type="button" onClick={() => setPlotType('multi-temporal')} className={`col-span-2 px-3 py-2 text-sm font-medium border rounded-md transition-colors ${plotType === 'multi-temporal' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Multi-Temporal</button>
                            </div>
                        </div>

                        {/* ---- Scatter Plot Controls ---- */}
                        {plotType === 'scatter' && (
                            <div className="space-y-4 border-t pt-4">
                                <h4 className="font-medium text-gray-700">Scatter Configuration</h4>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">X Axis</label>
                                    <select
                                        value={xAxisField}
                                        onChange={(e) => setXAxisField(e.target.value as any)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Y Axis</label>
                                    <select
                                        value={yAxisField}
                                        onChange={(e) => setYAxisField(e.target.value as any)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Color By</label>
                                    <select
                                        value={colorField || ''}
                                        onChange={(e) => setColorField(e.target.value ? e.target.value as any : undefined)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="">None (Single Color)</option>
                                        {numericFields.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                </div>
                                {colorField && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Color Palette</label>
                                        <select
                                            value={scatterPalette}
                                            onChange={(e) => setScatterPalette(e.target.value)}
                                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                        >
                                            {Object.keys(PALETTES).map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Size By (Dynamic)</label>
                                    <select
                                        value={scatterSizeField || ''}
                                        onChange={(e) => setScatterSizeField(e.target.value ? e.target.value as any : undefined)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="">None (Fixed Size)</option>
                                        {numericFields.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* ---- Histogram Controls ---- */}
                        {plotType === 'histogram' && (
                            <div className="space-y-4 border-t pt-4">
                                <h4 className="font-medium text-gray-700">Histogram Configuration</h4>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Fields to Plot (Cmd/Ctrl+Click to select multiple)</label>
                                    <select
                                        multiple
                                        value={histFields}
                                        onChange={(e) => {
                                            const selected = Array.from(e.target.selectedOptions, option => option.value);
                                            setHistFields(selected);
                                        }}
                                        className="block w-full h-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                        <option value="hour">Hour of Day</option>
                                        <option value="gap">Inter-event Gap</option>
                                    </select>
                                    <p className="text-[10px] text-gray-500 mt-1">Select multiple to view stacked charts</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Bins: {histBins}</label>
                                    <input
                                        type="range"
                                        min="5"
                                        max="100"
                                        value={histBins}
                                        onChange={(e) => setHistBins(parseInt(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}

                        {/* ---- 3D Controls ---- */}
                        {plotType === '3d' && (
                            <div className="space-y-4 border-t pt-4">
                                <h4 className="font-medium text-gray-700">3D Axes Configuration</h4>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">X Axis</label>
                                    <select value={threeDX} onChange={(e) => setThreeDX(e.target.value as any)} className="block w-full border p-2 rounded text-sm">
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Y Axis</label>
                                    <select value={threeDY} onChange={(e) => setThreeDY(e.target.value as any)} className="block w-full border p-2 rounded text-sm">
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Z Axis</label>
                                    <select value={threeDZ} onChange={(e) => setThreeDZ(e.target.value as any)} className="block w-full border p-2 rounded text-sm">
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Color By</label>
                                    <select value={threeDColor} onChange={(e) => setThreeDColor(e.target.value as any)} className="block w-full border p-2 rounded text-sm">
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* ---- Multi-Panel Controls ---- */}
                        {plotType === 'multi-temporal' && (
                            <div className="space-y-4 border-t pt-4">
                                <h4 className="font-medium text-gray-700">Multi-Panel Configuration</h4>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Top Panel (Y Axis)</label>
                                    <select
                                        value={multiField1}
                                        onChange={(e) => setMultiField1(e.target.value as any)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Middle Panel (Y Axis)</label>
                                    <select
                                        value={multiField2}
                                        onChange={(e) => setMultiField2(e.target.value as any)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Bottom Panel (Y Axis)</label>
                                    <select
                                        value={multiField3}
                                        onChange={(e) => setMultiField3(e.target.value as any)}
                                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        {numericFields.map(field => <option key={field} value={field}>{field}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ---- Visualization Area ---- */}
                <div className="flex-grow bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <div className="flex items-baseline gap-3">
                            <h2 className="text-lg font-bold text-gray-800">
                                {plotType === 'scatter' && 'Scatter Analysis'}
                                {plotType === 'map' && 'Geospatial View'}
                                {plotType === 'histogram' && 'Distribution Analysis'}
                                {plotType === '3d' && '3D Visualization'}
                            </h2>
                            {filteredData.length > 0 && (
                                <span className={`text-sm ${isSamplingEnabled && filteredData.length > SAMPLING_THRESHOLD ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                                    {isSamplingEnabled && filteredData.length > SAMPLING_THRESHOLD ? '⚡ ' : ''}
                                    {displayData.length} / {filteredData.length} events
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-grow p-4 relative overflow-hidden">
                        {plotType === 'scatter' && (
                            <GenericScatterPlot
                                earthquakes={displayData}
                                fullDataForExport={exportData}
                                xAxisField={xAxisField}
                                yAxisField={yAxisField}
                                colorField={colorField}
                                colorPalette={PALETTES[scatterPalette as keyof typeof PALETTES]}
                                sizeField={scatterSizeField}
                            />
                        )}

                        {plotType === 'map' && (
                            <div className="relative w-full h-full rounded-lg overflow-hidden border border-gray-100">
                                <Map
                                    key={`sandbox-map-${filteredData.length}`}
                                    earthquakes={filteredData}
                                />
                                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 shadow-sm border border-gray-200 pointer-events-none">
                                    Displaying {filteredData.length} events
                                </div>
                            </div>
                        )}

                        {plotType === 'histogram' && (
                            <div className="w-full h-full">
                                {histFields.length > 0 ? (
                                    <div className="h-full">
                                        <GenericHistogram
                                            earthquakes={displayData}
                                            fields={histFields as any}
                                            bins={histBins}
                                            title="Comparative Distribution"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50/50 rounded-lg border-2 border-dashed border-gray-200">
                                        <div className="text-4xl mb-3 opacity-20">📊</div>
                                        <p className="font-medium text-gray-500">No Fields Selected</p>
                                        <p className="text-sm mt-1">Choose variables from the sidebar to generate histograms</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {plotType === '3d' && (
                            <ThreeDVisualization
                                earthquakes={displayData}
                                xAxisField={threeDX}
                                yAxisField={threeDY}
                                zAxisField={threeDZ}
                                colorField={threeDColor}
                                fullDataForExport={exportData}
                            />
                        )}

                        {plotType === 'multi-temporal' && (
                            <MultiPanelTemporalPlot
                                earthquakes={displayData}
                                fullDataForExport={exportData}
                                field1={multiField1}
                                field2={multiField2}
                                field3={multiField3}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
