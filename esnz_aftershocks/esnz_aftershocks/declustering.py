import pandas as pd
import numpy as np

def haversine_distance_matrix(lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    """Calculate haversine distance matrix between two sets of points."""
    R = 6371.0 # Earth's radius in km
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    
    # Broadcast to matrix shape
    lat1 = lat1[:, np.newaxis]
    lon1 = lon1[:, np.newaxis]
    lat2 = lat2[np.newaxis, :]
    lon2 = lon2[np.newaxis, :]
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def decluster_gardner_knopoff(catalog: pd.DataFrame, 
                              a: float = 0.1238, b: float = 0.983, 
                              c: float = 0.032, d: float = 2.7389) -> pd.DataFrame:
    """
    Apply Gardner-Knopoff declustering to a pandas DataFrame catalog.
    Requires 'time', 'magnitude', 'latitude', 'longitude'.
    """
    sorted_cat = catalog.sort_values(by='magnitude', ascending=False).reset_index(drop=True)
    is_dependent = np.zeros(len(sorted_cat), dtype=bool)
    
    times = sorted_cat['time'].values
    lats = sorted_cat['latitude'].values
    lons = sorted_cat['longitude'].values
    mags = sorted_cat['magnitude'].values
    
    spatial_windows = 10 ** (a * mags + b)
    # Temporal window is in days, convert to timedelta64[ns]
    temporal_windows = pd.to_timedelta(10 ** (c * mags + d), unit='D').values
    
    for i in range(len(sorted_cat)):
        if is_dependent[i]:
            continue
            
        main_time = times[i]
        main_lat = lats[i]
        main_lon = lons[i]
        s_win = spatial_windows[i]
        t_win = temporal_windows[i]
        
        # Fast preliminary temporal filter
        t_diff = np.abs(times - main_time)
        temporal_mask = (t_diff <= t_win)
        temporal_mask[i] = False # don't check self
        
        candidates = np.where(temporal_mask & ~is_dependent)[0]
        if len(candidates) > 0:
            distances = haversine_distance_matrix(
                np.array([main_lat]), np.array([main_lon]),
                lats[candidates], lons[candidates]
            )[0]
            
            spatial_mask = distances <= s_win
            dependent_indices = candidates[spatial_mask]
            is_dependent[dependent_indices] = True
            
    return sorted_cat[~is_dependent].reset_index(drop=True)

def decluster_srl_hardebeck(catalog: pd.DataFrame, time_window_years: float = 3.0, spatial_factor: float = 5.0) -> pd.DataFrame:
    """
    Apply Hardebeck et al. method (SRL) declustering using Wells-Coppersmith rupture length.
    """
    sorted_cat = catalog.sort_values(by='magnitude', ascending=False).reset_index(drop=True)
    is_dependent = np.zeros(len(sorted_cat), dtype=bool)
    
    times = sorted_cat['time'].values
    lats = sorted_cat['latitude'].values
    lons = sorted_cat['longitude'].values
    mags = sorted_cat['magnitude'].values
    
    rupture_lengths = 10 ** (-2.44 + 0.59 * mags)
    t_win = pd.to_timedelta(time_window_years * 365.25, unit='D')
    
    for i in range(len(sorted_cat)):
        if is_dependent[i]:
            continue
            
        main_time = times[i]
        main_lat = lats[i]
        main_lon = lons[i]
        dist_limit = spatial_factor * rupture_lengths[i]
        
        # Only check events following the main event within the time window
        time_mask = (times > main_time) & (times <= main_time + t_win)
        
        candidates = np.where(time_mask & ~is_dependent)[0]
        if len(candidates) > 0:
            distances = haversine_distance_matrix(
                np.array([main_lat]), np.array([main_lon]),
                lats[candidates], lons[candidates]
            )[0]
            
            spatial_mask = distances <= dist_limit
            dependent_indices = candidates[spatial_mask]
            is_dependent[dependent_indices] = True
            
    return sorted_cat[~is_dependent].reset_index(drop=True)

def find_recent_significant_mainshocks(catalog: pd.DataFrame, decluster_method: str = 'zaliapin', min_magnitude: float = 5.5,
                                       srl_time_window_years: float = 3.0, srl_spatial_factor: float = 5.0,
                                       srl_aftershock_days: float = 10.0, srl_aftershock_spatial_factor: float = 3.0,
                                       zaliapin_log_eta_threshold: float = -3.0,
                                       **kwargs) -> pd.DataFrame:
    """
    Identify significant mainshocks that have > 2 aftershocks.
    """
    sig_events = catalog[catalog['magnitude'] >= min_magnitude].copy()
    
    if decluster_method == 'srl':
        declustered = decluster_srl_hardebeck(sig_events, time_window_years=srl_time_window_years, spatial_factor=srl_spatial_factor)
    elif decluster_method == 'gk':
        declustered = decluster_gardner_knopoff(sig_events, **kwargs)
    elif decluster_method == 'zaliapin':
        declustered = decluster_zaliapin(sig_events, log_eta_threshold=zaliapin_log_eta_threshold, **kwargs)
    elif decluster_method == 'reasenberg':
        declustered = decluster_reasenberg(sig_events, **kwargs)
    elif decluster_method == 'etas':
        declustered = decluster_stochastic_etas(sig_events, **kwargs)
    elif decluster_method == 'st_dbscan':
        declustered = decluster_st_dbscan(sig_events, **kwargs)
    else:
        raise ValueError(f"Unknown decluster_method: {decluster_method}")
        
    valid_mainshocks = []
    times = catalog['time'].values
    lats = catalog['latitude'].values
    lons = catalog['longitude'].values
    
    for idx, row in declustered.iterrows():
        main_time = row['time']
        main_lat = row['latitude']
        main_lon = row['longitude']
        mag = row['magnitude']
        
        rl = 10 ** (-2.44 + 0.59 * mag)
        t_win = pd.to_timedelta(srl_aftershock_days, unit='D')
        s_win = srl_aftershock_spatial_factor * rl
        
        time_mask = (times > main_time) & (times <= main_time + t_win)
        candidates = np.where(time_mask)[0]
        
        if len(candidates) > 2:
            distances = haversine_distance_matrix(
                np.array([main_lat]), np.array([main_lon]),
                lats[candidates], lons[candidates]
            )[0]
            aftershock_count = np.sum(distances <= s_win)
            if aftershock_count > 2:
                valid_mainshocks.append(row)
                
    if not valid_mainshocks:
        return pd.DataFrame(columns=catalog.columns)
        
    result = pd.DataFrame(valid_mainshocks).sort_values(by='magnitude', ascending=False).head(10).reset_index(drop=True)
    return result

def decluster_zaliapin(catalog: pd.DataFrame, b_value: float = 1.0, fractal_dim: float = 1.2, log_eta_threshold: float = -3.0) -> pd.DataFrame:
    """
    Apply Zaliapin & Ben-Zion (2013) nearest-neighbor declustering.
    """
    sorted_cat = catalog.sort_values(by='time').reset_index(drop=True)
    n = len(sorted_cat)
    is_dependent = np.zeros(n, dtype=bool)
    
    if n == 0:
        return sorted_cat
    
    times = sorted_cat['time'].values
    lats = sorted_cat['latitude'].values
    lons = sorted_cat['longitude'].values
    mags = sorted_cat['magnitude'].values
    
    max_lookback = min(1000, n) 
    
    for i in range(1, n):
        start_idx = max(0, i - max_lookback)
        t_child = times[i]
        
        t_diffs = (t_child - times[start_idx:i]) / np.timedelta64(1, 'D')
        
        valid_mask = t_diffs > 0
        if not np.any(valid_mask):
            continue
            
        distances = haversine_distance_matrix(
            np.array([lats[i]]), np.array([lons[i]]),
            lats[start_idx:i], lons[start_idx:i]
        )[0]
        
        distances = np.maximum(distances, 0.001)
        
        eta = t_diffs * (distances ** fractal_dim) * (10 ** (-b_value * mags[start_idx:i]))
        eta = eta[valid_mask]
        
        if len(eta) > 0:
            min_eta = np.min(eta)
            if min_eta > 0 and np.log10(min_eta) < log_eta_threshold:
                is_dependent[i] = True
            
    return sorted_cat[~is_dependent].reset_index(drop=True)

def decluster_reasenberg(catalog: pd.DataFrame, rfact: float = 10.0, taumin: float = 1.0, taumax: float = 10.0) -> pd.DataFrame:
    """
    Apply Reasenberg (1985) dynamic window declustering (simplified).
    """
    sorted_cat = catalog.sort_values(by='time').reset_index(drop=True)
    n = len(sorted_cat)
    is_dependent = np.zeros(n, dtype=bool)
    
    if n == 0:
        return sorted_cat
    
    times = sorted_cat['time'].values
    lats = sorted_cat['latitude'].values
    lons = sorted_cat['longitude'].values
    mags = sorted_cat['magnitude'].values
    
    R = 0.011 * (10 ** (0.4 * mags))
    
    for i in range(n):
        if is_dependent[i]:
            continue
            
        r_mult = rfact * R[i]
        
        j = i + 1
        while j < n:
            t_diff = (times[j] - times[i]) / np.timedelta64(1, 'D')
            if t_diff > taumax:
                break
                
            dist = haversine_distance_matrix(
                np.array([lats[i]]), np.array([lons[i]]),
                np.array([lats[j]]), np.array([lons[j]])
            )[0][0]
            
            if dist <= r_mult and t_diff <= taumax:
                is_dependent[j] = True
            j += 1
            
    return sorted_cat[~is_dependent].reset_index(drop=True)

def decluster_st_dbscan(catalog: pd.DataFrame, 
                        eps_spatial_km: float = 10.0, 
                        eps_temporal_days: float = 14.0, 
                        min_pts: int = 3) -> pd.DataFrame:
    """
    Apply pure Data-Driven Spatiotemporal Density-Based Spatial Clustering (ST-DBSCAN).
    Unlike Gardner-Knopoff or Reasenberg, this relies on ZERO empirical magnitude-scaling laws.
    Identifies high-density 3D sequences; retains 'Noise' as the independent background catalog.
    """
    try:
        from sklearn.neighbors import BallTree
    except ImportError:
        raise ImportError("scikit-learn is required for ST-DBSCAN. Please run: pip install scikit-learn")

    cat = catalog.sort_values(by='time').reset_index(drop=True)
    n = len(cat)
    if n == 0:
        return cat
        
    times_days = cat['time'].astype(np.int64).values / (10**9 * 86400.0) 
    lats = np.radians(cat['latitude'].values)
    lons = np.radians(cat['longitude'].values)
    
    coords = np.vstack((lats, lons)).T
    
    # Build BallTree for Haversine speed
    tree = BallTree(coords, metric='haversine')
    eps_spatial_rad = eps_spatial_km / 6371.0
    
    # -1 unassigned, 0 Noise, >0 Cluster
    labels = np.full(n, -1, dtype=int)
    cluster_id = 0
    
    for i in range(n):
        if labels[i] != -1:
            continue
            
        t_target = times_days[i]
        idx_start = np.searchsorted(times_days, t_target - eps_temporal_days, side='left')
        idx_end = np.searchsorted(times_days, t_target + eps_temporal_days, side='right')
        
        candidates = np.arange(idx_start, idx_end)
        
        dists, = tree.query_radius(coords[i:i+1], r=eps_spatial_rad, return_distance=False)
        neighbors = np.intersect1d(candidates, dists)
        
        if len(neighbors) < min_pts:
            labels[i] = 0 # Independent background (noise)
        else:
            cluster_id += 1
            labels[i] = cluster_id
            
            queue = list(neighbors)
            queue.remove(i)
            
            while len(queue) > 0:
                q = queue.pop(0)
                
                if labels[q] == 0:
                    labels[q] = cluster_id 
                if labels[q] != -1:
                    continue
                    
                labels[q] = cluster_id
                
                q_t_target = times_days[q]
                q_idx_start = np.searchsorted(times_days, q_t_target - eps_temporal_days, side='left')
                q_idx_end = np.searchsorted(times_days, q_t_target + eps_temporal_days, side='right')
                q_candidates = np.arange(q_idx_start, q_idx_end)
                
                q_dists, = tree.query_radius(coords[q:q+1], r=eps_spatial_rad, return_distance=False)
                q_neighbors = np.intersect1d(q_candidates, q_dists)
                
                if len(q_neighbors) >= min_pts:
                    for val in q_neighbors:
                        if labels[val] == -1 and val not in queue:
                            queue.append(val)
                            
    # Any label > 0 is part of a density swarm (aftershocks)
    is_dependent = (labels > 0)
    
    return cat[~is_dependent].reset_index(drop=True)


