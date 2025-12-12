'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

/**
 * Split Clustering Context - Selection State Only
 * OPTIMIZATION: Separate contexts prevent unnecessary re-renders
 * Components only re-render when the state they use actually change
 *
 * Use ClusteringParamsContext for clustering algorithm parameters
 * Use this context for selection state (selectedIndices)
 */

export interface ClusteringSelection {
    selectedIndices: Set<number>;
    setSelectedIndices: (indices: Set<number>) => void;
    toggleSelection: (index: number) => void;
    clearSelection: () => void;
    addToSelection: (indices: number[]) => void;
}

const ClusteringSelectionContext = createContext<ClusteringSelection | undefined>(undefined);

export function ClusteringSelectionProvider({ children }: { children: ReactNode }) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

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

    const clearSelection = useCallback(() => {
        setSelectedIndices(new Set());
    }, []);

    const addToSelection = useCallback((indices: number[]) => {
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            indices.forEach(idx => newSet.add(idx));
            return newSet;
        });
    }, []);

    const value: ClusteringSelection = useMemo(
        () => ({
            selectedIndices,
            setSelectedIndices,
            toggleSelection,
            clearSelection,
            addToSelection,
        }),
        [selectedIndices, toggleSelection, clearSelection, addToSelection]
    );

    return (
        <ClusteringSelectionContext.Provider value={value}>
            {children}
        </ClusteringSelectionContext.Provider>
    );
}

export function useClusteringSelection() {
    const context = useContext(ClusteringSelectionContext);
    if (context === undefined) {
        throw new Error('useClusteringSelection must be used within a ClusteringSelectionProvider');
    }
    return context;
}
