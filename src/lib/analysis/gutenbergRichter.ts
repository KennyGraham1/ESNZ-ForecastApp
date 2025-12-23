import { linearRegression } from 'simple-statistics';
import { EarthquakeData } from '@/types/earthquake';

export interface GutenbergRichterResult {
    bValue: number;
    aValue: number;
    magnitudeOfCompleteness: number;
    rSquared: number;
    earthquakesAboveMc: number;
    binCenters: number[];
    cumulativeCounts: number[];
    fittedLine: number[];
}

export interface GROptions {
    binWidth?: number;
    completenessMethod?: 'maximum_curvature' | 'goodness_of_fit';
    magnitudeCompleteness?: number;
}

/**
 * Calculate Gutenberg-Richter b-value and magnitude of completeness
 * Based on the Gutenberg-Richter law: log10(N) = a - b*M
 */
export function calculateGutenbergRichter(
    earthquakes: EarthquakeData[],
    options: GROptions = {}
): GutenbergRichterResult | null {
    const { binWidth = 0.1, completenessMethod = 'maximum_curvature', magnitudeCompleteness } = options;

    if (earthquakes.length === 0) {
        return null;
    }

    const magnitudes = earthquakes.map(eq => eq.magnitude);
    // FIXED: Use iterative approach instead of spread operator to avoid stack overflow on large datasets
    let minMag = Infinity;
    let maxMag = -Infinity;
    for (const mag of magnitudes) {
        if (mag < minMag) minMag = mag;
        if (mag > maxMag) maxMag = mag;
    }

    // Create magnitude bins
    const numBins = Math.ceil((maxMag - minMag) / binWidth) + 1;
    const bins: number[] = [];
    const binCenters: number[] = [];

    for (let i = 0; i < numBins; i++) {
        bins.push(0);
        binCenters.push(minMag + i * binWidth);
    }

    // Count earthquakes in each bin
    magnitudes.forEach(mag => {
        const binIndex = Math.floor((mag - minMag) / binWidth);
        if (binIndex >= 0 && binIndex < numBins) {
            bins[binIndex]++;
        }
    });

    // Calculate cumulative counts (N >= M)
    const cumulativeCounts: number[] = new Array(numBins).fill(0);
    for (let i = 0; i < numBins; i++) {
        for (let j = i; j < numBins; j++) {
            cumulativeCounts[i] += bins[j];
        }
    }

    // Determine magnitude of completeness (Mc)
    let mc: number;
    let mcIndex: number;

    if (magnitudeCompleteness !== undefined) {
        // Use user-provided Mc
        mc = magnitudeCompleteness;
        // Find nearest bin index
        let minDiff = Infinity;
        mcIndex = 0;
        binCenters.forEach((center, idx) => {
            const diff = Math.abs(center - mc);
            if (diff < minDiff) {
                minDiff = diff;
                mcIndex = idx;
            }
        });
        // Ensure mc matches a bin center strictly if needed, but for now closest bin is fine
        // Actually, let's just trust the user provided value but we need an index for the loop below
    } else if (completenessMethod === 'maximum_curvature') {
        // Mc is the magnitude bin with the maximum count
        // CRITICAL FIX: Don't use spread operator with large arrays (causes stack overflow)
        // Use reduce with first element as initial value to avoid -Infinity
        const maxBin = bins.length > 0 ? bins.reduce((max, bin) => Math.max(max, bin), bins[0]) : 0;
        mcIndex = bins.indexOf(maxBin);
        mc = binCenters[mcIndex];
    } else {
        // Goodness of fit method
        let bestR2 = -Infinity;
        mcIndex = 0;

        for (let i = 0; i < numBins - 2; i++) {
            const testMagnitudes: number[] = [];
            const testLogCounts: number[] = [];

            for (let j = i; j < numBins; j++) {
                if (cumulativeCounts[j] > 0) {
                    testMagnitudes.push(binCenters[j]);
                    testLogCounts.push(Math.log10(cumulativeCounts[j]));
                }
            }

            if (testMagnitudes.length < 3) continue;

            const r2 = calculateR2(testMagnitudes, testLogCounts);
            if (r2 > bestR2) {
                bestR2 = r2;
                mcIndex = i;
            }
        }

        mc = binCenters[mcIndex];
    }

    // Filter data above Mc for b-value calculation
    const magnitudesAboveMc: number[] = [];
    const logCountsAboveMc: number[] = [];

    for (let i = mcIndex; i < numBins; i++) {
        if (cumulativeCounts[i] > 0) {
            magnitudesAboveMc.push(binCenters[i]);
            logCountsAboveMc.push(Math.log10(cumulativeCounts[i]));
        }
    }

    if (magnitudesAboveMc.length < 2) {
        return null;
    }

    // Perform linear regression: log10(N) = a - b*M
    const points: [number, number][] = magnitudesAboveMc.map((m, i) => [m, logCountsAboveMc[i]]);
    const { m: slope, b: intercept } = linearRegression(points);

    const bValue = -slope; // b-value is negative of slope
    const aValue = intercept;

    // Calculate R-squared
    const rSquared = calculateR2(magnitudesAboveMc, logCountsAboveMc);

    // Calculate fitted line for all bin centers
    const fittedLine = binCenters.map(m => Math.pow(10, aValue - bValue * m));

    const earthquakesAboveMc = earthquakes.filter(eq => eq.magnitude >= mc).length;

    return {
        bValue,
        aValue,
        magnitudeOfCompleteness: mc,
        rSquared,
        earthquakesAboveMc,
        binCenters,
        cumulativeCounts,
        fittedLine
    };
}

/**
 * Calculate R-squared value for linear regression
 */
function calculateR2(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) {
        return 0;
    }

    const points: [number, number][] = x.map((xi, i) => [xi, y[i]]);
    const { m, b } = linearRegression(points);

    const yMean = y.reduce((sum, val) => sum + val, 0) / y.length;

    let ssRes = 0;
    let ssTot = 0;

    for (let i = 0; i < x.length; i++) {
        const yPred = m * x[i] + b;
        ssRes += Math.pow(y[i] - yPred, 2);
        ssTot += Math.pow(y[i] - yMean, 2);
    }

    return 1 - (ssRes / ssTot);
}
