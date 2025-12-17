export interface Earthquake {
    type: string;
    geometry: {
        type: string;
        coordinates: [number, number, number]; // longitude, latitude, depth
    };
    properties: {
        publicID: string;
        time: string;
        depth: number;
        magnitude: number;
        magnitudeType: string;
        locality: string;
        quality: string;
        mmi?: number;
    };
    id: string;
}

export interface GeoNetResponse {
    type: string;
    features: Earthquake[];
}

export interface EarthquakeData {
    eventID: string;
    time: Date;
    timeMs?: number; // OPTIMIZATION: Pre-computed timestamp for fast filtering
    latitude: number;
    longitude: number;
    depth: number;
    magnitude: number;
    locality: string;
    mmi?: number;
    [key: string]: any;
}
