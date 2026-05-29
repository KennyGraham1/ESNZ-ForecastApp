# ESNZ-ForecastApp

Browser-based **earthquake analysis and aftershock forecasting** for New Zealand seismicity. It streams live catalogs from [GeoNet](https://www.geonet.org.nz/), caches them client-side in IndexedDB, and provides interactive statistical, clustering, and forecasting tools for seismologists and researchers.

📖 **Full documentation:** https://esnz-forecastapp.readthedocs.io · source in [`docs/`](docs/)

## Features

- **Live & uploaded catalogs** — GeoNet fetch (monthly chunking, auto-bisect, retry) with IndexedDB cache and incremental refresh; import CSV/TSV/JSON/GeoJSON/XLSX/QuakeML.
- **Clustering & declustering (12 algorithms)** — DBSCAN, OPTICS, k-Means, ST-DBSCAN, HDBSCAN (density); Nearest-Neighbor (Zaliapin–Ben-Zion η, Otsu threshold) and Reasenberg/TMC (link-based); Gardner-Knopoff (1974), Uhrhammer (1986), Hardebeck (2019), STEP-Mag/Time (window declustering). Light algorithms run in a Web Worker, heavy ones server-side. See the [declustering deep-dive](docs/declustering-methods.md).
- **Gutenberg–Richter** — Aki–Utsu MLE b-value with Shi & Bolt (1982) uncertainty; Maximum-Curvature or Wiemer & Wyss (2000, KSTOTAL) magnitude of completeness; interactive Mc-method / bin-width controls and incremental + cumulative FMD overlays.
- **Aftershock sequences** — Omori–Utsu fitting (7 optimisers, MLE with Hessian/bootstrap CIs, AIC/BIC, Q-Q & residual diagnostics); 12 historical NZ presets or custom mainshocks; SRL/Hardebeck and Gardner-Knopoff declustering.
- **Temporal statistics** — inter-event-time histogram vs a Poisson reference, inter-event coefficient of variation, cumulative count & seismic-moment curves, and rolling-window **Mc(t)/b(t) stability**.
- **Data Sandbox** — configurable scatter / histogram / 3D / multi-panel explorer; histograms support group/colour-by (depth, magnitude, year, or quantile/categorical buckets), log-axis (Gutenberg–Richter), reverse-cumulative N(≥value), and density normalization.
- **Visualisation & export** — Highcharts (canvas Boost), Leaflet maps, 3D scatter, linked temporal-spatial selection, PNG/JPEG/SVG/CSV/JSON and multi-page PDF export.

## Tech stack

Next.js 13 (App Router) · React 18 · TypeScript · Tailwind CSS · Highcharts 12 · Leaflet · TanStack Query · density-clustering · RBush (R-tree) · ml-levenberg-marquardt · simple-statistics · Jest. Performance: IndexedDB cache, Web Workers, R-tree indexing, stratified sampling, pre-computed timestamps.

## Getting started

```bash
git clone <repository-url>
cd ESNZ-ForecastApp
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm test                     # tests
npm run lint                 # lint
```

## Documentation

Docs are written in Markdown under [`docs/`](docs/) and published to Read the Docs (Sphinx + MyST + `sphinx_rtd_theme`). Build locally:

```bash
pip install -r docs/requirements.txt
sphinx-build -b html docs docs/_build/html   # open docs/_build/html/index.html
```

Key pages: [Architecture](docs/architecture.md) · [Data Flow](docs/data-flow.md) · [Clustering Algorithms](docs/clustering-algorithms.md) · [Declustering Methods](docs/declustering-methods.md) · [Statistical Models](docs/statistical-models.md) · [Performance](docs/performance.md) · [Setup & Deployment](docs/setup.md).

## Data source

Earthquake data from **[GeoNet](https://www.geonet.org.nz/)**, New Zealand's geological hazard information system (public API).

## License

Private and proprietary.

---

> **Disclaimer:** for research and educational use only. For official earthquake information and warnings see [GeoNet](https://www.geonet.org.nz/) and [Civil Defence](https://www.civildefence.govt.nz/).
