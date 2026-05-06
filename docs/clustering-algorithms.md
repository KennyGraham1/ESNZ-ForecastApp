# Clustering Algorithms

The application implements ten spatial and spatio-temporal clustering algorithms. Six run in a Web Worker (light algorithms); four are routed to the server API (heavy algorithms). All algorithms operate on the same five-dimensional point representation: `[latitude, longitude, depth, magnitude, timeMs]`.

---

## Algorithm summary

| Algorithm | Type | Execution | Primary use case |
|---|---|---|---|
| DBSCAN | Density-based | Worker | General spatial clusters of arbitrary shape |
| OPTICS | Density-based | Worker | Variable-density clusters |
| k-Means | Partition-based | Worker | Fixed number of compact clusters |
| ST-DBSCAN | Spatio-temporal | Worker | Clusters with both spatial and temporal coherence |
| STEP-Mag | Seismology | Worker | Mainshock–aftershock windows by magnitude scaling |
| STEP-Time | Seismology | Worker | Fixed time window around each event |
| HDBSCAN | Hierarchical density | Server | Robust clusters with soft membership probabilities |
| Nearest-Neighbor | Seismology | Server | Zaliapin–Ben-Zion interevent distance method |
| TMC | Seismology | Server | Reasenberg-style time–magnitude clustering |
| Hardebeck-2019 | Seismology | Server | Updated window method for aftershock identification |

---

## Light algorithms (Web Worker)

### DBSCAN

Density-Based Spatial Clustering of Applications with Noise. Groups points that are reachable within `epsilon` km of each other with at least `minSamples` neighbours. Points that cannot be assigned to any cluster are labelled noise (−1).

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Spatial radius | `epsilon` | 50 km | Core-point neighbourhood radius |
| Min neighbours | `minSamples` | 5 | Minimum points to form a core point |
| R-tree index | `useRTree` | `true` | 90–95% faster range queries (see [Performance](performance.md)) |

**When to use:** Identifying seismic clusters of irregular shape where cluster count is unknown.

---

### OPTICS

Ordering Points To Identify the Clustering Structure. An extension of DBSCAN that produces a reachability plot, allowing variable-density cluster extraction. Uses the same `epsilon` and `minSamples` parameters as DBSCAN.

**Parameters:** identical to DBSCAN.

**When to use:** Datasets with clusters of varying density — e.g. dense mainshock sequences embedded in sparse background seismicity.

---

### k-Means

Partitions events into exactly `k` clusters by minimising within-cluster variance. Requires the number of clusters to be specified in advance. Does not produce noise points.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Number of clusters | `k` | 5 | Target cluster count |

**When to use:** When the number of distinct seismic zones or sequences is known.

---

### ST-DBSCAN (Spatio-Temporal DBSCAN)

Extends DBSCAN with a second temporal epsilon, so two events are considered neighbours only if they are within `epsilon` km **and** `epsilonTemporal` days of each other.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Spatial radius | `epsilon` | 50 km | Spatial neighbourhood radius |
| Temporal radius | `epsilonTemporal` | 7 days | Temporal neighbourhood window |
| Min neighbours | `minSamples` | 5 | Minimum points to form a core point |

**When to use:** Aftershock sequences and swarms where spatial proximity alone is insufficient.

---

### STEP-Mag (STEP Magnitude Clustering)

A seismology-specific window method that associates events with a potential mainshock based on magnitude-scaled look-ahead and look-back time windows:

- Look-back: `T1` days (default 1 day)
- Look-forward: `T2` days (default 30 days), scaled by the mainshock magnitude

Events within the combined space–time window are assigned to the same cluster as the triggering mainshock.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Min mainshock mag | `stepMinMag` | 2.0 | Minimum magnitude to act as cluster seed |
| Look-back window | `stepT1` | 1 day | Days before a candidate mainshock |
| Look-forward window | `stepT2` | 30 days | Base days after a candidate mainshock |

---

### STEP-Time (STEP Time Clustering)

A simplified variant of STEP-Mag using a fixed time window rather than a magnitude-scaled one. Useful for identifying short-duration swarms without a clear mainshock–aftershock hierarchy.

**Parameters:** same as STEP-Mag.

---

## Heavy algorithms (server API)

These algorithms are routed to `POST /api/cluster` because their computational complexity or memory profile makes Web Worker execution impractical for large catalogs. Results are cached server-side (SHA-256 key, 15-min TTL, 30-entry LRU).

### HDBSCAN (Hierarchical DBSCAN)

Campello et al. (2013). Builds a hierarchy of DBSCAN clusterings across all density thresholds and extracts the most stable clusters. Produces soft membership probabilities and GLOSH-style outlier scores per event.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Min cluster size | `hdbscanMinClusterSize` | 5 | Smallest grouping considered a true cluster |
| Min samples | `hdbscanMinSamples` | 5 | Core-distance neighbourhood size |

**Extras in ClusterResult:**

