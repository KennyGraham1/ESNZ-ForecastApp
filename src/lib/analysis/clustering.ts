import { EarthquakeData } from '@/types/earthquake';
import { DBSCAN, OPTICS, KMEANS } from 'density-clustering';
import RBush from 'rbush';
import { clusteringCache } from './clusteringCache';
import { safeMax } from '@/utils/arrayMath';
import type {
    ClusteringAlgorithm,
    ClusterResult,
    ClusteringMetadata,
    SpatialClusteringOptions
} from './clusteringTypes';

// Re-export types for backwards compatibility
export type {
    ClusteringAlgorithm,
    ClusterResult,
    ClusteringMetadata,
    SpatialClusteringOptions
};

// OPTIMIZATION: R-tree spatial point interface
interface SpatialPoint {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    index: number;
}

/**
 * OPTIMIZATION: R-tree optimized DBSCAN implementation
 * Uses spatial indexing for O(n log n) neighbor queries instead of O(n²)
 * 90-95% faster than standard DBSCAN for large datasets
 */
function dbscanWithRTree(
    dataset: number[][],
    epsilon: number,
    minSamples: number
): { clusters: number[][], noiseIndices: number[] } {
    const n = dataset.length;

    // Build R-tree spatial index
    const tree = new RBush<SpatialPoint>();
    const items: SpatialPoint[] = dataset.map((point, i) => ({
        minX: point[0],
        minY: point[1],
        maxX: point[0],
        maxY: point[1],
        index: i
    }));
    tree.load(items);

    // DBSCAN algorithm with R-tree neighbor queries
    const labels = new Array(n).fill(-1); // -1 = unvisited
    const NOISE = -2;
    let clusterId = 0;

    // Helper: Get neighbors within epsilon using R-tree
    const getNeighbors = (pointIdx: number): number[] => {
        const point = dataset[pointIdx];
        const candidates = tree.search({
            minX: point[0] - epsilon,
            minY: point[1] - epsilon,
            maxX: point[0] + epsilon,
            maxY: point[1] + epsilon
        });

        // Filter by actual distance (R-tree gives bounding box matches)
        return candidates
            .map(c => c.index)
            .filter(idx => {
                const dx = dataset[idx][0] - point[0];
                const dy = dataset[idx][1] - point[1];
                return Math.sqrt(dx * dx + dy * dy) <= epsilon;
            });
    };

    // Main DBSCAN loop
    for (let i = 0; i < n; i++) {
        if (labels[i] !== -1) continue; // Already processed

        const neighbors = getNeighbors(i);

        if (neighbors.length < minSamples) {
            labels[i] = NOISE;
            continue;
        }

        // Start new cluster
        labels[i] = clusterId;
        const queue = [...neighbors];

        while (queue.length > 0) {
            const currentIdx = queue.shift()!;

            if (labels[currentIdx] === NOISE) {
                labels[currentIdx] = clusterId; // Border point
            }

            if (labels[currentIdx] !== -1) continue; // Already processed

            labels[currentIdx] = clusterId;

            const currentNeighbors = getNeighbors(currentIdx);
            if (currentNeighbors.length >= minSamples) {
                queue.push(...currentNeighbors);
            }
        }

        clusterId++;
    }

    // Extract clusters and noise
    const clusters: number[][] = Array.from({ length: clusterId }, () => []);
    const noiseIndices: number[] = [];

    for (let i = 0; i < n; i++) {
        if (labels[i] === NOISE) {
            noiseIndices.push(i);
        } else if (labels[i] >= 0) {
            clusters[labels[i]].push(i);
        }
    }

    return { clusters, noiseIndices };
}

/**
 * Infer a log10(η) threshold separating clustered (low η) from background
 * (high η) links via Otsu between-class-variance maximization on the histogram
 * of finite log10(η) values. Mirrors clusterPipeline's `infer_eta_threshold`.
 * Falls back to a low quantile when there are too few values to histogram.
 */
function inferLog10EtaThreshold(log10Etas: number[], quantileFallback: number = 0.15): number {
    const values = log10Etas.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (values.length === 0) return NaN;

    const quantile = (q: number): number => {
        const idx = Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1))));
        return values[idx];
    };
    if (values.length < 20) return quantile(quantileFallback);

    const min = values[0];
    const max = values[values.length - 1];
    if (max <= min) return quantile(quantileFallback);

    const nBins = Math.max(3, Math.min(100, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min) / nBins;
    const hist = new Array(nBins).fill(0);
    for (const v of values) {
        let b = Math.floor((v - min) / width);
        if (b < 0) b = 0;
        if (b >= nBins) b = nBins - 1;
        hist[b]++;
    }
    const total = values.length;
    const probs = hist.map(h => h / total);
    const centers = hist.map((_, i) => min + (i + 0.5) * width);
    const muTotal = probs.reduce((s, p, i) => s + p * centers[i], 0);

    // Otsu: maximize σ_b²(t) = [μ_T·ω(t) − μ(t)]² / [ω(t)(1−ω(t))]
    let omega = 0;
    let mu = 0;
    let bestSigma = -Infinity;
    let bestCenter = quantile(quantileFallback);
    for (let i = 0; i < nBins; i++) {
        omega += probs[i];
        mu += probs[i] * centers[i];
        if (omega <= 0 || omega >= 1) continue;
        const sigma = ((muTotal * omega - mu) ** 2) / (omega * (1 - omega));
        if (sigma > bestSigma) {
            bestSigma = sigma;
            bestCenter = centers[i];
        }
    }
    return bestCenter;
}

/**
 * Nearest-Neighbor Clustering (Zaliapin-Ben-Zion method)
 * Identifies earthquake clusters based on nearest-neighbor distances in the
 * space-time-magnitude domain: η = Δt · r^d · 10^(−b·m_parent).
 * Reference: Zaliapin & Ben-Zion (2013, 2020) - JGR
 *
 * @param thresholdOverride  When <= 0 it is used directly as the log10(η)
 *   threshold; otherwise (e.g. the legacy default of 1.0) the threshold is
 *   auto-inferred from the bimodal log10(η) distribution (Otsu).
 */
function nearestNeighborClustering(
    earthquakes: EarthquakeData[],
    dataset: number[][], // [x, y] in km, parallel to earthquakes
    thresholdOverride: number = 1.0
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    if (n === 0) return { clusters: [], noiseIndices: [] };

    const D = 1.6;            // fractal dimension (Zaliapin & Ben-Zion 2013)
    const B = 1.0;            // Gutenberg-Richter b-value
    const DIST_FLOOR_KM = 0.001;

    // Sort indices chronologically. The raw input order is NOT guaranteed to be
    // time-sorted; the previous implementation compared abs(Δt) over the raw
    // order, which let a LATER event act as a parent (causality violation).
    const getTimeMs = (idx: number): number => {
        const t = earthquakes[idx].time;
        return t instanceof Date ? t.getTime() : new Date(t).getTime();
    };
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => getTimeMs(a) - getTimeMs(b));
    const timesDays = order.map(idx => getTimeMs(idx) / (1000 * 60 * 60 * 24));

    // For each event (time order) find the earlier event minimizing η, requiring
    // Δt > 0 so the parent strictly precedes the child.
    const nnParent = new Array(n).fill(-1); // sorted-space parent index
    const log10Eta = new Array(n).fill(Infinity);

    for (let i = 0; i < n; i++) {
        const si = order[i];
        let minEta = Infinity;
        let parent = -1;
        for (let j = 0; j < i; j++) {
            const dt = timesDays[i] - timesDays[j]; // days
            if (dt <= 0) continue;                  // strictly earlier parent only
            const sj = order[j];
            const dx = dataset[si][0] - dataset[sj][0];
            const dy = dataset[si][1] - dataset[sj][1];
            const r = Math.max(Math.sqrt(dx * dx + dy * dy), DIST_FLOOR_KM);
            // Parent magnitude = the earlier event (sj). 10^(−B·m) lowers η for
            // larger parents, as in Zaliapin & Ben-Zion (2013).
            const eta = dt * Math.pow(r, D) * Math.pow(10, -B * earthquakes[sj].magnitude);
            if (eta < minEta) {
                minEta = eta;
                parent = j;
            }
        }
        nnParent[i] = parent;
        log10Eta[i] = parent >= 0 && minEta > 0 ? Math.log10(minEta) : Infinity;
    }

    // Threshold in log10(η) space: explicit override (<= 0) or auto-inferred valley.
    const threshold = thresholdOverride <= 0
        ? thresholdOverride
        : inferLog10EtaThreshold(log10Eta, 0.15);

    const isTriggered = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
        isTriggered[i] = nnParent[i] >= 0 && Number.isFinite(log10Eta[i]) && log10Eta[i] <= threshold;
    }

    // Follow triggered parent links to a cluster root (parent index always < i in
    // sorted space, so the walk strictly decreases and terminates).
    const root = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        let r = i;
        while (isTriggered[r] && nnParent[r] >= 0) {
            r = nnParent[r];
        }
        root[i] = r;
    }

    // Group sorted indices by root, mapping back to original indices.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
        const r = root[i];
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(order[i]);
    }

    const clusters: number[][] = [];
    const noiseIndices: number[] = [];
    for (const members of groups.values()) {
        if (members.length >= 2) {
            clusters.push(members);
        } else {
            noiseIndices.push(...members);
        }
    }

    return { clusters, noiseIndices };
}

