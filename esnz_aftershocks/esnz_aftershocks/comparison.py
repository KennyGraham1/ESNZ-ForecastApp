import pandas as pd
import numpy as np
from typing import Dict, List, Set

from .gutenberg_richter import calculate_gutenberg_richter

def calculate_temporal_rates(raw_catalog: pd.DataFrame, declustered_catalogs: Dict[str, pd.DataFrame], freq: str = 'Y') -> Dict[str, Dict]:
    """
    Generates time series mapping cumulative events and binned frequency over time.
    Format returned is optimized for JSON dumps to direct web UI plotting (like Highcharts).
    Replicates Figure 2a and 2b from the Nature study.
    """
    times = pd.to_datetime(raw_catalog['time'])
    min_time, max_time = times.min(), times.max()
    
    # Generate uniform time bins for frequency
    date_range = pd.date_range(start=min_time.floor('M'), end=max_time.ceil('M'), freq=freq)
    
    output = {}
    
    # Process Raw
    raw_hist, _ = np.histogram(times.astype(np.int64) // 10**9, 
                               bins=date_range.astype(np.int64) // 10**9)
    # Frequency
    raw_grouped = raw_catalog.set_index('time').groupby(pd.Grouper(freq=freq)).size()
    
    output['raw'] = {
        'times_epoch': (date_range[:-1].astype(np.int64) // 10**6).tolist(), # ms for JS
        'cumulative_counts': np.cumsum(raw_hist).tolist(),
        'frequency_counts': raw_grouped.values.tolist(),
        'frequency_epoch': (raw_grouped.index.astype(np.int64) // 10**6).tolist()
    }
    
    for name, cat in declustered_catalogs.items():
        if len(cat) == 0:
            continue
        ctimes = pd.to_datetime(cat['time'])
        chist, _ = np.histogram(ctimes.astype(np.int64) // 10**9,
                                bins=date_range.astype(np.int64) // 10**9)
        
        grouped = cat.set_index('time').groupby(pd.Grouper(freq=freq)).size()
        
        output[name] = {
            'times_epoch': (date_range[:-1].astype(np.int64) // 10**6).tolist(),
            'cumulative_counts': np.cumsum(chist).tolist(),
            'frequency_counts': grouped.values.tolist(),
            'frequency_epoch': (grouped.index.astype(np.int64) // 10**6).tolist()
        }
        
    return output

def calculate_matching_proportions(raw_catalog: pd.DataFrame, declustered_catalogs: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Computes a similarity matrix measuring the proportion of *removed (clustered) events* 
    that match between any two declustering algorithms. 
    Interpreted as: "Of the events removed by Method A (rows), what percentage was also removed by Method B (cols)?"
    Replicates Table 4.
    """
    removed_sets = {}
    for name, cat in declustered_catalogs.items():
        # Match by exact time timestamp to be immune to index reset loss
        rem = set(raw_catalog['time']).difference(set(cat['time']))
        removed_sets[name] = rem
        
    names = list(removed_sets.keys())
    matrix = np.zeros((len(names), len(names)))
    
    for i, n1 in enumerate(names):
        set1 = removed_sets[n1]
        for j, n2 in enumerate(names):
            set2 = removed_sets[n2]
            
            if len(set1) == 0:
                matrix[i, j] = 0.0
            else:
                intersection = len(set1.intersection(set2))
                matrix[i, j] = intersection / len(set1) * 100.0
                
    df = pd.DataFrame(matrix, index=names, columns=names)
    return df

def calculate_declustering_ratio_by_magnitude(raw_catalog: pd.DataFrame, declustered_catalogs: Dict[str, pd.DataFrame], 
                                               bins: List[float] = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 9.0]) -> pd.DataFrame:
    """
    Calculates fraction of removed events split by magnitude bins. Replicates Fig 4c and Table 5.
    """
    results = []
    
    raw_mags = raw_catalog['magnitude'].values
    
    for i in range(len(bins)-1):
        m_low = bins[i]
        m_high = bins[i+1]
        
        mask = (raw_mags >= m_low) & (raw_mags < m_high)
        raw_count = np.sum(mask)
        raw_subset = set(raw_catalog[mask]['time'])
        
        row = {'Magnitude_bin': f"{m_low:.1f}-{m_high:.1f}", 'Total_events': raw_count}
        
        for name, cat in declustered_catalogs.items():
            if raw_count == 0:
                row[name] = 0.0
                continue
                
            cat_subset = set(cat['time'])
            # Retained events in this bin
            retained = len(raw_subset.intersection(cat_subset))
            removed = raw_count - retained
            
            row[name] = (removed / raw_count) * 100.0
            
        results.append(row)
        
    return pd.DataFrame(results)

def calculate_b_value_shifts(raw_catalog: pd.DataFrame, declustered_catalogs: Dict[str, pd.DataFrame], mc_override: float = 3.0) -> pd.DataFrame:
    """
    Computes b-value and a-value for raw and declustered catalogs to quantify how 
    declustering structurally alters seismic activity parameters. Replicates Fig 5 and Nature analysis.
    """
    results = []
    
    raw_gr = calculate_gutenberg_richter(raw_catalog['magnitude'].values, mc_override=mc_override)
    if raw_gr:
        results.append({
            'Catalog': 'Raw',
            'b_value': raw_gr['b_value'],
            'a_value': raw_gr['a_value'],
            'Mc': raw_gr['magnitude_completeness']
        })
        
    for name, cat in declustered_catalogs.items():
        gr = calculate_gutenberg_richter(cat['magnitude'].values, mc_override=mc_override)
        if gr:
            results.append({
                'Catalog': name,
                'b_value': gr['b_value'],
                'a_value': gr['a_value'],
                'Mc': gr['magnitude_completeness']
            })
            
    return pd.DataFrame(results)

def calculate_inter_event_cdf(raw_catalog: pd.DataFrame, declustered_catalogs: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
    """
    Computes Empirical CDF of inter-event times against the theoretical Exponential Distribution.
    """
    from .optimization import calculate_inter_event_times
    output = {}
    
    # helper for ECDF
    def ecdf_calc(data):
        x = np.sort(data)
        y = np.arange(1, len(x) + 1) / len(x)
        return x, y
        
    for name, cat in [('raw', raw_catalog)] + list(declustered_catalogs.items()):
        if len(cat) < 2:
            continue
        dts = calculate_inter_event_times(cat)
        mean_dt = np.mean(dts)
        x_emp, y_emp = ecdf_calc(dts)
        
        # Theoretical exponential CDF: 1 - exp(-lambda * x) where lambda = 1/mean
        y_theo = 1.0 - np.exp(-x_emp / mean_dt)
        
        output[name] = {
            'x_empirical': x_emp.tolist(),
            'y_empirical': y_emp.tolist(),
            'y_theoretical': y_theo.tolist()
        }
        
    return output

def calculate_nearest_neighbor_eta(raw_catalog: pd.DataFrame, b_value: float = 1.0, d: float = 1.6) -> np.ndarray:
    """
    Recalculates the Zaliapin Nearest-Neighbor distance eta parameters for the full raw catalog 
    to extract the Bimodal distribution histogram bounds.
    """
    from .spatial_filter import haversine_distance_matrix
    
    cat = raw_catalog.sort_values(by='time').reset_index(drop=True)
    n = len(cat)
    if n < 2:
        return np.array([])
        
    times = cat['time'].values
    lats = cat['latitude'].values
    lons = cat['longitude'].values
    mags = cat['magnitude'].values
    
    eta_min = np.full(n, np.inf)
    
    for j in range(1, n):
        t_diffs = (times[j] - times[:j]) / np.timedelta64(1, 'D')
        
        # Space difference
        r_diffs = haversine_distance_matrix(
            np.array([lats[j]]), np.array([lons[j]]),
            lats[:j], lons[:j]
        )[0]
        r_diffs = np.maximum(r_diffs, 0.001)
        
        # eta = t * r^d * 10^(-b * M)
        eta_candidates = t_diffs * np.power(r_diffs, d) * np.power(10.0, -b_value * mags[:j])
        eta_min[j] = np.min(eta_candidates)
        
    # Ignore the first event which has inf
    valid_eta = eta_min[1:]
    valid_eta = valid_eta[valid_eta > 0]
    
    # We want log10(eta) for the bimodal plot
    log_eta = np.log10(valid_eta)
    return log_eta
