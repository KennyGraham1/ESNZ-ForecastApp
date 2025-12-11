import { EarthquakeData } from '@/types/earthquake';
import { levenbergMarquardt } from 'ml-levenberg-marquardt';

export type OptimizationMethod = 'grid-search' | 'levenberg-marquardt' | 'nelder-mead' | 'hybrid' | 'mle';

export interface ParameterUncertainty {
    K_se?: number;  // Standard error
    c_se?: number;
    p_se?: number;
    K_ci?: [number, number];  // 95% confidence interval
    c_ci?: [number, number];
    p_ci?: [number, number];
    logLikelihood?: number;
    aic?: number;  // Akaike Information Criterion
    bic?: number;  // Bayesian Information Criterion
}

export interface OmoriParameters {
    K: number;
    c: number;
    p: number;
    rSquared: number;
    dailyCounts: { day: number; count: number }[];
    fittedCounts: { day: number; count: number }[];
    cumulativeCounts: { day: number; count: number }[];
    expectedCumulativeCounts: { day: number; count: number }[];
    qqPlotData: { x: number; y: number }[];
    residualProcess: { t: number; residual: number }[];
    standardizedResiduals: { day: number; residual: number; observed: number; expected: number }[];
    profileLikelihood: { p: number; c: number; logLikelihood: number }[];
    optimizationMethod?: OptimizationMethod;
    iterations?: number;
    uncertainty?: ParameterUncertainty;
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
 * Grid Search optimization for Omori's Law
 */
function fitOmoriLawGridSearch(
    days: number[],
    counts: number[]
): { K: number; c: number; p: number; rSquared: number; iterations: number } {
    // Initial parameter guesses
    let K = Math.max(...counts) * 2;
    let c = 0.1;
    let p = 1.1;

    // Simple grid search for better parameters
    let bestError = Infinity;
    let bestParams = { K, c, p };
    let iterations = 0;

    // Coarse grid search
    for (let testP = 0.8; testP <= 1.5; testP += 0.1) {
        for (let testC = 0.01; testC <= 1.0; testC += 0.1) {
            iterations++;
            // Calculate optimal K for this (p, c) using least squares
            // Minimize Σ(n_i - K/(t_i+c)^p)²
            // Solution: K = Σ(n_i / (t_i+c)^p) / Σ(1 / (t_i+c)^(2p))
            const sumNumerator = days.reduce((sum, t, i) => {
                return sum + counts[i] / Math.pow(t + testC, testP);
            }, 0);
            const sumDenominator = days.reduce((sum, t) => {
                return sum + 1 / Math.pow(t + testC, 2 * testP);
            }, 0);
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

    return { ...bestParams, rSquared, iterations };
}

/**
 * Levenberg-Marquardt optimization for Omori's Law
 */
function fitOmoriLawLM(
    days: number[],
    counts: number[]
): { K: number; c: number; p: number; rSquared: number; iterations: number } {
    // Initial parameter guesses from grid search (coarse)
    const gridResult = fitOmoriLawGridSearch(days, counts);

    // Define the parameterized function for LM
    // Returns a function that takes x and returns y given parameters [K, c, p]
    const omoriFunction = ([K, c, p]: number[]) => (t: number): number => {
        return K / Math.pow(t + c, p);
    };

    // Initial guess
    const initialParams = [gridResult.K, gridResult.c, gridResult.p];

    try {
        // Prepare data for LM
        const data = {
            x: days,
            y: counts
        };

        // Run Levenberg-Marquardt
        const result = levenbergMarquardt(
            data,
            omoriFunction,
            {
                initialValues: initialParams,
                damping: 0.01,
                maxIterations: 100,
                errorTolerance: 1e-7,
                gradientDifference: 1e-5,
                minValues: [0.001, 0.001, 0.5],
                maxValues: [1e6, 10, 2.0]
            }
        );

        const [K, c, p] = result.parameterValues;

        // Calculate R-squared
        const meanCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
        const ssTot = counts.reduce((sum, c) => sum + Math.pow(c - meanCount, 2), 0);
        const ssRes = days.reduce((sum, t, i) => {
            const predicted = omoriLaw(t, K, c, p);
            return sum + Math.pow(counts[i] - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssRes / ssTot);

        return {
            K,
            c,
            p,
            rSquared,
            iterations: result.iterations
        };
    } catch (error) {
        // Fallback to grid search if LM fails
        console.warn('Levenberg-Marquardt failed, falling back to grid search:', error);
        return gridResult;
    }
}

/**
 * Nelder-Mead (Simplex) optimization for Omori's Law
 */
function fitOmoriLawNelderMead(
    days: number[],
    counts: number[]
): { K: number; c: number; p: number; rSquared: number; iterations: number } {
    // Initial guess from coarse grid search
    const gridResult = fitOmoriLawGridSearch(days, counts);

    // Objective function: sum of squared residuals
    const objectiveFunction = (params: number[]): number => {
        const [K, c, p] = params;
        // Add penalty for unreasonable parameters
        if (K <= 0 || c <= 0 || p <= 0.5 || p >= 2.5) {
            return 1e10;
        }

        return days.reduce((sum, t, i) => {
            const predicted = omoriLaw(t, K, c, p);
            return sum + Math.pow(counts[i] - predicted, 2);
        }, 0);
    };

    // Nelder-Mead implementation
    const nelderMead = (
        f: (x: number[]) => number,
        x0: number[],
        maxIter: number = 200,
        tol: number = 1e-6
    ): { params: number[]; iterations: number } => {
        const n = x0.length;
        const alpha = 1.0;  // reflection
        const gamma = 2.0;  // expansion
        const rho = 0.5;    // contraction
        const sigma = 0.5;  // shrinkage

        // Initialize simplex
        const simplex: number[][] = [x0];
        for (let i = 0; i < n; i++) {
            const vertex = [...x0];
            vertex[i] += vertex[i] * 0.1 || 0.1;
            simplex.push(vertex);
        }

        let iterations = 0;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations++;

            // Sort simplex by function values
            simplex.sort((a, b) => f(a) - f(b));

            // Check convergence
            const fvals = simplex.map(f);
            const range = Math.max(...fvals) - Math.min(...fvals);
            if (range < tol) break;

            // Compute centroid of best n points
            const centroid = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    centroid[j] += simplex[i][j] / n;
                }
            }

            // Reflect worst point
            const worst = simplex[n];
            const reflected = centroid.map((c, i) => c + alpha * (c - worst[i]));
            const fReflected = f(reflected);

            if (fReflected < f(simplex[0])) {
                // Expansion
                const expanded = centroid.map((c, i) => c + gamma * (reflected[i] - c));
                const fExpanded = f(expanded);
                simplex[n] = fExpanded < fReflected ? expanded : reflected;
            } else if (fReflected < f(simplex[n - 1])) {
                // Accept reflection
                simplex[n] = reflected;
            } else {
                // Contraction
                const contracted = centroid.map((c, i) =>
                    c + rho * (worst[i] - c)
                );
                const fContracted = f(contracted);

                if (fContracted < f(worst)) {
                    simplex[n] = contracted;
                } else {
                    // Shrinkage
                    for (let i = 1; i <= n; i++) {
                        simplex[i] = simplex[0].map((x0val, j) =>
                            x0val + sigma * (simplex[i][j] - x0val)
                        );
                    }
                }
            }
        }

        simplex.sort((a, b) => f(a) - f(b));
        return { params: simplex[0], iterations };
    };

    // Run Nelder-Mead
    const result = nelderMead(
        objectiveFunction,
        [gridResult.K, gridResult.c, gridResult.p]
    );

    const [K, c, p] = result.params;

    // Calculate R-squared
    const meanCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const ssTot = counts.reduce((sum, c) => sum + Math.pow(c - meanCount, 2), 0);
    const ssRes = days.reduce((sum, t, i) => {
        const predicted = omoriLaw(t, K, c, p);
        return sum + Math.pow(counts[i] - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssRes / ssTot);

    return { K, c, p, rSquared, iterations: result.iterations };
}

/**
 * Hybrid optimization: Grid search + Levenberg-Marquardt refinement
 */
function fitOmoriLawHybrid(
    days: number[],
    counts: number[]
): { K: number; c: number; p: number; rSquared: number; iterations: number } {
    // Start with grid search for a robust initial guess
    const gridResult = fitOmoriLawGridSearch(days, counts);

    // Refine with Levenberg-Marquardt
    const lmResult = fitOmoriLawLM(days, counts);

    // Compare R-squared and choose better result
    if (lmResult.rSquared > gridResult.rSquared) {
        return {
            ...lmResult,
            iterations: gridResult.iterations + lmResult.iterations
        };
    }

    return gridResult;
}

/**
 * Maximum Likelihood Estimation for Omori's Law using event times
 * This is the statistically proper approach for point process data
 */
function fitOmoriLawMLE(
    eventTimes: number[],  // Individual event times (not binned)
    T_max: number           // End of observation window
): { K: number; c: number; p: number; rSquared: number; iterations: number; logLikelihood: number } {
    // Sort and filter event times (remove events too close to t=0 for numerical stability)
    const MIN_TIME = 0.001;  // 0.001 days ≈ 1.4 minutes
    const sortedTimes = [...eventTimes]
        .filter(t => t >= MIN_TIME)  // Filter out events very close to mainshock
        .sort((a, b) => a - b);
    const N = sortedTimes.length;

    // Log-likelihood function for Omori's Law point process
    // ln L = sum(ln(λ(t_i))) - ∫₀^T λ(t) dt
    // where λ(t) = K / (t + c)^p
    const negLogLikelihood = (params: number[]): number => {
        const [K, c, p] = params;

        // Parameter bounds checking (typical ranges for aftershocks)
        // K: productivity (typically 10-10000)
        // c: time offset (typically 0.01-2.0 days)
        // p: decay exponent (typically 0.7-1.6)
        if (K <= 0 || K > 1e6 || c <= 0.005 || c > 5.0 || p <= 0.6 || p >= 1.8) {
            return 1e10;
        }

        // Sum of log rates at event times
        let sumLogRates = 0;
        for (const t of sortedTimes) {
            const rate = K / Math.pow(t + c, p);
            if (rate <= 0) return 1e10;
            sumLogRates += Math.log(rate);
        }

        // Integral of rate function from 0 to T_max
        let integral;
        if (Math.abs(p - 1.0) < 1e-6) {
            // Special case: p = 1
            integral = K * (Math.log(T_max + c) - Math.log(c));
        } else {
            // General case
            const oneMinusP = 1 - p;
            integral = (K / oneMinusP) * (Math.pow(T_max + c, oneMinusP) - Math.pow(c, oneMinusP));
        }

        // Negative log-likelihood (for minimization)
        return -(sumLogRates - integral);
    };

    // Initial guess using simple heuristics from event time data
    // For Omori law: λ(t) = K/(t+c)^p is the RATE (events per unit time)
    // Good initial guesses:
    // - p typically around 1.0-1.2 for aftershocks
    // - c typically around 0.01-0.5 days
    // - K can be estimated from integral constraint: N ≈ ∫₀^T λ(t) dt

    // Estimate initial p from rate decay
    // Use adaptive time windows based on sequence length
    const maxTime = Math.max(...sortedTimes);
    const earlyWindow = Math.min(1.0, maxTime * 0.1);  // First 10% or 1 day
    const lateStart = Math.min(10.0, maxTime * 0.5);   // Starting at 50% or 10 days
    const lateEnd = Math.min(20.0, maxTime * 0.7);     // Ending at 70% or 20 days

    const earlyEvents = sortedTimes.filter(t => t < earlyWindow);
    const lateEvents = sortedTimes.filter(t => t >= lateStart && t < lateEnd);

    const earlyRate = earlyEvents.length / earlyWindow;
    const lateRate = lateEvents.length / (lateEnd - lateStart);

    const earlyTime = earlyWindow / 2;
    const lateTime = (lateStart + lateEnd) / 2;

    // If λ(t) ~ 1/t^p, then log(λ) ~ -p*log(t)
    // So p ~ -log(λ2/λ1) / log(t2/t1)
    let initialP = 1.1;  // Default
    if (earlyRate > 0 && lateRate > 0 && lateTime > earlyTime) {
        const estimatedP = Math.log(earlyRate / lateRate) / Math.log(lateTime / earlyTime);
        initialP = Math.max(0.9, Math.min(1.3, estimatedP));  // Clamp to typical range
    }

    // Initial c: typically small, 0.01-0.5 days
    const initialC = 0.1;

    // Initial K: use the analytical MLE formula for K given (p, c)
    // For point process: K_mle = N / ∫₀^T (t+c)^(-p) dt
    let integralTerm;
    if (Math.abs(initialP - 1.0) < 1e-6) {
        integralTerm = Math.log(T_max + initialC) - Math.log(initialC);
    } else {
        const oneMinusP = 1 - initialP;
        integralTerm = (Math.pow(T_max + initialC, oneMinusP) - Math.pow(initialC, oneMinusP)) / oneMinusP;
    }
    const initialK = N / integralTerm;

    // Nelder-Mead optimization for MLE
    const nelderMead = (
        f: (x: number[]) => number,
        x0: number[],
        maxIter: number = 300,
        tol: number = 1e-8
    ): { params: number[]; iterations: number; fval: number } => {
        const n = x0.length;
        const alpha = 1.0;  // reflection
        const gamma = 2.0;  // expansion
        const rho = 0.5;    // contraction
        const sigma = 0.5;  // shrinkage

        // Initialize simplex
        const simplex: number[][] = [x0];
        for (let i = 0; i < n; i++) {
            const vertex = [...x0];
            vertex[i] += vertex[i] * 0.1 || 0.1;
            simplex.push(vertex);
        }

        let iterations = 0;

        for (let iter = 0; iter < maxIter; iter++) {
            iterations++;

            // Sort simplex by function values
            simplex.sort((a, b) => f(a) - f(b));

            // Check convergence
            const fvals = simplex.map(f);
            const range = Math.max(...fvals) - Math.min(...fvals);
            if (range < tol) break;

            // Compute centroid of best n points
            const centroid = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    centroid[j] += simplex[i][j] / n;
                }
            }

            // Reflect worst point
            const worst = simplex[n];
            const reflected = centroid.map((c, i) => c + alpha * (c - worst[i]));
            const fReflected = f(reflected);

            if (fReflected < f(simplex[0])) {
                // Expansion
                const expanded = centroid.map((c, i) => c + gamma * (reflected[i] - c));
                const fExpanded = f(expanded);
                simplex[n] = fExpanded < fReflected ? expanded : reflected;
            } else if (fReflected < f(simplex[n - 1])) {
                // Accept reflection
                simplex[n] = reflected;
            } else {
                // Contraction
                const contracted = centroid.map((c, i) =>
                    c + rho * (worst[i] - c)
                );
                const fContracted = f(contracted);

                if (fContracted < f(worst)) {
                    simplex[n] = contracted;
                } else {
                    // Shrinkage
                    for (let i = 1; i <= n; i++) {
                        simplex[i] = simplex[0].map((x0val, j) =>
                            x0val + sigma * (simplex[i][j] - x0val)
                        );
                    }
                }
            }
        }

        simplex.sort((a, b) => f(a) - f(b));
        return { params: simplex[0], iterations, fval: f(simplex[0]) };
    };

    // Run MLE optimization
    const result = nelderMead(
        negLogLikelihood,
        [initialK, initialC, initialP],
        300,
        1e-8
    );

    const [K, c, p] = result.params;
    const logLikelihood = -result.fval;

    // Calculate R-squared using binned data for comparison
    const maxDay = Math.ceil(Math.max(...sortedTimes));
    const dailyCounts = new Array(maxDay).fill(0);
    for (const t of sortedTimes) {
        const day = Math.floor(t);
        if (day < maxDay) dailyCounts[day]++;
    }

    const nonZeroDays = dailyCounts
        .map((count, day) => ({ day: day + 1, count }))
        .filter(d => d.count > 0);

    if (nonZeroDays.length > 0) {
        const counts = nonZeroDays.map(d => d.count);
        const days = nonZeroDays.map(d => d.day);

        const meanCount = counts.reduce((sum, c) => sum + c, 0) / counts.length;
        const ssTot = counts.reduce((sum, c) => sum + Math.pow(c - meanCount, 2), 0);
        const ssRes = days.reduce((sum, t, i) => {
            const predicted = omoriLaw(t, K, c, p);
            return sum + Math.pow(counts[i] - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssRes / ssTot);

        return { K, c, p, rSquared, iterations: result.iterations, logLikelihood };
    }

    return { K, c, p, rSquared: 0, iterations: result.iterations, logLikelihood };
}

/**
 * Bootstrap resampling for uncertainty estimation in non-MLE methods
 * Resamples the event times with replacement and refits parameters
 */
function bootstrapUncertainty(
    days: number[],
    counts: number[],
    fittingMethod: (d: number[], c: number[]) => { K: number; c: number; p: number; rSquared: number; iterations: number },
    nBootstrap: number = 100
): ParameterUncertainty {
    const bootstrapResults: { K: number; c: number; p: number }[] = [];

    // Perform bootstrap resampling
    for (let b = 0; b < nBootstrap; b++) {
        // Resample with replacement
        const n = days.length;
        const resampledDays: number[] = [];
        const resampledCounts: number[] = [];

        for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * n);
            resampledDays.push(days[idx]);
            resampledCounts.push(counts[idx]);
        }

        try {
            const result = fittingMethod(resampledDays, resampledCounts);
            // Only include valid results
            if (result.K > 0 && result.c > 0 && result.p > 0.5 && result.p < 2.0) {
                bootstrapResults.push({ K: result.K, c: result.c, p: result.p });
            }
        } catch (error) {
            // Skip failed bootstrap iterations
            continue;
        }
    }

    if (bootstrapResults.length < 10) {
        // Not enough successful bootstrap iterations
        console.warn(`Bootstrap failed: only ${bootstrapResults.length} successful iterations out of ${nBootstrap}`);
        return {};
    }

    console.log(`Bootstrap completed: ${bootstrapResults.length} successful iterations out of ${nBootstrap}`);

    // Calculate statistics from bootstrap distribution
    const K_values = bootstrapResults.map(r => r.K).sort((a, b) => a - b);
    const c_values = bootstrapResults.map(r => r.c).sort((a, b) => a - b);
    const p_values = bootstrapResults.map(r => r.p).sort((a, b) => a - b);

    const getPercentile = (arr: number[], percentile: number): number => {
        const index = Math.floor((percentile / 100) * arr.length);
        return arr[Math.min(index, arr.length - 1)];
    };

    const getStdDev = (arr: number[]): number => {
        const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    };

    return {
        K_se: getStdDev(K_values),
        c_se: getStdDev(c_values),
        p_se: getStdDev(p_values),
        K_ci: [getPercentile(K_values, 2.5), getPercentile(K_values, 97.5)],
        c_ci: [getPercentile(c_values, 2.5), getPercentile(c_values, 97.5)],
        p_ci: [getPercentile(p_values, 2.5), getPercentile(p_values, 97.5)]
    };
}

/**
 * Calculate confidence intervals using profile likelihood
 * Based on likelihood ratio test: -2(log L(θ) - log L(θ_MLE)) ~ χ²(1)
 * For 95% CI: -2Δlog L ≈ 3.84
 */
function calculateConfidenceIntervals(
    eventTimes: number[],
    T_max: number,
    K_mle: number,
    c_mle: number,
    p_mle: number,
    logL_mle: number,
    confidenceLevel: number = 0.95
): { K_ci: [number, number]; c_ci: [number, number]; p_ci: [number, number] } {
    // Critical value for likelihood ratio test
    const chiSqCritical = confidenceLevel === 0.95 ? 3.84 : 6.63;  // 95% or 99%
    const threshold = logL_mle - chiSqCritical / 2;

    // Helper function to compute log-likelihood for fixed parameter
    const logLikelihoodFixed = (K: number, c: number, p: number): number => {
        if (K <= 0 || K > 1e6 || c <= 0.005 || c > 5.0 || p <= 0.6 || p >= 1.8) return -Infinity;

        let sumLogRates = 0;
        for (const t of eventTimes) {
            const rate = K / Math.pow(t + c, p);
            if (rate <= 0) return -Infinity;
            sumLogRates += Math.log(rate);
        }

        let integral;
        if (Math.abs(p - 1.0) < 1e-6) {
            integral = K * (Math.log(T_max + c) - Math.log(c));
        } else {
            const oneMinusP = 1 - p;
            integral = (K / oneMinusP) * (Math.pow(T_max + c, oneMinusP) - Math.pow(c, oneMinusP));
        }

        return sumLogRates - integral;
    };

    // Find CI bounds using bisection search
    const findCIBound = (
        param: 'K' | 'c' | 'p',
        direction: 'lower' | 'upper',
        mleValue: number
    ): number => {
        const searchRange = direction === 'lower'
            ? [mleValue * 0.1, mleValue]
            : [mleValue, mleValue * 10];

        let left = searchRange[0];
        let right = searchRange[1];

        for (let iter = 0; iter < 50; iter++) {
            const mid = (left + right) / 2;

            // Profile likelihood: optimize over other parameters
            let logL: number;
            if (param === 'K') {
                logL = logLikelihoodFixed(mid, c_mle, p_mle);
            } else if (param === 'c') {
                logL = logLikelihoodFixed(K_mle, mid, p_mle);
            } else {
                logL = logLikelihoodFixed(K_mle, c_mle, mid);
            }

            if (Math.abs(logL - threshold) < 0.01) {
                return mid;
            }

            if (direction === 'lower') {
                if (logL > threshold) {
                    right = mid;
                } else {
                    left = mid;
                }
            } else {
                if (logL > threshold) {
                    left = mid;
                } else {
                    right = mid;
                }
            }
        }

        return (left + right) / 2;
    };

    // Calculate CIs for each parameter (clamped to physical bounds)
    const K_lower = findCIBound('K', 'lower', K_mle);
    const K_upper = findCIBound('K', 'upper', K_mle);
    const c_lower = Math.max(0.005, findCIBound('c', 'lower', c_mle));
    const c_upper = Math.min(5.0, findCIBound('c', 'upper', c_mle));
    const p_lower = Math.max(0.6, findCIBound('p', 'lower', p_mle));
    const p_upper = Math.min(1.8, findCIBound('p', 'upper', p_mle));

    return {
        K_ci: [K_lower, K_upper],
        c_ci: [c_lower, c_upper],
        p_ci: [p_lower, p_upper]
    };
}

/**
 * Main fitting function that selects optimization method
 */
function fitOmoriLaw(
    days: number[],
    counts: number[],
    method: OptimizationMethod = 'hybrid'
): { K: number; c: number; p: number; rSquared: number; iterations: number; logLikelihood?: number } {
    switch (method) {
        case 'grid-search':
            return fitOmoriLawGridSearch(days, counts);
        case 'levenberg-marquardt':
            return fitOmoriLawLM(days, counts);
        case 'nelder-mead':
            return fitOmoriLawNelderMead(days, counts);
        case 'mle':
            // For MLE, we need event times, not binned counts
            // This will be handled in calculateOmoriParameters
            return fitOmoriLawHybrid(days, counts);
        case 'hybrid':
        default:
            return fitOmoriLawHybrid(days, counts);
    }
}

/**
 * Calculate Omori's Law parameters for an aftershock sequence
 *
 * @param earthquakes - Array of earthquake events
 * @param mainEvent - Main event information
 * @param daysAfter - Number of days after mainshock to analyze
 * @param optimizationMethod - Optimization method to use
 * @param magnitudeCompleteness - Magnitude of completeness (Mc). If provided, only events with M >= Mc are included
 */
export function calculateOmoriParameters(
    earthquakes: EarthquakeData[],
    mainEvent: MainEventInfo,
    daysAfter: number = 365,
    optimizationMethod: OptimizationMethod = 'hybrid',
    magnitudeCompleteness?: number
): OmoriParameters | null {
    if (earthquakes.length === 0) {
        return null;
    }

    const mainEventTime = mainEvent.time instanceof Date ? mainEvent.time : new Date(mainEvent.time);

    // Filter aftershocks by time and magnitude completeness
    const aftershocks = earthquakes.filter(eq => {
        try {
            const eqTime = eq.time instanceof Date ? eq.time : new Date(eq.time);
            if (isNaN(eqTime.getTime())) return false;

            const daysSince = (eqTime.getTime() - mainEventTime.getTime()) / (1000 * 60 * 60 * 24);

            // Apply time filter
            if (daysSince <= 0 || daysSince > daysAfter) return false;

            // Apply magnitude completeness filter if specified
            if (magnitudeCompleteness !== undefined && eq.magnitude < magnitudeCompleteness) {
                return false;
            }

            return true;
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
    let K: number, c: number, p: number, rSquared: number, iterations: number;
    let logLikelihood: number | undefined;
    let uncertainty: ParameterUncertainty | undefined;

    // Extract event times for MLE
    const eventTimes = aftershocksWithDays.map(a => a.daysSince);

    if (optimizationMethod === 'mle') {
        // Use Maximum Likelihood Estimation with event times
        const mleResult = fitOmoriLawMLE(eventTimes, daysAfter);
        K = mleResult.K;
        c = mleResult.c;
        p = mleResult.p;
        rSquared = mleResult.rSquared;
        iterations = mleResult.iterations;
        logLikelihood = mleResult.logLikelihood;

        // Calculate confidence intervals
        try {
            const cis = calculateConfidenceIntervals(
                eventTimes,
                daysAfter,
                K,
                c,
                p,
                logLikelihood
            );

            // Calculate AIC and BIC
            const numParams = 3;  // K, c, p
            const n = eventTimes.length;
            const aic = -2 * logLikelihood + 2 * numParams;
            const bic = -2 * logLikelihood + numParams * Math.log(n);

            // Approximate standard errors from CI width (assuming normal approx)
            const K_se = (cis.K_ci[1] - cis.K_ci[0]) / (2 * 1.96);
            const c_se = (cis.c_ci[1] - cis.c_ci[0]) / (2 * 1.96);
            const p_se = (cis.p_ci[1] - cis.p_ci[0]) / (2 * 1.96);

            uncertainty = {
                K_se,
                c_se,
                p_se,
                K_ci: cis.K_ci,
                c_ci: cis.c_ci,
                p_ci: cis.p_ci,
                logLikelihood,
                aic,
                bic
            };
        } catch (error) {
            console.warn('Failed to calculate confidence intervals:', error);
        }
    } else {
        // Use standard optimization methods
        const result = fitOmoriLaw(days, counts, optimizationMethod);
        K = result.K;
        c = result.c;
        p = result.p;
        rSquared = result.rSquared;
        iterations = result.iterations;
        logLikelihood = result.logLikelihood;

        // Calculate bootstrap uncertainty estimates for non-MLE methods
        try {
            // Determine which fitting function to use for bootstrap
            let fittingFunction: (d: number[], c: number[]) => { K: number; c: number; p: number; rSquared: number; iterations: number };

            switch (optimizationMethod) {
                case 'grid-search':
                    fittingFunction = fitOmoriLawGridSearch;
                    break;
                case 'levenberg-marquardt':
                    fittingFunction = fitOmoriLawLM;
                    break;
                case 'nelder-mead':
                    fittingFunction = fitOmoriLawNelderMead;
                    break;
                case 'hybrid':
                default:
                    fittingFunction = fitOmoriLawHybrid;
                    break;
            }

            // Run bootstrap (100 iterations for better estimates)
            const bootstrapResults = bootstrapUncertainty(days, counts, fittingFunction, 100);

            if (Object.keys(bootstrapResults).length > 0) {
                uncertainty = bootstrapResults;
            } else {
                console.warn(`Bootstrap uncertainty estimation failed for ${optimizationMethod}`);
            }
        } catch (error) {
            console.warn('Failed to calculate bootstrap uncertainty:', error);
        }
    }

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

    // ------------------------------------------------------------
    // DIAGNOSTICS CALCULATION
    // ------------------------------------------------------------

    // 1. Integrated Rate Function: Lambda(t) = Expected Cumulative Count at time t
    const integrateOmori = (t: number, K: number, c: number, p: number): number => {
        if (Math.abs(p - 1.0) < 0.001) {
            return K * (Math.log(t + c) - Math.log(c));
        } else {
            const oneMinusP = 1 - p;
            return (K / oneMinusP) * (Math.pow(t + c, oneMinusP) - Math.pow(c, oneMinusP));
        }
    };

    // Calculate expected cumulative counts for visualization (smooth curve)
    const expectedCumulativeCounts = dailyCounts.map(({ day }) => ({
        day,
        count: integrateOmori(day, K, c, p)
    }));

    // 2. Transformed Times for Q-Q Plot
    // Transform event times t_i to tau_i = Lambda(t_i).
    // If model is correct, tau_i should be Poisson(1), so inter-event times of tau should be Exp(1).
    const sortedDays = aftershocksWithDays
        .map(a => a.daysSince)
        .sort((a, b) => a - b);

    const transformedTimes = sortedDays.map(t => integrateOmori(t, K, c, p));
    const interEventTimes: number[] = [];
    for (let i = 1; i < transformedTimes.length; i++) {
        interEventTimes.push(transformedTimes[i] - transformedTimes[i - 1]);
    }
    // Sort inter-event times for Q-Q comparison
    interEventTimes.sort((a, b) => a - b);
    const nInter = interEventTimes.length;

    const qqPlotData = interEventTimes.map((val, i) => {
        // Theoretical quantile for Exp(1): -ln(1 - (i - 0.5)/n)
        const pVal = (i + 0.5) / nInter;
        const theoretical = -Math.log(1 - pVal);
        return { x: theoretical, y: val };
    });

    // 3. Residuals
    // Cumulative Residuals: Observed(t) - Expected(t)
    const residualProcess = sortedDays.map((t, i) => {
        const observed = i + 1;
        const expected = integrateOmori(t, K, c, p);
        return { t, residual: observed - expected };
    });

    // Standardized Bin Residuals (Pearson)
    const standardizedResiduals = dailyCounts.map(d => {
        // Expected count in this day bin: Lambda(day) - Lambda(day-1)
        const expected = integrateOmori(d.day, K, c, p) - integrateOmori(d.day - 1, K, c, p);
        const residual = expected > 0 ? (d.count - expected) / Math.sqrt(expected) : 0;
        return { day: d.day, residual, observed: d.count, expected };
    });

    // 4. Profile Likelihood for (p, c)
    // We calculate log-likelihood over a grid of p and c, optimizing K for each point
    const profileLikelihood: { p: number; c: number; logLikelihood: number }[] = [];
    const pMin = 0.5, pMax = 1.8, pStep = 0.1; // 14 steps
    const cMin = 0.01, cMax = 1.0, cStep = 0.1; // 10 steps
    // Total ~140 grid points, very fast

    // Log-likelihood function for terminating point process:
    // ln L = sum(ln(lambda(ti))) - integral(lambda(t))
    // For fixed p, c, the optimal K is K_hat = N / integral((t+c)^-p)
    // where integral is from 0 to T_max (daysAfter)

    const T_max = daysAfter;

    for (let testP = pMin; testP <= pMax; testP += pStep) {
        for (let testC = cMin; testC <= cMax; testC += cStep) {
            // Calculate integral term for K=1
            let intTerm = 0;
            if (Math.abs(testP - 1.0) < 0.001) {
                intTerm = Math.log(T_max + testC) - Math.log(testC);
            } else {
                intTerm = (Math.pow(T_max + testC, 1 - testP) - Math.pow(testC, 1 - testP)) / (1 - testP);
            }

            // Analytical MLE for K
            const testK = sortedDays.length / intTerm;

            // Calculate Log Likelihood
            let sumLogLambda = 0;
            for (const t of sortedDays) {
                const lambda = testK / Math.pow(t + testC, testP);
                sumLogLambda += Math.log(lambda);
            }

            const logL = sumLogLambda - (testK * intTerm);

            profileLikelihood.push({
                p: Number(testP.toFixed(2)),
                c: Number(testC.toFixed(3)),
                logLikelihood: logL
            });
        }
    }

    return {
        K,
        c,
        p,
        rSquared,
        dailyCounts,
        fittedCounts,
        cumulativeCounts,
        expectedCumulativeCounts,
        // New Diagnostics
        qqPlotData,
        residualProcess,
        standardizedResiduals,
        profileLikelihood,
        // Optimization metadata
        optimizationMethod,
        iterations,
        uncertainty
    };
}