/**
 * Helper function to calculate great-circle distance in km between two points
 * Uses the Haversine formula
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate Wells-Coppersmith search radius from magnitude
 * Formula: radius = max(5, 10^(0.59*M - 2.44)) km
 * Reference: Wells & Coppersmith (1994)
 */
function wellsCoppersmithRadius(magnitude: number): number {
    return Math.max(5, Math.pow(10, 0.59 * magnitude - 2.44));
}

/**
 * Convert Date to decimal year (for temporal calculations)
 */
function toDecimalYear(date: Date): number {
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1).getTime();
    const endOfYear = new Date(year + 1, 0, 1).getTime();
    const now = date.getTime();
    return year + (now - startOfYear) / (endOfYear - startOfYear);
}

/**
 * STEP Magnitude Clustering (clusterSTEPmag)
 * Clusters earthquakes starting from the largest magnitude, using spatial windows
 * according to the STEP forecasting model with sliding time windows.
 *
 * Based on Annemarie Christophersen's MATLAB implementation (2008)
 *
 * @param earthquakes - Array of earthquake data
 * @param minMainMag - Completeness magnitude Mc. Controls both the initial catalog
 *                     filter (events below this are noise) and the time-window
 *                     extension trigger (only events STRICTLY ABOVE this extend tRef).
 *                     The MATLAB reference has a separate `Mainmag` parameter but it is
 *                     unused — only `Mc` drives the algorithm.
 * @param t1 - Time window before an earthquake in days
 * @param t2 - Time window after an earthquake in days
 */
function stepMagnitudeClustering(
    earthquakes: EarthquakeData[],
    minMainMag: number = 2.0,
    t1: number = 1,
    t2: number = 30
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    if (n === 0) return { clusters: [], noiseIndices: [] };

    // Convert time windows from days to decimal years
    const dtAfter = t2 / 365;
    const dtBefore = t1 / 365;

    // Filter and prepare data: include only events >= minMainMag
    // Create working array with indices and clustering info
    interface WorkingEvent {
        originalIndex: number;
        lat: number;
        lon: number;
        decimalYear: number;
        magnitude: number;
        clusterNo: number; // 0 = unclustered
    }

    const workingData: WorkingEvent[] = earthquakes
        .map((eq, idx) => ({
            originalIndex: idx,
            lat: eq.latitude,
            lon: eq.longitude,
            decimalYear: toDecimalYear(eq.time instanceof Date ? eq.time : new Date(eq.time)),
            magnitude: eq.magnitude,
            clusterNo: 0
        }))
        .filter(e => e.magnitude >= minMainMag)
        .sort((a, b) => a.decimalYear - b.decimalYear); // Sort by time

    if (workingData.length === 0) {
        // No events meet magnitude threshold - all are noise
        return { clusters: [], noiseIndices: earthquakes.map((_, i) => i) };
    }

    let clusterNo = 1;

    // Process until all events are clustered
    while (workingData.some(e => e.clusterNo === 0)) {
        // Find the largest unclustered earthquake
        const unclustered = workingData.filter(e => e.clusterNo === 0);
        const maxMag = safeMax(unclustered.map(e => e.magnitude));
        const mainshockIdx = workingData.findIndex(e => e.clusterNo === 0 && e.magnitude === maxMag);

        if (mainshockIdx === -1) break;

        const mainshock = workingData[mainshockIdx];
        mainshock.clusterNo = clusterNo;

        const searchRadius = wellsCoppersmithRadius(maxMag);
        let tRef = mainshock.decimalYear;
        const latRef = mainshock.lat;
        const lonRef = mainshock.lon;

        // Search backwards in time with sliding windows (matching MATLAB's loop restart behavior)
        // Calculate initial search range
        let eventsBefore = workingData.filter(e =>
            e.decimalYear > tRef - dtBefore && e.decimalYear < tRef
        ).length;
        let linoBefore = Math.max(0, mainshockIdx - eventsBefore);

        for (let i = linoBefore; i < mainshockIdx; i++) {
            const event = workingData[i];
            if (event.clusterNo !== 0) continue;

            const dist = haversineDistance(latRef, lonRef, event.lat, event.lon);
            if (dist <= searchRadius) {
                event.clusterNo = clusterNo;
                // Update reference time and recalculate search window (sliding window)
                tRef = event.decimalYear;
                eventsBefore = workingData.filter(e =>
                    e.decimalYear > tRef - dtBefore && e.decimalYear < tRef
                ).length;
                const newLinoBefore = Math.max(0, i - eventsBefore);
                if (newLinoBefore < linoBefore) {
                    linoBefore = newLinoBefore;
                    i = linoBefore - 1; // Will be incremented to linoBefore by loop
                }
            }
        }

        // Search forwards in time with sliding windows
        tRef = mainshock.decimalYear; // Reset to mainshock time
        for (let i = mainshockIdx + 1; i < workingData.length; i++) {
            const event = workingData[i];
            if (event.decimalYear > tRef + dtAfter) break;

            if (event.clusterNo === 0) {
                const dist = haversineDistance(latRef, lonRef, event.lat, event.lon);
                if (dist <= searchRadius) {
                    event.clusterNo = clusterNo;
                    // Extend time window only for events STRICTLY ABOVE Mc.
                    // MATLAB: `if (b(lino,6) > Mc)` — events at exactly Mc do not slide the window.
                    if (event.magnitude > minMainMag) {
                        tRef = event.decimalYear;
                    }
                }
            }
        }

        clusterNo++;
    }

    // Build clusters from the results
    const clusterMap = new Map<number, number[]>();
    for (const event of workingData) {
        if (event.clusterNo > 0) {
            if (!clusterMap.has(event.clusterNo)) {
                clusterMap.set(event.clusterNo, []);
            }
            clusterMap.get(event.clusterNo)!.push(event.originalIndex);
        }
    }

    const clusters = Array.from(clusterMap.values()).filter(c => c.length > 0);

    // Events not in any cluster (below Mc or unclustered)
    const clusteredIndices = new Set(workingData.filter(e => e.clusterNo > 0).map(e => e.originalIndex));
    const noiseIndices = earthquakes.map((_, i) => i).filter(i => !clusteredIndices.has(i));

    return { clusters, noiseIndices };
}

/**
 * STEP Time Clustering (clusterSTEPtime)
 * Clusters earthquakes in temporal order, identifying sequences based on
 * magnitude-dependent spatial windows and sliding time windows.
 *
 * Based on Annemarie Christophersen's MATLAB implementation (2007)
 *
 * @param earthquakes - Array of earthquake data
 * @param minMainMag - Completeness magnitude Mc (same role as in stepMagnitudeClustering).
 *                     Only events STRICTLY ABOVE this value initiate new clusters
 *                     (MATLAB: `b(i,6) > Mainmag`) and only those events extend tRef
 *                     (MATLAB: `b(lino,6) > Mc`).
 * @param t1 - Time window before an earthquake in days
 * @param t2 - Time window after an earthquake in days
 */
