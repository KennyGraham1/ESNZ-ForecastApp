# Architecture Overview

## High-level structure

ESNZ-ForecastApp is a **Next.js 16 App Router** application (React 19, Turbopack). All analysis runs in the browser; the server provides thin API routes (`/api/cluster`, `/api/earthquakes/proxy`). There is no server-side database — earthquake catalogs persist in **browser IndexedDB**.

```
Browser                                   Next.js server
──────────────────────────────────────    ─────────────────────────────────────
PageClient.tsx (React state + hooks)  →   /api/earthquakes/proxy  (CORS proxy)
  ├── useGeoNetData hook                  /api/cluster            (heavy clustering
  ├── IndexedDB (earthquakeCache.ts)                               + LRU cache)
  └── Web Worker (clustering.worker.ts)
```

---

## App Router directory layout

```
src/
├── app/
│   ├── layout.tsx              # Root layout — wraps <Providers>
│   ├── page.tsx                # RSC shell — reads searchParams, renders <Suspense>
│   ├── PageClient.tsx          # 'use client' — entire interactive UI
│   └── api/
│       ├── earthquakes/
│       │   └── proxy/route.ts  # CORS proxy → GeoNet quakesearch API
│       └── cluster/route.ts    # Clustering endpoint with server LRU cache
├── components/
│   ├── tabs/
│   │   ├── BasicDashboard.tsx
│   │   ├── AdvancedStatistics.tsx
│   │   ├── AftershockSequence.tsx
│   │   └── TemporalSpatial.tsx
│   ├── FilterControls.tsx
│   ├── Statistics.tsx
│   ├── CacheIndicator.tsx
│   ├── LoadingProgress.tsx
│   ├── OmoriLawPlot.tsx
│   ├── GutenbergRichterPlot.tsx
│   ├── LeafletClusterMap.tsx
│   ├── LeafletAftershockMap.tsx
│   ├── ChartExportButtons.tsx
│   ├── CatalogUpload.tsx
│   └── Providers.tsx
├── hooks/
│   └── useGeoNetData.ts
├── lib/
│   ├── geonetClient.ts
│   ├── earthquakeCache.ts
│   └── analysis/
│       ├── clustering.ts
│       ├── clustering.worker.ts
│       ├── clusteringCache.ts
│       ├── clusteringTypes.ts
│       ├── omori.ts
│       ├── gutenbergRichter.ts
│       └── referenceModels.ts
├── types/
│   └── earthquake.ts
└── utils/
    └── earthquakeEnhancement.ts
```

---

## `page.tsx` — RSC shell

`page.tsx` is a React Server Component. Its sole responsibility is reading `searchParams` from the URL and passing them as props to `<PageClient>` wrapped in a `<Suspense>` boundary. This pattern avoids the `useSearchParams()` hydration penalty on the client.

---

## `PageClient.tsx` — interactive root

`'use client'` component that owns all application state. URL state is read on mount and written back via `router.replace` whenever it changes.

### URL search parameters

| Parameter | Type | Description |
|---|---|---|
| `tab` | string | Active tab ID (`basic`, `advanced`, `aftershock`, `temporal-spatial`, `sandbox`) |
| `days` | number | Days of data to show (daysBack mode) |
| `mag` | number | Minimum magnitude threshold |
| `start` | YYYY-MM-DD | Range start (used when `days` is absent) |
| `end` | YYYY-MM-DD | Range end |

### State variables

| Variable | Type | Purpose |
|---|---|---|
| `activeTab` | string | Currently rendered tab |
| `dataSource` | `'geonet' \| 'uploaded'` | Whether data comes from GeoNet or a user file |
| `uploadedData` | `EarthquakeData[] \| null` | Catalog loaded from file upload |
| `filterOptions` | `GeoNetFilterOptions` | Magnitude threshold + date window sent to `useGeoNetData` |
| `filters` | `FilterOptions` | Applied post-fetch filters (mag range, depth, dates, polygon) |
| `tempOptions` | local object | Slider values before Apply is clicked; tracks `'preset' \| 'custom'` mode |
| `fetchWarningDismissed` | boolean | Whether the amber GeoNet warning panel has been closed |

