# ESNZ-ForecastApp

**ESNZ-ForecastApp** is a browser-based earthquake analysis and aftershock forecasting application for New Zealand seismicity. It works with **two interchangeable data sources** — a **live [GeoNet](https://www.geonet.org.nz/) stream** (cached client-side in IndexedDB) and **your own uploaded catalog** (CSV/TSV/JSON/GeoJSON/Excel/DAT/QuakeML) — and provides a full suite of interactive statistical tools for seismologists and researchers. See **[Data Sources](data-sources.md)**.

---

## Feature Overview

### Live Catalog Fetching

- Fetches earthquake data from GeoNet's public quakesearch API via a server-side CORS proxy
- Splits requests into monthly chunks and automatically bisects any chunk that returns ≥ 20,000 features
- Bounded concurrency (5 parallel requests), exponential back-off retry (3 attempts), structured fetch reports
- Supports any magnitude threshold (M2+, M3+, M4+, …)

### Browser-Side Persistence

- Full catalog stored in browser **IndexedDB** — no server database required
- Instant re-render on repeat visits with no network requests
- Incremental refresh (user-triggered): fetches only events since last update
- Historical gap-fill: automatically fetches missing date ranges on demand

### Upload Your Own Catalog

- Import **CSV / TSV / TXT, JSON / GeoJSON, Excel (.xlsx/.xls), DAT, or QuakeML (.qml/.xml)** files (up to 200 MB)
- Quick import (auto-detect) or a 4-step wizard: file select → column mapping → import options → preview & import
- Auto-suggested column mapping (incl. split year/month/day columns and custom fields); 8 date formats (incl. Unix s/ms); decimal / DMS / decimal-minute coordinates
- Configurable validation with **Global** and **New Zealand** presets, a preview-statistics panel, and a downloadable per-row error report
- Full details in **[Data Sources](data-sources.md)**

### Spatial Clustering (12 Algorithms)

| Algorithm | Routing | Description |
|---|---|---|
| DBSCAN | Worker | Density-based, R-tree accelerated |
| OPTICS | Worker | Variable-density |
| k-Means | Worker | Fixed-k partition |
| ST-DBSCAN | Worker | Spatio-temporal DBSCAN (haversine) |
| STEP-Mag | Worker | Magnitude-scaled windows |
| STEP-Time | Worker | Fixed time windows |
| Gardner-Knopoff | Worker | Magnitude-window declustering (1974) |
| Uhrhammer | Worker | Magnitude-window declustering (1986) |
| HDBSCAN | Server | Hierarchical, with soft membership |
| Nearest-Neighbor | Server | Zaliapin–Ben-Zion η metric (Otsu threshold) |
| TMC | Server | Reasenberg-style |
| Hardebeck-2019 | Server | Rupture-length windows |

### Aftershock Sequence Analysis

- **Omori–Utsu fitting**: 7 optimisation methods (grid-search, Levenberg–Marquardt, Nelder-Mead, hybrid, MLE, MLE-SA, MLE-EM)
- **Confidence intervals**: Hessian-based (Fisher Information Matrix) and bootstrap (100 resamplings)
- **Model diagnostics**: Q-Q plot, cumulative residual process, standardised Pearson residuals, profile likelihood surface
- **AIC / BIC**: computed for all MLE-based methods
- **Reference models**: Reasenberg & Jones (1989) and four Hardebeck et al. (2019) regional variants
- **12 pre-configured NZ events**: Kaikōura 2016, Christchurch 2011, Canterbury 2010, and more
- **Declustering**: SRL/Hardebeck window method and Gardner-Knopoff method

### Gutenberg-Richter Analysis

- Frequency-magnitude distribution with **Aki–Utsu maximum-likelihood** b-value and **Shi & Bolt (1982)** standard error
- Two magnitude-of-completeness methods: **Maximum Curvature** and **Wiemer & Wyss (2000)** goodness-of-fit (KSTOTAL criterion)
- Cumulative and interval variants

### Interactive Visualisation

- **Highcharts** charts with canvas-mode Boost above 50,000 points per series
- **Leaflet** maps (cluster and aftershock views) with canvas renderer
- **3D scatter plots**: latitude, longitude, depth, coloured by cluster or time
- **Data Sandbox**: configurable scatter / histogram / 3D / multi-panel explorer. Histograms support **group/colour-by** any field (depth/magnitude class, year, or quantile/categorical buckets), a **logarithmic count axis** (Gutenberg–Richter), a **reverse-cumulative** N(≥value) overlay, and **density normalization**
- PDF report export via html2canvas + jsPDF

---

## Documentation

**Getting started**

| Page | Contents |
|---|---|
| [Setup & Deployment](setup.md) | Prerequisites, install, env vars, dev workflow, production build, Vercel deployment |
| [Data Sources](data-sources.md) | Live GeoNet stream and user catalog upload (formats, column mapping, date/coordinate formats, validation presets, the data-source toggle) |
| [Interface & Interaction Guide](interface.md) | Per-tab UI tour: global filters, map controls, selection modes, the Sandbox, and exports |

**Methods** — the scientific core

| Page | Contents |
|---|---|
| [Clustering Algorithms](clustering-algorithms.md) | The 5 density/partition algorithms (DBSCAN, OPTICS, k-Means, ST-DBSCAN, HDBSCAN), routing, coordinate system — each with its own deep-dive page |
| [Declustering Methods](declustering-methods.md) | The 7 declustering methods (Gardner-Knopoff, Uhrhammer, Hardebeck, STEP-Mag/Time, Reasenberg/TMC, Nearest-Neighbor) — each with a Mermaid algorithm diagram |
| [Statistical Models](statistical-models.md) | Omori's Law (7 fit methods, diagnostics, CIs), Gutenberg-Richter, reference models |

**Architecture** — how the app is built

| Page | Contents |
|---|---|
| [Architecture Overview](architecture.md) | App Router structure, component tree, API routes, state management, data types |
| [Data Flow & Logic](data-flow.md) | Fetch pipeline, caching, gap-fill, refresh, clustering pipeline — all with Mermaid diagrams |
| [Performance Optimizations](performance.md) | IndexedDB, LRU caches, Transferable Workers, R-tree, Highcharts Boost, reservoir sampling |

The **Appendix & Notes** section collects supplementary engineering deep-dives (parameter reference, confidence-interval methods, and historical optimization notes).

---

## Technology Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.4 |
| Language | TypeScript | 5 |
| UI | React | 19 |
| Styling | Tailwind CSS | 3 |
| Charts | Highcharts | 12.4.0 |
| Maps | Leaflet + react-leaflet | 1.9.4 / 5.0.0 |
| Clustering | density-clustering | 1.3.0 |
| Spatial index | rbush (R-tree) | 4.0.1 |
| Curve fitting | ml-levenberg-marquardt | 5.0.0 |
| Statistics | simple-statistics | 7.8.8 |
| Date handling | date-fns | 4.1.0 |
| Data fetching | TanStack Query | 5.90.10 |
| Spreadsheet import | xlsx | 0.18.5 |
| PDF export | jsPDF + html2canvas | latest |
| Testing | Jest | 30 |

```{toctree}
:hidden:
:caption: GETTING STARTED
:maxdepth: 2

setup
data-sources
interface
```

```{toctree}
:hidden:
:caption: METHODS
:maxdepth: 2

clustering-algorithms
declustering-methods
statistical-models
```

```{toctree}
:hidden:
:caption: ARCHITECTURE
:maxdepth: 2

architecture
data-flow
performance
```

```{toctree}
:hidden:
:caption: APPENDIX & NOTES
:maxdepth: 2

Algorithm comparison & noise reference <reference/CLUSTERING_ALGORITHMS>
Omori-law implementation notes <reference/OMORI_LAW_ANALYSIS>
Confidence-interval methods <reference/CONFIDENCE_INTERVALS_IMPROVED>
Optimization notes <reference/optimization-notes>
```