function stepTimeClustering(
    earthquakes: EarthquakeData[],
    minMainMag: number = 2.0,
    t1: number = 1,
    t2: number = 30
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    if (n === 0) return { clusters: [], noiseIndices: [] };

    // Convert time windows from days to decimal years
    const dtAfter = t2 / 365;
    const dtBefore = t1 / 365;

    // Filter and prepare data
    interface WorkingEvent {
        originalIndex: number;
        lat: number;
        lon: number;
        decimalYear: number;
        magnitude: number;
        clusterNo: number;
    }

    // Filter to events >= Mc before clustering, matching clusterSTEPtime.m
    // (`l = mCatalog(:,6) >= Mc`) and stepMagnitudeClustering above. Without this
    // filter, sub-completeness events could be absorbed as cluster members, which
    // the MATLAB reference never allows.
    const workingData: WorkingEvent[] = earthquakes
        .map((eq, idx) => ({
            originalIndex: idx,
            lat: eq.latitude,
            lon: eq.longitude,
            decimalYear: toDecimalYear(eq.time instanceof Date ? eq.time : new Date(eq.time)),
            magnitude: eq.magnitude,
            clusterNo: 0
        }))
        .filter(e => e.magnitude >= minMainMag)
        .sort((a, b) => a.decimalYear - b.decimalYear); // Sort by time

    if (workingData.length === 0) {
        return { clusters: [], noiseIndices: earthquakes.map((_, i) => i) };
    }

    let clusterNo = 1;

    // Process events in temporal order
    for (let i = 0; i < workingData.length; i++) {
        const event = workingData[i];

        // Skip if already clustered, or at-or-below the threshold.
        // MATLAB: `if (b(i,12) == 0 && b(i,6) > Mainmag)` — strictly greater than, so
        // events at exactly minMainMag do NOT initiate clusters (they can still be absorbed).
        if (event.clusterNo !== 0 || event.magnitude <= minMainMag) {
            continue;
        }

        // Start a new cluster with this event as the mainshock
        event.clusterNo = clusterNo;

        let tRef = event.decimalYear;
        let magRef = event.magnitude;
        let latRef = event.lat;
        let lonRef = event.lon;
        let searchRadius = wellsCoppersmithRadius(magRef);

        // Calculate how far back to search
        const eventsBefore = workingData.filter(e =>
            e.decimalYear > tRef - dtBefore && e.decimalYear < tRef
        ).length;
        const startIdx = Math.max(0, i - eventsBefore);

        // Process events in the time window (both before and after)
        let j = startIdx;
        while (j < workingData.length && workingData[j].decimalYear < tRef + dtAfter) {
            const candidate = workingData[j];

            if (candidate.clusterNo === 0) {
                // When a larger event is found, evaluate the distance against the larger radius
                // so that events within the bigger rupture zone can be absorbed.
                // (Original MATLAB code had a bug here: used magRef instead of candidate.magnitude,
                // making this check a no-op. Fixed to use candidate.magnitude.)
                if (candidate.magnitude > magRef) {
                    searchRadius = wellsCoppersmithRadius(candidate.magnitude);
                }

                const dist = haversineDistance(latRef, lonRef, candidate.lat, candidate.lon);

                if (dist <= searchRadius) {
                    candidate.clusterNo = clusterNo;

                    // Extend window only for events STRICTLY ABOVE Mc and after tRef.
                    // MATLAB: `if (b(lino,6) > Mc && b(lino,3) > tref)`
                    if (candidate.decimalYear > tRef && candidate.magnitude > minMainMag) {
                        tRef = candidate.decimalYear;
                    }

                    // If larger magnitude, update reference location and search backwards
                    if (candidate.magnitude > magRef) {
                        latRef = candidate.lat;
                        lonRef = candidate.lon;
                        magRef = candidate.magnitude;

                        // Recalculate search window and jump back
                        const newEventsBefore = workingData.filter(e =>
                            e.decimalYear > tRef - dtBefore && e.decimalYear < tRef
                        ).length;
                        // MATLAB: lino = lino-eventsbefore -1 (no constraint)
                        j = Math.max(0, j - newEventsBefore - 1);
                    }
                }

                // Reset search radius to current reference magnitude
                searchRadius = wellsCoppersmithRadius(magRef);
            }

            j++;
        }

        clusterNo++;
    }

    // Build clusters from results
    const clusterMap = new Map<number, number[]>();
    for (const event of workingData) {
        if (event.clusterNo > 0) {
            if (!clusterMap.has(event.clusterNo)) {
                clusterMap.set(event.clusterNo, []);
            }
            clusterMap.get(event.clusterNo)!.push(event.originalIndex);
        }
    }

    const clusters = Array.from(clusterMap.values()).filter(c => c.length > 0);

    // Events not in any cluster
    const clusteredIndices = new Set(workingData.filter(e => e.clusterNo > 0).map(e => e.originalIndex));
    const noiseIndices = earthquakes.map((_, i) => i).filter(i => !clusteredIndices.has(i));

    return { clusters, noiseIndices };
}

/**
 * ST-DBSCAN (Spatio-Temporal DBSCAN)
 * Extension of DBSCAN that considers both spatial and temporal proximity.
 * Events must be within both spatial epsilon AND temporal epsilon to be neighbors.
 * 
 * Reference: Birant & Kut (2007) - "ST-DBSCAN: An algorithm for clustering spatial-temporal data"
 * 
 * @param earthquakes - Array of earthquake data
 * @param dataset - Pre-computed [x, y] coordinates in km
 * @param epsilonSpatial - Spatial distance threshold in km (default: 25)
 * @param epsilonTemporal - Temporal distance threshold in days (default: 7)
 * @param minSamples - Minimum neighbors to form a core point (default: 5)
 */
function stDbscan(
    earthquakes: EarthquakeData[],
    dataset: number[][],
    epsilonSpatial: number = 25,
    epsilonTemporal: number = 7,
    minSamples: number = 5
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    if (n === 0) return { clusters: [], noiseIndices: [] };

    // Extract timestamps for temporal calculations
    const timestamps = earthquakes.map(eq => {
        const t = eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime();
        return t / (1000 * 60 * 60 * 24); // Convert to days
    });

    // Build R-tree spatial index
    const tree = new RBush<SpatialPoint>();
    const items: SpatialPoint[] = dataset.map((point, i) => ({
        minX: point[0],
        minY: point[1],
        maxX: point[0],
        maxY: point[1],
        index: i
    }));
    tree.load(items);

    // DBSCAN labels: -1 = unvisited, -2 = noise, >= 0 = cluster ID
    const labels = new Array(n).fill(-1);
    const NOISE = -2;
    let clusterId = 0;

    // Get spatio-temporal neighbors for a point
    const getSTNeighbors = (pointIdx: number): number[] => {
        const point = dataset[pointIdx];
        const pointTime = timestamps[pointIdx];

        // Spatial candidates from R-tree
        const candidates = tree.search({
            minX: point[0] - epsilonSpatial,
            minY: point[1] - epsilonSpatial,
            maxX: point[0] + epsilonSpatial,
            maxY: point[1] + epsilonSpatial
        });

        // Filter by actual distance (spatial) AND temporal proximity
        return candidates
            .map(c => c.index)
            .filter(idx => {
                // Spatial distance check
                const dx = dataset[idx][0] - point[0];
                const dy = dataset[idx][1] - point[1];
                const spatialDist = Math.sqrt(dx * dx + dy * dy);
                if (spatialDist > epsilonSpatial) return false;

                // Temporal distance check
                const temporalDist = Math.abs(timestamps[idx] - pointTime);
                return temporalDist <= epsilonTemporal;
            });
    };

    // Main ST-DBSCAN loop
    for (let i = 0; i < n; i++) {
        if (labels[i] !== -1) continue; // Already processed

        const neighbors = getSTNeighbors(i);

        if (neighbors.length < minSamples) {
            labels[i] = NOISE;
            continue;
        }

        // Start new cluster
        labels[i] = clusterId;
        const queue = [...neighbors];

        while (queue.length > 0) {
            const currentIdx = queue.shift()!;

            if (labels[currentIdx] === NOISE) {
                labels[currentIdx] = clusterId; // Border point
            }

            if (labels[currentIdx] !== -1) continue; // Already processed

            labels[currentIdx] = clusterId;

            const currentNeighbors = getSTNeighbors(currentIdx);
            if (currentNeighbors.length >= minSamples) {
                queue.push(...currentNeighbors);
            }
        }

        clusterId++;
    }

    // Extract clusters and noise
    const clusters: number[][] = Array.from({ length: clusterId }, () => []);
    const noiseIndices: number[] = [];

    for (let i = 0; i < n; i++) {
        if (labels[i] === NOISE) {
            noiseIndices.push(i);
        } else if (labels[i] >= 0) {
            clusters[labels[i]].push(i);
        }
    }

    return { clusters, noiseIndices };
}

/**
 * Time Magnitude Clustering (TMC) - Reasenberg Style
 * Implements magnitude-dependent spatio-temporal clustering based on the
 * Reasenberg (1985) declustering algorithm used in cluster2000x.f
 * 
 * Features:
 * - Interaction radius based on Kanamori-Anderson (1975) crack model
 * - Time-varying look-ahead window based on cluster's largest magnitude
 * - Cluster merging when events link separate sequences
 * 
 * @param earthquakes - Array of earthquake data
 * @param rfact - Spatial radius multiplier (default: 10)
 * @param tau0 - Base look-ahead time in days (default: 2)
 * @param tauMax - Maximum look-ahead time in days (default: 10)
 * @param p1 - Probability threshold (default: 0.99)
 * @param xk - Magnitude scaling factor (default: 0.5)
 * @param minMag - Effective minimum magnitude threshold (default: 1.5)
 */
