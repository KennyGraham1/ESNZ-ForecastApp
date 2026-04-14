"""
ESNZ Aftershock Sequence Analysis Package
"""

__version__ = "0.1.0"

from .declustering import (
    decluster_gardner_knopoff,
    decluster_reasenberg,
    decluster_zaliapin,
    decluster_st_dbscan,
    find_recent_significant_mainshocks
)

from .optimization import (
    test_poisson_behavior,
    optimize_declustering_parameters,
    analyze_declustering_effects
)

from .comparison import (
    calculate_temporal_rates,
    calculate_matching_proportions,
    calculate_declustering_ratio_by_magnitude,
    calculate_b_value_shifts,
    calculate_inter_event_cdf,
    calculate_nearest_neighbor_eta
)

from .plots import (
    create_cumulative_events_plot,
    create_frequency_plot,
    create_similarity_matrix_plot,
    create_declustering_ratio_plot,
    create_inter_event_time_cdf_plot,
    create_spatial_epicenter_plot,
    create_nearest_neighbor_bimodal_plot
)