### Derived values (useMemo)

**`dataDateRange`** — scans all earthquakes, finds min/max timestamps:
- Handles both `Date` objects and ISO strings
- Returns `{ min: string, max: string }` in YYYY-MM-DD format
- Used to seed the date pickers when switching to date-range mode

**`filteredEarthquakes`** — applies four independent filters in sequence:
1. Magnitude range: `filters.minMagnitude ≤ eq.magnitude ≤ filters.maxMagnitude`
2. Depth category: `shallow` (0–70 km), `intermediate` (70–300 km), `deep` (> 300 km)
3. Date range: start date 00:00 → end date 23:59:59.999
4. Polygon: `isPointInPolygon([lon, lat], polygon)` when a polygon is drawn

### Date display helpers

| Function | Input | Output |
|---|---|---|
| `toDisplayDate(isoDate)` | `YYYY-MM-DD` | `DD/MM/YYYY` |
| `parseDisplayDate(d)` | `DD/MM/YYYY` | `YYYY-MM-DD` (validates parts, d≤31, m∈[1,12], 4-digit year) |

---

## Component hierarchy

```
<Providers>                          # QueryClient + ThemeProvider
└── <PageClient>
    ├── Header
    │   ├── Tab selector (5 tabs)
    │   └── Data source toggle (GeoNet / Upload)
    ├── <CacheIndicator>             # IndexedDB hit/miss, "Check for New Events"
    ├── GeoNet warning panel         # Dismissable amber panel (fetchWarnings)
    ├── <LoadingProgress>            # Chunk-level fetch progress bar
    ├── <FilterControls>             # Mag range, depth, dates, polygon
    ├── <Statistics>                 # Event count, max mag, avg depth
    └── [active tab component]
        ├── <BasicDashboard>
        │   ├── <Statistics>             # Event count, max mag, avg depth
        │   ├── <Map>                    # Leaflet NZ map (SSR disabled)
        │   └── <TemporalAnalysis>
        ├── <AdvancedStatistics>         # 6 panels
        │   ├── <GutenbergRichterPlot>
        │   ├── <DepthProfilePlot>
        │   ├── <MagnitudeDistribution>
        │   ├── <TemporalStatistics>
        │   ├── <TemporalCompletenessPlot>   # rolling Mc(t) / b(t)
        │   └── <ThreeDVisualization>
        ├── <AftershockSequence>
        │   ├── <AftershockSequencePlot>
        │   ├── <ThreeDVisualization>
        │   ├── <OmoriLawPlot>
        │   ├── <GutenbergRichterPlot>
        │   └── <CumulativeAftershockPlot>
        ├── <TemporalSpatial>
        │   ├── <LeafletClusterMap>
        │   ├── <TemporalSpatial3DPlot>
        │   └── <ClusteringProgressPanel>
        └── <Sandbox>
            ├── <StatsPanel>
            ├── <GenericScatterPlot>
            ├── <GenericHistogram>
            ├── <MultiPanelPlot>
            ├── <ThreeDVisualization>
            └── <Map>
```

---

## API routes

### `GET /api/earthquakes/proxy`

A CORS proxy that forwards requests to `https://quakesearch.geonet.org.nz/geojson`. All query parameters are forwarded verbatim.

**Headers sent to GeoNet:**
```
Accept: application/json
User-Agent: ESNZ-ForecastApp GeoNet catalog proxy
```

**Cache strategy:** `cache: 'no-store'` — Next.js's incremental cache has a 2 MB per-entry limit, which GeoNet monthly chunks frequently exceed. All caching is handled client-side via IndexedDB.

**Error handling:**
- Non-200 response from GeoNet → returns HTTP 502, error body capped at 500 chars
- Network error → returns HTTP 502 with message

