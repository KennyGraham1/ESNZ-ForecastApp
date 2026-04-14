import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple

# Okabe-Ito Colorblind-Safe Palette
OKABE_ITO = [
    '#000000', # Black (Raw)
    '#E69F00', # Orange
    '#56B4E9', # Sky Blue
    '#009E73', # Bluish Green
    '#F0E442', # Yellow
    '#0072B2', # Blue
    '#D55E00', # Vermilion
    '#CC79A7'  # Reddish Purple
]

def set_publication_style():
    """
    Overrides Matplotlib rcParams to enforce a scientific, 
    publication-grade aesthetic.
    """
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Arial', 'Helvetica', 'DejaVu Sans'],
        'font.size': 11,
        'axes.labelsize': 12,
        'axes.titlesize': 14,
        'axes.titleweight': 'bold',
        'axes.spines.top': False,
        'axes.spines.right': False,
        'axes.linewidth': 1.2,
        'xtick.direction': 'in',
        'ytick.direction': 'in',
        'xtick.major.size': 5,
        'ytick.major.size': 5,
        'xtick.major.width': 1.2,
        'ytick.major.width': 1.2,
        'xtick.labelsize': 10,
        'ytick.labelsize': 10,
        'legend.frameon': False,
        'legend.fontsize': 10,
        'grid.color': '#EEEEEE',
        'grid.linestyle': '-',
        'grid.linewidth': 1.0,
        'grid.alpha': 0.8
    })

def _auto_detect_regimes(dates, counts) -> List[Tuple[float, float]]:
    """
    Identifies high-frequency structural regimes (e.g., massive aftershock spikes).
    Returns a list of epoch ms tuples outlining the boundaries of the spike.
    """
    if len(counts) == 0:
        return []
        
    counts_arr = np.array(counts)
    mean_c = np.mean(counts_arr)
    std_c = np.std(counts_arr)
    
    threshold = mean_c + 2.5 * std_c
    spike_indices = np.where(counts_arr > threshold)[0]
    
    regimes = []
    for i in spike_indices:
        start_idx = max(0, i - 1)
        end_idx = min(len(dates) - 1, i + 2)
        regimes.append((dates[start_idx], dates[end_idx]))
        
    if not regimes:
        return []
        
    regimes.sort(key=lambda x: x[0])
    merged = [regimes[0]]
    for current in regimes[1:]:
        prev = merged[-1]
        if current[0] <= prev[1]:
            merged[-1] = (prev[0], max(prev[1], current[1]))
        else:
            merged.append(current)
            
    return merged

