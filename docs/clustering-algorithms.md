# Clustering Algorithms

Ten spatial and spatio-temporal clustering algorithms are implemented. Six run in a Web Worker (light); four are routed to the server API (heavy).

---

## Routing decision

```typescript
const HEAVY_ALGORITHMS = ['hdbscan', 'nearest-neighbor', 'tmc', 'hardebeck-2019'];

if (HEAVY_ALGORITHMS.includes(algorithm)) {
    // POST /api/cluster  (server-side, LRU cached)
} else {
    // postMessage → clustering.worker.ts  (Web Worker, 30s timeout)
}
```

---

## Coordinate system

### Equirectangular projection

All distance-based algorithms project geographic coordinates to a flat kilometre plane centred on the mean coordinates \((\bar{\phi}, \bar{\lambda})\) of the dataset:

$$x = (\lambda - \bar{\lambda}) \times 111.32 \times \cos\!\left(\bar{\phi}\,\frac{\pi}{180}\right) \quad [\text{km}]$$

$$y = (\phi - \bar{\phi}) \times 110.57 \quad [\text{km}]$$

### Haversine great-circle distance

Used for exact distances in STEP, TMC, and Hardebeck algorithms:

$$\Delta\phi = (\phi_2 - \phi_1)\frac{\pi}{180}, \qquad \Delta\lambda = (\lambda_2 - \lambda_1)\frac{\pi}{180}$$

$$a = \sin^2\!\frac{\Delta\phi}{2} + \cos\phi_1 \cos\phi_2 \sin^2\!\frac{\Delta\lambda}{2}$$

$$d = 2R\arctan2\!\left(\sqrt{a},\,\sqrt{1-a}\right), \qquad R = 6{,}371\ \text{km}$$

### Wells-Coppersmith rupture length

Used by STEP, TMC, and Hardebeck to scale spatial windows to earthquake size:

$$\mathrm{RL}(M) = 10^{-2.44 + 0.59M} \quad [\text{km}]$$

---

## Algorithm summary

| Algorithm | Worker/Server | Key parameters | Noise label |
|---|---|---|---|
| DBSCAN | Worker | \(\varepsilon\) (km), `minSamples` | \(-1\) |
| OPTICS | Worker | \(\varepsilon\) (km), `minSamples` | \(-1\) |
| k-Means | Worker | \(k\) | none |
| ST-DBSCAN | Worker | \(\varepsilon\), \(\varepsilon_t\) (days), `minSamples` | \(-1\) |
| STEP-Mag | Worker | \(M_{\min}\), \(T_1\), \(T_2\) | \(-1\) |
| STEP-Time | Worker | \(M_{\min}\), \(T_1\), \(T_2\) | \(-1\) |
| HDBSCAN | Server | `minClusterSize`, `minSamples` | \(-1\) |
| Nearest-Neighbor | Server | \(\eta_{\text{threshold}}\) | \(-1\) |
| TMC | Server | \(r_{\text{fact}}\), \(\tau_0\), \(\tau_{\max}\), \(p_1\), \(x_k\), \(M_{\min}\) | \(-1\) |
| Hardebeck-2019 | Server | \(M_{\min}\), \(T_w\), \(r_{\text{mult}}\), \(T_{\text{excl}}\) | \(-1\) |

---

## DBSCAN

Groups points reachable within \(\varepsilon\) km with at least `minSamples` neighbours. Unreachable points are labelled \(-1\) (noise).

