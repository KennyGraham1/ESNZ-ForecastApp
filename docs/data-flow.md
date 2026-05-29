# Data Flow & Logic

## GeoNet fetch and caching pipeline

```mermaid
flowchart TD
    A([Page load / magnitude change]) --> B[useGeoNetData mounts\nfor minMagnitude]
    B --> C[getCachedCatalog\nIndexedDB read]
    C --> D{Cache hit?}

    D -- Yes --> E[Set catalog state\nUI renders immediately]
    D -- No --> F[fetchFromGeoNetWithReport\nstart = now − 365 days\nend = now]

    F --> G[buildMonthlyChunks\none chunk per calendar month]
    G --> H[Bounded concurrency pool\nMAX_CONCURRENT = 5]
    H --> I[fetchChunkRecursive\ndepth = 0]

    I --> J[fetchJsonWithRetry\nmax 3 attempts\n600ms × 2^attempt + 0–250ms jitter]
    J --> K{Features ≥ 20,000?}
    K -- Yes\ninterval > 24h --> L[splitChunk bisect\nrecurse both halves\ndepth + 1]
    L --> I
    K -- Yes\ninterval ≤ 24h --> M[Emit 'truncated' issue\nreturn empty result]
    K -- No --> N[parseGeoNetFeature\nfor each feature]

    N --> O{Parse outcome?}
    O -- 'invalid'\nmissing required field --> P[invalidFeatures++]
    O -- 'skipped'\nbbox/event-type mismatch --> Q[skippedFeatures++]
    O -- StoredEarthquake --> R[events array]

    R --> S[Merge all chunk results\ndeduplicate by eventID\nnewest modificationTime wins]
    S --> T[saveCatalog to IndexedDB]
    T --> E

    E --> U{Requested date range\nbefore initialFetchDate?}
    U -- Yes --> V[gapFill\nfetch missing window]
    V --> W[mergeEvents + saveCatalog]
    W --> E
    U -- No --> X[applyDateFilter\ntimeMs comparisons]
    X --> Y[toEarthquakeData\ntime string → Date]
    Y --> Z[enhanceEarthquakeData\nadd timeMs, magBin,\ndepthCategory, year]
    Z --> AA([CatalogResponse returned\nto PageClient])
```

---

## Monthly chunking

`buildMonthlyChunks(startDate, endDate)` uses `date-fns/addMonths` to produce one chunk per calendar month. A 12-month window produces ~12 chunks processed with up to 5 concurrent requests.

---

## Retry policy

Each HTTP request passes through `fetchJsonWithRetry`:

| Attempt | Delay before retry |
|---|---|
| 1 → 2 | \(600\ \text{ms} + \mathrm{Uniform}(0, 250)\ \text{ms}\) |
| 2 → 3 | \(1{,}200\ \text{ms} + \mathrm{Uniform}(0, 250)\ \text{ms}\) |

Retryable status codes: **429, 500, 502, 503, 504**.

An HTTP **400** on a chunk also triggers date-splitting before failing — this handles GeoNet's undocumented request-size rejections for very active periods.

---

## Recursive date splitting

When GeoNet returns \(\geq 20{,}000\) features for a chunk:

1. If the interval is \(> \mathrm{MIN\_SPLIT\_INTERVAL\_MS}\) (24 hours): bisect the interval into two equal halves, run both concurrently, merge results.
2. If the interval is \(\leq 24\) hours: record a `truncated` issue and return empty — the data for that window is genuinely too dense to retrieve in full.

---

## Feature parsing

`parseGeoNetFeature(feature, eventType?)` returns one of three values:

| Return | Condition | Counter |
|---|---|---|
| `StoredEarthquake` | All required fields present and within NZ bbox | — |
| `'invalid'` | Missing or unparseable: `eventID`, `time`, lat, lon, depth, or magnitude | `invalidFeatures++` |
| `'skipped'` | Valid record excluded by bbox or event-type filter | `skippedFeatures++` |

**Null `eventtype` events are included.** GeoNet omits `eventtype` for unreviewed automatic solutions, which are overwhelmingly real earthquakes. The filter only rejects records where `eventtype` is explicitly set to a different type.

---

## Deduplication

After all chunks complete, `deduplicate()` merges by `eventID`. When the same event appears in two overlapping chunks, the copy with the newer `modificationTime` is kept. The final array is sorted by `timeMs` descending.

---

## Fetch report

```typescript
interface GeoNetFetchReport {
    events:           StoredEarthquake[];
    chunksTotal:      number;
    chunksSucceeded:  number;
    chunksFailed:     number;
    chunksEmpty:      number;        // chunks with 0 valid events after filters
    chunksSplit:      number;        // total bisections performed
    truncatedChunks:  number;        // chunks hitting 20,000 limit at ≤1 day interval
    invalidFeatures:  number;        // missing/unparseable required fields
    skippedFeatures:  number;        // valid records excluded by bbox or event-type
    duplicateEvents:  number;
    partial:          boolean;       // true if chunksFailed > 0 || truncatedChunks > 0
    issues:           GeoNetFetchIssue[];
}
```

`partial: true` causes a dismissable amber warning panel in the UI. `skippedFeatures` is **not** shown as a warning — it is expected behaviour.

---

## Incremental refresh

