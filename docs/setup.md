# Setup & Deployment

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 18.x | Required by Next.js 13 |
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

No environment variables are required for local development. All defaults are hardcoded.

If you need to override the GeoNet upstream URL (e.g. for testing against a staging endpoint):

```bash
# .env.local  (server-side only — no NEXT_PUBLIC_ prefix)
GEONET_QUAKESEARCH_URL=https://quakesearch.geonet.org.nz/geojson
```

This variable is read by `/api/earthquakes/proxy/route.ts` and defaults to `https://quakesearch.geonet.org.nz/geojson` if absent.

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
| `resolve.fallback.fs/net/tls` | `false` | Highcharts and map-collection packages reference Node built-ins that must be shimmed away for the browser bundle |
| `staticPageGenerationTimeout` | 180 s | Large Highcharts map-data imports can exceed the default 60 s |
| `experimental.optimizeCss` | `false` | Disabled to avoid occasional build failures with the Tailwind/PostCSS pipeline on this Next.js version |
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

## Web Worker in Next.js 13

`clustering.worker.ts` is loaded via:

```typescript
new Worker(new URL('../../lib/analysis/clustering.worker.ts', import.meta.url))
```

Next.js 13 + webpack automatically bundles Web Worker files referenced this way. No additional configuration is needed.

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
  "next": "13.5.6",
  "react": "^18",
  "react-dom": "^18",
  "typescript": "^5",

  "highcharts": "^12.4.0",
  "highcharts-react-official": "^3.2.1",

  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",

  "@tanstack/react-query": "^5.90.10",

  "rbush": "^4.0.1",
  "density-clustering": "^1.3.0",
  "ml-levenberg-marquardt": "^5.0.0",
  "simple-statistics": "^7.8.3",

  "date-fns": "^3.6.0",
  "tailwindcss": "^3",
  "lucide-react": "latest",
  "xlsx": "latest",
  "jspdf": "latest",
  "html2canvas": "latest",

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
