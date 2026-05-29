# Setup & Deployment

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 20.x (≥ 18.18) | Required by Next.js 16 |
| npm | 9.x | Or yarn / pnpm / bun |
| Browser | Chrome 90+, Firefox 88+, Safari 14+ | IndexedDB required for catalog caching |

No database, no backend, and no API keys are required. Earthquake data comes from the public [GeoNet quakesearch API](https://quakesearch.geonet.org.nz/).

---

## Installation

```bash
git clone <repository-url>
cd ESNZ-ForecastApp
npm install
```

---

## Environment variables

None are required — the app runs with hardcoded defaults (the GeoNet upstream URL is a constant in `/api/earthquakes/proxy/route.ts`; there is no `GEONET_QUAKESEARCH_URL` override). Three optional client-side toggles exist:

```bash
# .env.local  (client-side — NEXT_PUBLIC_ prefix required)
NEXT_PUBLIC_ENABLE_WEB_WORKERS=true   # default true; route light clustering to a Web Worker
NEXT_PUBLIC_USE_RTREE=true            # default true; R-tree acceleration for DBSCAN/ST-DBSCAN
NEXT_PUBLIC_CACHE_TTL_MS=60000        # default 60000; in-memory cache TTL
```

> Note: there is **no cron job and no server-side disk cache**. A `CRON_SECRET` and a `/api/cron/update-cache` route referenced in an old `.env.local` are not implemented; ignore them.

---

## Local development

```bash
npm run dev        # http://localhost:3000
```

Hot module replacement is enabled. Changes to TypeScript and React files reload instantly.

### First-load behaviour

On first visit the browser has no cached data. The app will:

1. Detect no IndexedDB catalog for the requested magnitude
2. Fetch the last **365 days** of events from GeoNet (~12 monthly HTTP requests via the proxy)
3. Save the catalog to IndexedDB
4. Render the full UI

Subsequent visits load from IndexedDB immediately.

### Watching for type errors

```bash
npx tsc --noEmit --watch
```

### Running tests

```bash
npm test                   # run once
npm run test:watch         # re-run on file changes
npm run test:coverage      # with lcov coverage report
```

Tests use **Jest 30** with `@testing-library/react` for component tests.

### Linting

```bash
npm run lint               # next lint (ESLint + Next.js rules)
```

---

## Production build

```bash
npm run build
npm start
```

`next build` compiles, tree-shakes, and optimises the application. `npm start` runs the resulting Next.js production server.

### Known build configuration

**`next.config.js` settings:**

| Option | Value | Reason |
|---|---|---|
| `turbopack` | `{}` (enabled) | Turbopack is the default bundler on Next.js 16; a webpack fallback config is retained |
| `resolve.fallback.fs/net/tls` | `false` | Highcharts and map-collection packages reference Node built-ins that must be shimmed away for the browser bundle (webpack fallback) |
| `webpack … moduleIds` | `'deterministic'` | Stable chunk hashing across builds |
| `staticPageGenerationTimeout` | 180 s | Large Highcharts map-data imports can exceed the default 60 s |
| `watchOptions.ignored` | `node_modules`, `.next`, `.git` | Prevents `EMFILE: too many open files` inotify exhaustion in dev mode on Linux |

---

## Deployment on Vercel

The application is designed for zero-configuration deployment on [Vercel](https://vercel.com/).

1. Push the repository to GitHub
2. Import the project at `vercel.com/new`
3. Leave all build settings at defaults (`next build`, output directory `.next`)
4. Click **Deploy**

### Serverless function limits

| Route | Computation | Vercel Hobby limit | Vercel Pro limit |
|---|---|---|---|
| `/api/earthquakes/proxy` | Simple HTTP proxy | Well within 10 s | Well within 60 s |
| `/api/cluster` | Heavy clustering (HDBSCAN, TMC, etc.) | May timeout for large catalogs | 60 s — sufficient for most inputs |

For large catalogs with heavy algorithms, the **Pro plan** is recommended. The 60-second limit is hardcoded in the route handler.

### Server LRU cache on Vercel

The in-process LRU cache in `/api/cluster` resets on every **cold start** (serverless scale-to-zero). This is acceptable — the cache only benefits repeated identical requests within a warm function instance. A warm instance typically stays alive for several minutes between requests.

---

## Web Worker in Next.js

`clustering.worker.ts` is loaded (from `src/hooks/useClusteringWorker.ts`) via:

```typescript
new Worker(new URL('../lib/analysis/clustering.worker.ts', import.meta.url))
```

Next.js bundles Web Worker files referenced this way automatically (Turbopack and the webpack fallback). No additional configuration is needed.

---

## IndexedDB in restricted environments

The cache degrades gracefully when IndexedDB is unavailable:

| Environment | Behaviour |
|---|---|
| Server-side rendering | Guard: `typeof window === 'undefined'` → skip |
| Firefox Strict Mode | `indexedDB.open()` throws synchronously → caught, re-fetches each load |
| Safari Private Browsing | Same as above |
| Chrome with storage blocked | `request.onerror` fires → `dbPromise` reset, re-fetches each load |

In all unavailable cases the app functions normally — it simply fetches from GeoNet on every page load instead of using the cache.

---

## Dependency overview

```json
{
  "next": "^16.2.4",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "typescript": "^5",

  "highcharts": "^12.4.0",
  "highcharts-react-official": "^3.2.3",

  "leaflet": "^1.9.4",
  "react-leaflet": "^5.0.0",

  "@tanstack/react-query": "^5.90.10",

  "rbush": "^4.0.1",
  "density-clustering": "^1.3.0",
  "ml-levenberg-marquardt": "^5.0.0",
  "simple-statistics": "^7.8.8",

  "date-fns": "^4.1.0",
  "tailwindcss": "^3",
  "lucide-react": "latest",
  "xlsx": "^0.18.5",
  "jspdf": "^3.0.4",
  "html2canvas": "^1.4.1",

  "jest": "^30",
  "@testing-library/react": "latest",
  "@testing-library/jest-dom": "latest"
}
```

### TanStack Query

`@tanstack/react-query` is installed and a `QueryClient` is configured in `src/components/Providers.tsx`. However, the main data-fetching logic (`useGeoNetData`) does **not** use `useQuery` — it manages fetching and caching directly. TanStack Query is available as infrastructure for future use.

---

## Scripts reference

| Script | Command | Description |
|---|---|---|
| `dev` | `next dev` | Development server with HMR |
| `build` | `next build` | Production build |
| `start` | `next start` | Run production build |
| `lint` | `next lint` | ESLint with Next.js rules |
| `test` | `jest` | Run test suite once |
| `test:watch` | `jest --watch` | Re-run on file change |
| `test:coverage` | `jest --coverage` | Coverage report |
