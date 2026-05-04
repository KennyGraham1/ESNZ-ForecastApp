# Nearest-Neighbor Clustering in Temporal-Spatial Analysis

This document explains the Nearest-Neighbor option in the Temporal-Spatial Analysis module of ESNZ-ForecastApp.

## Where Nearest-Neighbor Is Used

The UI option is:

- `nearest-neighbor`: Nearest-Neighbor - Seismology

The UI control is `NN Threshold` in `src/components/tabs/TemporalSpatial.tsx`. The implementation is in `src/lib/analysis/clustering.ts`.

## Parameter

- `nnThreshold`: maximum nearest-neighbor metric value for dependent-event linkage.

Coordinates are projected into approximate kilometers before the metric is calculated.

## Technical Meaning

For each event, the implementation searches only earlier catalog events. It finds the earlier event with the smallest space-time-magnitude nearest-neighbor distance:

```text
eta = timeDays * spatialDistanceKm^1.6 / 10^(1.0 * earlierMagnitude)
```

An event with `eta < nnThreshold` is considered linked to its nearest earlier event. Linked parent-child relationships are then traversed to build clusters.

```mermaid
flowchart TD
    A[Earthquake catalog] --> B[Project lon/lat into km coordinates]
    B --> C[Loop through events in catalog order]
    C --> D[For event i, inspect events before i]
    D --> E[Compute temporal distance in days]
    E --> F[Compute spatial distance in km]
    F --> G[Compute eta using earlier event magnitude]
    G --> H{eta is smallest so far?}
    H -->|Yes| I[Store j as nearest parent]
    H -->|No| J[Keep current parent]
    I --> K{More earlier events?}
    J --> K
    K -->|Yes| D
    K -->|No| L[Store event i nearest-neighbor result]
    L --> M{More events?}
    M -->|Yes| C
    M -->|No| N[Classify high eta or no parent as background candidates]
```

Cluster construction:

```mermaid
flowchart TD
    A[Nearest-neighbor results] --> B[Initialize all labels unassigned]
    B --> C[Pick an unassigned event with eta below threshold]
    C --> D[Start new cluster queue]
    D --> E[Pop current event]
    E --> F[Assign current event to cluster]
    F --> G{Has linked parent below threshold?}
    G -->|Yes| H[Add parent to queue]
    G -->|No| I[Scan children]
    H --> I
    I --> J[Find later events whose parent is current event]
    J --> K{Child eta below threshold?}
    K -->|Yes| L[Add child to queue]
    K -->|No| M[Ignore child]
    L --> N{Queue empty?}
    M --> N
    N -->|No| E
    N -->|Yes| O[Cluster complete]
    O --> P[Remove clustered background parents from noise]
    P --> Q[Return clusters and true noise]
```

## Seismological Meaning

Nearest-Neighbor clustering is closer to declustering than pure spatial clustering. It asks whether each event is unusually close in space and time to an earlier event, with larger earlier events given stronger linking power.

This is useful for identifying:

- aftershock chains,
- foreshock-mainshock relationships,
- dependent event cascades,
- background events that do not link strongly to earlier seismicity.

## Noise Meaning

Noise means:

```text
The event remains background-like or independent after nearest-neighbor links are built.
```

Some events initially classified as background candidates can later become cluster members if they are the parent of dependent events. The implementation filters those out of `noiseIndices` after cluster construction.

## Parameter Effects

- Larger `nnThreshold`: more events link to earlier events, fewer noise points.
- Smaller `nnThreshold`: stricter dependent-event definition, more background/noise events.

```mermaid
flowchart LR
    A[Lower threshold] --> B[Only very strong links accepted]
    B --> C[More background/noise]
    C --> D[Conservative dependent clusters]

    E[Higher threshold] --> F[Weaker links accepted]
    F --> G[Fewer noise events]
    G --> H[More extensive chains]
```

## Practical Use

Use Nearest-Neighbor when the question is:

```text
Which events are dependent on earlier events in space-time-magnitude terms?
```

It is better suited than DBSCAN for background versus triggered-event interpretation.
