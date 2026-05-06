'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { Upload, CalendarDays, X } from 'lucide-react';

const TABS = [
  { id: 'basic', label: 'Basic Dashboard' },
  { id: 'advanced', label: 'Advanced Statistical Analysis' },
  { id: 'aftershock', label: 'Aftershock Sequence' },
  { id: 'temporal-spatial', label: 'Temporal-Spatial Analysis' },
  { id: 'sandbox', label: 'Sandbox' }
];

const VALID_TABS = new Set(TABS.map(t => t.id));

type DataSource = 'geonet' | 'uploaded';

export default function PageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── Read initial values from URL ─────────────────────────────────────────────
  const urlTab   = searchParams.get('tab');
  const urlDays  = searchParams.get('days');
  const urlMag   = searchParams.get('mag');
  const urlStart = searchParams.get('start');
  const urlEnd   = searchParams.get('end');

  const initialTab  = urlTab && VALID_TABS.has(urlTab) ? urlTab : 'basic';
  const initialMag  = urlMag ? parseInt(urlMag, 10) : 3;
  const initialDays = urlDays ? parseInt(urlDays, 10) : undefined;
  const initialStart = urlStart ?? undefined;
  const initialEnd   = urlEnd   ?? undefined;

  const [activeTab, setActiveTab] = useState(initialTab);

  // Data source management
  const [dataSource, setDataSource] = useState<DataSource>('geonet');
  const [uploadedData, setUploadedData] = useState<EarthquakeData[] | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [fetchWarningDismissed, setFetchWarningDismissed] = useState(false);

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
    if (numD < 1 || numD > 31) return null;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${numY}-${pad(numM)}-${pad(numD)}`;
  };

  // Filter options - used for server-side filtering
  const [filterOptions, setFilterOptions] = useState<{
    daysBack?: number;
    minMagnitude: number;
    startDate?: string;
    endDate?: string;
  }>({
    daysBack: initialDays ?? (initialStart ? undefined : 365),
    minMagnitude: isNaN(initialMag) ? 3 : initialMag,
    startDate: initialStart,
    endDate: initialEnd,
  });

  // ── Auto-reload when a stale deployment causes a ChunkLoadError ─────────────
  // After a new Vercel deployment the old chunk hashes no longer exist on the
  // CDN. The browser's cached page references those old hashes → 404 → this
  // error. We reload once to fetch the new bundle; sessionStorage guards against
  // an infinite reload loop if the chunk is genuinely absent.
  useEffect(() => {
    const handleChunkError = (event: ErrorEvent) => {
      if (event.error instanceof Error && event.error.name === 'ChunkLoadError') {
        const GUARD_KEY = 'chunkErrorReload';
        const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(GUARD_KEY, String(Date.now()));
          window.location.reload();
        }
      }
    };
    window.addEventListener('error', handleChunkError);
    return () => window.removeEventListener('error', handleChunkError);
  }, []);

  // ── Sync URL whenever tab or fetch options change ────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'basic') params.set('tab', activeTab);
    if (filterOptions.daysBack) {
      params.set('days', String(filterOptions.daysBack));
    } else if (filterOptions.startDate) {
      params.set('start', filterOptions.startDate);
      if (filterOptions.endDate) params.set('end', filterOptions.endDate);
    }
    if (filterOptions.minMagnitude !== 3) params.set('mag', String(filterOptions.minMagnitude));

    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/', { scroll: false });
  }, [activeTab, filterOptions, router]);

  // Fetch catalog
  const { data: response, isLoading, isRefreshing, error, refetch } = useGeoNetData({
    daysBack: filterOptions.daysBack,
    startDate: filterOptions.startDate,
    endDate: filterOptions.endDate,
    minMagnitude: filterOptions.minMagnitude
  });

  const geonetEarthquakes = response?.data || [];
  const earthquakes = useMemo(
    () => dataSource === 'uploaded' && uploadedData ? uploadedData : geonetEarthquakes,
    [dataSource, uploadedData, geonetEarthquakes]
  );

  const cacheInfo = {
    lastUpdated: response?.lastUpdated || new Date().toISOString(),
    initialFetchDate: response?.initialFetchDate || new Date().toISOString(),
    totalEvents: response?.totalEvents || 0,
    newEventsAdded: response?.newEventsAdded || 0,
    filteredCount: response?.filteredCount || 0,
    returnedCount: response?.returnedCount || 0
  };

  const handleDataLoaded = useCallback((data: EarthquakeData[], filename: string) => {
    setUploadedData(data);
    setUploadedFilename(filename);
    setDataSource('uploaded');
    setShowUploadDialog(false);
    console.log(`✅ Switched to uploaded catalog: ${filename} (${data.length} events)`);
  }, []);

  const handleSwitchToGeoNet = useCallback(() => {
    setDataSource('geonet');
  }, []);

  const dataDateRange = useMemo(() => {
    if (!earthquakes || earthquakes.length === 0) {
      return { min: '', max: '' };
    }

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

  const [filters, setFilters] = useState<FilterOptions>({
    minMagnitude: 0,
    maxMagnitude: 10,
    depthCategory: 'all',
    startDate: dataDateRange.min,
    endDate: dataDateRange.max
  });

  const handleFilterChange = useCallback((newFilters: FilterOptions) => {
    setFilters(newFilters);
  }, []);

  useEffect(() => {
    if (dataDateRange.min && dataDateRange.max) {
      setFilters(prev => {
        if (prev.startDate === dataDateRange.min && prev.endDate === dataDateRange.max) return prev;
        return { ...prev, startDate: dataDateRange.min, endDate: dataDateRange.max };
      });
    }
  }, [dataDateRange.min, dataDateRange.max]);

  const filteredEarthquakes = useMemo(() => {
    if (!earthquakes || earthquakes.length === 0) return [];

    const startDateObj = filters.startDate ? new Date(filters.startDate) : null;
    const endDateObj = filters.endDate ? new Date(filters.endDate) : null;
    if (endDateObj) {
      endDateObj.setHours(23, 59, 59, 999);
    }

    const { polygon } = filters.polygon ? parsePolygonString(filters.polygon) : { polygon: null };

    return earthquakes.filter(eq => {
      if (!eq || typeof eq.magnitude !== 'number' || typeof eq.depth !== 'number') {
        return false;
      }

      if (eq.magnitude < filters.minMagnitude || eq.magnitude > filters.maxMagnitude) {
        return false;
      }

      if (filters.depthCategory !== 'all') {
        const depth = eq.depth;
        if (filters.depthCategory === 'shallow' && depth > 70) return false;
        if (filters.depthCategory === 'intermediate' && (depth <= 70 || depth > 300)) return false;
        if (filters.depthCategory === 'deep' && depth <= 300) return false;
      }

      if (startDateObj || endDateObj) {
        const eqTime = eq.timeMs !== undefined
          ? eq.timeMs
          : (eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime());

        if (isNaN(eqTime)) return false;

        const startTimeMs = startDateObj ? startDateObj.getTime() : -Infinity;
        const endTimeMs = endDateObj ? endDateObj.getTime() : Infinity;

        if (eqTime < startTimeMs || eqTime > endTimeMs) return false;
      }

      if (polygon) {
        if (!isPointInPolygon([eq.longitude, eq.latitude], polygon)) {
          return false;
        }
      }

      return true;
    });
  }, [earthquakes, filters]);

  const [tempOptions, setTempOptions] = useState<{
    daysBack?: number;
    minMagnitude: number;
    startDate?: string;
    endDate?: string;
    mode: 'preset' | 'custom';
  }>({
    ...filterOptions,
    mode: filterOptions.daysBack ? 'preset' : 'custom',
    startDate: filterOptions.startDate,
    endDate: filterOptions.endDate
  });

  useEffect(() => {
    if (tempOptions.mode === 'custom') {
      const currentParsedStart = parseDisplayDate(startInputVal);
      if (currentParsedStart !== tempOptions.startDate) {
        setStartInputVal(toDisplayDate(tempOptions.startDate));
      }

      const currentParsedEnd = parseDisplayDate(endInputVal);
      if (currentParsedEnd !== tempOptions.endDate) {
        setEndInputVal(toDisplayDate(tempOptions.endDate));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempOptions.startDate, tempOptions.endDate, tempOptions.mode]);

  const handleRefresh = useCallback(async () => {
    setFetchWarningDismissed(false);
    try {
      await refetch();
    } catch (err) {
      console.error('Failed to refresh cache:', err);
    }
  }, [refetch]);

  const handleLoad = () => {
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
            Check the browser console (F12) to see progress
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
                            setStartInputVal(val);
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
                          className="sr-only"
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
              <>
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
                {response?.fetchWarnings?.length && !fetchWarningDismissed ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">GeoNet catalog warning</div>
                      <button
                        onClick={() => setFetchWarningDismissed(true)}
                        className="shrink-0 rounded p-0.5 hover:bg-amber-200 transition-colors"
                        aria-label="Dismiss warning"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <ul className="mt-1 list-disc list-inside space-y-1">
                      {response.fetchWarnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
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