- `probabilities[i]` — soft cluster membership [0, 1] for event *i*
- `outlierScores[i]` — GLOSH anomaly score [0, 1] for event *i* (higher = more anomalous)

**When to use:** When robust cluster extraction across a range of densities is needed, or when per-event outlier scores are useful for identifying isolated anomalous events.

---

### Nearest-Neighbor (Zaliapin–Ben-Zion)

Zaliapin & Ben-Zion (2013). Computes normalised interevent distances in space–time–magnitude space. Pairs of events whose distance falls below a threshold are linked as parent–child (mainshock–aftershock). Clusters correspond to connected components of these links.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Distance threshold | `nnThreshold` | 0.1 | Normalised interevent distance cutoff |

**When to use:** Declustering to separate background seismicity from triggered sequences, consistent with the Zaliapin–Ben-Zion statistical framework.

---

### TMC (Time Magnitude Clustering — Reasenberg-style)

A probabilistic look-ahead clustering approach inspired by Reasenberg (1985). Each event opens a time window whose length grows with the running maximum magnitude of the current cluster. New events entering the window are added to the cluster; the window resets on each addition.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Spatial radius multiplier | `tmcRfact` | 10 | Multiplier for interaction radius |
| Base look-ahead time | `tmcTau0` | 2 days | Minimum cluster look-ahead |
| Maximum look-ahead time | `tmcTauMax` | 10 days | Cap on look-ahead window |
| Probability threshold | `tmcP1` | 0.99 | Interaction probability cutoff |
| Magnitude scaling factor | `tmcXk` | 0.5 | Controls how magnitude grows the window |
| Effective min magnitude | `tmcMinMag` | 1.5 | Events below this are not seeds |

---

### Hardebeck-2019

Hardebeck (2019) updated window method. Defines aftershock zones using a rupture-length-scaled spatial radius and a fixed time window. Events within the zone of a qualifying mainshock are classified as aftershocks.

**Parameters:**

| Parameter | Key | Default | Description |
|---|---|---|---|
| Min mainshock magnitude | `hardebeckMinMag` | 5.0 | Minimum mainshock magnitude |
| Aftershock time window | `hardebeckTimeWindow` | 10 days | Days after mainshock to collect aftershocks |
| Rupture length multiplier | `hardebeckRuptureMult` | 3 | Spatial radius = multiplier × rupture length |
| Mainshock exclusion period | `hardebeckMainshockTimeYears` | 3 years | Events within this period before mainshock are excluded as foreshocks |

---

## R-tree spatial acceleration

For algorithms that perform repeated range or nearest-neighbour lookups (DBSCAN, OPTICS, ST-DBSCAN), the application uses **RBush** (`rbush ^4.0.1`), an R-tree spatial index.

Without an index, each range query scans all *n* events — O(n²) total for the full DBSCAN run. With the R-tree, each query narrows candidates to a small geographic rectangle in O(log n), reducing total complexity to approximately O(n log n).

In practice this yields **90–95% faster** clustering for catalogs of 5,000+ events. The index is built once per clustering run and discarded afterwards.

Enable via `useRTree: true` (the default) in `SpatialClusteringOptions`.

---

## Worker routing logic

The routing decision in `src/lib/analysis/clustering.ts`:

```typescript
const HEAVY_ALGORITHMS = ['hdbscan', 'nearest-neighbor', 'tmc', 'hardebeck-2019'];

if (HEAVY_ALGORITHMS.includes(algorithm)) {
    // POST /api/cluster
} else {
    // postMessage to Web Worker
}
```

---

## Full parameter reference

```typescript
interface SpatialClusteringOptions {
    algorithm: ClusteringAlgorithm;
    epsilon: number;               // km  — DBSCAN / OPTICS / ST-DBSCAN
    minSamples: number;            // DBSCAN / OPTICS / HDBSCAN
    k: number;                     // k-Means cluster count
    useRTree?: boolean;            // default true
    nnThreshold?: number;          // Nearest-Neighbor distance threshold

    // STEP
    stepMinMag?: number;           // default 2.0
    stepT1?: number;               // days — default 1
    stepT2?: number;               // days — default 30

    // ST-DBSCAN
    epsilonTemporal?: number;      // days — default 7

    // TMC
    tmcRfact?: number;             // default 10
    tmcTau0?: number;              // days — default 2
    tmcTauMax?: number;            // days — default 10
    tmcP1?: number;                // default 0.99
    tmcXk?: number;                // default 0.5
    tmcMinMag?: number;            // default 1.5

    // Hardebeck-2019
    hardebeckMinMag?: number;      // default 5.0
    hardebeckTimeWindow?: number;  // days — default 10
    hardebeckRuptureMult?: number; // default 3
    hardebeckMainshockTimeYears?: number; // default 3

    // HDBSCAN
    hdbscanMinClusterSize?: number; // default 5
    hdbscanMinSamples?: number;     // default 5
}
```
