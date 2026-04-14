import numpy as np
from scipy.stats import linregress
from typing import Dict, Optional

def calculate_gutenberg_richter(magnitudes: np.ndarray, 
                                bin_width: float = 0.1, 
                                method: str = 'maximum_curvature',
                                mc_override: Optional[float] = None) -> Optional[Dict]:
    """
    Calculate Gutenberg-Richter b-value and magnitude of completeness (Mc).
    """
    if len(magnitudes) == 0:
        return None
        
    min_mag, max_mag = np.min(magnitudes), np.max(magnitudes)
    
    # Create bins
    bins = np.arange(min_mag, max_mag + bin_width * 1.5, bin_width)
    bin_centers = bins[:-1]
    
    counts, _ = np.histogram(magnitudes, bins=bins)
    
    # Cumulative counts N >= M
    cumulative_counts = np.array([np.sum(counts[i:]) for i in range(len(counts))])
    
    if mc_override is not None:
        mc = mc_override
        mc_idx = np.argmin(np.abs(bin_centers - mc))
    elif method == 'maximum_curvature':
        mc_idx = np.argmax(counts)
        mc = bin_centers[mc_idx]
    else: # goodness_of_fit
        best_r2 = -float('inf')
        mc_idx = 0
        for i in range(len(bin_centers) - 2):
            test_mags = bin_centers[i:]
            test_counts = cumulative_counts[i:]
            valid = test_counts > 0
            if np.sum(valid) < 3:
                continue
                
            test_log_counts = np.log10(test_counts[valid])
            _, _, r_val, _, _ = linregress(test_mags[valid], test_log_counts)
            r2 = r_val**2
            if r2 > best_r2: # Fix comparison
                best_r2 = r2
                mc_idx = i
        mc = bin_centers[mc_idx]
        
    # Analyze subset M >= Mc
    subset_mask = cumulative_counts[mc_idx:] > 0
    mags_above_mc = bin_centers[mc_idx:][subset_mask]
    log_counts = np.log10(cumulative_counts[mc_idx:][subset_mask])
    
    if len(mags_above_mc) < 2:
        return None
        
    slope, intercept, r_val, _, _ = linregress(mags_above_mc, log_counts)
    
    return {
        'b_value': -slope,
        'a_value': intercept,
        'magnitude_completeness': float(mc),
        'r_squared': float(r_val**2),
        'earthquakes_above_mc': int(np.sum(magnitudes >= mc)),
        'bin_centers': bin_centers.tolist(),
        'cumulative_counts': cumulative_counts.tolist()
    }
