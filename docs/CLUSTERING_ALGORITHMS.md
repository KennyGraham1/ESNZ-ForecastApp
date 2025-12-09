# Clustering Algorithms Reference

This document describes all earthquake clustering algorithms implemented in the ESNZ-ForecastApp, their parameters, and scientific references.

## Table of Contents
- [1. DBSCAN (Density-Based Spatial Clustering)](#1-dbscan-density-based-spatial-clustering)
- [2. OPTICS (Ordering Points To Identify Clustering Structure)](#2-optics-ordering-points-to-identify-clustering-structure)
- [3. K-Means](#3-k-means)
- [4. ST-DBSCAN (Spatio-Temporal DBSCAN)](#4-st-dbscan-spatio-temporal-dbscan)
- [5. STEP Magnitude Clustering](#5-step-magnitude-clustering)
- [6. STEP Time Clustering](#6-step-time-clustering)
- [7. Nearest-Neighbor Clustering (Zaliapin-Ben-Zion)](#7-nearest-neighbor-clustering-zaliapin-ben-zion)
- [8. TMC (Time-Magnitude Clustering / Reasenberg)](#8-tmc-time-magnitude-clustering--reasenberg)
- [Noise Determination](#noise-determination)

---

## 1. DBSCAN (Density-Based Spatial Clustering)

**Description:**  
DBSCAN groups together points that are closely packed together, marking points in low-density regions as noise. Optimized with R-tree spatial indexing for 90-95% faster performance.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Spatial distance threshold in kilometers. Points within this distance are considered neighbors. |
| `minSamples` | number | 5 | Minimum number of points required to form a dense region (core point). |
| `useRTree` | boolean | true | Use R-tree spatial index for optimization. |

**Output:**  
- Clusters of earthquake events
- Noise points (events that don't belong to any cluster)

**Reference:**  
Ester, M., et al. (1996). "A Density-Based Algorithm for Discovering Clusters in Large Spatial Databases with Noise." KDD-96.

---

## 2. OPTICS (Ordering Points To Identify Clustering Structure)

**Description:**  
OPTICS is an extension of DBSCAN that creates an ordering of points based on their density-reachability. It doesn't produce explicit clusters but an augmented ordering that can be used to extract clusters at various density levels.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Maximum neighborhood radius in kilometers. |
| `minSamples` | number | 5 | Minimum points required to form a core object. |

**Reference:**  
Ankerst, M., et al. (1999). "OPTICS: Ordering Points To Identify the Clustering Structure." SIGMOD Conference.

---

## 3. K-Means

**Description:**  
K-Means partitions the dataset into exactly K clusters by minimizing within-cluster variance. Unlike DBSCAN/OPTICS, every point is assigned to a cluster (no noise).

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | number | 5 | Number of clusters to create. |

**Note:** K-Means assigns every point to a cluster; there are no noise points.

**Reference:**  
MacQueen, J. (1967). "Some Methods for Classification and Analysis of Multivariate Observations." Berkeley Symposium on Mathematical Statistics and Probability.

---

## 4. ST-DBSCAN (Spatio-Temporal DBSCAN)

**Description:**  
ST-DBSCAN extends DBSCAN to consider both spatial AND temporal proximity. Events must be within both the spatial epsilon AND temporal epsilon to be considered neighbors. Uses R-tree spatial indexing for optimization.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` | number | 25 | Spatial distance threshold in kilometers. |
| `epsilonTemporal` | number | 7 | Temporal distance threshold in days. |
| `minSamples` | number | 5 | Minimum neighbors to form a core point. |

**Reference:**  
Birant, D. & Kut, A. (2007). "ST-DBSCAN: An algorithm for clustering spatial-temporal data." Data & Knowledge Engineering.

---

## 5. STEP Magnitude Clustering

**Description:**  
Clusters earthquakes starting from the **largest magnitude event** (mainshock), using magnitude-dependent spatial windows based on the Wells-Coppersmith (1994) fault length relation. Implements sliding time windows that extend when significant aftershocks occur.

Based on Annemarie Christophersen's MATLAB implementation (2008).

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stepMinMag` | number | 2.0 | Minimum mainshock magnitude (Mc). Events below this are filtered. |
| `stepT1` | number | 1 | Time window before an earthquake in days. |
| `stepT2` | number | 30 | Time window after an earthquake in days. |

**Algorithm Details:**
1. Filter events by minimum magnitude
2. Find the largest unclustered earthquake (mainshock)
3. Calculate search radius using Wells-Coppersmith formula:
   ```
   radius = max(5, 10^(0.59 × M - 2.44)) km
   ```
4. Cluster events within radius and time window
5. Extend time window if significant events (M > Mc) are found
6. Repeat until all events are clustered

**Reference:**  
- Wells, D.L. & Coppersmith, K.J. (1994). "New Empirical Relationships among Magnitude, Rupture Length, Rupture Width, Rupture Area, and Surface Displacement." BSSA.
- Christophersen, A. (2008). STEP clustering MATLAB implementation.

---

## 6. STEP Time Clustering

**Description:**  
Clusters earthquakes in **temporal order** (chronologically), identifying sequences based on magnitude-dependent spatial windows and sliding time windows. Unlike STEP-Magnitude, this processes events as they occur in time.

Based on Annemarie Christophersen's MATLAB implementation (2007).

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stepMinMag` | number | 2.0 | Minimum mainshock magnitude. |
| `stepT1` | number | 1 | Time window before an earthquake in days. |
| `stepT2` | number | 30 | Time window after an earthquake in days. |

**Algorithm Details:**
1. Process events in chronological order
2. For each event above minimum magnitude, start a new cluster
3. Search backwards in time (within T1 window)
4. Search forwards in time (within T2 window)
5. Use Wells-Coppersmith radius based on current largest magnitude in cluster
6. Extend time window when larger events are encountered

**Reference:**  
Christophersen, A. (2007). STEP time clustering MATLAB implementation.

---

## 7. Nearest-Neighbor Clustering (Zaliapin-Ben-Zion)

**Description:**  
Identifies earthquake clusters based on nearest-neighbor distances in the space-time-magnitude domain. This method uses a rescaled distance metric (η) that accounts for the background seismicity rate.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nnThreshold` | number | 1.0 | Nearest-neighbor distance threshold. Lower values = stricter clustering. |

**Distance Metric (η):**
```
η = t × r^d / 10^(b×m)
```
Where:
- `t` = temporal distance (days)
- `r` = spatial distance (km)
- `d` = fractal dimension (default: 1.6)
- `b` = Gutenberg-Richter b-value (default: 1.0)
- `m` = magnitude of the earlier event

**Reference:**  
- Zaliapin, I. & Ben-Zion, Y. (2013). "Earthquake clusters in southern California I: Identification and stability." JGR.
- Zaliapin, I. & Ben-Zion, Y. (2020). "Earthquake declustering using the nearest-neighbor approach in space-time-magnitude domain." JGR.

---

## 8. TMC (Time-Magnitude Clustering / Reasenberg)

**Description:**
Implements the Reasenberg (1985) declustering algorithm. Uses magnitude-dependent spatio-temporal windows based on the Kanamori-Anderson (1975) crack model. Features adaptive look-ahead windows and cluster merging.

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tmcRfact` | number | 10 | Spatial radius multiplier for interaction zone. |
| `tmcTau0` | number | 2 | Base look-ahead time in days. |
| `tmcTauMax` | number | 10 | Maximum look-ahead time in days. |
| `tmcP1` | number | 0.99 | Probability threshold for clustering (0-1). |
| `tmcXk` | number | 0.5 | Magnitude scaling factor. |

**Algorithm Details:**

### Interaction Radius (Kanamori-Anderson crack model):
```
r = rfact × 0.011 × 10^(0.4 × M) km
```
Capped at 30 km (crustal thickness constraint).

### Look-ahead Time (τ):
```
τ = -ln(1 - p1) × t / 10^((ΔM - 1) × 2/3)
```
Where:
- `t` = time since largest event in cluster
- `ΔM` = (1 - xk) × M_largest - M_min
- Result clamped to [τ0, τMax]

### Clustering Process:
1. Sort events chronologically
2. For each event, calculate interaction radius and look-ahead time
3. Test subsequent events for spatial-temporal proximity
4. Create new clusters, add to existing clusters, or merge clusters
5. Update cluster properties when larger events are added

**Reference:**
- Reasenberg, P. (1985). "Second-Order Moment of Central California Seismicity, 1969-1982." JGR.
- Kanamori, H. & Anderson, D.L. (1975). "Theoretical Basis of Some Empirical Relations in Seismology." BSSA.

---

## Noise Determination

How each algorithm determines "noise" (points not belonging to any cluster):

| Algorithm | Method used to classify Noise |
|-----------|-------------------------------|
| **DBSCAN** | Events with fewer than `minSamples` neighbors within the `epsilon` spatial radius are marked as noise. |
| **ST-DBSCAN** | Similar to DBSCAN, but neighbors must fall within **both** the spatial `epsilon` and `epsilonTemporal` thresholds. Points with insufficient spatio-temporal neighbors are noise. |
| **K-Means** | **Does not produce noise.** This algorithm forces every point into one of the `k` clusters based on proximity to a centroid. |
| **OPTICS** | Events that are not reachable from any core point at any density distance (up to `epsilon`) are considered noise. |
| **STEP (Mag/Time)** | Events that fall below the `stepMinMag` threshold or are not captured within the magnitude-dependent spatio-temporal windows of a mainshock are classified as background noise. |
| **Nearest-Neighbor** | Events with a nearest-neighbor distance (η) greater than `nnThreshold` are considered unlinked background events (noise). Independent mainshocks often appear as "noise" in this context as they lack a close parent. |
| **TMC (Reasenberg)** | Events that do not fall within the interaction zone and look-ahead time of any prior event are left unclustered (cluster ID 0) and thus classified as noise. |

---

## Performance Optimizations

### R-tree Spatial Indexing
DBSCAN and ST-DBSCAN use R-tree spatial indexing (via the `rbush` library) for 90-95% faster neighbor queries compared to brute-force distance calculations.

### Web Workers
For datasets larger than 500 events, clustering computations are offloaded to Web Workers to prevent UI freezing.

---

## Default Configuration

From `src/config/performance.ts`:

```typescript
CLUSTERING: {
    WEB_WORKER_THRESHOLD: 500,    // Use Web Worker for datasets > 500
    USE_RTREE: true,              // R-tree spatial indexing enabled
    DEFAULT_EPSILON: 25,          // km
    DEFAULT_MIN_SAMPLES: 5,
    DEFAULT_K: 5                  // for K-means
}
```

---

## Comparison Guide

| Algorithm | Best For | Handles Noise | Requires K | Temporal Aware |
|-----------|----------|---------------|------------|----------------|
| DBSCAN | General spatial clustering | ✅ | ❌ | ❌ |
| OPTICS | Variable density clusters | ✅ | ❌ | ❌ |
| K-Means | Fixed number of clusters | ❌ | ✅ | ❌ |
| ST-DBSCAN | Space-time clustering | ✅ | ❌ | ✅ |
| STEP-Mag | Aftershock identification | ✅ | ❌ | ✅ |
| STEP-Time | Real-time sequence detection | ✅ | ❌ | ✅ |
| Nearest-Neighbor | Statistical declustering | ✅ | ❌ | ✅ |
| TMC/Reasenberg | Aftershock removal | ✅ | ❌ | ✅ |

---

## Seismology-Specific Recommendations

- **Aftershock Identification**: Use **STEP-Mag** or **TMC** for identifying mainshock-aftershock sequences
- **Real-time Monitoring**: Use **STEP-Time** for chronological sequence detection
- **Statistical Analysis**: Use **Nearest-Neighbor (Zaliapin-Ben-Zion)** for declustering catalogs
- **Swarm Detection**: Use **ST-DBSCAN** for identifying spatio-temporal swarms without clear mainshock