function timeMagnitudeClustering(
    earthquakes: EarthquakeData[],
    rfact: number = 10,
    tau0: number = 2,
    tauMax: number = 10,
    p1: number = 0.99,
    xk: number = 0.5,
    minMag: number = 1.5
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    if (n === 0) return { clusters: [], noiseIndices: [] };

    // Sort by time (preserve original indices)
    interface WorkingEvent {
        originalIndex: number;
        lat: number;
        lon: number;
        timeMinutes: number; // Minutes from epoch for calculations
        magnitude: number;
        clusterId: number; // 0 = unclustered
    }

    const sortedEvents: WorkingEvent[] = earthquakes
        .map((eq, idx) => {
            const t = eq.time instanceof Date ? eq.time.getTime() : new Date(eq.time).getTime();
            return {
                originalIndex: idx,
                lat: eq.latitude,
                lon: eq.longitude,
                timeMinutes: t / (1000 * 60), // Convert to minutes
                magnitude: eq.magnitude,
                clusterId: 0
            };
        })
        .sort((a, b) => a.timeMinutes - b.timeMinutes);

    // Cluster tracking
    interface ClusterInfo {
        largestMag: number;
        largestMagTime: number; // Time of largest event (drives the Reasenberg tau formula)
        members: number[]; // Indices in sortedEvents
    }
    const clusterInfos: Map<number, ClusterInfo> = new Map();
    let nextClusterId = 1;

    // Calculate interaction radius (Kanamori-Anderson crack model)
    // r = rfact * 0.011 * 10^(0.4*M) km
    // With stress drop dsigma = 30 bars
    const interactionRadius = (mag: number): number => {
        const r = rfact * 0.011 * Math.pow(10, 0.4 * mag);
        // Cap at 30 km (crustal thickness constraint)
        return Math.min(r, 30);
    };

    // Calculate look-ahead time (tau) for an event in a cluster
    const calculateTau = (clusterId: number, eventTime: number): number => {
        if (clusterId === 0) {
            // Unclustered event: use base tau
            return tau0 * 1440; // Convert days to minutes
        }

        const info = clusterInfos.get(clusterId);
        if (!info) return tau0 * 1440;

        // Reasenberg 1985 (cluster2000x.f) uses T_e = elapsed since LARGEST event in cluster, not most recent
        const t = (eventTime - info.largestMagTime) / 1440; // Convert to days
        if (t <= 0) return tau0 * 1440;

        // Reasenberg formula: tau = -ln(1-p1) * t / 10^((deltaM-1)*2/3)
        const deltaM = (1 - xk) * info.largestMag - minMag;
        const denom = Math.pow(10, (deltaM - 1) * 2 / 3);
        let tau = (-Math.log(1 - p1) * t) / denom;

        // Clamp to [tau0, tauMax] in days, then convert to minutes
        tau = Math.max(tau0, Math.min(tau, tauMax));
        return tau * 1440;
    };

    // Process events in temporal order
    for (let i = 0; i < sortedEvents.length; i++) {
        const event1 = sortedEvents[i];

        // Look for candidate event2 within tau time window
        for (let j = i + 1; j < sortedEvents.length; j++) {
            const event2 = sortedEvents[j];

            // Recompute tau every inner step: event1.clusterId (and its cluster's
            // largest magnitude) can change mid-loop when event1 is absorbed into a
            // cluster or clusters merge, which widens the look-ahead window.
            // Computing tau once before the loop (the previous approach) made the
            // break fire too early and miss events in the gap [old_tau, new_tau].
            // NOTE: cluster2000x.f actually evaluates tau ONCE per outer event i
            // (before the j-loop); this per-pair recompute follows the Python
            // decluster_reasenberg reference instead, which intentionally widens
            // the window as event1 joins a cluster.
            const tau = calculateTau(event1.clusterId, event1.timeMinutes);

            // Check temporal proximity
            const timeDiff = event2.timeMinutes - event1.timeMinutes;
            if (timeDiff > tau) break; // Beyond look-ahead window

            // Skip if already in the same cluster
            if (event1.clusterId !== 0 && event2.clusterId === event1.clusterId) {
                continue;
            }

            // Calculate spatial distance
            const dist = haversineDistance(event1.lat, event1.lon, event2.lat, event2.lon);

            // Calculate interaction distance:
            // Sum of event1's radius and cluster's largest event radius (if clustered)
            // Note: cluster2000x.f mathematically specifies that rMain does NOT scale by rfact.
            const r1 = interactionRadius(event1.magnitude);
            const rMain = event1.clusterId !== 0
                ? Math.min(0.011 * Math.pow(10, 0.4 * clusterInfos.get(event1.clusterId)!.largestMag), 30)
                : 0;
            // cluster2000x.f caps the SUMMED interaction distance at one crustal
            // thickness (`if (rtest .gt. 30.) rtest=30.`), not each term individually.
            // Without this the radius can reach ~60 km for large mainshocks and
            // over-cluster. Matches the Python decluster_reasenberg reference too.
            const rTest = Math.min(r1 + rMain, 30);

            // Cluster test
            if (dist <= rTest) {
                // CLUSTER DECLARED

                if (event1.clusterId !== 0 && event2.clusterId !== 0) {
                    // Both already clustered: merge clusters
                    const keepId = Math.min(event1.clusterId, event2.clusterId);
                    const mergeId = Math.max(event1.clusterId, event2.clusterId);

                    // Update all events in mergeId cluster
                    for (const e of sortedEvents) {
                        if (e.clusterId === mergeId) {
                            e.clusterId = keepId;
                        }
                    }

                    // Merge cluster info
                    const keepInfo = clusterInfos.get(keepId)!;
                    const mergeInfo = clusterInfos.get(mergeId)!;

                    if (mergeInfo.largestMag > keepInfo.largestMag) {
                        keepInfo.largestMag = mergeInfo.largestMag;
                        keepInfo.largestMagTime = mergeInfo.largestMagTime;
                    }
                    keepInfo.members.push(...mergeInfo.members);
                    clusterInfos.delete(mergeId);

                } else if (event1.clusterId !== 0) {
                    // Add event2 to event1's cluster
                    event2.clusterId = event1.clusterId;
                    const info = clusterInfos.get(event1.clusterId)!;
                    info.members.push(j);
                    if (event2.magnitude > info.largestMag) {
                        info.largestMag = event2.magnitude;
                        info.largestMagTime = event2.timeMinutes;
                    }

                } else if (event2.clusterId !== 0) {
                    // Add event1 to event2's cluster
                    event1.clusterId = event2.clusterId;
                    const info = clusterInfos.get(event2.clusterId)!;
                    info.members.push(i);
                    if (event1.magnitude > info.largestMag) {
                        info.largestMag = event1.magnitude;
                        info.largestMagTime = event1.timeMinutes;
                    }

                } else {
                    // Start new cluster with both events
                    const newId = nextClusterId++;
                    event1.clusterId = newId;
                    event2.clusterId = newId;

                    const largerEvent = event1.magnitude >= event2.magnitude ? event1 : event2;
                    clusterInfos.set(newId, {
                        largestMag: largerEvent.magnitude,
                        largestMagTime: largerEvent.timeMinutes,
                        members: [i, j]
                    });
                }
            }
        }
    }

    // Build output clusters
    const clusterMap = new Map<number, number[]>();
    const noiseIndices: number[] = [];

    for (const event of sortedEvents) {
        if (event.clusterId > 0) {
            if (!clusterMap.has(event.clusterId)) {
                clusterMap.set(event.clusterId, []);
            }
            clusterMap.get(event.clusterId)!.push(event.originalIndex);
        } else {
            noiseIndices.push(event.originalIndex);
        }
    }

    const clusters = Array.from(clusterMap.values()).filter(c => c.length > 0);

    return { clusters, noiseIndices };
}

// ----------------------------------------------------------------------
// HARDEBECK (2019) CLUSTERING
// Based on "Updated California Aftershock Parameters" (2019)
// Uses simple physical windowing:
// 1. Mainshocks M >= 5 (filtered if within 3yr/5*RL of larger event)
// 2. Aftershocks within 10 days and 3*RL of mainshock
// 3. RL from Wells & Coppersmith (1994)
// ----------------------------------------------------------------------

