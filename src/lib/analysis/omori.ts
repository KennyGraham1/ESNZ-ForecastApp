import { EarthquakeData } from '@/types/earthquake';

export interface OmoriParameters {
    K: number;
    c: number;
    p: number;
    rSquared: number;
    dailyCounts: { day: number; count: number }[];
    fittedCounts: { day: number; count: number }[];
    cumulativeCounts: { day: number; count: number }[];
}

export interface MainEventInfo {
    time: Date;
    magnitude: number;
    name: string;
    latitude?: number;
    longitude?: number;
    depth?: number;
}

/**
 * Modified Omori Law: n(t) = K / (t + c)^p
 * where:
 * - n(t) is the aftershock rate at time t
 * - K is the productivity parameter
 * - c is the time offset (days)
 * - p is the decay exponent
 */
function omoriLaw(t: number, K: number, c: number, p: number): number {
    return K / Math.pow(t + c, p);
}

/**
 * Simple curve fitting using least squares for Omori's Law
 * This is a simplified version - for production, use ml-levenberg-marquardt
 */
function fitOmoriLaw(
    days: number[],
    counts: number[]
): { K: number; c: number; p: number; rSquared: number } {
    // Initial parameter guesses
    let K = Math.max(...counts) * 2;
    let c = 0.1;
    let p = 1.1;

    // Simple grid search for better parameters
    let bestError = Infinity;
    let bestParams = { K, c, p };

    // Coarse grid search
    for (let testP = 0.8; testP <= 1.5; testP += 0.1) {
        for (let testC = 0.01; testC <= 1.0; testC += 0.1) {
            // Calculate K from the data
            const sumNumerator = days.reduce((sum, t, i) => {
                return sum + counts[i] * Math.pow(t + testC, testP);
            }, 0);
            const sumDenominator = days.length;
            const testK = sumNumerator / sumDenominator;

            // Calculate error
            const error = days.reduce((sum, t, i) => {
                const predicted = omoriLaw(t, testK, testC, testP);
                return sum + Math.pow(counts[i] - predicted, 2);
            }, 0);

            if (error < bestError) {
                bestError = error;
                bestParams = { K: testK, c: testC, p: testP };
            }
        }
    }

    // Calculate R-squared
    const meanCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const ssTot = counts.reduce((sum, c) => sum + Math.pow(c - meanCount, 2), 0);
    const ssRes = days.reduce((sum, t, i) => {
        const predicted = omoriLaw(t, bestParams.K, bestParams.c, bestParams.p);
        return sum + Math.pow(counts[i] - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssRes / ssTot);

    return { ...bestParams, rSquared };
}

/**
 * Calculate Omori's Law parameters for an aftershock sequence
 */
export function calculateOmoriParameters(
    earthquakes: EarthquakeData[],
    mainEvent: MainEventInfo,
    daysAfter: number = 365
): OmoriParameters | null {
    if (earthquakes.length === 0) {
        return null;
    }

    const mainEventTime = mainEvent.time instanceof Date ? mainEvent.time : new Date(mainEvent.time);

    // Filter aftershocks
    const aftershocks = earthquakes.filter(eq => {
        try {
            const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
            if (isNaN(eqTime.getTime())) return false;

            const daysSince = (eqTime.getTime() - mainEventTime.getTime()) / (1000 * 60 * 60 * 24);
            return daysSince > 0 && daysSince <= daysAfter;
        } catch (e) {
            return false;
        }
    });

    if (aftershocks.length < 10) {
        return null; // Not enough data
    }

    // Calculate days since mainshock for each aftershock
    const aftershocksWithDays = aftershocks.map(eq => {
        const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
        const daysSince = (eqTime.getTime() - mainEventTime.getTime()) / (1000 * 60 * 60 * 24);
        return { ...eq, daysSince };
    });

    // Bin into daily counts
    const maxDay = Math.ceil(Math.max(...aftershocksWithDays.map(a => a.daysSince)));
    const dailyCounts: { day: number; count: number }[] = [];

    for (let day = 1; day <= Math.min(maxDay, daysAfter); day++) {
        const count = aftershocksWithDays.filter(
            a => a.daysSince >= day - 0.5 && a.daysSince < day + 0.5
        ).length;
        dailyCounts.push({ day, count });
    }

    // Filter out days with zero counts for fitting (log scale)
    const nonZeroDays = dailyCounts.filter(d => d.count > 0);
    if (nonZeroDays.length < 5) {
        return null;
    }

    const days = nonZeroDays.map(d => d.day);
    const counts = nonZeroDays.map(d => d.count);

    // Fit Omori's Law
    const { K, c, p, rSquared } = fitOmoriLaw(days, counts);

    // Generate fitted curve
    const fittedCounts = dailyCounts.map(({ day }) => ({
        day,
        count: omoriLaw(day, K, c, p)
    }));

    // Calculate cumulative counts
    let cumulative = 0;
    const cumulativeCounts = dailyCounts.map(({ day, count }) => {
        cumulative += count;
        return { day, count: cumulative };
    });

    return {
        K,
        c,
        p,
        rSquared,
        dailyCounts,
        fittedCounts,
        cumulativeCounts
    };
}
