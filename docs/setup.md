# Setup & Deployment

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 18.x | Required by Next.js 13 |
| npm | 9.x | Or yarn / pnpm / bun |
| Modern browser | Chrome 90+, Firefox 88+, Safari 14+ | IndexedDB required |

No database, no backend server, and no API keys are required. All earthquake data is fetched from the public [GeoNet quakesearch API](https://quakesearch.geonet.org.nz/).

---

## Installation

```bash
git clone <repository-url>
cd ESNZ-ForecastApp

npm install
```

---

## Environment variables

The application has no required environment variables for local development. The Next.js server API routes (`/api/earthquakes/proxy` and `/api/cluster`) run on the same origin, so no `NEXT_PUBLIC_API_URL` is needed.

If you need to override the GeoNet base URL (e.g. for testing against a staging endpoint), you can add:

```bash
# .env.local
GEONET_QUAKESEARCH_URL=https://quakesearch.geonet.org.nz/geojson
```

This variable is read server-side only (no `NEXT_PUBLIC_` prefix) and defaults to `https://quakesearch.geonet.org.nz/geojson` if not set.

---

## Local development

```bash
npm run dev
```

The development server starts at [http://localhost:3000](http://localhost:3000) with hot module replacement enabled.

### First load behaviour

On first visit the browser has no cached data. The application will:

1. Fetch the last 365 days of M2+ earthquakes from GeoNet (~12 monthly HTTP requests via the proxy).
2. Store the catalog in browser IndexedDB.
3. Render the full interactive UI.

Subsequent visits read from IndexedDB instantly with no network requests.

### Watching for TypeScript errors

```bash
npx tsc --noEmit --watch
```

### Running tests

```bash
npm test                  # run once
npm run test:watch        # re-run on file changes
npm run test:coverage     # with coverage report
```

Tests use **Jest 30** with **Testing Library** for component tests.

---

## Production build

```bash
npm run build
npm start
```

`next build` compiles and optimises the app. The `staticPageGenerationTimeout` is set to 180 seconds in `next.config.js` to handle large Highcharts map-data imports.

### Build notes

- Highcharts and related map-collection packages resolve `fs`, `net`, and `tls` Node built-ins to `false` in the webpack config (they are browser-only at runtime).
- CSS optimisation (`optimizeCss`) is disabled to avoid occasional build failures with the Tailwind/PostCSS pipeline on this Next.js version.

---

## Deployment (Vercel)

The application is designed for zero-configuration deployment on [Vercel](https://vercel.com/).

1. Push the repository to GitHub.
2. Import the project in the Vercel dashboard.
3. Leave all build settings at defaults (`next build`, output directory `.next`).
4. Deploy.

**Serverless function limits:**

The `/api/cluster` route runs heavy clustering algorithms (HDBSCAN, TMC, etc.) synchronously. On Vercel's Hobby plan, serverless functions time out after **10 seconds**; on Pro/Enterprise, the limit is 60 seconds. For large catalogs with heavy algorithms, the Pro plan is recommended.

The `/api/earthquakes/proxy` route is a simple HTTP proxy and well within any timeout limit.

**Server-side LRU cache:**

The in-process LRU cache in `/api/cluster` resets on every cold start (serverless function scale-to-zero). This is acceptable — the cache only accelerates repeated identical requests within a warm function instance.

---

## Development notes

### Next.js 13 App Router

The project uses the **App Router** (not the Pages Router). All route files live under `src/app/`. The interactive UI (`PageClient.tsx`) is explicitly marked `'use client'`; the thin RSC shell (`page.tsx`) reads URL search params and wraps the client component in `<Suspense>`.

### Web Worker in Next.js

`clustering.worker.ts` is a standard Web Worker loaded via `new Worker(new URL(..., import.meta.url))`. Next.js 13 bundles this automatically via webpack. No additional configuration is required.

### IndexedDB availability

The application handles environments where IndexedDB is unavailable (server-side rendering, Firefox strict mode, Safari Private Browsing) by catching the synchronous throw from `indexedDB.open()` inside the Promise constructor. When IndexedDB is unavailable, the catalog is fetched fresh from GeoNet on every page load.

### Linting

```bash
npm run lint       # next lint (ESLint with Next.js rules)
```

---

## Dependency highlights

```json
{
  "next": "13.5.6",
  "react": "^18",
  "typescript": "^5",
  "highcharts": "^12",
  "highcharts-react-official": "^3.2.1",
  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",
  "@tanstack/react-query": "^5.90.10",
  "rbush": "^4.0.1",
  "density-clustering": "^1.3.0",
  "simple-statistics": "^7.8.3",
  "ml-levenberg-marquardt": "^5.0.2",
  "date-fns": "^3.6.0",
  "tailwindcss": "^3",
  "jest": "^30"
}
```

> **Note on TanStack Query:** `@tanstack/react-query` is installed and a `QueryClient` is set up in `src/components/Providers.tsx`. However, the main data-fetching logic uses a custom `useGeoNetData` hook (not `useQuery`). TanStack Query is available as infrastructure for future use.