**R-tree optimisation (`useRTree: true`, default):** Range queries use a **RBush** spatial index, reducing complexity from \(\mathcal{O}(n^2)\) to \(\mathcal{O}(n \log n)\). See [Performance](performance.md#5-r-tree-spatial-indexing) for details.

| Key | Default | Description |
|---|---|---|
| `epsilon` | 25 km | Core-point neighbourhood radius \(\varepsilon\) |
| `minSamples` | 5 | Minimum points to form a core point |
| `useRTree` | `true` | Enable R-tree acceleration |

---

## OPTICS

Extends DBSCAN to produce a reachability plot for variable-density cluster extraction. Implemented via the `density-clustering` library.

**Parameters:** identical to DBSCAN.

---

## k-Means

Partitions events into exactly \(k\) clusters by minimising within-cluster variance. No noise points.

| Key | Default | Description |
|---|---|---|
| `k` | 5 | Number of clusters |

---

## ST-DBSCAN

Extends DBSCAN with a temporal epsilon \(\varepsilon_t\). Two events are neighbours only if they satisfy both:

$$d_{\text{spatial}}(i, j) \leq \varepsilon \quad \text{and} \quad |t_i - t_j| \leq \varepsilon_t$$

Event timestamps are converted to fractional days from epoch for the temporal comparison.

| Key | Default | Description |
|---|---|---|
| `epsilon` | 25 km | Spatial neighbourhood radius \(\varepsilon\) |
| `epsilonTemporal` | 7 days | Temporal neighbourhood window \(\varepsilon_t\) |
| `minSamples` | 5 | Minimum neighbours (both conditions must hold) |

---

## STEP-Mag

Events are associated to mainshock clusters based on magnitude-scaled look-back and look-forward windows. Events are processed largest-magnitude first.

**Spatial window** uses the Wells-Coppersmith rupture length:

$$\mathrm{RL}(M) = 10^{-2.44 + 0.59M} \quad [\text{km}]$$

Only events with magnitude strictly above \(M_{\min}\) can seed or extend a cluster.

| Key | Default | Description |
|---|---|---|
| `stepMinMag` | 2.0 | Minimum mainshock magnitude \(M_{\min}\) |
| `stepT1` | 1 day | Look-back window \(T_1\) |
| `stepT2` | 30 days | Look-forward window \(T_2\) |

---

## STEP-Time

Identical to STEP-Mag but events are processed in **temporal order**. The cluster reference location and radius update when a larger event is found within it.

**Parameters:** same as STEP-Mag.

---

## HDBSCAN — *server only*

Campello et al. (2013). Builds a hierarchy of DBSCAN clusterings across all density thresholds and extracts the most stable clusters via the *Excess of Mass* criterion.

### Phase 1 — Core distances

For each point \(i\), compute its core distance: the Euclidean distance to its \(k\)-th nearest neighbour, denoted \(\text{core}_k(i)\).

### Phase 2 — Mutual-reachability graph and MST

Define the mutual-reachability distance:

$$d_{\text{mreach}}(i,j) = \max\!\bigl(\text{core}_k(i),\;\text{core}_k(j),\;d_{\text{eucl}}(i,j)\bigr)$$

Build a minimum spanning tree (MST) on the complete graph weighted by \(d_{\text{mreach}}\) using **Prim's algorithm**.

### Phase 3 — Single-linkage dendrogram

Sort MST edges by weight and merge components in ascending order to produce a full dendrogram.

### Phase 4 — Condense tree

Walk the dendrogram bottom-up. At each split, if one side has fewer than `minClusterSize` points, those points *fall out* (their death level \(\lambda_{\text{death}}\) is recorded, where \(\lambda = 1/d\)). Otherwise a new sub-cluster is created.

### Phase 5 — Cluster stability (Excess of Mass)

$$\text{stability}(C) = \sum_{p \in C} \bigl(\lambda_{\text{death}}(p) - \lambda_{\text{birth}}(C)\bigr)$$

### Phase 6 — Cluster selection (bottom-up DP)

For each cluster, keep it if its own stability exceeds the sum of its children's stabilities:

$$\text{keep } C \iff \text{stability}(C) \geq \sum_{\text{child}} \text{stability}(\text{child})$$

### Phase 7 — Membership probabilities and GLOSH outlier scores

$$\text{prob}(p) = \frac{\lambda_{\text{death}}(p)}{\lambda_{\max}(\text{assigned cluster})}$$

$$\text{outlier}(p) = 1 - \frac{\lambda_{\text{death}}(p)}{\lambda_{\max}(\text{drop cluster})}$$

Higher outlier score indicates a more anomalous event.

| Key | Default | Description |
|---|---|---|
| `hdbscanMinClusterSize` | 5 | Smallest grouping considered a true cluster |
| `hdbscanMinSamples` | 5 | \(k\)-NN neighbourhood size for core-distance computation |

**Extra `ClusterResult` fields:** `probabilities[]`, `outlierScores[]`

---

## Nearest-Neighbor (Zaliapin–Ben-Zion) — *server only*

Zaliapin & Ben-Zion (2013). Computes normalised interevent distances in joint space–time–magnitude space:

$$\eta(i,j) = \frac{t_{ij} \cdot r_{ij}^{d}}{10^{b\, m_i}}$$

| Symbol | Value | Meaning |
|---|---|---|
| \(t_{ij}\) | — | Time difference in days (only earlier events considered as parents) |
| \(r_{ij}\) | — | Spatial distance in km |
| \(d\) | 1.6 | Fractal dimension constant |
| \(b\) | 1.0 | Gutenberg-Richter b-value constant |
| \(m_i\) | — | Magnitude of the candidate parent event |

Each event is linked to its parent with the smallest \(\eta\). If \(\eta < \eta_{\text{threshold}}\), the pair is clustered. Clusters are connected components of these links.

| Key | Default | Description |
|---|---|---|
| `nnThreshold` | 1.0 | Normalised interevent distance cutoff \(\eta_{\text{threshold}}\) |

---

## TMC (Time-Magnitude Clustering — Reasenberg-style) — *server only*

A probabilistic look-ahead approach inspired by Reasenberg (1985).

**Interaction radius** (capped at 30 km):

$$r(M) = r_{\text{fact}} \times 0.011 \times 10^{0.4M}, \qquad r \leq 30\ \text{km}$$

**Reasenberg look-ahead time:**

$$\Delta M = (1 - x_k)\,M_{\max} - M_{\min}$$

$$\tau = \frac{-\ln(1 - p_1)\,t}{10^{(\Delta M - 1)\,2/3}}, \qquad \tau = \max\!\bigl(\tau_0,\,\min(\tau, \tau_{\max})\bigr)$$

where \(t\) is time elapsed since the largest event in the cluster, \(M_{\max}\) is the magnitude of the largest event, and \(M_{\min}\) is `tmcMinMag`.

Events are processed chronologically. Two events bridge separate clusters: clusters are merged.

| Key | Default | Description |
|---|---|---|
| `tmcRfact` | 10 | Spatial radius multiplier \(r_{\text{fact}}\) |
| `tmcTau0` | 2 days | Minimum look-ahead time \(\tau_0\) |
| `tmcTauMax` | 10 days | Maximum look-ahead time \(\tau_{\max}\) |
| `tmcP1` | 0.99 | Interaction probability threshold \(p_1\) |
| `tmcXk` | 0.5 | Magnitude scaling factor \(x_k\) |
| `tmcMinMag` | 1.5 | Effective minimum seed magnitude \(M_{\min}\) |

---

## Hardebeck-2019 — *server only*

Hardebeck (2019) updated window method based on Wells-Coppersmith (1994) rupture lengths.

**Rupture length** (Wells-Coppersmith 1994):

$$\mathrm{RL}(M) = 10^{-2.44 + 0.59M} \quad [\text{km}]$$

**Algorithm** (largest mainshocks processed first):

1. Skip any candidate mainshock that falls within \(T_{\text{excl}}\) years and \(5 \times \mathrm{RL}\) of a larger event — it is itself an aftershock
2. Tag all events within \(T_w\) days and \(r_{\text{mult}} \times \mathrm{RL}\) km as aftershocks of the mainshock

| Key | Default | Description |
|---|---|---|
| `hardebeckMinMag` | 5.0 | Minimum mainshock magnitude |
| `hardebeckTimeWindow` | 10 days | Aftershock collection window \(T_w\) |
| `hardebeckRuptureMult` | 3 | Spatial radius multiplier \(r_{\text{mult}}\) |
| `hardebeckMainshockTimeYears` | 3 years | Mainshock exclusion look-back \(T_{\text{excl}}\) |

---

## Client-side result cache

Clustering results are cached in `src/lib/analysis/clusteringCache.ts` (separate from the server LRU):

| Property | Value |
|---|---|
| Max entries | 10 |
| TTL | 5 minutes |
| Key | `dataHash : JSON.stringify(options)` |
| Data hash | \(\mathcal{O}(1)\) sample — array length + first/last/middle `timeMs` + sample magnitudes |

---

## Full parameter reference

```typescript
interface SpatialClusteringOptions {
    algorithm: ClusteringAlgorithm;   // required

    epsilon?: number;           // km  — DBSCAN / OPTICS / ST-DBSCAN  (default 25)
    minSamples?: number;        // DBSCAN / OPTICS / HDBSCAN           (default 5)
    k?: number;                 // k-Means cluster count               (default 5)
    useRTree?: boolean;         // R-tree acceleration                 (default true)
    nnThreshold?: number;       // Nearest-Neighbor η cutoff           (default 1.0)
    epsilonTemporal?: number;   // days — ST-DBSCAN                    (default 7)

    stepMinMag?: number;        // STEP min mainshock magnitude        (default 2.0)
    stepT1?: number;            // STEP look-back days                 (default 1)
    stepT2?: number;            // STEP look-forward days              (default 30)

    tmcRfact?: number;          // TMC radius multiplier               (default 10)
    tmcTau0?: number;           // TMC min look-ahead days             (default 2)
    tmcTauMax?: number;         // TMC max look-ahead days             (default 10)
    tmcP1?: number;             // TMC probability threshold           (default 0.99)
    tmcXk?: number;             // TMC magnitude scaling               (default 0.5)
    tmcMinMag?: number;         // TMC min seed magnitude              (default 1.5)

    hardebeckMinMag?: number;             // default 5.0
    hardebeckTimeWindow?: number;         // days, default 10
    hardebeckRuptureMult?: number;        // default 3
    hardebeckMainshockTimeYears?: number; // default 3

    hdbscanMinClusterSize?: number;       // default 5
    hdbscanMinSamples?: number;           // default 5
}
```

---

## Selection modes in Temporal-Spatial tab

After clustering, two selection modes are available:

| Mode | Behaviour |
|---|---|
| `individual` | Click a point to toggle it; noise points (\(-1\)) always use this mode |
| `cluster` | Click any point to select all events with the same cluster label |

A **"Show only this cluster"** toggle isolates one cluster across all three linked views (Leaflet map, temporal scatter, 3D plot).
