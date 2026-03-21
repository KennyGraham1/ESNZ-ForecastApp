/**
 * Browser-side IndexedDB cache for earthquake catalogs.
 * Persists data across page refreshes, eliminating the need for server-side file caching.
 * No external dependencies — uses the raw IndexedDB API with Promise wrappers.
 *
 * Schema:
 *   Database: esnz-earthquake-catalog (v1)
 *   Object store: 'catalogs'  (keyPath: 'minMagnitude')
 *     One entry per magnitude level (2, 3, 4, 5 …)
 *     Each entry holds all loaded events for that magnitude plus metadata.
 */

const DB_NAME = 'esnz-earthquake-catalog';
const DB_VERSION = 1;
const STORE_NAME = 'catalogs';

/** Earthquake record as stored in IndexedDB (time is kept as ISO string; Date is not serialisable). */
export interface StoredEarthquake {
    eventID: string;
    time: string;     // ISO 8601 string
    timeMs: number;   // pre-computed ms — used for fast date-range filtering
    latitude: number;
    longitude: number;
    depth: number;
    magnitude: number;
    locality: string;
    azimuthalGap?: number;
    magnitudeStationCount?: number;
    minimumDistance?: number;
    standardError?: number;
    originError?: number;
    evaluationMethod?: string;
    usedPhaseCount?: number;
}

/** Full catalog entry stored per minMagnitude key. */
export interface StoredCatalog {
    minMagnitude: number;           // keyPath — the IndexedDB record key
    earthquakes: StoredEarthquake[];
    initialFetchDate: string;       // ISO — earliest event date we have loaded
    lastUpdated: string;            // ISO — when we last fetched new events
    totalEvents: number;
}

// Singleton DB promise — opened once, reused across all operations.
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'minMagnitude' });
                }
            };

            request.onsuccess = () => resolve(request.result);

            request.onerror = () => {
                dbPromise = null; // reset so next call retries the open
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('IndexedDB open blocked — another tab may have an older version open');
            };
        });
    }
    return dbPromise;
}

export async function getCachedCatalog(minMagnitude: number): Promise<StoredCatalog | null> {
    try {
        const db = await getDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(minMagnitude);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB read error:', err);
        return null;
    }
}

export async function saveCatalog(catalog: StoredCatalog): Promise<void> {
    try {
        const db = await getDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(catalog);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB write error:', err);
        // Non-fatal — app continues; next load will re-fetch from GeoNet
    }
}

export async function clearCatalog(minMagnitude: number): Promise<void> {
    try {
        const db = await getDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).delete(minMagnitude);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('IndexedDB delete error:', err);
    }
}
