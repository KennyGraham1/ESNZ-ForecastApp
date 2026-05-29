# Algorithm Comparison & Noise Reference

```{note}
This page is the cross-algorithm **comparison** and the detailed **noise-determination**
reference. For each algorithm's formulas, parameters, and a step-by-step diagram, see the
dedicated pages under [Clustering Algorithms](../clustering-algorithms.md) and
[Declustering Methods](../declustering-methods.md).
```

How each algorithm decides what counts as **noise / background**, how the twelve
algorithms compare, and which to choose for a given seismological goal.

---

## Table of Contents

- [Noise Determination](#noise-determination)
- [Comparison Guide](#comparison-guide)
- [Seismology-Specific Recommendations](#seismology-specific-recommendations)

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
