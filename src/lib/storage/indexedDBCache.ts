/**
 * IndexedDB Cache for Client-Side Persistence
 * Stores earthquake data and clustering results across browser sessions
 * Provides instant loading on return visits
 */

const DB_NAME = 'earthquake-forecast-cache';
const DB_VERSION = 2; // bumped: added workspaces + filterPresets stores
const STORE_EARTHQUAKES = 'earthquakes';
const STORE_CLUSTERING = 'clustering';
const STORE_WORKSPACES = 'workspaces';
const STORE_PRESETS = 'filterPresets';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ── Public workspace / preset types ──────────────────────────────────────────

/** Snapshot of clustering parameters + UI state saved by the user. */
export interface ClusteringWorkspace {
    id: string;           // UUID (crypto.randomUUID or timestamp-based)
    name: string;         // user-defined label
    savedAt: number;      // Date.now()
    algorithm: string;
    params: Record<string, number>;   // all slider values keyed by param name
    selectionMode: 'individual' | 'cluster';
}

/** A named set of filter options saved by the user. */
export interface FilterPreset {
    id: string;
    name: string;
    savedAt: number;
    minMagnitude: number;
    maxMagnitude: number;
    depthCategory: string;
    startDate: string;
    endDate: string;
    polygon?: string;
}

interface CacheEntry<T> {
    key: string;
    data: T;
    timestamp: number;
    version: string;
}

class IndexedDBCache {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    /**
     * Initialize IndexedDB connection
     */
    private async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined' || !window.indexedDB) {
                console.warn('IndexedDB not available');
                reject(new Error('IndexedDB not supported'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB initialization failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object stores
                if (!db.objectStoreNames.contains(STORE_EARTHQUAKES)) {
                    db.createObjectStore(STORE_EARTHQUAKES, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_CLUSTERING)) {
                    db.createObjectStore(STORE_CLUSTERING, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
                    const ws = db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
                    ws.createIndex('savedAt', 'savedAt');
                }
                if (!db.objectStoreNames.contains(STORE_PRESETS)) {
                    const ps = db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
                    ps.createIndex('savedAt', 'savedAt');
                }

                console.log('📦 IndexedDB object stores created');
            };
        });

        return this.initPromise;
    }

    /**
     * Store data in IndexedDB
     */
    async set<T>(storeName: string, key: string, data: T): Promise<void> {
        try {
            await this.init();
            if (!this.db) throw new Error('Database not initialized');

            const entry: CacheEntry<T> = {
                key,
                data,
                timestamp: Date.now(),
                version: '1.0',
            };

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(entry);

                request.onsuccess = () => {
                    console.log(`💾 IndexedDB: Stored ${key} in ${storeName}`);
                    resolve();
                };

                request.onerror = () => {
                    console.error(`IndexedDB write error:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB set error:', error);
            // Don't throw - fail silently for cache operations
        }
    }

    /**
     * Retrieve data from IndexedDB
     */
    async get<T>(storeName: string, key: string): Promise<T | null> {
        try {
            await this.init();
            if (!this.db) return null;

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => {
                    const entry = request.result as CacheEntry<T> | undefined;

                    if (!entry) {
                        resolve(null);
                        return;
                    }

                    // Check if cache is stale
                    const age = Date.now() - entry.timestamp;
                    if (age > CACHE_DURATION) {
                        console.log(`🗑️ IndexedDB: Cache expired for ${key}`);
                        this.delete(storeName, key); // Clean up stale entry
                        resolve(null);
                        return;
                    }

                    console.log(`✅ IndexedDB: Retrieved ${key} from ${storeName} (age: ${Math.round(age / 1000 / 60)}min)`);
                    resolve(entry.data);
                };

                request.onerror = () => {
                    console.error(`IndexedDB read error:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB get error:', error);
            return null;
        }
    }

    /**
     * Delete data from IndexedDB
     */
    async delete(storeName: string, key: string): Promise<void> {
        try {
            await this.init();
            if (!this.db) return;

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB delete error:', error);
        }
    }

    /**
     * Clear all data from a store
     */
    async clear(storeName: string): Promise<void> {
        try {
            await this.init();
            if (!this.db) return;

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log(`🗑️ IndexedDB: Cleared ${storeName}`);
                    resolve();
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB clear error:', error);
        }
    }

    /**
     * Retrieve all records from a store (for stores with non-CacheEntry keyPath like 'id')
     */
    async getAll<T>(storeName: string): Promise<T[]> {
        try {
            await this.init();
            if (!this.db) return [];

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve(request.result as T[]);
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB getAll error:', error);
            return [];
        }
    }

    /**
     * Put a record directly (for stores with native keyPath like 'id')
     */
    async put<T>(storeName: string, record: T): Promise<void> {
        try {
            await this.init();
            if (!this.db) throw new Error('Database not initialized');

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(record);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('IndexedDB put error:', error);
        }
    }

    /**
     * Get all keys from a store
     */
    async getAllKeys(storeName: string): Promise<string[]> {
        try {
            await this.init();
            if (!this.db) return [];

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAllKeys();

                request.onsuccess = () => {
                    resolve(request.result as string[]);
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('IndexedDB getAllKeys error:', error);
            return [];
        }
    }
}

// Export singleton instance
export const idbCache = new IndexedDBCache();

// Convenience functions
export const cacheEarthquakes = (key: string, data: any) =>
    idbCache.set(STORE_EARTHQUAKES, key, data);

export const getCachedEarthquakes = (key: string) =>
    idbCache.get(STORE_EARTHQUAKES, key);

export const cacheClusteringResult = (key: string, data: any) =>
    idbCache.set(STORE_CLUSTERING, key, data);

export const getCachedClusteringResult = (key: string) =>
    idbCache.get(STORE_CLUSTERING, key);

export const clearEarthquakeCache = () =>
    idbCache.clear(STORE_EARTHQUAKES);

export const clearClusteringCache = () =>
    idbCache.clear(STORE_CLUSTERING);

// Workspace convenience functions
export const saveWorkspace = (ws: ClusteringWorkspace): Promise<void> =>
    idbCache.put(STORE_WORKSPACES, ws);

export const getWorkspaces = (): Promise<ClusteringWorkspace[]> =>
    idbCache.getAll<ClusteringWorkspace>(STORE_WORKSPACES);

export const deleteWorkspace = (id: string): Promise<void> =>
    idbCache.delete(STORE_WORKSPACES, id);

// Filter preset convenience functions
export const saveFilterPreset = (preset: FilterPreset): Promise<void> =>
    idbCache.put(STORE_PRESETS, preset);

export const getFilterPresets = (): Promise<FilterPreset[]> =>
    idbCache.getAll<FilterPreset>(STORE_PRESETS);

export const deleteFilterPreset = (id: string): Promise<void> =>
    idbCache.delete(STORE_PRESETS, id);