function hardebeckClustering(
    earthquakes: EarthquakeData[],
    minMainMag: number = 5.0,
    timeWindowDays: number = 10,
    ruptureMult: number = 3,
    mainshockTimeYears: number = 3
): { clusters: number[][], noiseIndices: number[] } {
    const n = earthquakes.length;
    const labels = new Array(n).fill(-1); // -1 = unassigned/noise initially

    // Sort by magnitude (descending) to process largest events first as potential mainshocks
    // This makes it easier to respect the "larger event" exclusion rule
    const sortedIndices = earthquakes.map((_, i) => i).sort((a, b) =>
        earthquakes[b].magnitude - earthquakes[a].magnitude
    );

    // Wells & Coppersmith (1994) Rupture Length (Subsurface, All Slip Types)
    // log10(RL) = -2.44 + 0.59 * M
    const calculateRL = (mag: number): number => {
        return Math.pow(10, -2.44 + 0.59 * mag);
    };

    // Haversine distance helper
    const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Helper: Distance in km
    const dist = (i: number, j: number): number => {
        return getHaversineDistance(
            earthquakes[i].latitude, earthquakes[i].longitude,
            earthquakes[j].latitude, earthquakes[j].longitude
        );
    };

    let clusterId = 0;
    const clusters: number[][] = [];
    const mainshockIndices: number[] = [];

    // First pass: Identify potential mainshocks
    // Hardebeck: "M >= 5, excluding events that occur in the 3 years following a 
    // larger event and within 5 times the rupture length of that larger event."
    // Since we act on a static catalog, we can process this hierarchically.

    // We strictly follow the definition for "Mainshocks" to start clusters.
    // However, an event can be an aftershock of a larger event AND a mainshock of its own sub-sequence.
    // Clarification from paper: "We define mainshocks as all earthquakes M>=5, excluding events..."
    // This implies exclusive categorization for the purpose of parameter fitting. 
    // But for CLUSTERING visualization, usually we want to group associated events.
    // We will form clusters around these valid mainshocks.

    const validMainshocks = new Set<number>();

    // Process from largest to smallest to handle the "larger event" exclusion easily
    for (const idx of sortedIndices) {
        const eq = earthquakes[idx];
        if (eq.magnitude < minMainMag) continue;

        // Check if this event is "suppressed" by a larger, earlier event
        // We check against all ALREADY ACCEPTED mainshocks that are LARGER
        // (Since we sort by Mag, all previously processed validMainshocks are >= this mag)
        // Wait, the rule is "following a LARGER event". The larger event might be later in the array if we sort by time?
        // No, we need to check against ANY larger event in the catalog that occurred BEFORE this one.

        // Actually, let's optimize:
        // For each candidate M>=5:
        //   Check if there exists any OTHER event j where:
        //     Mag(j) > Mag(i)
        //     Time(j) < Time(i) AND Time(i) - Time(j) < 3 years
        //     Dist(i, j) < 5 * RL(j)

        // This check could be O(N^2) worst case.
        // Given we only care about M>=5 candidates, N is small enough for typical catalogs.

        // Time in ms
        const t_i = new Date(eq.time).getTime();
        const exclusionWindowMs = mainshockTimeYears * 365.25 * 24 * 60 * 60 * 1000;

        let isSuppressed = false;

        // Check against all other events that are larger and earlier
        // We can just iterate through sortedIndices upwards (larger mags) 
        // effectively, but we need time check.
        // Let's just iterate all earthquakes M > eq.magnitude
        // Optimize: verify against sortedIndices until we hit current mag

        for (const j of sortedIndices) {
            if (earthquakes[j].magnitude <= eq.magnitude) break; // Reached smaller/equal mags

            const t_j = new Date(earthquakes[j].time).getTime();

            // "Following a larger event"
            if (t_i > t_j && (t_i - t_j) < exclusionWindowMs) {
                const RL_j = calculateRL(earthquakes[j].magnitude);
                const distance = dist(idx, j);
                if (distance < 5 * RL_j) {
                    isSuppressed = true;
                    break;
                }
            }
        }

        if (!isSuppressed) {
            validMainshocks.add(idx);
        }
    }

    // Second Pass: Form clusters around valid mainshocks
    // "Aftershocks are defined as all events within 10 days after a mainshock 
    // and 3 times the rupture length... The smallest radius... is 10 km."

    // We process Valid Mainshocks, maybe sorted by Time or Mag?
    // A single event could theoretically be in multiple windows. 
    // Standard clustering assigns to the strongest link or first link. 
    // Hardebeck (2019) doesn't specify declustering for the whole catalog, 
    // just identifying sequences for specific mainshocks.
    // For this generic clustering tool, we will assign to the LARGEST eligible mainshock (most dominant).
    // So we iterate validMainshocks by Magnitude descending.

    const sortedMainshocks = Array.from(validMainshocks).sort((a, b) =>
        earthquakes[b].magnitude - earthquakes[a].magnitude
    );

    for (const mIdx of sortedMainshocks) {
        if (labels[mIdx] !== -1) continue; // Already assigned to a larger cluster?

        // Start a new cluster
        clusterId++;
        const currentCluster: number[] = [mIdx];
        labels[mIdx] = clusterId;

        const mainshock = earthquakes[mIdx];
        const t_m = new Date(mainshock.time).getTime();
        const RL = calculateRL(mainshock.magnitude);
        const radius = Math.max(10, ruptureMult * RL); // Minimum 10km constraint from paper
        const windowMs = timeWindowDays * 24 * 60 * 60 * 1000;

        // Find aftershocks
        // Optimization: Use R-tree if available, but for now simple loop is safe
        // Check all unassigned events (or reassignment allowed? usually no for simple partition)
        for (let i = 0; i < n; i++) {
            if (i === mIdx) continue;
            if (labels[i] !== -1) continue; // Already clustered

            const candidate = earthquakes[i];
            const t_c = new Date(candidate.time).getTime();

            // "Within 10 days AFTER"
            if (t_c > t_m && (t_c - t_m) <= windowMs) {
                const d = dist(mIdx, i);
                if (d <= radius) {
                    labels[i] = clusterId;
                    currentCluster.push(i);
                }
            }
        }

        if (currentCluster.length > 0) {
            clusters.push(currentCluster);
        }
    }

    // Collect noise
    const noiseIndices: number[] = [];
    for (let i = 0; i < n; i++) {
        if (labels[i] === -1) noiseIndices.push(i);
    }

    return { clusters, noiseIndices };
}


// ============================================================
// HDBSCAN — Hierarchical Density-Based Spatial Clustering of
//           Applications with Noise
//
// Reference: Campello, Moulavi & Sander (2013)
//   "Density-Based Clustering Based on Hierarchical Density
//    Estimates", PAKDD 2013. DOI: 10.1007/978-3-642-37456-2_14
//
// Algorithm overview:
//   1. Compute core distances (k-th nearest-neighbour distance)
//   2. Build MST on the mutual-reachability graph via Prim's
//   3. Convert sorted MST edges into a single-linkage hierarchy
//   4. Condense the hierarchy using minClusterSize
//   5. Compute per-cluster stability (Excess of Mass)
//   6. Extract the optimal flat clustering via bottom-up DP
//   7. Assign labels, soft membership probabilities, and
//      GLOSH-style outlier scores
//
// Complexity: O(n²) time and O(n) space — suitable for
// n ≤ 3 000 (the display sample cap used by this application).
// ============================================================

/**
 * Simple Union-Find (path compression + union by rank).
 * Used both for MST construction and for tracking which
 * condensed cluster "owns" each single-linkage node.
 */
class UnionFind {
    private parent: Int32Array;
    private rank: Int32Array;
    readonly size: Int32Array;

    constructor(n: number) {
        this.parent = new Int32Array(n).map((_, i) => i);
        this.rank   = new Int32Array(n);
        this.size   = new Int32Array(n).fill(1);
    }

    find(x: number): number {
        // Iterative path-halving — avoids stack overflow on deep trees
        while (this.parent[x] !== x) {
            this.parent[x] = this.parent[this.parent[x]];
            x = this.parent[x];
        }
        return x;
    }

    /** Returns false if x and y were already in the same component. */
    union(x: number, y: number): boolean {
        const px = this.find(x);
        const py = this.find(y);
        if (px === py) return false;
        if (this.rank[px] < this.rank[py]) {
            this.parent[px] = py;
            this.size[py] += this.size[px];
        } else if (this.rank[px] > this.rank[py]) {
            this.parent[py] = px;
            this.size[px] += this.size[py];
        } else {
            this.parent[py] = px;
            this.size[px] += this.size[py];
            this.rank[px]++;
        }
        return true;
    }

    getSize(x: number): number { return this.size[this.find(x)]; }
}

/**
 * Collect every leaf-point index reachable from nodeId in the
 * single-linkage tree.  Iterative to avoid call-stack overflow.
 * n = number of original data points (leaf IDs are 0 … n-1).
 */
function hdbscanGetLeaves(
    nodeId: number,
    n: number,
    childrenOf: Map<number, [number, number]>
): number[] {
    const leaves: number[] = [];
    const stack: number[] = [nodeId];
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (id < n) {
            leaves.push(id);
        } else {
            const ch = childrenOf.get(id)!;
            stack.push(ch[0], ch[1]);
        }
    }
    return leaves;
}

/**
 * Full HDBSCAN implementation.
 *
 * @param dataset         2-D array of projected-km coordinates [x, y]
 * @param minClusterSize  Smallest group considered a genuine cluster
 * @param minSamples      Neighbourhood size k for core-distance (minPts)
 * @returns clusters, noiseIndices, labels, probabilities, outlierScores
 */
