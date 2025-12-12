'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { ClusteringAlgorithm } from '@/lib/analysis/clustering';

/**
 * Split Clustering Context - Parameters Only
 * OPTIMIZATION: Separate contexts prevent unnecessary re-renders
 * Components only re-render when the parameters they use actually change
 *
 * Use this context for clustering algorithm parameters (epsilon, minSamples, etc.)
 * Use ClusteringSelectionContext for selection state (selectedIndices)
 */

export interface ClusteringParams {
    // Clustering algorithm selection
    algorithm: ClusteringAlgorithm;

    // DBSCAN / OPTICS parameters
    epsilon: number;
    minSamples: number;

    // K-means parameters
    k: number;

    // Nearest-neighbor parameters
    nnThreshold: number;

    // STEP clustering parameters
    stepMinMag: number;
    stepT1: number;
    stepT2: number;

    // ST-DBSCAN parameters
    epsilonTemporal: number;

    // TMC parameters
    tmcRfact: number;
    tmcTau0: number;
    tmcTauMax: number;
    tmcP1: number;
    tmcXk: number;

    // Visualization options
    includeNoise: boolean;

    // Setters
    setAlgorithm: (algorithm: ClusteringAlgorithm) => void;
    setEpsilon: (epsilon: number) => void;
    setMinSamples: (minSamples: number) => void;
    setK: (k: number) => void;
    setNnThreshold: (threshold: number) => void;
    setStepMinMag: (minMag: number) => void;
    setStepT1: (t1: number) => void;
    setStepT2: (t2: number) => void;
    setEpsilonTemporal: (val: number) => void;
    setTmcRfact: (val: number) => void;
    setTmcTau0: (val: number) => void;
    setTmcTauMax: (val: number) => void;
    setTmcP1: (val: number) => void;
    setTmcXk: (val: number) => void;
    setIncludeNoise: (include: boolean) => void;
}

const ClusteringParamsContext = createContext<ClusteringParams | undefined>(undefined);

export function ClusteringParamsProvider({ children }: { children: ReactNode }) {
    // Clustering parameters
    const [algorithm, setAlgorithm] = useState<ClusteringAlgorithm>('dbscan');
    const [epsilon, setEpsilon] = useState(25);
    const [minSamples, setMinSamples] = useState(5);
    const [k, setK] = useState(5);
    const [nnThreshold, setNnThreshold] = useState(1.0);
    const [stepMinMag, setStepMinMag] = useState(2.0);
    const [stepT1, setStepT1] = useState(1);
    const [stepT2, setStepT2] = useState(30);
    const [epsilonTemporal, setEpsilonTemporal] = useState(7);
    const [tmcRfact, setTmcRfact] = useState(10);
    const [tmcTau0, setTmcTau0] = useState(2);
    const [tmcTauMax, setTmcTauMax] = useState(10);
    const [tmcP1, setTmcP1] = useState(0.99);
    const [tmcXk, setTmcXk] = useState(0.5);
    const [includeNoise, setIncludeNoise] = useState(true);

    // Memoize context value
    const value: ClusteringParams = useMemo(
        () => ({
            algorithm,
            epsilon,
            minSamples,
            k,
            nnThreshold,
            stepMinMag,
            stepT1,
            stepT2,
            epsilonTemporal,
            tmcRfact,
            tmcTau0,
            tmcTauMax,
            tmcP1,
            tmcXk,
            includeNoise,
            setAlgorithm,
            setEpsilon,
            setMinSamples,
            setK,
            setNnThreshold,
            setStepMinMag,
            setStepT1,
            setStepT2,
            setEpsilonTemporal,
            setTmcRfact,
            setTmcTau0,
            setTmcTauMax,
            setTmcP1,
            setTmcXk,
            setIncludeNoise,
        }),
        [
            algorithm,
            epsilon,
            minSamples,
            k,
            nnThreshold,
            stepMinMag,
            stepT1,
            stepT2,
            epsilonTemporal,
            tmcRfact,
            tmcTau0,
            tmcTauMax,
            tmcP1,
            tmcXk,
            includeNoise,
        ]
    );

    return (
        <ClusteringParamsContext.Provider value={value}>
            {children}
        </ClusteringParamsContext.Provider>
    );
}

export function useClusteringParams() {
    const context = useContext(ClusteringParamsContext);
    if (context === undefined) {
        throw new Error('useClusteringParams must be used within a ClusteringParamsProvider');
    }
    return context;
}
