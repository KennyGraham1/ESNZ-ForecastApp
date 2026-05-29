export type ClusteringAlgorithm =
    | 'dbscan'
    | 'optics'
    | 'kmeans'
    | 'step-mag'          // STEP Magnitude clustering (seismology)
    | 'step-time'         // STEP Time clustering (seismology)
    | 'nearest-neighbor'
    | 'st-dbscan'         // Spatio-Temporal DBSCAN
    | 'tmc'               // Time Magnitude Clustering (Reasenberg-style)
    | 'hardebeck-2019'    // Hardebeck (2019) updated window method
    | 'gardner-knopoff'   // Gardner & Knopoff (1974) magnitude windows
    | 'uhrhammer'         // Uhrhammer (1986) magnitude windows
    | 'hdbscan';          // Hierarchical DBSCAN (Campello et al. 2013)

export interface ClusterResult {
    labels: number[]; // Cluster label per event, -1 for noise/unassigned
    nClusters: number;
    clusterPercent: number;
    noisePercent: number;
    clusters: number[][]; // Array of arrays of indices
    // HDBSCAN extras (undefined for other algorithms)
    probabilities?: number[];   // Soft membership probability [0,1] per point
    outlierScores?: number[];   // GLOSH-style outlier score [0,1] per point (higher = more anomalous)
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
    minSamples: number; // used by DBSCAN/OPTICS/HDBSCAN (core-distance neighbourhood size)
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
    // HDBSCAN parameters (Campello et al. 2013)
    hdbscanMinClusterSize?: number; // Smallest grouping considered a true cluster (default: 5)
    hdbscanMinSamples?: number;     // k-NN neighbourhood size for core-distance (default: 5)
    // Gardner & Knopoff (1974) window parameters
    gkSpatialA?: number;            // Spatial window 10^(a*M+b): a (default: 0.1238)
    gkSpatialB?: number;            // Spatial window 10^(a*M+b): b (default: 0.983)
    gkTemporalC?: number;           // Temporal 10^(c*M+d) when not piecewise: c (default: 0.032)
    gkTemporalD?: number;           // Temporal 10^(c*M+d) when not piecewise: d (default: 2.7389)
    gkPiecewiseTemporal?: boolean;  // Use the published M>=6.5 piecewise temporal window (default: true)
    // Uhrhammer (1986) window parameters
    uhrSpatialA?: number;           // Spatial window exp(a+b*M): a (default: -1.024)
    uhrSpatialB?: number;           // Spatial window exp(a+b*M): b (default: 0.804)
    uhrTemporalA?: number;          // Temporal window exp(a+b*M): a (default: -2.870)
    uhrTemporalB?: number;          // Temporal window exp(a+b*M): b (default: 1.235)
    uhrFsTimeProp?: number;         // Foreshock window fraction of T(M), in [0,1] (default: 1.0)
}
