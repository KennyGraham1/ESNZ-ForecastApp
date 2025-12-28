'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { ClusteringAlgorithm } from '@/lib/analysis/clustering';

export interface ClusteringState {
    // Clustering parameters
    algorithm: ClusteringAlgorithm;
    epsilon: number;
    minSamples: number;
    k: number;
    nnThreshold: number; // Nearest-neighbor threshold
    // STEP clustering parameters
    stepMinMag: number;  // Minimum mainshock magnitude for STEP
    stepT1: number;      // Time window before (days)
    stepT2: number;      // Time window after (days)
    // ST-DBSCAN parameters
    epsilonTemporal: number; // days
    // TMC parameters
    tmcRfact: number;
    tmcTau0: number;
    tmcTauMax: number;
    tmcP1: number;
    tmcXk: number;
    // Hardebeck (2019) parameters
    hardebeckMinMag: number;
    hardebeckTimeWindow: number;
    hardebeckRuptureMult: number;
    hardebeckMainshockTimeYears: number;

    // Visualization Options
    includeNoise: boolean; // Whether to include noise points (cluster -1) in visualization

    // Selection state (indices into the processed earthquake array)
    selectedIndices: Set<number>;

    // Methods to update state
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
    setHardebeckMinMag: (val: number) => void;
    setHardebeckTimeWindow: (val: number) => void;
    setHardebeckRuptureMult: (val: number) => void;
    setHardebeckMainshockTimeYears: (val: number) => void;
    setIncludeNoise: (include: boolean) => void;
    setSelectedIndices: (indices: Set<number>) => void;
    toggleSelection: (index: number) => void;
    clearSelection: () => void;
    addToSelection: (indices: number[]) => void;
}

const ClusteringContext = createContext<ClusteringState | undefined>(undefined);

export function ClusteringProvider({ children }: { children: ReactNode }) {
    // Clustering parameters
    const [algorithm, setAlgorithm] = useState<ClusteringAlgorithm>('dbscan');
    const [epsilon, setEpsilon] = useState(25); // km
    const [minSamples, setMinSamples] = useState(5);
    const [k, setK] = useState(5);
    const [nnThreshold, setNnThreshold] = useState(1.0); // Nearest-neighbor threshold
    // STEP clustering parameters
    const [stepMinMag, setStepMinMag] = useState(2.0);  // Minimum mainshock magnitude
    const [stepT1, setStepT1] = useState(1);            // Time window before (days)
    const [stepT2, setStepT2] = useState(30);           // Time window after (days)
    // ST-DBSCAN parameters
    const [epsilonTemporal, setEpsilonTemporal] = useState(7); // days
    // TMC parameters
    const [tmcRfact, setTmcRfact] = useState(10);
    const [tmcTau0, setTmcTau0] = useState(2);
    const [tmcTauMax, setTmcTauMax] = useState(10);
    const [tmcP1, setTmcP1] = useState(0.99);
    const [tmcXk, setTmcXk] = useState(0.5);
    // Hardebeck (2019) parameters
    const [hardebeckMinMag, setHardebeckMinMag] = useState(5.0);
    const [hardebeckTimeWindow, setHardebeckTimeWindow] = useState(10);
    const [hardebeckRuptureMult, setHardebeckRuptureMult] = useState(3);
    const [hardebeckMainshockTimeYears, setHardebeckMainshockTimeYears] = useState(3); // Years

    // Visualization Options
    const [includeNoise, setIncludeNoise] = useState(true);

    // Selection state
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Create a stable version of selectedIndices for dependency tracking
    // Convert Set to sorted array string for stable comparison
    const selectedIndicesKey = useMemo(() =>
        Array.from(selectedIndices).sort((a, b) => a - b).join(','),
        [selectedIndices]
    );

    // Toggle a single index in/out of selection
    const toggleSelection = useCallback((index: number) => {
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    }, []);

    // Clear all selections
    const clearSelection = useCallback(() => {
        setSelectedIndices(new Set());
    }, []);

    // Add multiple indices to selection
    const addToSelection = useCallback((indices: number[]) => {
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            indices.forEach(idx => newSet.add(idx));
            return newSet;
        });
    }, []);

    // OPTIMIZATION: Memoize context value to prevent unnecessary re-renders
    // Only recreate when actual state values change
    // Use selectedIndicesKey instead of selectedIndices for stable dependency
    const value: ClusteringState = useMemo(() => ({
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
        hardebeckMinMag,
        hardebeckTimeWindow,
        hardebeckRuptureMult,
        hardebeckMainshockTimeYears,
        includeNoise,
        selectedIndices,
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
        setHardebeckMinMag,
        setHardebeckTimeWindow,
        setHardebeckRuptureMult,
        setHardebeckMainshockTimeYears,
        setIncludeNoise,
        setSelectedIndices,
        toggleSelection,
        clearSelection,
        addToSelection,
    }), [
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
        hardebeckMinMag,
        hardebeckTimeWindow,
        hardebeckRuptureMult,
        hardebeckMainshockTimeYears,
        includeNoise,
        selectedIndicesKey,
        toggleSelection,
        clearSelection,
        addToSelection,
    ]);

    return (
        <ClusteringContext.Provider value={value}>
            {children}
        </ClusteringContext.Provider>
    );
}

export function useClusteringContext() {
    const context = useContext(ClusteringContext);
    if (context === undefined) {
        throw new Error('useClusteringContext must be used within a ClusteringProvider');
    }
    return context;
}

// Optional hook that returns undefined if not within provider (for optional usage)
export function useClusteringContextOptional() {
    return useContext(ClusteringContext);
}

