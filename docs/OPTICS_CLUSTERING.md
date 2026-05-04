# OPTICS Clustering in Temporal-Spatial Analysis

This document explains the OPTICS option in the Temporal-Spatial Analysis module of ESNZ-ForecastApp.

## Where OPTICS Is Used

The UI option is:

- `optics`: OPTICS - Hierarchical Density

The UI controls are in `src/components/tabs/TemporalSpatial.tsx`. The OPTICS call is made in `src/lib/analysis/clustering.ts` using the `density-clustering` package.

## Parameters

- `epsilon`: maximum spatial search radius in kilometers.
- `minSamples`: minimum local neighborhood size used by the density method.

Coordinates are projected into approximate kilometers before clustering:

```text
x = (longitude - meanLongitude) * 111.32 * cos(meanLatitude)
y = (latitude - meanLatitude) * 110.57
```

## Technical Meaning

OPTICS is a density-based algorithm like DBSCAN, but it is designed to expose cluster structure across changing densities. Conceptually, it orders events by density reachability rather than committing only to one density level.

In this app, the library returns a flat list of clusters. The implementation then identifies noise by checking which event indices do not appear in any returned cluster.

```mermaid
flowchart TD
    A[Earthquake catalog] --> B[Project lon/lat into km coordinates]
    B --> C[Run OPTICS library with epsilon and minSamples]
    C --> D[Library computes reachability ordering]
    D --> E[Library extracts flat clusters]
    E --> F[Create empty clustered index set]
    F --> G[Loop over returned clusters]
    G --> H[Add every cluster member to clustered set]
    H --> I{All clusters scanned?}
    I -->|No| G
    I -->|Yes| J[Loop over all catalog events]
    J --> K{Event index in clustered set?}
    K -->|Yes| L[Event receives cluster label]
    K -->|No| M[Event is noise]
    L --> N{More events?}
    M --> N
    N -->|Yes| J
    N -->|No| O[Return clusters and noiseIndices]
```

## Seismological Meaning

OPTICS is useful when earthquake clustering density varies across the catalog. Examples include:

- a dense aftershock core with a diffuse outer sequence,
- swarms with uneven internal density,
- mixed urban/network-sensitive catalog regions,
- fault systems where some sections are much more active than others.

The current app output is still a flat cluster assignment, so the reachability structure is not visualized directly.

## Noise Meaning

For OPTICS, noise means:

```text
The event was not included in any cluster returned by the OPTICS library.
```

Seismologically, this usually corresponds to background or weakly connected seismicity at the selected density settings.

## Parameter Effects

- Larger `epsilon`: allows wider reachability searches and can reduce noise.
- Smaller `epsilon`: restricts searches and can split diffuse structures.
- Larger `minSamples`: requires stronger local density and produces more conservative clusters.
- Smaller `minSamples`: makes weaker density structures easier to cluster.

```mermaid
flowchart LR
    A[Catalog with variable density] --> B[OPTICS reachability ordering]
    B --> C[Dense valleys in reachability structure]
    C --> D[Returned clusters]
    B --> E[Weak or isolated points]
    E --> F[Noise in app output]
```

## Practical Use

Use OPTICS when the question is:

```text
Are there spatial clusters at different densities that DBSCAN may miss or merge?
```

Use HDBSCAN when you want a more explicit stability-based extraction of variable-density clusters.
