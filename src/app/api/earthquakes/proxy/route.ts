/**
 * GET /api/earthquakes/proxy
 *
 * Thin pass-through proxy to the GeoNet quakesearch API.
 * Required because GeoNet does not provide CORS headers that allow
 * direct browser fetch from a different origin.
 *
 * No server-side state, no file caching — purely a forwarding layer.
 * All query parameters are forwarded verbatim to GeoNet.
 *
 * The app's durable cache lives in browser IndexedDB. This route intentionally
 * uses `cache: 'no-store'` because large GeoNet chunks can exceed Next.js's
 * incremental cache entry size.
 */

import { NextRequest, NextResponse } from 'next/server';

const GEONET_BASE = 'https://quakesearch.geonet.org.nz/geojson';

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams.toString();
    const url = `${GEONET_BASE}?${params}`;

    try {
        const upstream = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'ESNZ-ForecastApp GeoNet catalog proxy',
            },
            // No server-side caching — the browser's IndexedDB is the cache layer.
            // Next.js's incremental cache has a 2MB per-entry limit which large GeoNet
            // chunks (e.g. active seismic months) exceed, causing errors.
            cache: 'no-store',
        });

        if (!upstream.ok) {
            const body = await upstream.text().catch(() => '');
            return NextResponse.json(
                {
                    error: `GeoNet API error: ${upstream.statusText}`,
                    message: body.slice(0, 500),
                },
                { status: upstream.status }
            );
        }

        const data = await upstream.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                error: 'Failed to reach GeoNet API',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 502 }
        );
    }
}
