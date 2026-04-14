import numpy as np
from scipy.optimize import curve_fit, minimize, dual_annealing
from typing import Dict

def omori_law_rate(t: np.ndarray, K: float, c: float, p: float) -> np.ndarray:
    return K / np.power(t + c, p)

def fit_omori_lm(days: np.ndarray, counts: np.ndarray) -> Dict:
    """Levenberg-Marquardt fit using scipys curve_fit"""
    # Initial guess heuristic
    if len(counts) == 0:
        return {'K': 0, 'c': 0, 'p': 0, 'r_squared': 0.0, 'method': 'empty'}
        
    K0 = np.max(counts) * 2; c0 = 0.1; p0 = 1.1
    try:
        popt, _ = curve_fit(
            omori_law_rate, days, counts, 
            p0=[K0, c0, p0], 
            bounds=([0.001, 0.001, 0.5], [1e6, 10.0, 2.0]),
            method='trf' # trf is robust with bounds
        )
        K, c, p = popt
        
        preds = omori_law_rate(days, K, c, p)
        ss_res = np.sum((counts - preds)**2)
        ss_tot = np.sum((counts - np.mean(counts))**2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        
        return {'K': K, 'c': c, 'p': p, 'r_squared': r_squared, 'method': 'lm'}
    except Exception:
        return {'K': K0, 'c': c0, 'p': p0, 'r_squared': 0.0, 'method': 'lm_failed'}

def _neg_log_likelihood(params: np.ndarray, event_times: np.ndarray, t_max: float) -> float:
    K, c, p = params
    if K <= 0 or c <= 0.005 or p <= 0.6 or p >= 1.8:
        return 1e10
    
    rates = K / np.power(event_times + c, p)
    if np.any(rates <= 0):
        return 1e10
        
    sum_log_rates = np.sum(np.log(rates))
    
    if np.abs(p - 1.0) < 1e-6:
        integral = K * (np.log(t_max + c) - np.log(c))
    else:
        one_minus_p = 1 - p
        integral = (K / one_minus_p) * (np.power(t_max + c, one_minus_p) - np.power(c, one_minus_p))
        
    return -(sum_log_rates - integral)

def _get_mle_initial_guess(event_times: np.ndarray, t_max: float) -> np.ndarray:
    N = len(event_times)
    initial_c = 0.1
    initial_p = 1.1
    
    one_minus_p = 1 - initial_p
    integral_term = (np.power(t_max + initial_c, one_minus_p) - np.power(initial_c, one_minus_p)) / one_minus_p
    initial_K = N / (integral_term if integral_term > 0 else 1.0)
    return np.array([initial_K, initial_c, initial_p])

def fit_omori_mle_nelder_mead(event_times: np.ndarray, t_max: float) -> Dict:
    """MLE optimization using Nelder-Mead"""
    event_times = event_times[event_times >= 0.001]
    if len(event_times) == 0:
        return {'K': 0, 'c': 0, 'p': 0, 'log_likelihood': 0.0, 'method': 'empty'}
        
    x0 = _get_mle_initial_guess(event_times, t_max)
    res = minimize(
        _neg_log_likelihood, 
        x0, 
        args=(event_times, t_max),
        method='Nelder-Mead',
        options={'maxiter': 1000, 'fatol': 1e-8}
    )
    
    K, c, p = res.x
    return {'K': K, 'c': c, 'p': p, 'log_likelihood': -res.fun, 'method': 'mle_nelder_mead'}

def fit_omori_mle_simulated_annealing(event_times: np.ndarray, t_max: float) -> Dict:
    """MLE optimization using Simulated Annealing"""
    event_times = event_times[event_times >= 0.001]
    if len(event_times) == 0:
        return {'K': 0, 'c': 0, 'p': 0, 'log_likelihood': 0.0, 'method': 'empty'}
        
    bounds = [(1e-3, 1e5), (0.01, 5.0), (0.7, 1.7)]
    
    res = dual_annealing(
        _neg_log_likelihood,
        bounds=bounds,
        args=(event_times, t_max),
        maxiter=1000
    )
    
    K, c, p = res.x
    return {'K': K, 'c': c, 'p': p, 'log_likelihood': -res.fun, 'method': 'mle_simulated_annealing'}