function hdbscanClustering(
    dataset: number[][],
    minClusterSize: number = 5,
    minSamples: number = 5
): {
    clusters: number[][];
    noiseIndices: number[];
    labels: number[];
    probabilities: number[];
    outlierScores: number[];
} {
    const n = dataset.length;
    const empty = {
        clusters: [], noiseIndices: [],
        labels: [], probabilities: [], outlierScores: []
    };
    if (n === 0) return empty;
    if (n === 1) return {
        clusters: [[0]], noiseIndices: [],
        labels: [0], probabilities: [1], outlierScores: [0]
    };

    // Clamp parameters to sensible ranges relative to dataset size
    const k = Math.min(minSamples, n - 1);
    const minCS = Math.max(2, Math.min(minClusterSize, Math.floor(n / 2)));

    // ----------------------------------------------------------------
    // PHASE 1 — Core distances
    // core_dist_k(i) = distance from i to its k-th nearest neighbour.
    // We compute all pairwise distances and pick the k-th smallest;
    // O(n²) which is fine for n ≤ 3 000.
    // ----------------------------------------------------------------
    const coreDistances = new Float64Array(n);
    const euclidean = (i: number, j: number): number => {
        const dx = dataset[i][0] - dataset[j][0];
        const dy = dataset[i][1] - dataset[j][1];
        return Math.sqrt(dx * dx + dy * dy);
    };

    for (let i = 0; i < n; i++) {
        // Collect distances to all other points
        const dists: number[] = new Array(n - 1);
        let idx = 0;
        for (let j = 0; j < n; j++) {
            if (j !== i) dists[idx++] = euclidean(i, j);
        }
        // We only need the k-th smallest — partial-sort the first k entries
        // via a max-heap would be fastest, but Array.sort is simpler and
        // still fast for n ≤ 3 000.
        dists.sort((a, b) => a - b);
        coreDistances[i] = dists[k - 1]; // k-th nearest (1-indexed)
    }

    // ----------------------------------------------------------------
    // PHASE 2 — Minimum Spanning Tree on the mutual-reachability graph
    //
    // d_mreach(i,j) = max( core_k(i), core_k(j), d(i,j) )
    //
    // Prim's algorithm, O(n²) — optimal for dense complete graphs.
    // ----------------------------------------------------------------
    const mreachDist = (i: number, j: number): number =>
        Math.max(coreDistances[i], coreDistances[j], euclidean(i, j));

    const inMST      = new Uint8Array(n);
    const minW       = new Float64Array(n).fill(Infinity);
    const minWSource = new Int32Array(n).fill(0);

    inMST[0] = 1;
    for (let j = 1; j < n; j++) {
        minW[j] = mreachDist(0, j);
        minWSource[j] = 0;
    }

    // [from, to, weight]  (n-1 edges)
    const mstEdges: [number, number, number][] = [];

    for (let iter = 0; iter < n - 1; iter++) {
        // Find the cheapest edge into the MST
        let bestW  = Infinity;
        let bestJ  = -1;
        for (let j = 0; j < n; j++) {
            if (!inMST[j] && minW[j] < bestW) { bestW = minW[j]; bestJ = j; }
        }
        if (bestJ === -1) break; // disconnected (should not happen)
        inMST[bestJ] = 1;
        mstEdges.push([minWSource[bestJ], bestJ, bestW]);

        // Relax edges from the newly added node
        for (let j = 0; j < n; j++) {
            if (!inMST[j]) {
                const w = mreachDist(bestJ, j);
                if (w < minW[j]) { minW[j] = w; minWSource[j] = bestJ; }
            }
        }
    }

    // Sort MST edges ascending by weight — produces single-linkage order
    mstEdges.sort((a, b) => a[2] - b[2]);

    // ----------------------------------------------------------------
    // PHASE 3 — Build the single-linkage dendrogram
    //
    // Process MST edges in order (cheapest first).
    // Each edge merges two components; internal nodes are numbered
    // n, n+1, …, 2n-2.  We track which "node ID" represents each
    // component so we can reconstruct the binary tree later.
    // ----------------------------------------------------------------
    interface Merge {
        nodeId: number;  // internal node ID (≥ n)
        left:   number;  // left-child node ID  (< n = leaf point)
        right:  number;  // right-child node ID
        weight: number;  // merge distance
        size:   number;  // total points in this merged subtree
    }

    const uf = new UnionFind(n);
    // Maps component root → the node ID that currently represents it
    const compNode: number[] = Array.from({ length: n }, (_, i) => i);
    const merges: Merge[] = [];
    let nextInternalId = n;

    for (const [u, v, w] of mstEdges) {
        const ru = uf.find(u);
        const rv = uf.find(v);
        if (ru === rv) continue;

        const nodeU = compNode[ru];
        const nodeV = compNode[rv];
        const sz    = uf.getSize(ru) + uf.getSize(rv);
        const newId = nextInternalId++;

        merges.push({ nodeId: newId, left: nodeU, right: nodeV, weight: w, size: sz });
        uf.union(u, v);
        const newRoot = uf.find(u);
        compNode[newRoot] = newId;
    }

    if (merges.length === 0) {
        // All points are identical — one degenerate cluster
        return {
            clusters: [Array.from({ length: n }, (_, i) => i)],
            noiseIndices: [],
            labels: new Array(n).fill(0),
            probabilities: new Array(n).fill(1),
            outlierScores: new Array(n).fill(0),
        };
    }

    // Lookup: nodeId → (left child, right child)
    const childrenOf = new Map<number, [number, number]>();
    // Lookup: nodeId → subtree size
    const subtreeSz  = new Map<number, number>();
    for (let i = 0; i < n; i++) subtreeSz.set(i, 1); // leaves

    for (const m of merges) {
        childrenOf.set(m.nodeId, [m.left, m.right]);
        subtreeSz.set(m.nodeId, m.size);
    }

    // ----------------------------------------------------------------
    // PHASE 4 — Condense the tree
    //
    // Walk top-down from the root.  At each split with weight w
    // (λ = 1/w):
    //   • Both children ≥ minCS  → genuine split, each becomes a
    //     new condensed cluster born at λ.
    //   • One child < minCS      → those points "fall out" (dropout)
    //     at λ; the large child continues as the same cluster.
    //   • Both children < minCS  → all points fall out at λ; the
    //     cluster ends.
    //
    // We record every dropout: (pointIndex, droppingClusterId, λ).
    // ----------------------------------------------------------------
    interface CondensedCluster {
        id:           number;
        parent:       number;       // -1 for root
        lambdaBirth:  number;       // λ when this cluster was born
        dropouts:     Map<number, number>; // pointIdx → λ at which it left
        childIds:     number[];     // IDs of child clusters (genuine splits)
    }

    const condensed     = new Map<number, CondensedCluster>();
    // Maps each dropped point to the cluster it fell from (for GLOSH)
    const pointDropCluster = new Map<number, number>(); // pointIdx → clusterId

    let nextCId = 0;
    const rootMerge    = merges[merges.length - 1];
    const rootCId      = nextCId++;
    condensed.set(rootCId, {
        id: rootCId, parent: -1, lambdaBirth: 0,
        dropouts: new Map(), childIds: []
    });

    // Stack: [singleLinkageNodeId, condensedClusterId]
    const stack: [number, number][] = [[rootMerge.nodeId, rootCId]];

    while (stack.length > 0) {
        const [nodeId, cid] = stack.pop()!;
        if (nodeId < n) continue; // leaf — handled by parent as dropout

        const ch      = childrenOf.get(nodeId)!;
        const left    = ch[0];
        const right   = ch[1];
        const mergeW  = merges[nodeId - n].weight;    // O(1) by index offset
        const lambda  = mergeW > 0 ? 1 / mergeW : 1e15;

        const szL = subtreeSz.get(left)!;
        const szR = subtreeSz.get(right)!;
        const cl  = condensed.get(cid)!;

        // --- Process left child ---
        if (szL >= minCS) {
            if (szR >= minCS) {
                // Genuine split: left becomes a new cluster
                const newId = nextCId++;
                condensed.set(newId, {
                    id: newId, parent: cid, lambdaBirth: lambda,
                    dropouts: new Map(), childIds: []
                });
                cl.childIds.push(newId);
                stack.push([left, newId]);
            } else {
                // Right is too small; left continues as current cluster
                stack.push([left, cid]);
            }
        } else {
            // Left too small — drop all its points at this lambda
            const pts = hdbscanGetLeaves(left, n, childrenOf);
            for (const p of pts) {
                cl.dropouts.set(p, lambda);
                pointDropCluster.set(p, cid);
            }
        }

        // --- Process right child ---
        if (szR >= minCS) {
            if (szL >= minCS) {
                // Genuine split (left already handled above): right → new cluster
                const newId = nextCId++;
                condensed.set(newId, {
                    id: newId, parent: cid, lambdaBirth: lambda,
                    dropouts: new Map(), childIds: []
                });
                cl.childIds.push(newId);
                stack.push([right, newId]);
            } else {
                // Left was too small; right continues as current cluster
                stack.push([right, cid]);
            }
        } else {
            // Right too small — drop all its points
            const pts = hdbscanGetLeaves(right, n, childrenOf);
            for (const p of pts) {
                cl.dropouts.set(p, lambda);
                pointDropCluster.set(p, cid);
            }
        }
    }

    // ----------------------------------------------------------------
    // PHASE 5 — Cluster stability (Excess of Mass)
    //
    // stability(C) = Σ_{direct dropouts p} (λ_drop(p) − λ_birth(C))
    //             + Σ_{child Ch}  |Ch| × (λ_birth(Ch) − λ_birth(C))
    //
    // where |Ch| is the total number of data points in Ch's subtree.
    // ----------------------------------------------------------------

    // Count total points under each condensed cluster (iterative, bottom-up)
    const condensedSize = new Map<number, number>();
    {
        // BFS order from root, then reverse = bottom-up
        const bfsOrder: number[] = [];
        const bfsQ: number[] = [rootCId];
        while (bfsQ.length > 0) {
            const id = bfsQ.shift()!;
            bfsOrder.push(id);
            for (const ch of condensed.get(id)!.childIds) bfsQ.push(ch);
        }
        for (const id of bfsOrder.reverse()) {
            const cl = condensed.get(id)!;
            let sz = cl.dropouts.size;
            for (const ch of cl.childIds) sz += condensedSize.get(ch)!;
            condensedSize.set(id, sz);
        }
    }

    const stability = new Map<number, number>();
    for (const [id, cl] of condensed) {
        let s = 0;
        for (const lambdaDrop of cl.dropouts.values()) {
            s += lambdaDrop - cl.lambdaBirth;
        }
        for (const chId of cl.childIds) {
            const chCl = condensed.get(chId)!;
            s += condensedSize.get(chId)! * (chCl.lambdaBirth - cl.lambdaBirth);
        }
        // Clamp to ≥ 0 (rounding can sometimes give tiny negatives)
        stability.set(id, Math.max(0, s));
    }

    // ----------------------------------------------------------------
    // PHASE 6 — Extract optimal flat clustering (bottom-up DP)
    //
    // For each cluster: select it if its own stability ≥ sum of the
    // stabilities already selected from its children.
    // ----------------------------------------------------------------
    const dpValue    = new Map<number, number>();
    const dpSelected = new Map<number, Set<number>>();

    // Process bottom-up using the reversed BFS order we still have
    // (re-compute it since bfsOrder was already reversed above)
    const bfsOrder2: number[] = [];
    {
        const q: number[] = [rootCId];
        while (q.length > 0) {
            const id = q.shift()!;
            bfsOrder2.push(id);
            for (const ch of condensed.get(id)!.childIds) q.push(ch);
        }
    }
    for (const id of bfsOrder2.reverse()) {
        const cl = condensed.get(id)!;
        if (cl.childIds.length === 0) {
            // Leaf condensed cluster: always select itself
            dpValue.set(id, stability.get(id)!);
            dpSelected.set(id, new Set([id]));
        } else {
            let childSum = 0;
            const childSel = new Set<number>();
            for (const chId of cl.childIds) {
                childSum += dpValue.get(chId)!;
                for (const s of dpSelected.get(chId)!) childSel.add(s);
            }
            const mySt = stability.get(id)!;
            if (mySt >= childSum) {
                dpValue.set(id, mySt);
                dpSelected.set(id, new Set([id]));
            } else {
                dpValue.set(id, childSum);
                dpSelected.set(id, childSel);
            }
        }
    }

    const selectedSet = dpSelected.get(rootCId) ?? new Set<number>();

    // ----------------------------------------------------------------
    // PHASE 7 — Label assignment, probabilities, and outlier scores
    //
    // For each selected cluster:
    //   • Recursively collect all data points (direct dropouts + those
    //     in non-selected descendant sub-clusters).
    //   • λ_max(C) = max λ among all collected points.
    //   • prob(p) = λ_death(p) / λ_max(C) ∈ [0, 1].
    //
    // For noise points (label = -1):
    //   • GLOSH-style score = 1 − λ_death(p) / λ_max(dropping cluster).
    //     Higher score → more anomalous relative to the nearest cluster.
    // ----------------------------------------------------------------

    /** Collect all (pointIdx, lambdaDeath) pairs under a condensed cluster,
     *  skipping sub-trees that are themselves in selectedSet. */
    function collectPoints(
        cid: number,
        sel: Set<number>
    ): { idx: number; lambda: number }[] {
        const cl  = condensed.get(cid)!;
        const pts: { idx: number; lambda: number }[] = [];
        // Direct dropouts
        for (const [p, lam] of cl.dropouts) pts.push({ idx: p, lambda: lam });
        // Recurse into non-selected children
        for (const chId of cl.childIds) {
            if (!sel.has(chId)) {
                // Child cluster was not independently selected; absorb it.
                // Points in this child left the parent at the child's birth lambda.
                const absorbed = collectPoints(chId, sel);
                // Override lambda with child's birth lambda for points that went
                // deeper into the sub-tree — their "exit from this cluster" was
                // the moment the sub-cluster split off.
                const childBirth = condensed.get(chId)!.lambdaBirth;
                for (const entry of absorbed) {
                    pts.push({ idx: entry.idx, lambda: childBirth });
                }
            }
        }
        return pts;
    }

    const labels        = new Array<number>(n).fill(-1);
    const probabilities = new Array<number>(n).fill(0);
    const outlierScores = new Array<number>(n).fill(0);
    const outputClusters: number[][] = [];

    let clusterIndex = 0;
    for (const cid of selectedSet) {
        const pts      = collectPoints(cid, selectedSet);
        const lambdaMax = pts.reduce((mx, p) => Math.max(mx, p.lambda), 0);

        const memberIndices: number[] = [];
        for (const { idx, lambda } of pts) {
            labels[idx]        = clusterIndex;
            probabilities[idx] = lambdaMax > 0 ? Math.min(1, lambda / lambdaMax) : 1;
            memberIndices.push(idx);
        }
        outputClusters.push(memberIndices);
        clusterIndex++;
    }

    // GLOSH-style outlier scores for noise points
    // Compute λ_max for each condensed cluster once (for GLOSH denominator)
    const lambdaMaxOfCluster = new Map<number, number>();
    for (const [cid, cl] of condensed) {
        let lmx = 0;
        for (const lam of cl.dropouts.values()) if (lam > lmx) lmx = lam;
        for (const chId of cl.childIds) {
            const chBirth = condensed.get(chId)!.lambdaBirth;
            if (chBirth > lmx) lmx = chBirth;
        }
        lambdaMaxOfCluster.set(cid, lmx);
    }

    const noiseIndices: number[] = [];
    for (let i = 0; i < n; i++) {
        if (labels[i] !== -1) continue;
        noiseIndices.push(i);

        // Find which cluster dropped this point and at what lambda
        const dropCId  = pointDropCluster.get(i) ?? rootCId;
        const dropLam  = condensed.get(dropCId)?.dropouts.get(i) ?? 0;
        const lmxOfDrop = lambdaMaxOfCluster.get(dropCId) ?? 0;

        // outlierScore ∈ [0,1]:  0 = nearly in a cluster, 1 = deep outlier
        outlierScores[i] = lmxOfDrop > 0
            ? Math.max(0, 1 - dropLam / lmxOfDrop)
            : 1;
    }

    return { clusters: outputClusters, noiseIndices, labels, probabilities, outlierScores };
}