def create_cumulative_events_plot(temporal_rates: Dict[str, Dict], 
                                  regimes: List[Tuple[Any, Any]] = 'auto', 
                                  save_path: str = None) -> Any:
    set_publication_style()
    fig, ax = plt.subplots(figsize=(10, 6))
    
    if regimes == 'auto' and 'raw' in temporal_rates:
        raw_data = temporal_rates['raw']
        detected = _auto_detect_regimes(raw_data['times_epoch'], raw_data['frequency_counts'])
        regimes = [(pd.to_datetime(s, unit='ms'), pd.to_datetime(e, unit='ms')) for s, e in detected]
    elif regimes == 'auto':
        regimes = []
        
    for start, end in regimes:
        ax.axvspan(pd.to_datetime(start), pd.to_datetime(end), color='#DDDDDD', alpha=0.5, lw=0)
    
    for idx, (name, data) in enumerate(temporal_rates.items()):
        dates = pd.to_datetime(data['times_epoch'], unit='ms')
        is_raw = (name == 'raw')
        
        ax.plot(dates, data['cumulative_counts'], label=name.capitalize(), 
                color=OKABE_ITO[idx % len(OKABE_ITO)], 
                linewidth=2.5 if is_raw else 1.5,
                zorder=5 if is_raw else 4)
        
    ax.set_title("Declustering Characteristics in Time Series (Cumulative)")
    ax.set_xlabel("Time")
    ax.set_ylabel("Cumulative number of earthquakes")
    ax.legend()
    ax.grid(True)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_frequency_plot(temporal_rates: Dict[str, Dict], 
                          regimes: List[Tuple[Any, Any]] = 'auto',
                          save_path: str = None) -> Any:
    set_publication_style()
    fig, ax = plt.subplots(figsize=(10, 6))
    
    if regimes == 'auto' and 'raw' in temporal_rates:
        raw_data = temporal_rates['raw']
        detected = _auto_detect_regimes(raw_data['times_epoch'], raw_data['frequency_counts'])
        regimes = [(pd.to_datetime(s, unit='ms'), pd.to_datetime(e, unit='ms')) for s, e in detected]
    elif regimes == 'auto':
        regimes = []
        
    for start, end in regimes:
        ax.axvspan(pd.to_datetime(start), pd.to_datetime(end), color='#E8E8E8', alpha=0.7, lw=0)
    
    for idx, (name, data) in enumerate(temporal_rates.items()):
        dates = pd.to_datetime(data['frequency_epoch'], unit='ms')
        is_raw = (name == 'raw')
        
        ax.plot(dates, data['frequency_counts'], label=name.capitalize(), 
                color=OKABE_ITO[idx % len(OKABE_ITO)], 
                linewidth=2.0 if is_raw else 1.2,
                zorder=5 if is_raw else 4)
        
    ax.set_title("Declustering Characteristics (Earthquake Frequency)")
    ax.set_xlabel("Time")
    ax.set_ylabel("Earthquake Frequency")
    ax.legend()
    ax.grid(True)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_similarity_matrix_plot(sim_matrix: pd.DataFrame, save_path: str = None) -> Any:
    set_publication_style()
    fig, ax = plt.subplots(figsize=(8, 6))
    
    plot_df = sim_matrix.copy()
    plot_df.index = [str(i).capitalize() for i in plot_df.index]
    plot_df.columns = [str(c).capitalize() for c in plot_df.columns]
    
    sns.heatmap(plot_df, annot=True, fmt=".1f", cmap="magma_r", 
                cbar_kws={'label': 'Matching Proportion (%)'}, ax=ax,
                linewidths=2, linecolor='white')
    
    ax.set_title("Matching Proportions of Clustered Events")
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_declustering_ratio_plot(ratio_df: pd.DataFrame, save_path: str = None) -> Any:
    set_publication_style()
    fig, ax = plt.subplots(figsize=(10, 6))
    
    algorithms = [c for c in ratio_df.columns if c not in ('Magnitude_bin', 'Total_events')]
    
    x = np.arange(len(ratio_df['Magnitude_bin']))
    width = 0.8 / len(algorithms)
    
    for i, algo in enumerate(algorithms):
        ax.bar(x + (i - len(algorithms)/2 + 0.5) * width, ratio_df[algo], 
               width, label=algo.capitalize(), color=OKABE_ITO[(i+1) % len(OKABE_ITO)],
               edgecolor='white', linewidth=0.5)
        
    ax.set_xticks(x)
    ax.set_xticklabels(ratio_df['Magnitude_bin'])
    ax.set_title("Fraction of Earthquakes Removed by Magnitude")
    ax.set_xlabel("Magnitude Bin")
    ax.set_ylabel("Declustering Ratio (%)")
    ax.legend()
    ax.grid(True, axis='y')
    ax.set_axisbelow(True)
    
    ax.spines['bottom'].set_visible(True)
    ax.spines['left'].set_visible(True)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_inter_event_time_cdf_plot(cdf_data: Dict[str, Dict], save_path: str = None) -> Any:
    """
    Plots the Empirical Cumulative Distribution Function of inter-event times against
    the perfect theoretical Poisson curve. 
    """
    set_publication_style()
    fig, ax = plt.subplots(figsize=(10, 6))
    
    for idx, (name, data) in enumerate(cdf_data.items()):
        if name == 'raw':
            color = OKABE_ITO[0]
            lw = 2.5
            z = 5
        else:
            color = OKABE_ITO[(idx) % len(OKABE_ITO)]
            lw = 1.5
            z = 4
            
        ax.plot(data['x_empirical'], data['y_empirical'], label=f"{name.capitalize()} (Empirical)", 
                color=color, linewidth=lw, zorder=z)
        
        if name != 'raw':
            ax.plot(data['x_empirical'], data['y_theoretical'], 
                    color=color, linestyle='--', linewidth=1.5, alpha=0.7, zorder=z-1,
                    label=f"{name.capitalize()} (Poisson)")
            
    ax.set_title("Inter-Event Time Distribution (Poisson Test)")
    ax.set_xlabel("Inter-Event Time (Days) - Log Scale")
    ax.set_ylabel("Cumulative Probability")
    ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    ax.grid(True)
    ax.set_xscale('log')
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_spatial_epicenter_plot(raw_catalog: pd.DataFrame, declustered_catalog: pd.DataFrame, algo_name: str, save_path: str = None) -> Any:
    """
    Generates a scatter plot mapping Longitude vs Latitude, separating background independent 
    events from clustered swarms. Replicates Figure 3 from Bi et al. (2024).
    """
    set_publication_style()
    fig, ax = plt.subplots(figsize=(8, 8))
    
    bg_times = set(declustered_catalog['time'])
    is_bg = raw_catalog['time'].isin(bg_times)
    
    bg_data = raw_catalog[is_bg]
    cl_data = raw_catalog[~is_bg]
    
    # Background in Grey, Cluster in highlighted Vermillion.
    ax.scatter(bg_data['longitude'], bg_data['latitude'], 
               c='#AAAAAA', s=(bg_data['magnitude']**2)*1.5, alpha=0.5, edgecolors='none', label='Background Events', zorder=2)
    ax.scatter(cl_data['longitude'], cl_data['latitude'], 
               c=OKABE_ITO[6], s=(cl_data['magnitude']**2)*1.5, alpha=0.7, edgecolors='white', linewidth=0.3, label='Clustered Events', zorder=3)
    
    ax.set_title(f"Spatial Distribution of Seismicity ({algo_name.capitalize()})")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.legend()
    ax.grid(True, linestyle='--', alpha=0.5)
    ax.set_aspect('equal', 'box')
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig

def create_nearest_neighbor_bimodal_plot(log_eta: np.ndarray, threshold: float = None, save_path: str = None) -> Any:
    """
    Plots the structural bimodal distribution of rescaled time-space distances natively used 
    by Zaliapin Nearest-Neighbor topology.
    """
    set_publication_style()
    fig, ax = plt.subplots(figsize=(8, 6))
    
    sns.histplot(log_eta, bins=60, kde=True, color=OKABE_ITO[5], ax=ax, edgecolor='white', linewidth=0.5)
    
    if threshold is not None:
        ax.axvline(threshold, color=OKABE_ITO[6], linestyle='--', linewidth=2.5, 
                   label=f'Optimal Threshold $\\log\\eta={threshold:.2f}$')
        ax.legend()
        
    ax.set_title("Nearest-Neighbor Distance Bimodal Distribution")
    ax.set_xlabel("Rescaled Distance $\\log_{10}(\\eta)$")
    ax.set_ylabel("Density / Count")
    ax.grid(True, axis='y')
    ax.set_axisbelow(True)
    
    ax.spines['bottom'].set_visible(True)
    ax.spines['left'].set_visible(True)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=300)
    return fig
