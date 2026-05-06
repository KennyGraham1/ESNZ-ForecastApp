# ESNZ-ForecastApp

**ESNZ-ForecastApp** is a browser-based earthquake analysis and aftershock forecasting application for New Zealand seismicity. It streams live earthquake catalogs from [GeoNet](https://www.geonet.org.nz/), caches them in the browser, and exposes a suite of statistical tools for seismologists and researchers.

---

## What it does

| Capability | Description |
|---|---|
| **Live catalog** | Fetches M2+ (or higher) events from GeoNet's quakesearch API, split into monthly chunks with automatic retry and recursive date-splitting when result limits are hit |
| **Persistent cache** | Stores the full catalog in browser IndexedDB — no repeat downloads on subsequent visits |
| **Spatial clustering** | Ten algorithms (DBSCAN, OPTICS, k-Means, ST-DBSCAN, HDBSCAN, TMC, Hardebeck-2019, STEP-Mag, STEP-Time, Nearest-Neighbor) with R-tree acceleration and Web Worker offloading |
| **Aftershock analysis** | Omori's Law parameter fitting (K, c, p) using seven methods including grid-search, Levenberg-Marquardt, and maximum-likelihood variants |
| **Gutenberg-Richter** | b-value estimation via Maximum Curvature or Goodness-of-Fit completeness methods |
| **Interactive charts** | Highcharts-powered plots with canvas acceleration above 50,000 points; Leaflet maps for spatial views |

---

## Documentation sections

- [Architecture Overview](architecture.md) — App Router component tree, API routes, state management
- [Data Flow & Logic](data-flow.md) — Fetch pipeline, IndexedDB caching, and clustering pipeline with Mermaid diagrams
- [Clustering Algorithms](clustering-algorithms.md) — All ten algorithms, parameter reference, and worker routing
- [Statistical Models](statistical-models.md) — Omori's Law fitting, Gutenberg-Richter analysis, reference models
- [Performance Optimizations](performance.md) — LRU cache, Transferable Workers, R-tree indexing, Highcharts Boost
- [Setup & Deployment](setup.md) — Prerequisites, environment variables, local development, production builds

---

## Quick start

```bash
git clone <repository-url>
cd ESNZ-ForecastApp
npm install
npm run dev        # http://localhost:3000
```

See [Setup & Deployment](setup.md) for full prerequisites and production instructions.

---

## Technology summary

| Layer | Technology |
|---|---|
| Framework | Next.js 13.5.6 (App Router) |
| Language | TypeScript 5, React 18 |
| Styling | Tailwind CSS 3 |
| Charts | Highcharts 12 + Boost module (canvas) |
| Maps | Leaflet 1.9 + react-leaflet 4.2 |
| Clustering | density-clustering 1.3, rbush 4.0 |
| Statistics | simple-statistics 7.8, ml-levenberg-marquardt 5.0 |
| Persistence | Browser IndexedDB (no server-side DB) |
| Testing | Jest 30 + Testing Library |