> **Important:** GeoNet does not support an `eventtype` query parameter — requests including it return HTTP 400. Event-type filtering is performed client-side after the response arrives.

---

### `POST /api/cluster`

Runs computationally heavy clustering algorithms server-side. Serverless function timeout: **60 seconds**.

**Request body:**
```typescript
{
  earthquakes: EarthquakeData[],  // dates arrive as ISO strings, re-hydrated server-side
  options: SpatialClusteringOptions
}
```

**Validation:**
- `earthquakes` must be a non-empty array
- `options.algorithm` must be present

**Response headers:**
- `X-Cluster-Cache: 'HIT'` — result served from LRU cache
- `X-Cluster-Cache: 'MISS'` — result freshly computed

**Response body:** `ClusterResult` JSON, or `{ error: string }` on failure.

**Server-side LRU cache:**

| Property | Value |
|---|---|
| Cache key | SHA-256(sorted event IDs + algorithm + params).slice(0, 16) |
| TTL | 15 minutes |
| Max entries | 30 |
| Eviction | Oldest entry removed on overflow |
| Scope | In-process (resets on Vercel cold start) |

---

## State management

The application does not use a global state library. State is distributed across four tiers:

| Tier | Mechanism | Scope |
|---|---|---|
| **Catalog state** | `useGeoNetData` hook + browser IndexedDB | Persists across page loads per magnitude level |
| **URL state** | `useSearchParams` + `router.replace` | Preserved in browser history |
| **UI / filter state** | `useState` in `PageClient.tsx` | Session only |
| **Clustering results** | `useState` in `TemporalSpatial.tsx` | Single analysis run |

TanStack Query (`@tanstack/react-query`) is installed and a `QueryClient` is configured in `Providers.tsx`, but the main data-fetching logic uses the custom `useGeoNetData` hook directly — not `useQuery`.

---

## All data types

### `EarthquakeData` (runtime)

```typescript
interface EarthquakeData {
    eventID: string;
    time: Date;                      // runtime Date object
    timeMs?: number;                 // pre-computed Unix ms (added by enhanceEarthquakeData)
    latitude: number;
    longitude: number;
    depth: number;
    magnitude: number;
    locality: string;
    mmi?: number;
    azimuthalGap?: number;
    magnitudeStationCount?: number;
    minimumDistance?: number;
    standardError?: number;
    originError?: number;
    evaluationMethod?: string;
    usedPhaseCount?: number;
    [key: string]: any;             // allows arbitrary catalog fields from uploads
}
```

### `EnhancedEarthquakeData` (post-enhancement)

```typescript
extends EarthquakeData {
    timeMs: number;                 // always present after enhanceEarthquakeData()
    magBin: number;                 // Math.floor(magnitude)
    depthCategory: 'shallow' | 'intermediate' | 'deep';  // 0–70, 70–300, >300 km
    year: number;
}
```

### `StoredEarthquake` (IndexedDB)

```typescript
interface StoredEarthquake {
    eventID: string;
    time: string;                   // ISO 8601 string (Date not serialisable in IDB)
    timeMs: number;                 // pre-computed ms for fast filtering
    latitude: number;
    longitude: number;
    depth: number;
    magnitude: number;
    locality: string;
    eventType?: string;
    magnitudeType?: string;
    evaluationStatus?: string;
    evaluationMode?: string;
    modificationTime?: string;
    earthModel?: string;
    azimuthalGap?: number;
    magnitudeUncertainty?: number;
    magnitudeStationCount?: number;
    minimumDistance?: number;
    standardError?: number;
    originError?: number;
    evaluationMethod?: string;
    usedPhaseCount?: number;
    usedStationCount?: number;
}
```

### `StoredCatalog` (IndexedDB record)

```typescript
interface StoredCatalog {
    minMagnitude: number;           // keyPath
    earthquakes: StoredEarthquake[];
    initialFetchDate: string;       // earliest event date loaded (ISO)
    lastUpdated: string;            // last refresh timestamp (ISO)
    totalEvents: number;
}
```

