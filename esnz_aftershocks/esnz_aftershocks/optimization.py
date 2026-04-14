import pandas as pd
import numpy as np
from scipy import stats
from scipy.optimize import minimize
from typing import Dict

from .declustering import decluster_gardner_knopoff, decluster_reasenberg, decluster_zaliapin

def calculate_inter_event_times(catalog: pd.DataFrame) -> np.ndarray:
    if len(catalog) <= 1:
        return np.array([])
    times = np.sort(catalog['time'].values)
    dts = (times[1:] - times[:-1]) / np.timedelta64(1, 'D')
    return dts

def test_poisson_behavior(catalog: pd.DataFrame) -> Dict[str, float]:
    dts = calculate_inter_event_times(catalog)
    if len(dts) < 2:
        return {'ks_statistic': 1.0, 'p_value': 0.0, 'mean_dt': 0.0}
    
    mean_dt = np.mean(dts)
    if mean_dt <= 0:
        return {'ks_statistic': 1.0, 'p_value': 0.0, 'mean_dt': 0.0}
        
    # KS test against exponential distribution
    ks_stat, p_value = stats.kstest(dts, 'expon', args=(0, mean_dt))
    
    return {
        'ks_statistic': ks_stat,
        'p_value': p_value,
        'mean_dt': mean_dt
    }

def objective_function(params: np.ndarray, catalog: pd.DataFrame, method: str, penalty_factor: float = 2.0) -> float:
    # Decode parameters based on method
    try:
        if method == 'zaliapin':
            log_eta = params[0]
            declustered = decluster_zaliapin(catalog, log_eta_threshold=log_eta)
        elif method == 'gk':
            a, b, c, d = params
            declustered = decluster_gardner_knopoff(catalog, a=a, b=b, c=c, d=d)
        elif method == 'reasenberg':
            rfact, taumin, taumax = params
            declustered = decluster_reasenberg(catalog, rfact=rfact, taumin=taumin, taumax=taumax)
        else:
            return 1e6
            
        N_orig = len(catalog)
        N_dec = len(declustered)
        
        if N_dec < 10:
            return 1e6 # Invalid state, destroyed catalog
            
        ks_res = test_poisson_behavior(declustered)
        ks_stat = ks_res['ks_statistic']
        
        # Fraction removed
        f_removed = 1.0 - (N_dec / N_orig)
        
        # Objective combines mapping to Poisson (KS stat is 0 to 1) 
        # and punishing over-declustering
        return ks_stat + penalty_factor * f_removed
        
    except Exception:
        return 1e6

def optimize_declustering_parameters(catalog: pd.DataFrame, method: str = 'zaliapin', penalty_factor: float = 2.0) -> Dict:
    if method == 'zaliapin':
        x0 = np.array([-3.0])
        bounds = [(-6.0, 0.0)]
    elif method == 'gk':
        x0 = np.array([0.1238, 0.983, 0.032, 2.7389])
        bounds = [(0.0, 1.0), (0.0, 3.0), (0.0, 0.1), (1.0, 4.0)]
    elif method == 'reasenberg':
        x0 = np.array([10.0, 1.0, 10.0])
        bounds = [(1.0, 50.0), (0.1, 5.0), (5.0, 50.0)]
    else:
        raise ValueError("Invalid method")
        
    # L-BFGS-B handles bounds cleanly
    res = minimize(
        objective_function,
        x0,
        args=(catalog, method, penalty_factor),
        bounds=bounds,
        method='L-BFGS-B',
        options={'eps': 0.1} # Step size for approx gradients
    )
    
    opt_params = res.x
    return {
        'optimal_parameters': opt_params.tolist(),
        'objective_value': res.fun,
        'success': res.success
    }

def analyze_declustering_effects(catalog: pd.DataFrame, penalty_factor: float = 2.0) -> pd.DataFrame:
    methods = ['zaliapin', 'gk', 'reasenberg']
    results = []
    
    # Base KS metric for undeclustered catalog
    base_res = test_poisson_behavior(catalog)
    results.append({
        'Method': 'Raw Catalog',
        'Parameters': 'None',
        'KS_Statistic': float(base_res['ks_statistic']),
        'P_Value': float(base_res['p_value']),
        'Pct_Retained': 100.0
    })
    
    for m in methods:
        opt_res = optimize_declustering_parameters(catalog, method=m, penalty_factor=penalty_factor)
        p = opt_res['optimal_parameters']
        
        if m == 'zaliapin':
            dec = decluster_zaliapin(catalog, log_eta_threshold=p[0])
            param_str = f"log_eta={p[0]:.2f}"
        elif m == 'gk':
            dec = decluster_gardner_knopoff(catalog, a=p[0], b=p[1], c=p[2], d=p[3])
            param_str = f"a={p[0]:.2f}, b={p[1]:.2f}, c={p[2]:.2f}, d={p[3]:.2f}"
        elif m == 'reasenberg':
            dec = decluster_reasenberg(catalog, rfact=p[0], taumin=p[1], taumax=p[2])
            param_str = f"rfact={p[0]:.1f}, t_min={p[1]:.1f}, t_max={p[2]:.1f}"
            
        ks_res = test_poisson_behavior(dec)
        results.append({
            'Method': m,
            'Parameters': param_str,
            'KS_Statistic': float(ks_res['ks_statistic']),
            'P_Value': float(ks_res['p_value']),
            'Pct_Retained': len(dec) / len(catalog) * 100.0
        })
        
    return pd.DataFrame(results)
