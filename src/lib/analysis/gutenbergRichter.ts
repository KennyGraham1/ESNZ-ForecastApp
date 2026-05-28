import { linearRegression } from 'simple-statistics';
import { EarthquakeData } from '@/types/earthquake';
import { safeMinMax } from '@/utils/arrayMath';

export interface GutenbergRichterResult {
    bValue: number;
    bUncertainty: number; // Shi & Bolt (1982) standard error on b
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
    const { min: minMag, max: maxMag } = safeMinMax(magnitudes);

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

    // Calculate cumulative counts (N >= M) using suffix sum — O(n) instead of O(n²)
    const cumulativeCounts: number[] = new Array(numBins).fill(0);
    cumulativeCounts[numBins - 1] = bins[numBins - 1];
    for (let i = numBins - 2; i >= 0; i--) {
        cumulativeCounts[i] = bins[i] + cumulativeCounts[i + 1];
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
        // Use closest bin center as proxy index for the regression loop below
    } else if (completenessMethod === 'maximum_curvature') {
        // Mc is the magnitude bin with the maximum count
        // CRITICAL FIX: Don't use spread operator with large arrays (causes stack overflow)
        // Use reduce with first element as initial value to avoid -Infinity
        const maxBin = bins.length > 0 ? bins.reduce((max, bin) => Math.max(max, bin), bins[0]) : 0;
        mcIndex = bins.indexOf(maxBin);
        mc = binCenters[mcIndex];
    } else {
        // Goodness-of-fit method (Wiemer & Wyss 2000) — KSTOTAL criterion.
        // For each candidate Mc (lowest to highest), fit G-R via the Aki MLE and
        // measure the absolute relative deviation between the observed and
        // synthetic cumulative FMD; select the LOWEST Mc where it drops below
        // 10%. The previous implementation maximised R², which always selects
        // the smallest possible Mc (more data → better linear fit) and is wrong.
        const maxBin = bins.length > 0 ? bins.reduce((max, bin) => Math.max(max, bin), bins[0]) : 0;
        mcIndex = bins.indexOf(maxBin); // fallback: maximum curvature
        const gftThreshold = 0.10;

        for (let i = 0; i < numBins - 2; i++) {
            const above = magnitudes.filter(m => m >= binCenters[i]);
            const nAbove = above.length;
            if (nAbove < 10) continue;

            const meanM = above.reduce((sum, m) => sum + m, 0) / nAbove;
            // Same Utsu binning correction as the primary b-value path
            const dm = meanM - (binCenters[i] - binWidth / 2);
            if (dm <= 0) continue;
            const bTry = Math.LOG10E / dm; // log10(e) / dm
            const aTry = Math.log10(nAbove) + bTry * binCenters[i];

            // Synthetic vs observed cumulative FMD from the Aki MLE fit
            let sumAbsDiff = 0;
            for (let j = i; j < numBins; j++) {
                const nObs = cumulativeCounts[j];
                if (nObs <= 0) continue;
                const nSyn = Math.pow(10, aTry - bTry * binCenters[j]);
                sumAbsDiff += Math.abs(nObs - nSyn);
            }
            const kstotal = sumAbsDiff / nAbove;
            if (kstotal <= gftThreshold) {
                mcIndex = i; // lowest Mc that passes
                break;
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

    // Aki (1965) maximum-likelihood b-value with the Utsu (1966) binning
    // correction: b = log10(e) / (mean_M - (Mc - binWidth/2)). This is the
    // minimum-variance unbiased estimator for a G-R population. OLS on
    // cumulative counts (the previous estimator) is biased because cumulative
    // counts are correlated and heteroscedastic.
    const magsAboveMc = magnitudes.filter(m => m >= mc);
    const nAboveMc = magsAboveMc.length;
    if (nAboveMc < 2) {
        return null;
    }
    const meanM = magsAboveMc.reduce((sum, m) => sum + m, 0) / nAboveMc;
    const dm = meanM - (mc - binWidth / 2);
    if (dm <= 0) {
        return null;
    }
    const bValue = Math.LOG10E / dm; // Aki-Utsu MLE
    const aValue = Math.log10(nAboveMc) + bValue * mc;

    // Shi & Bolt (1982) standard error on the b-value
    const varianceM = magsAboveMc.reduce((sum, m) => sum + (m - meanM) ** 2, 0) / (nAboveMc * (nAboveMc - 1));
    const bUncertainty = 2.30 * bValue * bValue * Math.sqrt(varianceM);

    // OLS fit on cumulative counts retained for the FMD plot quality metric
    // only (NOT used for b): R² of log10(N) vs M.
    const rSquared = calculateR2(magnitudesAboveMc, logCountsAboveMc);

    // Fitted G-R line for all bin centers, anchored on the MLE a/b
    const fittedLine = binCenters.map(m => Math.pow(10, aValue - bValue * m));

    const earthquakesAboveMc = nAboveMc;

    return {
        bValue,
        bUncertainty,
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