### `FilterOptions`

```typescript
interface FilterOptions {
    minMagnitude: number;
    maxMagnitude: number;
    depthCategory: 'all' | 'shallow' | 'intermediate' | 'deep';
    startDate: string;              // YYYY-MM-DD
    endDate: string;
    polygon?: string;               // CSV of "lon,lat" pairs
}
```

### `ClusterResult`

```typescript
interface ClusterResult {
    labels: number[];               // -1 = noise, 0,1,2,… = cluster ID
    nClusters: number;
    clusterPercent: number;         // % of events in any cluster
    noisePercent: number;
    clusters: number[][];           // event indices grouped by cluster
    probabilities?: number[];       // HDBSCAN: soft membership [0,1]
    outlierScores?: number[];       // HDBSCAN: GLOSH anomaly score [0,1]
    metadata?: ClusteringMetadata;
}
```

### `ClusteringMetadata`

```typescript
interface ClusteringMetadata {
    algorithm: ClusteringAlgorithm;
    algorithmDescription: string;
    parameters: Record<string, any>;
    timestamp: string;              // ISO
    datasetSize: number;
    computationTime?: number;       // ms
}
```

---

## IndexedDB schema

```
Database:  esnz-earthquake-catalog  (version 1)
Store:     catalogs                 (keyPath: minMagnitude)

One record per magnitude threshold (2, 3, 4 …):
{
    minMagnitude:     number,
    earthquakes:      StoredEarthquake[],
    initialFetchDate: string,   // ISO — oldest event date in catalog
    lastUpdated:      string,   // ISO — when catalog was last extended
    totalEvents:      number,
}
```

Selecting M3+ creates a record that is entirely independent of the M2+ record — they do not share events.

---

## Catalog upload

`CatalogUpload.tsx` implements a **4-step wizard**:

1. **Select File** — drag-drop or file input, max 200 MB. Supported formats: CSV, TSV, JSON, GeoJSON, XLSX, QuakeML.
2. **Map Columns** — auto-suggests mappings from detected column names. Required fields: `time`, `latitude`, `longitude`, `magnitude`, `depth`. Optional: `eventID`, `locality`, `mmi`, and others.
3. **Import Options** — date/coordinate format, validation rules (min/max magnitude, depth, date range).
4. **Preview & Import** — shows sample rows and statistics. On confirm calls `enhanceEarthquakeData()` and hands off to `PageClient` via `onDataLoaded`.

QuakeML files skip the column-mapping step (self-describing format).

---

## Components reference

### `CacheIndicator`

Displays catalog age and provides the **"Check for New Events"** refresh button.

- Auto-refreshes the displayed age every **60 seconds** via `setInterval`
- Age display format: `Xd Yh ago` / `Xh Ym ago` / `Xm ago`
- Props: `lastUpdated`, `initialFetchDate`, `totalEvents`, `onRefresh`, `isRefreshing`, `newEventsAdded`, `filteredCount`, `returnedCount`

### `LoadingProgress`

Animated progress panel shown during GeoNet fetches and clustering.

- Props: `operation`, `total`, `current`, `progress` (0–100), `details`, `overlay` (default `true`), `icon`
- Shows indeterminate bouncing-dot animation when `progress` is absent
- Shows percentage and filled bar when `progress` is provided

### `ChartExportButtons`

Exports Highcharts charts and data.

- **Image export**: PNG / JPEG / SVG at 1920×1080, scale 2×
- **CSV export**: data rows with metadata header
- **JSON export**: structured object with `ClusteringMetadata`
- Validates that `clusterLabels.length === data.length` before export

### `PolygonDrawer`

Dynamically imported (SSR disabled). Lets users draw a polygon on the map to spatially filter earthquakes. The polygon is serialised as a CSV string of `lon,lat` pairs and stored in `filters.polygon`.
