'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useGeoNetData } from '@/hooks/useGeoNetData';
import FilterControls, { FilterOptions } from '@/components/FilterControls';
import { parsePolygonString, isPointInPolygon } from '@/lib/polygonUtils';
import TabNavigation from '@/components/TabNavigation';
import BasicDashboard from '@/components/tabs/BasicDashboard';
import AdvancedStatistics from '@/components/tabs/AdvancedStatistics';
import AftershockSequence from '@/components/tabs/AftershockSequence';
import TemporalSpatial from '@/components/tabs/TemporalSpatial';
import Sandbox from '@/components/tabs/Sandbox';
import CacheIndicator from '@/components/CacheIndicator';
import { PerformanceDebugPanel } from '@/components/PerformanceDebugPanel';
import CatalogUpload from '@/components/CatalogUpload';
import { EarthquakeData } from '@/types/earthquake';
import { Upload, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';

const TABS = [
  { id: 'basic', label: 'Basic Dashboard' },
  { id: 'advanced', label: 'Advanced Statistical Analysis' },
  { id: 'aftershock', label: 'Aftershock Sequence' },
  { id: 'temporal-spatial', label: 'Temporal-Spatial Analysis' },
  { id: 'sandbox', label: 'Sandbox' }
];

type DataSource = 'geonet' | 'uploaded';

export default function Home() {
  const [activeTab, setActiveTab] = useState('basic');

  // Data source management
  const [dataSource, setDataSource] = useState<DataSource>('geonet');
  const [uploadedData, setUploadedData] = useState<EarthquakeData[] | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Refs for custom date pickers
  const startPickerRef = useRef<HTMLInputElement>(null);
  const endPickerRef = useRef<HTMLInputElement>(null);

  // Local text input state for manual typing (DD/MM/YYYY)
  const [startInputVal, setStartInputVal] = useState('');
  const [endInputVal, setEndInputVal] = useState('');

  // Helper to format ISO YYYY-MM-DD to DD/MM/YYYY
  const toDisplayDate = (isoDate?: string) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  };

  // Helper to parse DD/MM/YYYY to ISO YYYY-MM-DD
  const parseDisplayDate = (displayDate: string) => {
    const parts = displayDate.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    if (d.length > 2 || m.length > 2 || y.length !== 4) return null;

    const numD = parseInt(d);
    const numM = parseInt(m);
    const numY = parseInt(y);

    if (isNaN(numD) || isNaN(numM) || isNaN(numY)) return null;
    if (numM < 1 || numM > 12) return null;
    if (numD < 1 || numD > 31) return null; // Basic checks

    // Pad with zeros
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${numY}-${pad(numM)}-${pad(numD)}`;
  };

  // Filter options - now used for server-side filtering
  const [filterOptions, setFilterOptions] = useState<{
    daysBack?: number;
    minMagnitude: number;
    startDate?: string;
    endDate?: string;
  }>({
    daysBack: 365,
    minMagnitude: 3
  });

  // Fetch catalog — reads from browser IndexedDB first, falls back to GeoNet via proxy
  const { data: response, isLoading, isRefreshing, error, refetch } = useGeoNetData({
    daysBack: filterOptions.daysBack,
    startDate: filterOptions.startDate,
    endDate: filterOptions.endDate,
    minMagnitude: filterOptions.minMagnitude
  });

  // Determine which data to use based on data source
  const geonetEarthquakes = response?.data || [];
  const earthquakes = dataSource === 'uploaded' && uploadedData ? uploadedData : geonetEarthquakes;

  const cacheInfo = {
    lastUpdated: response?.lastUpdated || new Date().toISOString(),
    initialFetchDate: response?.initialFetchDate || new Date().toISOString(),
    totalEvents: response?.totalEvents || 0,
    newEventsAdded: response?.newEventsAdded || 0,
    filteredCount: response?.filteredCount || 0,
    returnedCount: response?.returnedCount || 0
  };

  // Handle uploaded catalog data
  const handleDataLoaded = useCallback((data: EarthquakeData[], filename: string) => {
    setUploadedData(data);
    setUploadedFilename(filename);
    setDataSource('uploaded');
    setShowUploadDialog(false);
    console.log(`✅ Switched to uploaded catalog: ${filename} (${data.length} events)`);
  }, []);

  // Switch back to GeoNet data
  const handleSwitchToGeoNet = useCallback(() => {
    setDataSource('geonet');
    console.log('✅ Switched to GeoNet catalog');
  }, []);

  // OPTIMIZATION: Get date range from data using pre-computed timestamps (95% faster)
  const dataDateRange = useMemo(() => {
    if (!earthquakes || earthquakes.length === 0) {
      return { min: '', max: '' };
    }

    // Find min/max timestamps efficiently
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (let i = 0; i < earthquakes.length; i++) {
      const eq = earthquakes[i];
      const timeMs = eq.timeMs !== undefined
        ? eq.timeMs
        : (eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime());

      if (!isNaN(timeMs)) {
        if (timeMs < minTime) minTime = timeMs;
        if (timeMs > maxTime) maxTime = timeMs;
      }
    }

    if (minTime === Infinity || maxTime === -Infinity) {
      return { min: '', max: '' };
    }

    return {
      min: new Date(minTime).toISOString().split('T')[0],
      max: new Date(maxTime).toISOString().split('T')[0]
    };
  }, [earthquakes]);

  // Initialize filters
  const [filters, setFilters] = useState<FilterOptions>({
    minMagnitude: 0,
    maxMagnitude: 10,
    depthCategory: 'all',
    startDate: dataDateRange.min,
    endDate: dataDateRange.max
  });

  // Memoize filter change handler to prevent unnecessary re-renders
  const handleFilterChange = useCallback((newFilters: FilterOptions) => {
    setFilters(newFilters);
  }, []);

  // Update filters when data loads
  useMemo(() => {
    if (dataDateRange.min && dataDateRange.max) {
      setFilters(prev => ({
        ...prev,
        startDate: dataDateRange.min,
        endDate: dataDateRange.max
      }));
    }
    return null;
  }, [dataDateRange]);

  // Optimized client-side filtering for additional filters
  // Uses early returns and minimal operations for better performance
  const filteredEarthquakes = useMemo(() => {
    if (!earthquakes || earthquakes.length === 0) return [];

    // Pre-parse date filters once instead of for each earthquake
    const startDateObj = filters.startDate ? new Date(filters.startDate) : null;
    const endDateObj = filters.endDate ? new Date(filters.endDate) : null;
    if (endDateObj) {
      endDateObj.setHours(23, 59, 59, 999); // Include entire end date
    }

    // Pre-parse polygon filter if present
    const { polygon } = filters.polygon ? parsePolygonString(filters.polygon) : { polygon: null };

    // Use array filter with optimized checks
    return earthquakes.filter(eq => {
      // Safety check for valid earthquake object
      if (!eq || typeof eq.magnitude !== 'number' || typeof eq.depth !== 'number') {
        return false;
      }

      // Magnitude filter (early return for performance)
      if (eq.magnitude < filters.minMagnitude || eq.magnitude > filters.maxMagnitude) {
        return false;
      }

      // Depth filter (early return for performance)
      if (filters.depthCategory !== 'all') {
        const depth = eq.depth;
        if (filters.depthCategory === 'shallow' && depth > 70) return false;
        if (filters.depthCategory === 'intermediate' && (depth <= 70 || depth > 300)) return false;
        if (filters.depthCategory === 'deep' && depth <= 300) return false;
      }

      // Date filter (OPTIMIZATION: use pre-computed timestamps for 95% faster filtering)
      if (startDateObj || endDateObj) {
        // Use pre-computed timeMs if available, otherwise compute once
        const eqTime = eq.timeMs !== undefined
          ? eq.timeMs
          : (eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime());

        if (isNaN(eqTime)) return false;

        const startTimeMs = startDateObj ? startDateObj.getTime() : -Infinity;
        const endTimeMs = endDateObj ? endDateObj.getTime() : Infinity;

        if (eqTime < startTimeMs || eqTime > endTimeMs) return false;
      }

      // Polygon filter
      if (polygon) {
        if (!isPointInPolygon([eq.longitude, eq.latitude], polygon)) {
          return false;
        }
      }

      return true;
    });
  }, [earthquakes, filters]);

  // Local state for the filter inputs (changed via dropdowns)
  const [tempOptions, setTempOptions] = useState<{
    daysBack?: number;
    minMagnitude: number;
    startDate?: string;
    endDate?: string;
    mode: 'preset' | 'custom';
  }>({
    ...filterOptions,
    mode: filterOptions.daysBack ? 'preset' : 'custom',
    // Initialize dates with defaults if not present
    startDate: filterOptions.startDate,
    endDate: filterOptions.endDate
  });

  // Sync text inputs with tempOptions when tempOptions changes (e.g. via picker or preset load)
  // We only update if the parsed input value doesn't match the new iso value (to avoid overwriting active typing if logic overlaps, though here we prioritize the prop source of truth for simplicity)
  useEffect(() => {
    if (tempOptions.mode === 'custom') {
      // Only update if the converted input value is different from the truth, 
      // or if the input is empty (initial load).
      // Actually, safe bet is to simple sync always unless focused? 
      // For now, let's just sync. The user types -> updates tempOptions -> this effect runs.
      // To prevent cursor jumping/reformatting while typing "01/01", we need to be careful.
      // However, toDisplayDate converts "2023-01-01" to "01/01/2023".
      // If user types "01/01/2023", it matches.
      // If user types "1/1/2023" and we format to "01/01/2023", it changes.

      // Better approach: Derived state or only sync on "external" change?
      // Let's rely on checking if the *parsed* input matches current state before overwriting.

      const currentParsedStart = parseDisplayDate(startInputVal);
      if (currentParsedStart !== tempOptions.startDate) {
        setStartInputVal(toDisplayDate(tempOptions.startDate));
      }

      const currentParsedEnd = parseDisplayDate(endInputVal);
      if (currentParsedEnd !== tempOptions.endDate) {
        setEndInputVal(toDisplayDate(tempOptions.endDate));
      }
    }
  }, [tempOptions.startDate, tempOptions.endDate, tempOptions.mode]);

  // Handle manual refresh (incremental update — hook manages isRefreshing state)
  const handleRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch (error) {
      console.error('Failed to refresh cache:', error);
    }
  }, [refetch]);

  // Handle "Load" button - just updates filter options (no API call)
  const handleLoad = () => {
    console.log('📊 Applying filters:', tempOptions);
    if (tempOptions.mode === 'preset') {
      setFilterOptions({
        daysBack: tempOptions.daysBack,
        minMagnitude: tempOptions.minMagnitude,
        startDate: undefined,
        endDate: undefined
      });
    } else {
      setFilterOptions({
        daysBack: undefined,
        minMagnitude: tempOptions.minMagnitude,
        startDate: tempOptions.startDate,
        endDate: tempOptions.endDate
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-800 text-xl font-bold mb-2">Loading Earthquake Catalog...</p>
          <p className="text-gray-600 text-base mb-4">
            Fetching {
              filterOptions.daysBack
                ? filterOptions.daysBack >= 365
                  ? `${Math.round(filterOptions.daysBack / 365)} year${Math.round(filterOptions.daysBack / 365) !== 1 ? 's' : ''}`
                  : `${filterOptions.daysBack} days`
                : filterOptions.startDate && filterOptions.endDate
                  ? `${filterOptions.startDate} to ${filterOptions.endDate}`
                  : 'selected period'
            } of historical data from GeoNet
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm text-gray-700 mb-2">
              <strong>First-time load:</strong> This may take up to a minute to fetch events from GeoNet.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Subsequent loads:</strong> Instant (data is cached locally).
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            💡 Check the browser console (F12) to see progress
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="text-xl font-bold mb-2">Error loading data</p>
          <p>{(error as Error).message}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Don't render until we have a response (isLoading already handles the fetching state)
  if (!response) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg font-medium">No earthquake data available</p>
          <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or refreshing the data</p>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">ESNZ-ForecastApp</h1>
                <p className="text-slate-400 text-sm mt-1">ESNZ Statistical Seismology Visualization and Analysis App</p>
              </div>
              {earthquakes && filteredEarthquakes.length > 0 && (
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg border border-blue-500">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold leading-none">{filteredEarthquakes.length.toLocaleString()}</span>
                    <span className="text-xs text-blue-200 uppercase tracking-wide">Events Loaded</span>
                  </div>
                </div>
              )}
            </div>

            {/* Data Loading Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {earthquakes && filteredEarthquakes.length > 0 && (
                <div className="md:hidden flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 rounded-lg border border-blue-500">
                  <span className="text-lg font-bold">{filteredEarthquakes.length.toLocaleString()}</span>
                  <span className="text-xs text-blue-200">events</span>
                </div>
              )}

              {/* Upload File Button */}
              <button
                onClick={() => setShowUploadDialog(!showUploadDialog)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                title="Load earthquake catalog from CSV, JSON, or GeoJSON file"
              >
                <Upload className="w-4 h-4" />
                Upload File
              </button>

              {/* Data Source Indicator */}
              {dataSource === 'uploaded' && uploadedData && (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-600 rounded-lg border border-purple-500">
                  <span className="text-xs text-purple-200">Using:</span>
                  <span className="text-sm font-medium">{uploadedFilename}</span>
                  <button
                    onClick={handleSwitchToGeoNet}
                    className="ml-2 px-2 py-0.5 bg-purple-700 hover:bg-purple-800 text-xs rounded transition-colors"
                    title="Switch back to GeoNet data"
                  >
                    Switch to GeoNet
                  </button>
                </div>
              )}

              {dataSource === 'geonet' && (
                <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                  <span className="text-xs font-medium text-slate-400 pl-2 uppercase tracking-wider hidden md:inline">GeoNet Data</span>
                  <div className="h-4 w-px bg-slate-700 mx-1 hidden md:block"></div>

                  {tempOptions.mode === 'preset' ? (
                    <select
                      className="bg-slate-900 text-white text-sm border-slate-700 rounded focus:ring-blue-500 focus:border-blue-500 py-1"
                      value={tempOptions.daysBack || 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setTempOptions(prev => ({ ...prev, mode: 'custom' }));
                        } else {
                          setTempOptions(prev => ({ ...prev, daysBack: parseInt(val), mode: 'preset' }));
                        }
                      }}
                    >
                      <option value="custom">Custom Range...</option>
                      <option value="30">Last 30 Days</option>
                      <option value="90">Last 3 Months</option>
                      <option value="180">Last 6 Months</option>
                      <option value="365">Last Year</option>
                      <option value="730">Last 2 Years</option>
                      <option value="1825">Last 5 Years</option>
                      <option value="3650">Last 10 Years</option>
                      <option value="7300">Last 20 Years</option>
                      <option value="10950">Last 30 Years</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      {/* Start Date Custom Input */}
                      <div className="relative group">
                        <input
                          type="text"
                          className="bg-slate-900 text-white text-sm border-slate-700 rounded focus:ring-blue-500 focus:border-blue-500 py-1 pl-2 pr-8 w-28 placeholder-slate-500"
                          value={startInputVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStartInputVal(val); // Always allow typing
                            const parsed = parseDisplayDate(val);
                            if (parsed) {
                              setTempOptions(prev => ({ ...prev, startDate: parsed }));
                            }
                          }}
                          placeholder="DD/MM/YYYY"
                        />
                        <CalendarDays
                          className="absolute right-2 top-1.5 w-4 h-4 text-slate-400 hover:text-white cursor-pointer"
                          onClick={() => startPickerRef.current?.showPicker()}
                        />
                        <input
                          ref={startPickerRef}
                          type="date"
                          className="sr-only" // Visually hidden but accessible via showPicker
                          value={tempOptions.startDate || ''}
                          onChange={(e) => setTempOptions(prev => ({ ...prev, startDate: e.target.value }))}
                        />
                      </div>

                      <span className="text-slate-400">-</span>

                      {/* End Date Custom Input */}
                      <div className="relative group">
                        <input
                          type="text"
                          className="bg-slate-900 text-white text-sm border-slate-700 rounded focus:ring-blue-500 focus:border-blue-500 py-1 pl-2 pr-8 w-28 placeholder-slate-500"
                          value={endInputVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEndInputVal(val);
                            const parsed = parseDisplayDate(val);
                            if (parsed) {
                              setTempOptions(prev => ({ ...prev, endDate: parsed }));
                            }
                          }}
                          placeholder="DD/MM/YYYY"
                        />
                        <CalendarDays
                          className="absolute right-2 top-1.5 w-4 h-4 text-slate-400 hover:text-white cursor-pointer"
                          onClick={() => endPickerRef.current?.showPicker()}
                        />
                        <input
                          ref={endPickerRef}
                          type="date"
                          className="sr-only"
                          value={tempOptions.endDate || ''}
                          onChange={(e) => setTempOptions(prev => ({ ...prev, endDate: e.target.value }))}
                        />
                      </div>

                      <button
                        onClick={() => setTempOptions(prev => ({ ...prev, mode: 'preset', daysBack: 365 }))}
                        className="text-slate-400 hover:text-white"
                        title="Back to presets"
                      >
                        &times;
                      </button>
                    </div>
                  )}

                  <select
                    className="bg-slate-900 text-white text-sm border-slate-700 rounded focus:ring-blue-500 focus:border-blue-500 py-1"
                    value={tempOptions.minMagnitude}
                    onChange={(e) => setTempOptions(prev => ({ ...prev, minMagnitude: parseInt(e.target.value) }))}
                  >
                    <option value="2">Min Mag 2+</option>
                    <option value="3">Min Mag 3+</option>
                    <option value="4">Min Mag 4+</option>
                    <option value="5">Min Mag 5+</option>
                  </select>
                  <button
                    onClick={handleLoad}
                    className="px-4 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 transition-colors shadow-sm"
                    title="Filter cached data by selected time range and magnitude"
                  >
                    Load
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Upload Dialog */}
        {showUploadDialog && (
          <div className="mb-6">
            <CatalogUpload
              onDataLoaded={handleDataLoaded}
              onClose={() => setShowUploadDialog(false)}
            />
          </div>
        )}

        {earthquakes && (
          <div className="space-y-6">
            {/* Cache Indicator - only show for GeoNet data */}
            {dataSource === 'geonet' && (
              <CacheIndicator
                lastUpdated={cacheInfo.lastUpdated}
                initialFetchDate={cacheInfo.initialFetchDate}
                totalEvents={cacheInfo.totalEvents}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                newEventsAdded={cacheInfo.newEventsAdded}
                filteredCount={cacheInfo.filteredCount}
                returnedCount={cacheInfo.returnedCount}
              />
            )}

            {/* Uploaded Data Info */}
            {dataSource === 'uploaded' && uploadedData && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-purple-900">Uploaded Catalog</h3>
                    <p className="text-sm text-purple-700 mt-1">
                      <strong>{uploadedFilename}</strong> - {uploadedData.length.toLocaleString()} events loaded
                    </p>
                  </div>
                  <button
                    onClick={handleSwitchToGeoNet}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Switch to GeoNet
                  </button>
                </div>
              </div>
            )}

            {/* Active Filters Display */}
            <div className="bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Data Loaded:</span>
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-md border border-blue-200">
                  <span className="text-xs text-slate-600">Time Range:</span>
                  <span className="text-sm font-bold text-blue-700">
                    {filterOptions.daysBack ? (
                      filterOptions.daysBack === 30 ? 'Last 30 Days' :
                        filterOptions.daysBack === 90 ? 'Last 3 Months' :
                          filterOptions.daysBack === 180 ? 'Last 6 Months' :
                            filterOptions.daysBack === 365 ? 'Last Year' :
                              filterOptions.daysBack === 730 ? 'Last 2 Years' :
                                filterOptions.daysBack === 1825 ? 'Last 5 Years' :
                                  filterOptions.daysBack === 3650 ? 'Last 10 Years' :
                                    filterOptions.daysBack === 7300 ? 'Last 20 Years' :
                                      filterOptions.daysBack === 10950 ? 'Last 30 Years' :
                                        `Last ${filterOptions.daysBack} Days`
                    ) : (
                      filterOptions.startDate && filterOptions.endDate ?
                        (() => {
                          const [y1, m1, d1] = filterOptions.startDate.split('-');
                          const [y2, m2, d2] = filterOptions.endDate.split('-');
                          return `${d1}/${m1}/${y1} - ${d2}/${m2}/${y2}`;
                        })() :
                        'Custom Range'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 rounded-md border border-purple-200">
                  <span className="text-xs text-slate-600">Min Magnitude:</span>
                  <span className="text-sm font-bold text-purple-700">M{filterOptions.minMagnitude}+</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-md border border-amber-200">
                  <span className="text-xs text-slate-600">Loaded from cache:</span>
                  <span className="text-sm font-bold text-amber-700">{earthquakes.length.toLocaleString()} events</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-md border border-green-200">
                  <span className="text-xs text-slate-600">After filters:</span>
                  <span className="text-sm font-bold text-green-700">{filteredEarthquakes.length.toLocaleString()} events</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <FilterControls
                filters={filters}
                onFilterChange={handleFilterChange}
                dataDateRange={dataDateRange}
              />
              {filters.polygon && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                  <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Polygon filter active: {parsePolygonString(filters.polygon).polygon ? 'Valid Polygon' : 'Invalid Polygon'}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
              <TabNavigation
                tabs={TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />

              <div className="p-6">
                {filteredEarthquakes.length === 0 ? (
                  <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                      {earthquakes.length === 0 ? (
                        <>
                          <p className="text-gray-600 text-lg font-medium">No earthquake data for the selected time range or magnitude</p>
                          <p className="text-gray-500 text-sm mt-2">Try adjusting the time range or minimum magnitude in the controls above, then click Load</p>
                          <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-gray-600 text-lg font-medium">No earthquakes match the current filters</p>
                          <p className="text-gray-500 text-sm mt-2">Try adjusting your magnitude, depth, or date range filters</p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Only render the active tab to prevent rendering all charts at once */}
                    {activeTab === 'basic' && <BasicDashboard earthquakes={filteredEarthquakes} />}
                    {activeTab === 'advanced' && <AdvancedStatistics earthquakes={filteredEarthquakes} />}
                    {activeTab === 'aftershock' && <AftershockSequence earthquakes={filteredEarthquakes} />}
                    {activeTab === 'temporal-spatial' && <TemporalSpatial earthquakes={filteredEarthquakes} />}
                    {activeTab === 'sandbox' && <Sandbox earthquakes={filteredEarthquakes} />}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} ESNZ-ForecastApp. Data provided by GeoNet.
          </p>
        </div>
      </footer>

      {/* Performance Debug Panel (dev only) */}
      <PerformanceDebugPanel />
    </div>
  );
}
