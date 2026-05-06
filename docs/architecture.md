# Architecture Overview

## High-level structure

ESNZ-ForecastApp is a **Next.js 13 App Router** application. All data fetching and analysis runs in the browser; the server provides only two thin API proxy routes. There is no database on the server side — earthquake catalogs are persisted in browser **IndexedDB**.

```
Browser                              Next.js server (Vercel / Node)
────────────────────────────────     ──────────────────────────────
React UI  ←→  IndexedDB              /api/earthquakes/proxy   (CORS proxy → GeoNet)
              ↑                      /api/cluster/route        (CPU-heavy clustering with LRU cache)
         Web Worker
         (clustering.worker.ts)
```

---

## App Router layout

```
src/app/
├── layout.tsx            # Root layout — wraps <Providers> (QueryClient, theme)
├── page.tsx              # RSC shell — reads URL search params, renders <Suspense>
├── PageClient.tsx        # "use client" — entire interactive UI lives here
└── api/
    ├── earthquakes/
    │   └── proxy/route.ts    # CORS proxy → GeoNet quakesearch API
    └── cluster/route.ts      # Clustering endpoint with server-side LRU cache
```

### `page.tsx` — RSC shell

`page.tsx` is a React Server Component. Its only job is to read `searchParams` from the URL (e.g. `?days=365&mag=2`) and pass them as props to `<PageClient>` inside a `<Suspense>` boundary. This pattern avoids the `useSearchParams()` hydration penalty on the client.

### `PageClient.tsx` — interactive root

`PageClient.tsx` is marked `'use client'` and owns all React state and hooks:

- `useGeoNetData` — catalog fetch/cache lifecycle
- `useState` for active tab, filter state, clustering params, and UI toggles
- `useEffect` to synchronise filter state with date-range changes
- Tab rendering via `<TabNavigation>` and conditional component mounting

---

## Component hierarchy

```
<Providers>                        # QueryClient + ThemeProvider
└── <PageClient>
    ├── <FilterControls>           # Magnitude, date range, days-back inputs
    ├── <CacheIndicator>           # IndexedDB hit/miss badge, "Check for New Events"
    ├── <LoadingProgress>          # Chunk-level GeoNet fetch progress bar
    ├── <Statistics>               # Summary counts, magnitude/depth stats
    ├── <TabNavigation>            # Tab bar — renders active tab label
    └── [active tab]
        ├── <BasicDashboard>       # Map + MagnitudeDistribution + TemporalAnalysis
        │   ├── <Map>              # Highcharts map (NZ base layer)
        │   ├── <MagnitudeDistribution>
        │   └── <TemporalAnalysis>
        ├── <AdvancedStatistics>   # GR plot, depth profile, 3D viz, temporal stats
        │   ├── <GutenbergRichterPlot>
        │   ├── <DepthProfilePlot>
        │   ├── <ThreeDVisualization>
        │   └── <TemporalStatistics>
        ├── <AftershockSequence>   # Omori's Law + aftershock plots
        │   ├── <OmoriLawPlot>
        │   ├── <AftershockSequencePlot>
        │   ├── <CumulativeAftershockPlot>
        │   └── <LeafletAftershockMap>
        └── <TemporalSpatial>      # Linked temporal + spatial clustering
            ├── <LeafletClusterMap>
            ├── <TemporalSpatial3DPlot>
            └── <ClusteringProgressPanel>
```

---

## API routes

### `GET /api/earthquakes/proxy`

A thin CORS proxy that rewrites requests to `https://quakesearch.geonet.org.nz/geojson`.

**Accepted query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `bbox` | `minLon,minLat,maxLon,maxLat` | Bounding box (NZ default: `163.0,-49.0,179.9,-27.0`) |
| `minmag` | number | Minimum magnitude |
| `startdate` | ISO datetime | Range start |
| `enddate` | ISO datetime | Range end |

> **Note:** GeoNet's quakesearch API does not support an `eventtype` query parameter — requests including it return HTTP 400. Event-type filtering is performed client-side after the response arrives.

**Response:** raw GeoJSON `FeatureCollection` from GeoNet, forwarded as-is.

### `POST /api/cluster`

Runs computationally heavy clustering algorithms server-side to avoid blocking the main thread for algorithms that are too large for the Web Worker budget.

**Request body:**

```json
{
  "algorithm": "hdbscan",
  "points": [[lat, lon, depth, mag, timeMs], ...],
  "options": { "hdbscanMinClusterSize": 5, "epsilon": 50 }
}
```

**Response:** `ClusterResult` JSON (labels, nClusters, clusters, optional probabilities).

**Caching:** Results are cached server-side using an in-memory LRU cache keyed by SHA-256 of the request body. Cache TTL is 15 minutes; maximum 30 entries.

---

## State management

The application does not use a global state library. State is distributed across three tiers:

| Tier | Mechanism | Scope |
|---|---|---|
| **Catalog state** | `useGeoNetData` hook + browser IndexedDB | Persists across page loads |
| **UI / filter state** | `useState` in `PageClient.tsx` | Single session |
| **Clustering results** | `useState` in `TemporalSpatial.tsx`, computed by worker or server | Single analysis run |

### `useGeoNetData` hook

Located at `src/hooks/useGeoNetData.ts`. Manages the full catalog lifecycle:

1. **Mount** — reads IndexedDB for the requested magnitude level
2. **Cache miss** — fetches the last 365 days from GeoNet, saves to IndexedDB
3. **Gap-fill** — if the requested date range precedes the cached `initialFetchDate`, fetches only the missing historical window and merges
4. **Refresh** — user-triggered incremental fetch from `lastUpdated` to now

The hook returns a `CatalogResponse` object with a `data: EarthquakeData[]` array pre-filtered to the requested date window.

---

## Data types

### `StoredEarthquake` (IndexedDB record)

```typescript
interface StoredEarthquake {
    eventID: string;
    time: string;        // ISO 8601
    timeMs: number;      // pre-computed ms (for fast filter)
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
    // ... 8 more optional quality fields
}
```

### `EarthquakeData` (runtime / chart input)

Identical to `StoredEarthquake` but with `time: Date` instead of `time: string`. Conversion happens in `useGeoNetData` when data is read from IndexedDB.

### `ClusterResult`

```typescript
interface ClusterResult {
    labels: number[];        // per-event cluster label (-1 = noise)
    nClusters: number;
    clusterPercent: number;
    noisePercent: number;
    clusters: number[][];    // indices grouped by cluster
    probabilities?: number[]; // HDBSCAN soft membership
    outlierScores?: number[]; // HDBSCAN GLOSH scores
    metadata?: ClusteringMetadata;
}
```

---

## IndexedDB schema

```
Database:  esnz-earthquake-catalog  (version 1)
Store:     catalogs                 (keyPath: minMagnitude)

Record per magnitude level:
{
    minMagnitude:    number,   // 2, 3, 4, …  (keyPath)
    earthquakes:     StoredEarthquake[],
    initialFetchDate: string,  // earliest event date loaded
    lastUpdated:     string,   // last refresh timestamp
    totalEvents:     number,
}
```

One record exists per magnitude threshold the user has queried. Selecting M3+ creates a separate record from M2+; they do not share data.