```mermaid
sequenceDiagram
    participant UI
    participant useGeoNetData
    participant GeoNet
    participant IndexedDB

    UI->>useGeoNetData: refetch() called
    useGeoNetData->>useGeoNetData: isRefreshingRef.current = true
    useGeoNetData->>GeoNet: fetchFromGeoNetWithReport\n(catalog.lastUpdated → now)
    GeoNet-->>useGeoNetData: new events
    useGeoNetData->>useGeoNetData: mergeEvents(existing, incoming)
    useGeoNetData->>IndexedDB: saveCatalog (updated lastUpdated)
    useGeoNetData->>UI: setCatalog + setNewEventsAdded
    useGeoNetData->>useGeoNetData: isRefreshingRef.current = false
```

---

## Gap-fill

```mermaid
sequenceDiagram
    participant useGeoNetData
    participant GeoNet
    participant IndexedDB

    Note over useGeoNetData: User requests date earlier\nthan catalog.initialFetchDate
    useGeoNetData->>useGeoNetData: gapFillRef.current = true
    useGeoNetData->>GeoNet: fetch(requestedStart → cacheStart)
    GeoNet-->>useGeoNetData: historical events
    useGeoNetData->>useGeoNetData: mergeEvents + update initialFetchDate
    useGeoNetData->>IndexedDB: saveCatalog
    useGeoNetData->>useGeoNetData: gapFillRef.current = false
```

---

## Magnitude switch behaviour

When `minMagnitude` changes, `loadingMagRef` tracks the in-flight magnitude number. In-flight callbacks check `magnitudeRef.current !== magnitude` before applying results, discarding stale responses if the user switches rapidly.

---

## Uploaded catalog flow

```mermaid
flowchart LR
    A([User selects file]) --> B[CatalogUpload wizard\n4 steps]
    B --> C[Parse CSV / TSV / JSON\nGeoJSON / XLSX / QuakeML]
    C --> D[Column mapping\nRequired: time, lat, lon, mag, depth]
    D --> E[Validation rules applied]
    E --> F[enhanceEarthquakeData\nadd timeMs, magBin, depthCategory, year]
    F --> G[PageClient.setUploadedData\ndataSource = 'uploaded']
    G --> H([All tabs render upload data\nno IndexedDB involved])
```

---

## Clustering pipeline

```mermaid
flowchart TD
    A([User clicks Run Clustering]) --> B{Algorithm type?}

    B -- Light\ndbscan / optics / kmeans / st-dbscan\nstep-mag / step-time\ngardner-knopoff / uhrhammer --> C[Encode events as Float64Array\n5 values per event]
    C --> D[Transferable postMessage\nzero-copy to clustering.worker.ts]
    D --> E{Timeout > 30s?}
    E -- Yes --> F[terminate worker\nreturn error]
    E -- No --> G[ClusterResult postMessage back]

    B -- Heavy\nhdbscan / nearest-neighbor\ntmc / hardebeck-2019 --> H[POST /api/cluster]
    H --> I{SHA-256 key\nin server LRU?}
    I -- HIT --> J[Return cached result\nX-Cluster-Cache: HIT]
    I -- MISS --> K[Run algorithm server-side]
    K --> L[Store in LRU\n30 entries, 15 min TTL]
    L --> J

    G --> M[Update TemporalSpatial state]
    J --> M
    M --> N[LeafletClusterMap\ncolour by label]
    M --> O[3D plot + temporal scatter\ncolour by label]
```

### Data encoding for the Web Worker

Each earthquake is packed into a flat `Float64Array` with 5 values per event:

$$\underbrace{\phi_0,\;\lambda_0,\;z_0,\;M_0,\;t_0}_{\text{event 0}},\;\underbrace{\phi_1,\;\lambda_1,\;z_1,\;M_1,\;t_1}_{\text{event 1}},\;\ldots$$

The buffer is **transferred** (not copied) via `postMessage`, giving zero-copy handoff. After transfer, `buf.buffer` is detached in the main thread.

### Reservoir sampling before clustering

If \(n > 5{,}000\), events are subsampled using **Knuth's reservoir algorithm** before encoding. Each event has equal probability \(5000/n\) of inclusion, preserving the statistical distribution of the full catalog.

---

## Aftershock declustering

### SRL / Hardebeck window method

**Rupture length** (Wells-Coppersmith 1994):

$$\mathrm{RL}(M) = 10^{-2.44 + 0.59M} \quad [\text{km}]$$

**Algorithm** (events processed largest-first):

1. Skip candidate if within \(T_{\text{excl}} = 3\) years and \(5 \times \mathrm{RL}\) of a larger event
2. Tag events within \(T_w = 10\) days and \(3 \times \mathrm{RL}\) km as aftershocks

### Gardner-Knopoff window method

**Spatial window:**

$$W_s(M) = 10^{0.1238 M + 0.983} \quad [\text{km}]$$

**Temporal window** (piecewise — the published Gardner-Knopoff 1974 form):

$$W_t(M) = \begin{cases} 10^{\,0.032 M + 2.7389} & M \ge 6.5 \\[4pt] 10^{\,0.5409 M - 0.547} & M < 6.5 \end{cases} \quad [\text{days}]$$

Events within both windows of a larger event are marked as dependent. The Aftershock Sequence tab uses these windows for aftershock identification; the same definitions are also exposed as the `gardner-knopoff` (and `uhrhammer`) clustering algorithms in the Temporal-Spatial tab — see [Clustering Algorithms](clustering-algorithms.md#gardner-knopoff-1974).