// Get algorithm description for metadata

function getAlgorithmDescription(algorithm: ClusteringAlgorithm): string {
    const descriptions: Record<ClusteringAlgorithm, string> = {
        'dbscan': 'DBSCAN (Density-Based Spatial Clustering) - Identifies clusters of arbitrary shape based on density',
        'optics': 'OPTICS (Ordering Points To Identify Clustering Structure) - Density-based clustering with variable density',
        'kmeans': 'K-Means - Partitions data into k clusters by minimizing within-cluster variance',
        'step-mag': 'STEP Magnitude Clustering - Clusters earthquakes starting from largest magnitude, using Wells-Coppersmith spatial radius and sliding time windows',
        'step-time': 'STEP Time Clustering - Clusters earthquakes in temporal order, extending clusters based on magnitude-dependent spatial windows',
        'nearest-neighbor': 'Nearest-Neighbor Clustering (Zaliapin-Ben-Zion) - Identifies clusters based on space-time-magnitude nearest-neighbor distances',
        'st-dbscan': 'ST-DBSCAN - Density-based clustering with both spatial and temporal thresholds',
        'tmc': 'Time-Magnitude Clustering (Reasenberg)',
        'hardebeck-2019': 'Hardebeck (2019) Rupture-Window Clustering',
        'hdbscan': 'HDBSCAN (Hierarchical DBSCAN, Campello et al. 2013) — builds a cluster hierarchy over all density levels and extracts the most stable flat clustering; handles variable-density clusters without requiring an epsilon parameter'
    };
    return descriptions[algorithm] || 'Unknown algorithm';
}

