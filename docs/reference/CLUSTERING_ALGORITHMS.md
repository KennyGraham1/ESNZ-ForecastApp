# Clustering Algorithms Reference

This document describes all earthquake clustering algorithms implemented in the
ESNZ-ForecastApp, their parameters, how noise is determined, and scientific
references.

---

## Table of Contents

- [1. DBSCAN](#1-dbscan-density-based-spatial-clustering)
- [2. OPTICS](#2-optics-ordering-points-to-identify-clustering-structure)
- [3. K-Means](#3-k-means)
- [4. ST-DBSCAN](#4-st-dbscan-spatio-temporal-dbscan)
- [5. STEP Magnitude Clustering](#5-step-magnitude-clustering)
- [6. STEP Time Clustering](#6-step-time-clustering)
- [7. Nearest-Neighbor (Zaliapin-Ben-Zion)](#7-nearest-neighbor-clustering-zaliapin-ben-zion)
- [8. TMC / Reasenberg](#8-tmc-time-magnitude-clustering--reasenberg)
- [9. Hardebeck (2019)](#9-hardebeck-2019)
- [10. HDBSCAN](#10-hdbscan-hierarchical-density-based-spatial-clustering)
- [11. Gardner-Knopoff (1974)](#11-gardner-knopoff-1974)
- [12. Uhrhammer (1986)](#12-uhrhammer-1986)
- [Noise Determination — detail per algorithm](#noise-determination)
- [Performance Optimisations](#performance-optimisations)
- [Comparison Guide](#comparison-guide)
- [Seismology-Specific Recommendations](#seismology-specific-recommendations)

---

## 1. DBSCAN (Density-Based Spatial Clustering)

**Description:**
DBSCAN groups together points that are closely packed, marking points in
low-density regions as noise. Optimised with R-tree spatial indexing for 90–95 %
faster performance on large catalogs.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Spatial distance threshold (km). Points within this radius are neighbours. |
| `minSamples` | number | 5 | Minimum neighbours required to declare a core point. |
| `useRTree` | boolean | true | Enable R-tree spatial index optimisation. |

**Output:** Clusters + noise points (events that belong to no cluster).

**Reference:**
Ester, M., et al. (1996). "A Density-Based Algorithm for Discovering Clusters in
Large Spatial Databases with Noise." KDD-96.

---

## 2. OPTICS (Ordering Points To Identify Clustering Structure)

**Description:**
OPTICS extends DBSCAN by producing a reachability ordering that encodes cluster
structure at all density levels. The implementation extracts explicit clusters from
this ordering; points that are unreachable from any core point are noise.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Maximum neighbourhood radius (km). |
| `minSamples` | number | 5 | Minimum points to form a core object. |

**Reference:**
Ankerst, M., et al. (1999). "OPTICS: Ordering Points To Identify the Clustering
Structure." SIGMOD.

---

## 3. K-Means

**Description:**
K-Means partitions the dataset into exactly *k* clusters by minimising
within-cluster variance. Unlike density-based algorithms, **every point is
assigned to a cluster** — no noise is produced.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | number | 5 | Number of clusters to create. |

> **Note:** Because K-Means produces no noise, the "Hide Noise" display option is
> disabled when this algorithm is selected.

**Reference:**
MacQueen, J. (1967). "Some Methods for Classification and Analysis of Multivariate
Observations." Berkeley Symposium on Mathematical Statistics and Probability.

---

## 4. ST-DBSCAN (Spatio-Temporal DBSCAN)

**Description:**
ST-DBSCAN extends DBSCAN to require proximity in both space **and** time.
Two events are neighbours only if they are within `epsilon` km AND within
`epsilonTemporal` days of each other.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Spatial distance threshold (km). |
| `epsilonTemporal` | number | 14 | Temporal distance threshold (days). |
| `minSamples` | number | 5 | Minimum spatio-temporal neighbours for a core point. |

> The exact spatial test uses the **haversine** great-circle distance (matching the `esnz_aftershocks` `BallTree(metric='haversine')` reference); the R-tree pre-filters candidates in projected km.

**Reference:**
Birant, D. & Kut, A. (2007). "ST-DBSCAN: An algorithm for clustering
spatial-temporal data." Data & Knowledge Engineering.

---

## 5. STEP Magnitude Clustering

**Description:**
Clusters earthquakes starting from the **largest-magnitude event** (mainshock),
using magnitude-dependent spatial windows derived from the Wells-Coppersmith (1994)
fault-length relation. Sliding time windows extend when significant aftershocks
occur. Based on Christophersen (2008).

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stepMinMag` | number | 2.0 | Minimum mainshock magnitude (Mc). Events below this are excluded. |
| `stepT1` | number | 1 | Backward time window (days). |
| `stepT2` | number | 30 | Forward time window (days). |

**Spatial radius (Wells-Coppersmith):**
```
radius = max(5, 10^(0.59 × M − 2.44))  km
```

**Algorithm steps:**
1. Filter events by `stepMinMag`.
2. Find the largest unclustered earthquake (mainshock).
3. Cluster events within the radius and time window.
4. Extend the window when a significant event (M > Mc) is found within it.
5. Repeat until all qualifying events are processed.

**References:**
- Wells, D.L. & Coppersmith, K.J. (1994). BSSA 84(4).
- Christophersen, A. (2008). STEP MATLAB implementation.

---

## 6. STEP Time Clustering

**Description:**
Clusters earthquakes in **chronological order**, using the same
magnitude-dependent windows as STEP-Mag but processing events as they occur
in time rather than by descending magnitude. Based on Christophersen (2007).

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stepMinMag` | number | 2.0 | Minimum mainshock magnitude. |
| `stepT1` | number | 1 | Backward time window (days). |
| `stepT2` | number | 30 | Forward time window (days). |

**Reference:**
Christophersen, A. (2007). STEP time-ordering MATLAB implementation.

---

## 7. Nearest-Neighbor Clustering (Zaliapin-Ben-Zion)

**Description:**
Identifies clusters using a rescaled nearest-neighbor distance (η) in the
space-time-magnitude domain. Events whose nearest-neighbor distance is below
the threshold are treated as clustered (aftershocks/foreshocks); those above are
background events.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nnThreshold` | number | 1.0 | `> 0` → auto-threshold on log₁₀(η) via Otsu; `≤ 0` → used directly as the explicit log₁₀(η) cut-off. |

**Distance metric:**
```
η = t × r^d / 10^(b × m)
```
- `t` — temporal distance (days) to the nearest earlier event (causal: parent strictly precedes child)
- `r` — spatial distance (km)
- `d` — fractal dimension (1.6)
- `b` — Gutenberg-Richter b-value (1.0)
- `m` — magnitude of the earlier event

**Thresholding:** performed in **log₁₀(η)** space, where clustered and background links form a bimodal distribution. With `nnThreshold > 0` (default) the separating value is inferred automatically by **Otsu** between-class-variance maximization; with `nnThreshold ≤ 0` the value is used directly. Clusters are the connected components formed by following *triggered* (below-threshold) parent links; singletons are noise.

**References:**
- Zaliapin, I. & Ben-Zion, Y. (2013). JGR 118.
- Zaliapin, I. & Ben-Zion, Y. (2020). JGR 125.

---

## 8. TMC (Time-Magnitude Clustering / Reasenberg)

**Description:**
Implements the Reasenberg (1985) declustering algorithm. Uses adaptive
magnitude-dependent spatio-temporal interaction zones based on the
Kanamori-Anderson (1975) crack model. Clusters can merge when a later event falls
within multiple interaction zones.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tmcRfact` | number | 10 | Spatial radius multiplier. |
| `tmcTau0` | number | 2 | Base look-ahead time (days). |
| `tmcTauMax` | number | 10 | Maximum look-ahead time (days). |
| `tmcP1` | number | 0.99 | Probability threshold (0–1). |
| `tmcXk` | number | 0.5 | Magnitude scaling factor. |
| `tmcMinMag` | number | 1.5 | Effective minimum seed magnitude (M_min). |

**Interaction radius** (the **sum** is capped at 30 km, matching `cluster2000x.f`; `r_main` does **not** scale by `rfact`):
```
r_test = min( rfact × 0.011 × 10^(0.4 × M1)  +  0.011 × 10^(0.4 × M_largest),  30 )  km
```

**Adaptive look-ahead window:**
```
ΔM = max(0, (1 − xk) × M_largest − M_min)     // floored at 0 (bruces/ZMAP, esnz)
τ  = −ln(1 − p1) × t / 10^((ΔM − 1) × 2/3)
```
An unclustered event uses τ = τ0; a clustered event is clamped to **[τ_min, τMax]** where τ_min = 1 day (fixed internal default, not `tmcTau0`). `t` is the time since the **largest** event in the cluster.

**References:**
- Reasenberg, P. (1985). JGR 90.
- Kanamori, H. & Anderson, D.L. (1975). BSSA 65(5).

---

## 9. Hardebeck (2019)

**Description:**
Identifies mainshock-aftershock sequences using physical rupture-length windows
based on the Wells-Coppersmith (1994) relation. Only events at or above
`minMainMag` can act as mainshocks. Candidate mainshocks are suppressed if a
larger event occurred nearby within the preceding `mainshockTimeYears` years,
preventing the same sequence from being anchored to a foreshock.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hardebeckMinMag` | number | 5.0 | Minimum magnitude for a valid mainshock. |
| `hardebeckTimeWindow` | number | 10 | Aftershock time window (days). |
| `hardebeckRuptureMult` | number | 3 | Spatial radius = `ruptureMult × RL` (minimum 10 km). |
| `hardebeckMainshockTimeYears` | number | 3 | Suppression window: ignore candidates near a larger event within this many years. |

**Rupture length (Wells-Coppersmith):**
```
RL = 10^(0.59 × M − 2.44)  km
radius = max(10, ruptureMult × RL)  km
```

**Mainshock suppression:** A candidate mainshock is rejected if any earlier event
of larger magnitude occurred within 5 × RL km and within `mainshockTimeYears` years
before it.

**References:**
- Hardebeck, J.L., Llenos, A.L., Michael, A.J., Page, M.T. & van der Elst, N. (2019).
  "Updated California Aftershock Parameters." *Seismological Research Letters* 90(1), 262–270.
  https://doi.org/10.1785/0220180240
- Wells, D.L. & Coppersmith, K.J. (1994). BSSA 84(4), 974–1002.

---

## 10. HDBSCAN (Hierarchical Density-Based Spatial Clustering)

**Description:**
HDBSCAN extends DBSCAN by building a full hierarchy of density-based clusters and
then selecting the most stable ones via the Excess-of-Mass criterion (Campello
et al. 2013). Points that are never absorbed into a stable cluster become noise.
It also computes a **GLOSH outlier score** ∈ [0, 1] for each noise point, where 1
indicates an extreme outlier.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hdbscanMinClusterSize` | number | 5 | Smallest grouping considered a genuine cluster. Larger → fewer, broader clusters. |
| `hdbscanMinSamples` | number | 5 | k-NN neighbourhood size for core-distance calculation. Larger → denser core points required. |

**Seven-phase algorithm:**
1. **Core distances** — compute the k-NN distance for each point.
2. **Mutual-reachability MST** — build a minimum spanning tree on the
   mutual-reachability graph using Prim's algorithm.
3. **Single-linkage dendrogram** — convert the MST into a binary merge tree
   sorted by merge distance (λ = 1 / distance).
4. **Condensation** — prune dendrogram splits where either child has fewer than
   `minClusterSize` points; record the λ at which small groups "drop out".
5. **Stability** — compute Excess-of-Mass stability for each condensed cluster node.
6. **Optimal extraction** — bottom-up dynamic programming selects the subset of
   clusters with maximal total stability.
7. **Labelling & outlier scores** — assign cluster labels; compute GLOSH scores for
   remaining noise points.

**GLOSH outlier score:**
```
score = max(0, 1 − λ_drop / λ_max_of_cluster)
```
- `λ_drop` — density level at which the point left its last cluster
- `λ_max_of_cluster` — maximum density ever reached in that cluster
- Score 0 ≈ nearly clustered; score 1 = extreme outlier

**References:**
- Campello, R.J.G.B., Moulavi, D. & Sander, J. (2013). "Density-Based Clustering
  Based on Hierarchical Density Estimates." PAKDD, LNAI 7819.
- McInnes, L., Healy, J. & Astels, S. (2017). "hdbscan: Hierarchical density based
  clustering." JOSS 2(11).

---

## 11. Gardner-Knopoff (1974)

**Description:**
Classic magnitude-window declustering. Every event defines magnitude-dependent
spatial and temporal windows; smaller events that fall within **both** windows of a
larger event (forward by `Wt`, back by `gkFsTimeProp × Wt`) are flagged dependent.
Distances are haversine. Faithful to the `esnz_aftershocks` `decluster_gardner_knopoff`.

**Windows:**
```
Ws(M) = 10^(0.1238·M + 0.983)  km
Wt(M) = 10^(0.032·M + 2.7389)  days   if M ≥ 6.5      (piecewise, published form)
        10^(0.5409·M − 0.547)  days   if M < 6.5
```
The piecewise breakpoint matters: applying the M ≥ 6.5 branch to small events grossly
over-windows (M5 → ~707 d instead of ~84 d). Set `gkPiecewiseTemporal = false` to use
the single `10^(cM+d)` form for all magnitudes.

**Parameters:** `gkSpatialA` (0.1238), `gkSpatialB` (0.983), `gkTemporalC` (0.032),
`gkTemporalD` (2.7389), `gkPiecewiseTemporal` (true).

**Reference:** Gardner, J.K. & Knopoff, L. (1974). BSSA 64(5).

---

## 12. Uhrhammer (1986)

**Description:**
Same window-declustering core as Gardner-Knopoff, with Uhrhammer's exponential window
definitions — generally **more conservative (shorter)** windows. Faithful to the
`esnz_aftershocks` `decluster_uhrhammer`.

**Windows:**
```
Ws(M) = exp(−1.024 + 0.804·M)  km
Wt(M) = exp(−2.870 + 1.235·M)  days
```

**Parameters:** `uhrSpatialA` (−1.024), `uhrSpatialB` (0.804), `uhrTemporalA` (−2.870),
`uhrTemporalB` (1.235), `uhrFsTimeProp` (1.0 — foreshock window as a fraction of `Wt`).

**Reference:** Uhrhammer, R.A. (1986). "Characteristics of northern and central
California seismicity." Earthquake Notes 57(1), 21.

---

## Noise Determination

### Quick-reference table

| Algorithm | Noise condition | Key parameter(s) |
|-----------|-----------------|------------------|
| DBSCAN | Fewer than `minSamples` spatial neighbours within `epsilon` km | `epsilon`, `minSamples` |
| OPTICS | Not reachable from any core point up to `epsilon` | `epsilon`, `minSamples` |
| K-Means | **None — all points clustered** | — |
| ST-DBSCAN | Fewer than `minSamples` *spatio-temporal* neighbours (both thresholds must be met) | `epsilon`, `epsilonTemporal`, `minSamples` |
| STEP-Mag | Magnitude < `stepMinMag`, **or** not captured by any mainshock's window | `stepMinMag`, `stepT1`, `stepT2` |
| STEP-Time | Magnitude < `stepMinMag`, **or** not captured by any chronological window | `stepMinMag`, `stepT1`, `stepT2` |
| Nearest-Neighbor | log₁₀(η) > threshold (Otsu auto or explicit); singleton after link-following | `nnThreshold` |
| TMC | `clusterId === 0` — never linked to any interaction zone | `tmcRfact`, `tmcTau0`, `tmcTauMax`, `tmcP1`, `tmcXk`, `tmcMinMag` |
| Hardebeck | `label === −1` — not within any valid mainshock's rupture window | `hardebeckMinMag`, `hardebeckTimeWindow`, `hardebeckRuptureMult` |
| HDBSCAN | `label === −1` — condensed out of all stable clusters | `hdbscanMinClusterSize`, `hdbscanMinSamples` |
| Gardner-Knopoff | Dependent (within both windows of a larger event) → removed; independents kept | `gkSpatialA/B`, `gkTemporalC/D`, `gkPiecewiseTemporal` |
| Uhrhammer | Dependent (within both windows of a larger event) → removed; independents kept | `uhrSpatialA/B`, `uhrTemporalA/B`, `uhrFsTimeProp` |

---

### DBSCAN

A point is labelled **NOISE** (`−2` internally, then excluded from `clusters`) when
the number of spatial neighbours within `epsilon` km is strictly less than
`minSamples`:

```typescript
// src/lib/analysis/clustering.ts — dbscanWithRTree()
if (neighbors.length < minSamples) {
    labels[i] = NOISE;   // NOISE = −2
    continue;
}
```

Border points (within epsilon of a core point but below minSamples themselves) are
*promoted* to the cluster during BFS expansion — they are not noise.

**Sensitivity:** Increasing `epsilon` or decreasing `minSamples` reduces noise.
Decreasing `epsilon` or increasing `minSamples` produces more noise.

---

### OPTICS

OPTICS does not mark noise during its pass; the external library returns a list of
clusters. Points not appearing in any cluster are identified post-hoc:

```typescript
// After optics.run(...)
const clusteredSet = new Set<number>();
clusters.forEach(cluster => cluster.forEach(idx => clusteredSet.add(idx)));
for (let i = 0; i < dataset.length; i++) {
    if (!clusteredSet.has(i)) noiseIndices.push(i);
}
```

Any point unreachable (at any density up to `epsilon`) from a core object is
noise.

**Sensitivity:** Same direction as DBSCAN. Because OPTICS processes all densities
up to `epsilon`, it typically produces fewer noise points than DBSCAN at the same
settings.

---

### K-Means

K-Means always assigns every point to the nearest centroid. `noiseIndices` is
always an empty array:

```typescript
noiseIndices = [];  // K-means has no concept of noise
```

The "Hide Noise" control is automatically disabled and reset to *Show All Points*
when K-Means is the active algorithm.

---

### ST-DBSCAN

Identical logic to DBSCAN, but a point counts as a neighbour only when it is
within *both* the spatial and temporal thresholds:

```typescript
// A candidate neighbour must satisfy both tests:
if (spatialDist > epsilonSpatial) return false;
const temporalDist = Math.abs(timestamps[idx] - pointTime);
return temporalDist <= epsilonTemporal;
```

A point is **NOISE** when its count of qualifying spatio-temporal neighbours is
`< minSamples`.

**Sensitivity:** Either threshold independently controls noise. Raising `epsilon`
reduces spatial noise; raising `epsilonTemporal` reduces temporal isolation noise.
A point that has many close *spatial* neighbours but none within the time window
will still be noise.

---

### STEP Magnitude

Two distinct routes produce noise:

1. **Magnitude filter** — events below `stepMinMag` are excluded before clustering
   begins; they are unconditionally noise.
2. **Spatial-temporal exclusion** — events at or above `stepMinMag` that are not
   captured within the Wells-Coppersmith radius and [T1, T2] window of *any*
   mainshock pass through the outer loop without being assigned a cluster, and
   are collected into noise at the end:

```typescript
const clusteredIndices = new Set(
    workingData.filter(e => e.clusterNo > 0).map(e => e.originalIndex)
);
const noiseIndices = earthquakes.map((_, i) => i)
    .filter(i => !clusteredIndices.has(i));
```

**Edge case:** If no event meets `stepMinMag`, every event is returned as noise
immediately.

**Sensitivity:** Lowering `stepMinMag` admits smaller mainshocks, reducing noise.
Widening `stepT1`/`stepT2` or raising `stepMinMag` increases noise.

---

### STEP Time

Identical noise logic to STEP Magnitude; the only difference is chronological
(rather than magnitude-first) processing order. The same two routes apply:
magnitude filter, then spatial-temporal exclusion.

---

### Nearest-Neighbor (Zaliapin-Ben-Zion)

An event is initially marked as **background** (noise candidate) in a first pass
when its η distance to the nearest *earlier* event exceeds the threshold, or when
it has no earlier event at all (first event in catalog):

```typescript
// First pass — identify candidate noise
if (nnDistances[i].distance >= threshold || nnDistances[i].nnIndex === -1) {
    noiseIndices.push(i);
}
```

In a second pass, clusters are built by following parent-child links. Some
background mainshocks are *pulled into clusters as parents* of dependent aftershock
chains. After cluster building, `noiseIndices` is filtered down to events that
truly remain unassigned:

```typescript
const clusteredSet = new Set<number>();
clusters.forEach(cluster => cluster.forEach(idx => clusteredSet.add(idx)));
const trueNoiseIndices = noiseIndices.filter(i => !clusteredSet.has(i));
```

**Result:** An independent mainshock (large η) that spawned aftershocks is a
*cluster member*, not noise. A background event with no dependent offspring is
noise.

**Sensitivity:** Raising `nnThreshold` admits more events as clustered, reducing
noise. Lowering it produces a sparser, more conservative clustering with more noise.

---

### TMC (Reasenberg)

An event remains noise (cluster ID 0) when it never falls within the
magnitude-dependent interaction radius **and** adaptive look-ahead window of any
prior event:

```typescript
if (dist <= rTest) {
    // assign to / create a cluster
}
// Otherwise: event keeps clusterId = 0  →  becomes noise at end
```

At the end of processing, events with `clusterId === 0` are collected:

```typescript
for (const event of sortedEvents) {
    if (event.clusterId > 0) {
        clusterMap.get(event.clusterId)!.push(event.originalIndex);
    } else {
        noiseIndices.push(event.originalIndex);
    }
}
```

**Sensitivity:** Increasing `tmcRfact` (larger radius) or `tmcTauMax` (longer
window) reduces noise. Increasing `tmcP1` raises the interaction probability
required, which *increases* noise.

---

### Hardebeck (2019)

All events start with `label = −1`. A label is written only when an event falls
within the rupture-length window of a valid, non-suppressed mainshock:

```typescript
// All labels initialised to −1
const labels = new Array(n).fill(-1);

// Only events inside the aftershock window get a cluster label
if (t_c > t_m && (t_c - t_m) <= windowMs) {
    const d = dist(mIdx, i);
    if (d <= radius) labels[i] = clusterId;
}
```

Noise is collected at the end as every event still at `−1`:

```typescript
for (let i = 0; i < n; i++) {
    if (labels[i] === -1) noiseIndices.push(i);
}
```

Three conditions produce noise:
1. Event magnitude < `hardebeckMinMag` (cannot be a mainshock) **and** not within
   any valid mainshock's window.
2. Event is a mainshock candidate but is **suppressed** — a larger event occurred
   within 5 × RL km in the prior `mainshockTimeYears` years.
3. Event is a mainshock candidate that passes suppression but has **no dependent
   aftershocks** (it is the mainshock of a size-1 sequence) — it still receives its
   own cluster label so is *not* noise.

**Sensitivity:** Lowering `hardebeckMinMag` admits smaller mainshocks, reducing
noise. Increasing `hardebeckRuptureMult` extends aftershock capture radii,
reducing noise among events near mainshocks.

---

### HDBSCAN

All labels start at `−1`. Labels are written during the final extraction phase
only for points that belong to a selected stable cluster:

```typescript
// Phase 7: labelling
const labels = new Array<number>(n).fill(-1);
for (const [cid, members] of selectedClusters) {
    for (const i of members) labels[i] = clusterIdMap.get(cid)!;
}

// Remaining −1 points are noise; compute GLOSH outlier score
for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    noiseIndices.push(i);
    const dropLam  = condensed.get(dropCId)?.dropouts.get(i) ?? 0;
    const lmxOfDrop = lambdaMaxOfCluster.get(dropCId) ?? 0;
    outlierScores[i] = lmxOfDrop > 0 ? Math.max(0, 1 - dropLam / lmxOfDrop) : 1;
}
```

A point is noise when it was "condensed out" during the pruning phase (its
sub-cluster had fewer than `minClusterSize` members) and was not later claimed by
a selected parent cluster.

**GLOSH outlier score** (available on `ClusterResult.outlierScores`):
- **0** — dropped out of its cluster at high density; nearly clustered
- **1** — dropped out at very low density; extreme outlier

**Sensitivity:** Increasing `hdbscanMinClusterSize` raises the minimum size of an
accepted cluster, causing smaller clusters to dissolve into noise. Increasing
`hdbscanMinSamples` requires denser cores, marking sparser regions as noise.

---

## Performance Optimisations

### R-tree Spatial Indexing
DBSCAN and ST-DBSCAN use R-tree spatial indexing (via `rbush`) for 90–95 % faster
neighbour queries compared to brute-force O(n²) distance calculations.

### Clustering Routing (Worker / Server)

Computation is routed to avoid blocking the UI:

| Condition | Route |
|-----------|-------|
| Result already in cache | Instant return (no computation) |
| Algorithm in {HDBSCAN, nearest-neighbor, TMC, hardebeck-2019} | **Server** (`POST /api/cluster`) — always, regardless of dataset size |
| All other algorithms | **Web Worker** (non-blocking background thread) |
| Web Worker unavailable / timed-out | Synchronous fallback on main thread |

The worker timeout is **30 seconds**; if exceeded the worker is reset and the sync
fallback runs.

### LRU Result Cache
Clustering results are cached in a 10-entry LRU cache with a 5-minute TTL.
The cache key is derived from dataset size, first/last/middle event timestamps, and
sample magnitudes (O(1) hash). Cache hits skip all computation.

---

## Comparison Guide

| Algorithm | Temporal Aware | Seismology-Specific | Produces Noise | Requires k | Complexity |
|-----------|---------------|---------------------|----------------|------------|------------|
| DBSCAN | ❌ | ❌ | ✅ | ❌ | O(n log n) with R-tree |
| OPTICS | ❌ | ❌ | ✅ | ❌ | O(n log n) |
| K-Means | ❌ | ❌ | ❌ | ✅ | O(n · k · iter) |
| ST-DBSCAN | ✅ | ❌ | ✅ | ❌ | O(n log n) with R-tree |
| STEP-Mag | ✅ | ✅ | ✅ | ❌ | O(n²) worst case |
| STEP-Time | ✅ | ✅ | ✅ | ❌ | O(n²) worst case |
| Nearest-Neighbor | ✅ | ✅ | ✅ | ❌ | O(n²) |
| TMC / Reasenberg | ✅ | ✅ | ✅ | ❌ | O(n²) |
| Hardebeck (2019) | ✅ | ✅ | ✅ | ❌ | O(n²) worst case |
| HDBSCAN | ❌ | ❌ | ✅ (+ scores) | ❌ | O(n²) worst case |

---

## Seismology-Specific Recommendations

| Goal | Recommended Algorithm |
|------|-----------------------|
| Aftershock sequence identification | **STEP-Mag** or **TMC / Reasenberg** |
| Real-time / chronological sequence detection | **STEP-Time** |
| Statistical catalog declustering | **Nearest-Neighbor (Zaliapin-Ben-Zion)** |
| Physical rupture-based aftershock windows | **Hardebeck (2019)** |
| Spatio-temporal swarm detection (no clear mainshock) | **ST-DBSCAN** |
| General spatial clustering / exploratory analysis | **DBSCAN** |
| Variable-density clusters | **OPTICS** or **HDBSCAN** |
| Soft cluster membership + outlier scores | **HDBSCAN** |
| Fixed number of regions (no noise needed) | **K-Means** |
