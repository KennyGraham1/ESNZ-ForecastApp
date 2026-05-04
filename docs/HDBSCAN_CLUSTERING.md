# HDBSCAN Clustering in Temporal-Spatial Analysis

This document explains the HDBSCAN option in the Temporal-Spatial Analysis module of ESNZ-ForecastApp.

## Where HDBSCAN Is Used

The UI option is:

- `hdbscan`: HDBSCAN - Hierarchical Density

The UI controls are in `src/components/tabs/TemporalSpatial.tsx`. The implementation is `hdbscanClustering` in `src/lib/analysis/clustering.ts`.

## Parameters

- `minClusterSize`: smallest group considered a genuine cluster.
- `minSamples`: k-nearest-neighbor size used to calculate core distance.

Coordinates are projected into approximate kilometers before clustering.

## Technical Meaning

HDBSCAN builds a hierarchy over density levels and selects the most stable clusters. Unlike DBSCAN, it does not require a single `epsilon` radius.

The implementation follows these phases:

1. Compute core distances.
2. Build a mutual-reachability graph.
3. Compute a minimum spanning tree.
4. Convert the tree into a single-linkage hierarchy.
5. Condense the hierarchy using `minClusterSize`.
6. Compute cluster stability.
7. Extract a flat clustering.
8. Assign probabilities and outlier scores.

## Detailed Algorithm Flow

```mermaid
flowchart TD
    A[Earthquake catalog] --> B[Project lon/lat into km coordinates]
    B --> C[Clamp minSamples and minClusterSize to dataset size]
    C --> D[Compute pairwise Euclidean distances]
    D --> E[For each point, find kth nearest-neighbor distance]
    E --> F[Store core distance for every point]
    F --> G[Define mutual-reachability distance]
    G --> H[d_mreach i,j = max core_i, core_j, distance_i_j]
    H --> I[Build minimum spanning tree using Prim algorithm]
    I --> J[Sort MST edges by weight]
    J --> K[Create single-linkage merge hierarchy]
```

Hierarchy condensation:

```mermaid
flowchart TD
    A[Single-linkage hierarchy] --> B[Start at root cluster]
    B --> C[Inspect next split]
    C --> D{Are both children at least minClusterSize?}
    D -->|Yes| E[Create two new condensed child clusters]
    D -->|No| F{One child >= minClusterSize?}
    F -->|Yes| G[Large child continues current cluster]
    G --> H[Small child points drop out as noise candidates]
    F -->|No| I[Both children too small]
    I --> J[All child points drop out]
    E --> K[Continue recursively]
    H --> K
    J --> K
    K --> L{More hierarchy nodes?}
    L -->|Yes| C
    L -->|No| M[Condensed cluster tree complete]
```

Cluster selection and labeling:

```mermaid
flowchart TD
    A[Condensed cluster tree] --> B[Compute stability for each cluster]
    B --> C[Process tree bottom-up]
    C --> D{Parent stability at least selected child stability sum?}
    D -->|Yes| E[Select parent cluster]
    D -->|No| F[Select child clusters]
    E --> G[Collect selected cluster points]
    F --> G
    G --> H[Assign cluster labels]
    H --> I[Compute membership probability from lambda death]
    I --> J[Unlabeled points become noise]
    J --> K[Compute GLOSH-style outlier score]
    K --> L[Return clusters, noise, probabilities, outlierScores]
```

## Seismological Meaning

HDBSCAN is useful when earthquake densities vary strongly across the study region. Examples include:

- a dense aftershock core and diffuse outer aftershock halo,
- swarms with uneven internal density,
- mixed tectonic and volcanic seismicity,
- regional catalogs containing both active faults and sparse background events.

HDBSCAN is often a better choice than DBSCAN when no single `epsilon` value can describe all meaningful clusters.

## Noise Meaning

Noise means:

```text
The event did not belong to any selected stable density cluster.
```

The implementation also produces an outlier score:

```text
0 = nearly cluster-like
1 = strongly anomalous relative to the nearest condensed cluster
```

## Parameter Effects

- Larger `minClusterSize`: fewer, larger, more stable clusters; more noise.
- Smaller `minClusterSize`: more small clusters; less noise but more possible over-fragmentation.
- Larger `minSamples`: more conservative density estimate; more noise.
- Smaller `minSamples`: more permissive clustering.

```mermaid
flowchart LR
    A[Increase minClusterSize] --> B[Small branches drop out]
    B --> C[More noise]
    C --> D[Fewer stable clusters]

    E[Increase minSamples] --> F[Larger core distances]
    F --> G[Density requirement becomes stricter]
    G --> H[More conservative clustering]
```

## Practical Use

Use HDBSCAN when the question is:

```text
Which clusters are stable across density levels in a catalog with variable seismicity density?
```

Use DBSCAN when one distance scale is appropriate. Use ST-DBSCAN, STEP, TMC, or Hardebeck when time and sequence physics must be part of the cluster definition.