// Backwards-compatible API:
// - Legacy: calculateSpatialClustering(earthquakes, epsilon, minSamples)
// - New:    calculateSpatialClustering(earthquakes, { algorithm, epsilon, minSamples, k })
export function calculateSpatialClustering(
    earthquakes: EarthquakeData[],
    optionsOrEpsilon: Partial<SpatialClusteringOptions> | number = {},
    minSamplesLegacy: number = 5
): ClusterResult | null {
    if (!earthquakes || earthquakes.length < 10) {
        return null;
    }

    const datasetSize = earthquakes.length;

    // OPTIMIZATION: Log warning for very large datasets
    if (datasetSize > 100000) {
        console.warn(`⚠️  Large dataset detected: ${datasetSize.toLocaleString()} events`);
        console.warn(`⚠️  This may take a while. Consider filtering to a smaller region/time period.`);
        console.warn(`⚠️  Recommended algorithms for large datasets: DBSCAN (with R-tree), ST-DBSCAN, or STEP methods`);
    }

    let algorithm: ClusteringAlgorithm = 'dbscan';
    let epsilon = 25; // km
    let minSamples = 5;
    let k = 5;
    let useRTree = true; // OPTIMIZATION: Default to R-tree for better performance
    let nnThreshold = 1.0; // Nearest-neighbor threshold
    // STEP clustering parameters
    let stepMinMag = 2.0;    // Minimum mainshock magnitude
    let stepT1 = 1;          // Time window before (days)
    let stepT2 = 30;         // Time window after (days)

    // Normalize options for cache key generation
    let options: Partial<SpatialClusteringOptions>;

    if (typeof optionsOrEpsilon === 'number') {
        // Legacy signature
        epsilon = optionsOrEpsilon;
        minSamples = minSamplesLegacy;
        options = { algorithm: 'dbscan', epsilon, minSamples };
    } else {
        const opts = optionsOrEpsilon || {};
        algorithm = opts.algorithm ?? 'dbscan';
        epsilon = opts.epsilon ?? 25;
        minSamples = opts.minSamples ?? 5;
        k = opts.k ?? 5;
        useRTree = opts.useRTree ?? true; // Default to optimized version
        nnThreshold = opts.nnThreshold ?? 1.0;
        // STEP parameters
        stepMinMag = opts.stepMinMag ?? 2.0;
        stepT1 = opts.stepT1 ?? 1;
        stepT2 = opts.stepT2 ?? 30;
        options = opts;
    }

    // OPTIMIZATION: Check cache before computing
    const cachedResult = clusteringCache.get(earthquakes, options);
    if (cachedResult) {
        return cachedResult;
    }

    const startTime = performance.now();

    // OPTIMIZATION: Log start for large datasets
    if (datasetSize > 100000) {
        console.log(`🔄 Starting ${algorithm} clustering on ${datasetSize.toLocaleString()} events...`);
    }

    // Default values if using legacy signature (needed for block scope access later)
    let epsilonTemporal = 7;
    let tmcRfact = 10;
    let tmcTau0 = 2;
    let tmcTauMax = 10;
    let tmcP1 = 0.99;
    let tmcXk = 0.5;
    let tmcMinMag = 1.5;
    // Hardebeck variables
    let hardebeckMinMag = 5.0;
    let hardebeckTimeWindow = 10;
    let hardebeckRuptureMult = 3;
    let hardebeckMainshockTimeYears = 3;
    // HDBSCAN variables
    let hdbscanMinClusterSize = 5;
    let hdbscanMinSamples = 5;

    if (typeof optionsOrEpsilon !== 'number') {
        const opts = optionsOrEpsilon || {};
        epsilonTemporal = opts.epsilonTemporal ?? 7;
        tmcRfact = opts.tmcRfact ?? 10;
        tmcTau0 = opts.tmcTau0 ?? 2;
        tmcTauMax = opts.tmcTauMax ?? 10;
        tmcP1 = opts.tmcP1 ?? 0.99;
        tmcXk = opts.tmcXk ?? 0.5;
        tmcMinMag = opts.tmcMinMag ?? 1.5;
        hardebeckMinMag = opts.hardebeckMinMag ?? 5.0;
        hardebeckTimeWindow = opts.hardebeckTimeWindow ?? 10;
        hardebeckRuptureMult = opts.hardebeckRuptureMult ?? 3;
        hardebeckMainshockTimeYears = opts.hardebeckMainshockTimeYears ?? 3;
        hdbscanMinClusterSize = opts.hdbscanMinClusterSize ?? 5;
        hdbscanMinSamples = opts.hdbscanMinSamples ?? 5;
    }

    // Prepare data for clustering (longitude, latitude)
    // Project to approximate km relative to the mean center so epsilon has meaning in km.
    // OPTIMIZATION: Use running sum for O(n) instead of reduce for large datasets
    let sumLat = 0;
    let sumLon = 0;
    for (let i = 0; i < earthquakes.length; i++) {
        sumLat += earthquakes[i].latitude;
        sumLon += earthquakes[i].longitude;
    }
    const meanLat = sumLat / earthquakes.length;
    const meanLon = sumLon / earthquakes.length;

    const dataset = earthquakes.map(eq => {
        // Simple equirectangular projection approximation in km
        const x = (eq.longitude - meanLon) * 111.32 * Math.cos((meanLat * Math.PI) / 180);
        const y = (eq.latitude - meanLat) * 110.57;
        return [x, y];
    });

    let clusters: number[][];
    let noiseIndices: number[] = [];
    let hdbscanProbabilities: number[] | undefined;
    let hdbscanOutlierScores: number[] | undefined;

    if (algorithm === 'dbscan') {
        // OPTIMIZATION: Use R-tree optimized DBSCAN for 90-95% speedup
        if (useRTree) {
            const result = dbscanWithRTree(dataset, epsilon, minSamples);
            clusters = result.clusters;
            noiseIndices = result.noiseIndices;
        } else {
            // Fallback to standard DBSCAN
            const dbscan = new DBSCAN();
            clusters = dbscan.run(dataset, epsilon, minSamples);
            noiseIndices = Array.isArray((dbscan as any).noise) ? (dbscan as any).noise : [];
        }
    } else if (algorithm === 'optics') {
        const optics = new OPTICS();
        clusters = optics.run(dataset, epsilon, minSamples);
        // OPTICS does not expose noise directly; treat points not in any cluster as noise
        const clusteredSet = new Set<number>();
        clusters.forEach(cluster => {
            cluster.forEach(idx => clusteredSet.add(idx));
        });
        noiseIndices = [];
        for (let i = 0; i < dataset.length; i++) {
            if (!clusteredSet.has(i)) noiseIndices.push(i);
        }
    } else if (algorithm === 'kmeans') {
        // K-MEANS
        const kmeans = new KMEANS();
        clusters = kmeans.run(dataset, k);
        // K-means assigns every point to some cluster; no noise
        noiseIndices = [];
    } else if (algorithm === 'step-mag') {
        // STEP Magnitude clustering (seismology) - Starts with largest earthquake
        const result = stepMagnitudeClustering(earthquakes, stepMinMag, stepT1, stepT2);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'step-time') {
        // STEP Time clustering (seismology) - Time-ordered processing
        const result = stepTimeClustering(earthquakes, stepMinMag, stepT1, stepT2);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'nearest-neighbor') {
        // Nearest-neighbor clustering (Zaliapin-Ben-Zion method)
        const result = nearestNeighborClustering(earthquakes, dataset, nnThreshold);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'st-dbscan') {
        const result = stDbscan(earthquakes, dataset, epsilon, epsilonTemporal, minSamples);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'tmc') {
        const result = timeMagnitudeClustering(earthquakes, tmcRfact, tmcTau0, tmcTauMax, tmcP1, tmcXk, tmcMinMag);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'hardebeck-2019') {
        const result = hardebeckClustering(earthquakes, hardebeckMinMag, hardebeckTimeWindow, hardebeckRuptureMult, hardebeckMainshockTimeYears);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    } else if (algorithm === 'hdbscan') {
        const result = hdbscanClustering(dataset, hdbscanMinClusterSize, hdbscanMinSamples);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
        hdbscanProbabilities = result.probabilities;
        hdbscanOutlierScores = result.outlierScores;
    } else {
        // Fallback to DBSCAN
        console.warn(`Unknown algorithm: ${algorithm}, falling back to DBSCAN`);
        const result = dbscanWithRTree(dataset, epsilon, minSamples);
        clusters = result.clusters;
        noiseIndices = result.noiseIndices;
    }

    // Create labels array (-1 for noise/unassigned)
    const labels = new Array(earthquakes.length).fill(-1);

    let clusteredCount = 0;
    clusters.forEach((clusterIndices, clusterId) => {
        clusterIndices.forEach(index => {
            if (index < 0 || index >= earthquakes.length) {
                console.error(`[clustering] ${algorithm}: cluster ${clusterId} contains out-of-bounds index ${index} (n=${earthquakes.length}) — skipped`);
                return;
            }
            labels[index] = clusterId;
            clusteredCount++;
        });
    });

    // NOTE: Do NOT unconditionally reset noiseIndices to -1 here.
    // For algorithms like nearest-neighbor, background events (mainshocks) appear in
    // noiseIndices because their OWN nearest-neighbour distance is large, but they are
    // also inserted into clusters as parents of dependent events. Overwriting their label
    // with -1 would erase the cluster assignment and make mainshocks invisible in the UI.

    const nClusters = clusters.length;
    const clusterPercent = (clusteredCount / earthquakes.length) * 100;
    const noisePercent = 100 - clusterPercent;

    const computationTime = performance.now() - startTime;

    // OPTIMIZATION: Log completion for large datasets
    if (datasetSize > 100000) {
        console.log(`✅ Clustering complete: ${nClusters} clusters found in ${(computationTime / 1000).toFixed(2)}s`);
        console.log(`   Clustered: ${clusteredCount.toLocaleString()} events (${clusterPercent.toFixed(1)}%)`);
        console.log(`   Noise: ${noiseIndices.length.toLocaleString()} events (${noisePercent.toFixed(1)}%)`);
    }

    // Build metadata for exports
    const parameters: Record<string, any> = {};
    if (algorithm === 'dbscan' || algorithm === 'optics') {
        parameters.epsilon = epsilon;
        parameters.minSamples = minSamples;
        if (algorithm === 'dbscan') {
            parameters.useRTree = useRTree;
        }
    } else if (algorithm === 'kmeans') {
        parameters.k = k;
    } else if (algorithm === 'step-mag' || algorithm === 'step-time') {
        parameters.stepMinMag = stepMinMag;
        parameters.stepT1 = stepT1;
        parameters.stepT2 = stepT2;
    } else if (algorithm === 'nearest-neighbor') {
        parameters.nnThreshold = nnThreshold;
    } else if (algorithm === 'st-dbscan') {
        parameters.epsilon = epsilon;
        parameters.epsilonTemporal = epsilonTemporal;
        parameters.minSamples = minSamples;
    } else if (algorithm === 'tmc') {
        parameters.tmcRfact = tmcRfact;
        parameters.tmcTau0 = tmcTau0;
        parameters.tmcTauMax = tmcTauMax;
        parameters.tmcP1 = tmcP1;
        parameters.tmcXk = tmcXk;
        parameters.tmcMinMag = tmcMinMag;
    } else if (algorithm === 'hdbscan') {
        parameters.hdbscanMinClusterSize = hdbscanMinClusterSize;
        parameters.hdbscanMinSamples = hdbscanMinSamples;
    }


    const metadata: ClusteringMetadata = {
        algorithm,
        algorithmDescription: getAlgorithmDescription(algorithm),
        parameters,
        timestamp: new Date().toISOString(),
        datasetSize: earthquakes.length,
        computationTime
    };

    const result: ClusterResult = {
        labels,
        nClusters,
        clusterPercent,
        noisePercent,
        clusters,
        ...(hdbscanProbabilities !== undefined && { probabilities: hdbscanProbabilities }),
        ...(hdbscanOutlierScores !== undefined && { outlierScores: hdbscanOutlierScores }),
        metadata
    };

    // OPTIMIZATION: Cache the result for future use
    clusteringCache.set(earthquakes, options, result);

    return result;
}
