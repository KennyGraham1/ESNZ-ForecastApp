# Interface & Interaction Guide

A tour of the app's tabs and their interactive controls. The *methods* behind each plot live in [Statistical Models](statistical-models.md), [Clustering Algorithms](clustering-algorithms.md), and [Declustering Methods](declustering-methods.md); this page covers the **UI**.

---

## Global controls

- **Data source** — switch between the live GeoNet stream and an uploaded catalog (see [Data Sources](data-sources.md)); a control restores GeoNet after an upload.
- **Time range** — preset windows (30 days … 30 years) or a custom range (DD/MM/YYYY text + native date picker).
- **Minimum magnitude** — M2 … M5+ (each threshold is cached independently).
- **Check for New Events** — incremental refresh; a cache indicator shows freshness.
- **Fetch warnings** — a dismissable amber panel appears when a GeoNet fetch is partial (e.g. a chunk hit the 20,000-event cap).
- **URL state** — the active tab, time range, and magnitude are encoded in the URL (shareable/bookmarkable).
- **Active-filter chips** summarise the current filter state.

### Shared filters (`FilterControls`)
Magnitude min/max, depth category, and start/end date, plus a **polygon filter** — paste **WKT**, upload a polygon file (`.txt`/`.wkt`/`.dat`), or **draw on the map**; changes are staged and applied with **Apply / Reset**.

---

## Maps (Leaflet)

Markers are sized by magnitude and coloured by depth. Map controls:

- **Fullscreen** toggle and **scale bar**.
- **Basemap switch** — CartoDB Light/Dark, OpenStreetMap, Esri Satellite.
- **Colour themes** — 6 palettes (Ocean, Heat, Viridis, Magma, Cividis, Plasma).
- **Depth-class show/hide** toggles (+ "show all") and a magnitude legend.
- **Fit to Data** / **Reset NZ View** buttons; a notice appears when the displayed set is sampled.

---

## Basic Dashboard

- **Summary cards** — total events, max magnitude, average depth.
- **Map** (above).
- **Magnitude vs Time** scatter (coloured by depth) and **frequency-over-time** line with a **7-day moving average**.
- **Temporal statistic cards** — inter-event mean/median/min/max/std and events-per-day.

---

## Advanced Statistical Analysis (6 panels)

- **Gutenberg–Richter** — Aki MLE b ± σ, Mc, R², N(≥Mc), fitted line, plus interactive **Mc-method** dropdown (Maximum Curvature / Goodness-of-fit) and **bin-width slider**, and an **incremental (per-bin)** FMD series alongside the cumulative one.
- **Depth Profile** — depth-vs-latitude cross-section coloured by magnitude.
- **Magnitude Distribution** — histogram with a **log-Y toggle** (read the G-R slope directly); mean/median magnitude.
- **Temporal Statistics** — magnitude-vs-time, frequency + 7-day MA, a **coefficient-of-variation** card (clustered / Poissonian / quasi-periodic), an **inter-event histogram vs a Poisson reference**, and **cumulative count + cumulative seismic moment**. (Methods: [Temporal and Catalog Statistics](statistical-models.md#temporal-and-catalog-statistics).)
- **Temporal Completeness & b-value Stability** — rolling-window Mc(t) and b(t) with a Shi & Bolt band.
- **3D Visualization** — lon/lat/depth scatter (drag-rotate, scroll/pinch-zoom).

---

## Aftershock Sequence

- **Declustering method** toggle — SRL/Hardebeck (2019) or Gardner-Knopoff — with **editable parameters** (mainshock years/×RL and aftershock days/×RL; or GK coefficients a, b, c, d).
- **Mainshock selection** — 12 historical NZ presets, manual entry (time/magnitude/name), or auto-detected recent significant events (M ≥ 5.5, declustered, > 2 aftershocks).
- **Aftershock timeline** — magnitude vs days; click to select; top events labelled; mainshock annotated.
- **Spatial radius filter** — auto-set from the Wells-Coppersmith rupture length `10^(0.59M − 2.44)` km, **floored at 50 km** (a deliberately generous default for this view; adjustable), debounced, with a colour-palette dropdown.
- **Magnitude vs Depth** scatter, **Leaflet aftershock map**, and a **timeline-zoom → map filter** (zooming the timeline filters the map); cross-chart hover highlighting links the three views; **Fit All** recenters.
- **3D aftershock distribution** coloured by days-since-mainshock.
- **Omori–Utsu fit** — K/c/p, R², CIs, AIC/BIC, 7 optimisers, Mc input, and three sub-tabs (**Model Fit / Residuals / Q-Q**); reference-model overlays (Reasenberg–Jones + 4 Hardebeck regional variants); a **cumulative aftershock** plot.
- **Generate Analysis Report** — multi-page **PDF** of the mainshock parameters, fitted values, CIs, AIC/BIC, method, and charts.

---

## Temporal-Spatial Analysis

- **Algorithm dropdown** grouped **Clustering** (DBSCAN, OPTICS, ST-DBSCAN, HDBSCAN, k-Means) and **Declustering** (Gardner-Knopoff, Uhrhammer, Hardebeck, STEP-Mag/Time, TMC, Nearest-Neighbor) — mirrors the docs.
- **Per-algorithm parameter sliders**; clustering re-runs with a **600 ms debounce** plus an explicit Apply.
- **Hide Noise** toggle (disabled for k-Means, which has no noise).
- **Selection mode** — Individual or Cluster — and **"Show only selected cluster"** isolation; a summary reports cluster count and % clustered / % noise.
- **Three linked views** — Leaflet cluster map, temporal scatter, and 3D plot, all coloured by cluster label with click-select kept in sync.
- **Export** charts/data with clustering metadata; a progress panel reports the route (worker/server) and can cancel.

---

## Sandbox

A free-form explorer (see also the histogram features below):

- **Stats panel** (events / max mag / depth range) and local filters (min-mag, max-depth, a **date-range slider**).
- **Fast Render** sampling toggle (per-plot-type thresholds keep large catalogs responsive).
- **Plot types** — Scatter, Map, Histogram, 3D, Multi-Panel.
- **Scatter / 3D / Multi-Panel** — choose X/Y/(Z)/Color/Size fields and a palette.
- **Histogram** — multiple fields, bin slider, **group/colour-by** (depth/magnitude class, year, or quantile/categorical buckets), **log-Y**, **reverse-cumulative**, **density normalization**, plus special fields **"Hour of Day"** and **"Inter-event Gap"**.

---

## Exports

- **`ChartExportButtons`** (most Highcharts panels) — PNG / JPEG / SVG at 1920×1080 @2×, plus **CSV / JSON** (clustering panels include cluster metadata).
- **Sandbox** scatter / 3D / multi-panel use the **native Highcharts export menu** (PNG/PDF/SVG).
- **Aftershock** offers the full multi-page **PDF report**.
