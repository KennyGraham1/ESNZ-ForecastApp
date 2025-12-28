export type ClusteringAlgorithm =
    | 'dbscan'
    | 'optics'
    | 'kmeans'
    // HIERARCHICAL CLUSTERING TYPES - COMMENTED OUT FOR FUTURE RESTORATION
    // | 'hierarchical-single'
    // | 'hierarchical-complete'
    // | 'hierarchical-average'
    // | 'hierarchical-ward'
    | 'step-mag'    // STEP Magnitude clustering (seismology)
    | 'step-time'   // STEP Time clustering (seismology)
    | 'nearest-neighbor'
    | 'st-dbscan'   // Spatio-Temporal DBSCAN
    | 'tmc'         // Time Magnitude Clustering (Reasenberg-style)
    | 'hardebeck-2019'; // Hardebeck (2019) updated window method

export interface ClusterResult {
    labels: number[]; // Cluster label per event, -1 for noise/unassigned
    nClusters: number;
    clusterPercent: number;
    noisePercent: number;
    clusters: number[][]; // Array of arrays of indices
    metadata?: ClusteringMetadata; // Additional metadata for exports
}

export interface ClusteringMetadata {
    algorithm: string;
    algorithmDescription: string;
    parameters: Record<string, any>;
    timestamp: string;
    datasetSize: number;
    computationTime?: number;
}

export interface SpatialClusteringOptions {
    algorithm: ClusteringAlgorithm;
    epsilon: number; // km, used by DBSCAN/OPTICS/Hierarchical
    minSamples: number; // used by DBSCAN/OPTICS
    k: number; // number of clusters for KMEANS/Hierarchical
    useRTree?: boolean; // OPTIMIZATION: Use R-tree spatial index for DBSCAN (90-95% faster)
    nnThreshold?: number; // Nearest-neighbor distance threshold (for nearest-neighbor clustering)
    // STEP clustering parameters (seismology)
    stepMinMag?: number;     // Minimum mainshock magnitude for STEP (default: 2.0)
    stepT1?: number;         // Time window before an earthquake in days (default: 1)
    stepT2?: number;         // Time window after an earthquake in days (default: 30)
    // ST-DBSCAN parameters
    epsilonTemporal?: number; // Temporal epsilon in days (default: 7)
    // TMC (Time Magnitude Clustering / Reasenberg-style) parameters
    tmcRfact?: number;       // Spatial radius multiplier (default: 10)
    tmcTau0?: number;        // Base look-ahead time in days (default: 2)
    tmcTauMax?: number;      // Maximum look-ahead time in days (default: 10)
    tmcP1?: number;          // Probability threshold (default: 0.99)
    tmcXk?: number;          // Magnitude scaling factor (default: 0.5)
    tmcMinMag?: number;      // Effective minimum magnitude (default: 1.5)
    // Hardebeck (2019) parameters
    hardebeckMinMag?: number; // Minimum mainshock magnitude (default: 5.0)
    hardebeckTimeWindow?: number; // Aftershock time window in days (default: 10)
    hardebeckRuptureMult?: number; // Multiplier for rupture length (default: 3)
    hardebeckMainshockTimeYears?: number; // Mainshock exclusion time window in years (default: 3)
}
