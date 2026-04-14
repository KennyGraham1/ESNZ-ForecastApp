import pandas as pd
import numpy as np
from datetime import timedelta
from typing import Optional
from scipy.spatial import cKDTree
from .models import MainEventInfo

def haversine_distance(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    R = 6371.0 # Earth's radius in km
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def extract_aftershock_sequence(catalog: pd.DataFrame, main_event: MainEventInfo, radius_km: Optional[float] = None) -> pd.DataFrame:
    """
    Extract aftershock sequence around a main event.
    Time window: 30 days before, 365 days after.
    Spatial window: Dynamic radius based on Wells-Coppersmith if not provided.
    Includes spatial indexing for fast queries.
    """
    if radius_km is None:
        radius_km = max(50.0, main_event.rupture_length_km)
        
    start_time = pd.to_datetime(main_event.time) - timedelta(days=30)
    end_time = pd.to_datetime(main_event.time) + timedelta(days=365)
    
    # Temporal filter
    temp_filtered = catalog[(catalog['time'] >= start_time) & (catalog['time'] <= end_time)].copy()
    
    if len(temp_filtered) == 0:
        return temp_filtered
        
    # Spatial filter using cKDTree
    # Convert lat/lon to 3D Cartesian coordinates for proper cKDTree usage (assuming spherical Earth)
    R = 6371.0
    lat_rad = np.radians(temp_filtered['latitude'].values)
    lon_rad = np.radians(temp_filtered['longitude'].values)
    
    x = R * np.cos(lat_rad) * np.cos(lon_rad)
    y = R * np.cos(lat_rad) * np.sin(lon_rad)
    z = R * np.sin(lat_rad)
    
    tree = cKDTree(np.c_[x, y, z])
    
    main_lat_rad = np.radians(main_event.latitude)
    main_lon_rad = np.radians(main_event.longitude)
    main_x = R * np.cos(main_lat_rad) * np.cos(main_lon_rad)
    main_y = R * np.cos(main_lat_rad) * np.sin(main_lon_rad)
    main_z = R * np.sin(main_lat_rad)
    
    # 2 * R * sin(theta/2) is the euclidean distance mapped to great circle distance
    # where theta is distance_km / R
    theta = radius_km / R
    euclidean_radius = 2 * R * np.sin(theta/2)
    
    indices = tree.query_ball_point([main_x, main_y, main_z], euclidean_radius)
    spatial_filtered = temp_filtered.iloc[indices].copy()
    
    # Add exact distances and days_since
    if len(spatial_filtered) > 0:
        exact_distances = haversine_distance(
            main_event.latitude, main_event.longitude,
            spatial_filtered['latitude'].values, spatial_filtered['longitude'].values
        )
        # Filter precisely to the radius to correct for Cartesian approximations
        exact_mask = exact_distances <= radius_km
        spatial_filtered = spatial_filtered[exact_mask].copy()
        spatial_filtered['distance'] = exact_distances[exact_mask]
        
        main_time_np = np.datetime64(main_event.time)
        spatial_filtered['days_since'] = (spatial_filtered['time'].values - main_time_np) / np.timedelta64(1, 'D')
        
    return spatial_filtered.reset_index(drop=True)
