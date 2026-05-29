import Highcharts from './highchartsInit';

// Define available palette names
export type ColorPaletteName = 'default' | 'magma' | 'viridis' | 'plasma' | 'inferno' | 'cividis' | 'turbo' | 'deut-prot' | 'tritan';

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
        case 'inferno':
            return [
                [0, 'rgba(0, 0, 4, 0.7)'],
                [0.33, 'rgba(87, 16, 109, 0.7)'],
                [0.66, 'rgba(211, 67, 46, 0.7)'],
                [1, 'rgba(252, 255, 164, 0.7)']
            ];
        case 'cividis': // Colorblind friendly (Blue-Yellow)
            return [
                [0, 'rgba(0, 32, 77, 0.7)'],
                [0.33, 'rgba(65, 77, 107, 0.7)'],
                [0.66, 'rgba(124, 123, 120, 0.7)'],
                [1, 'rgba(255, 234, 70, 0.7)']
            ];
        case 'turbo':
            return [
                [0, 'rgba(48, 18, 59, 0.7)'],
                [0.2, 'rgba(70, 134, 250, 0.7)'],
                [0.4, 'rgba(27, 219, 21, 0.7)'],
                [0.6, 'rgba(253, 188, 25, 0.7)'],
                [0.8, 'rgba(209, 41, 5, 0.7)'],
                [1, 'rgba(122, 4, 3, 0.7)']
            ];
        case 'deut-prot': // Deuteranopia/Protanopia Safe (Blue-Orange)
            return [
                [0, 'rgba(51, 34, 136, 0.7)'], // Indigo
                [0.5, 'rgba(255, 255, 255, 0.7)'], // White middle to separate
                [1, 'rgba(204, 170, 0, 0.7)'] // Gold/Yellow
            ];
        case 'tritan': // Tritanopia Safe (Red-Teal/Blue)
            return [
                [0, 'rgba(0, 0, 0, 0.7)'],
                [0.5, 'rgba(0, 77, 64, 0.7)'], // Teal
                [1, 'rgba(216, 27, 96, 0.7)'] // Rose Red
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
        case 'inferno':
            return {
                mainColor: '#D3432E',      // Orange-Red
                secondaryColor: '#57106D', // Dark Purple
                tertiaryColor: '#FCFFA4',  // Light Yellow
            };
        case 'cividis':
            return {
                mainColor: '#00204D',      // Dark Blue
                secondaryColor: '#7C7B78', // Grey
                tertiaryColor: '#FFEA46',  // Yellow
            };
        case 'turbo':
            return {
                mainColor: '#4686FA',      // Blue
                secondaryColor: '#D12905', // Red
                tertiaryColor: '#1BDB15',  // Green
            };
        case 'deut-prot':
            return {
                mainColor: '#1A85FF',      // Blue
                secondaryColor: '#D41159', // Magenta
                tertiaryColor: '#FFC20A',  // Gold
            };
        case 'tritan':
            return {
                mainColor: '#004D40',      // Teal
                secondaryColor: '#D81B60', // Rose
                tertiaryColor: '#1E88E5',  // Blue
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

/** Parse an `rgb()`/`rgba()` string into [r, g, b, a]. */
const parseRgba = (c: string): [number, number, number, number] => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 1];
    const p = m[1].split(',').map(s => parseFloat(s.trim()));
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
};

/**
 * Linearly interpolate a color along the palette gradient for a value in [min, max].
 * Interpolating (rather than returning the lower-bound stop) ensures per-point marker
 * colors match the smooth gradient drawn by a Highcharts colorAxis legend.
 */
export const getColorForValue = (value: number, min: number, max: number, palette: ColorPaletteName): string => {
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const stops = getColorStops(palette);

    if (normalized <= stops[0][0]) return stops[0][1];
    if (normalized >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    for (let i = 0; i < stops.length - 1; i++) {
        const [stop1, color1] = stops[i];
        const [stop2, color2] = stops[i + 1];
        if (normalized >= stop1 && normalized <= stop2) {
            const f = stop2 === stop1 ? 0 : (normalized - stop1) / (stop2 - stop1);
            const a = parseRgba(color1);
            const b = parseRgba(color2);
            const r = Math.round(a[0] + (b[0] - a[0]) * f);
            const g = Math.round(a[1] + (b[1] - a[1]) * f);
            const bl = Math.round(a[2] + (b[2] - a[2]) * f);
            const al = a[3] + (b[3] - a[3]) * f;
            return `rgba(${r}, ${g}, ${bl}, ${parseFloat(al.toFixed(3))})`;
        }
    }
    return stops[stops.length - 1][1];
};
