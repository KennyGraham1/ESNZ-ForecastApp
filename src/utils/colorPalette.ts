import Highcharts from './highchartsInit';

// Define available palette names
export type ColorPaletteName = 'default' | 'magma' | 'viridis' | 'plasma';

// Define theme colors for non-gradient plots
export interface PaletteTheme {
    mainColor: string;      // Primary data color (e.g., observed points)
    secondaryColor: string; // Secondary data color (e.g., fitted line)
    tertiaryColor: string;  // Tertiary data color (e.g., reference line)
}

/**
 * Returns the color stops for a given palette, suitable for Highcharts colorAxis.
 * @param palette The name of the palette
 */
export const getColorStops = (palette: ColorPaletteName): [number, string][] => {
    switch (palette) {
        case 'magma':
            return [
                [0, 'rgba(0, 0, 0, 0.7)'],
                [0.33, 'rgba(128, 0, 128, 0.7)'],
                [0.66, 'rgba(220, 20, 60, 0.7)'],
                [1, 'rgba(255, 255, 0, 0.7)']
            ];
        case 'viridis':
            return [
                [0, 'rgba(75, 0, 130, 0.7)'],
                [0.33, 'rgba(0, 128, 128, 0.7)'],
                [0.66, 'rgba(50, 205, 50, 0.7)'],
                [1, 'rgba(255, 215, 0, 0.7)']
            ];
        case 'plasma':
            return [
                [0, 'rgba(13, 8, 135, 0.7)'],
                [0.33, 'rgba(204, 71, 120, 0.7)'],
                [0.66, 'rgba(248, 149, 64, 0.7)'],
                [1, 'rgba(240, 249, 33, 0.7)']
            ];
        case 'default':
        default:
            // Blue -> Teal -> Green
            return [
                [0, 'rgba(100, 100, 255, 0.7)'],
                [0.25, 'rgba(50, 200, 255, 0.7)'],
                [0.5, 'rgba(50, 255, 200, 0.7)'],
                [0.75, 'rgba(50, 255, 50, 0.7)'],
                [1, 'rgba(50, 255, 50, 0.7)']
            ];
    }
};

/**
 * Returns theme colors for line/scatter plots based on the selected palette.
 * @param palette The name of the palette
 */
export const getPaletteThemeColors = (palette: ColorPaletteName): PaletteTheme => {
    switch (palette) {
        case 'magma':
            return {
                mainColor: '#800080',      // Purple
                secondaryColor: '#DC143C', // Crimson
                tertiaryColor: '#FFD700',  // Gold
            };
        case 'viridis':
            return {
                mainColor: '#008080',      // Teal
                secondaryColor: '#32CD32', // Lime Green
                tertiaryColor: '#FFD700',  // Gold
            };
        case 'plasma':
            return {
                mainColor: '#CC4778',      // Plasma Red/Pink
                secondaryColor: '#F89540', // Plasma Orange
                tertiaryColor: '#0D0887',  // Plasma Dark Blue
            };
        case 'default':
        default:
            return {
                mainColor: '#4682B4',      // Steel Blue
                secondaryColor: '#DC143C', // Crimson (Standard for fits)
                tertiaryColor: '#32CD32',  // Lime Green
            };
    }
};

/**
 * Helper to interpolate colors manually if needed (simple linear interpolation)
 * This is a simplified version effectively used for single point color lookups
 * where complex gradients aren't needed or for custom markers.
 */
export const getColorForValue = (value: number, min: number, max: number, palette: ColorPaletteName): string => {
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const stops = getColorStops(palette);

    // Find the two stops surrounding the value
    for (let i = 0; i < stops.length - 1; i++) {
        const [stop1, color1] = stops[i];
        const [stop2, color2] = stops[i + 1];

        if (normalized >= stop1 && normalized <= stop2) {
            // Simply return the closer one or just the lower bound for simplicity
            // In a real extensive implementation we would parse RGBA and interpolate
            // For now, returning the stop color is sufficient for discrete buckets
            // or we use Highcharts colorAxis for gradients.
            return color1; // Fallback to lower bound bucket
        }
    }
    return stops[stops.length - 1][1];
};
