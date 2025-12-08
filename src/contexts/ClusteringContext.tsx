'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
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

    // Selection state
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    
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
    
    const value: ClusteringState = {
        algorithm,
        epsilon,
        minSamples,
        k,
        nnThreshold,
        stepMinMag,
        stepT1,
        stepT2,
        selectedIndices,
        setAlgorithm,
        setEpsilon,
        setMinSamples,
        setK,
        setNnThreshold,
        setStepMinMag,
        setStepT1,
        setStepT2,
        setSelectedIndices,
        toggleSelection,
        clearSelection,
        addToSelection,
    };
    
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

