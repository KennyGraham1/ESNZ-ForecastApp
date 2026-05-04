# TMC Reasenberg-Style Clustering in Temporal-Spatial Analysis

This document explains the TMC option in the Temporal-Spatial Analysis module of ESNZ-ForecastApp.

## Where TMC Is Used

The UI option is:

- `tmc`: TMC - Reasenberg Style

The UI controls are in `src/components/tabs/TemporalSpatial.tsx`. The implementation is `timeMagnitudeClustering` in `src/lib/analysis/clustering.ts`.

## Parameters

- `rfact`: multiplier for event interaction radius.
- `tau0`: base look-ahead time in days.
- `tauMax`: maximum look-ahead time in days.
- `p1`: probability threshold in the Reasenberg-style look-ahead formula.
- `xk`: magnitude scaling factor.
- `tmcMinMag`: internal effective minimum magnitude, defaulted in the clustering function.

Event interaction radius is:

```text
r = min(rfact * 0.011 * 10^(0.4 * M), 30) km
```

The cap at 30 km acts as a crustal-thickness-style constraint.

## Technical Meaning

TMC processes events in chronological order. For each event, it looks forward in time by a duration `tau`. If a later event is close enough in time and space, the two events are linked into a cluster.

For unclustered events, the look-ahead window is `tau0`. For clustered events, `tau` depends on elapsed time since the largest event in the cluster, then is clamped between `tau0` and `tauMax`.

```mermaid
flowchart TD
    A[Earthquake catalog] --> B[Sort events by time]
    B --> C[Initialize every event with clusterId = 0]
    C --> D[Visit event1 in temporal order]
    D --> E{event1 already clustered?}
    E -->|No| F[Use tau0 look-ahead]
    E -->|Yes| G[Compute tau from cluster largest event and Reasenberg formula]
    F --> H[Scan later events until timeDiff > tau]
    G --> H
    H --> I[For each event2 inside look-ahead window]
    I --> J{event1 and event2 already in same cluster?}
    J -->|Yes| K[Skip pair]
    J -->|No| L[Compute Haversine distance]
    L --> M[Compute event1 interaction radius]
    M --> N[If event1 clustered, add radius from cluster largest event]
    N --> O{Distance within interaction distance?}
    O -->|No| P[Continue scanning]
    O -->|Yes| Q[Declare link]
```

Cluster update logic:

```mermaid
flowchart TD
    A[Link declared between event1 and event2] --> B{Cluster membership state}
    B -->|Neither clustered| C[Create new cluster containing both]
    B -->|event1 clustered only| D[Add event2 to event1 cluster]
    B -->|event2 clustered only| E[Add event1 to event2 cluster]
    B -->|Both clustered but different clusters| F[Merge clusters]
    C --> G[Track largest magnitude]
    D --> G
    E --> G
    F --> G
    G --> H[Track time of largest event]
    H --> I[Track most recent event time]
    I --> J[Continue temporal scan]
    J --> K[After all scans, clusterId 0 events become noise]
```

## Seismological Meaning

TMC is aimed at dependent-event clustering rather than generic spatial grouping. It is appropriate for declustering-style questions such as:

- which events are linked as aftershocks,
- which events belong to cascading sequences,
- which events remain independent background candidates.

The important feature is that cluster growth depends on both time and magnitude. Larger events increase the effective interaction scale and influence the future look-ahead behavior.

## Noise Meaning

Noise means:

```text
The event was never linked to another event by the Reasenberg-style space-time interaction rules.
```

Noise events are candidates for background or independent seismicity under the chosen TMC parameters.

## Parameter Effects

- Larger `rfact`: larger interaction radius, more clustering.
- Larger `tau0`: longer base look-ahead, more early links.
- Larger `tauMax`: allows longer-lived clusters.
- Larger `p1`: can increase the Reasenberg-style look-ahead time.
- Larger `xk`: changes the magnitude scaling in the tau formula.

```mermaid
flowchart LR
    A[Increase rfact] --> B[Larger spatial interaction radius]
    B --> C[More linked event pairs]
    C --> D[Fewer noise events]

    E[Increase tauMax or tau0] --> F[Longer time windows]
    F --> G[Longer sequence growth]
    G --> H[More cluster merging possible]
```

## Practical Use

Use TMC when the question is:

```text
Which events are dependent on prior seismicity under Reasenberg-style space-time rules?
```

Use Hardebeck if you want simpler rupture-length mainshock windows. Use ST-DBSCAN if you want density-based bursts without Reasenberg-style magnitude interaction.
