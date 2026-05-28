/**
 * Human-readable unit suffix for an earthquake data field.
 * Used for axis titles, color-axis labels, and tooltips across the Sandbox plots.
 * Returns a leading-space-prefixed suffix (e.g. " km") or an empty string.
 */
export function getFieldUnit(field: string): string {
    const f = field.toLowerCase();
    if (f.includes('depth')) return ' km';
    if (f.includes('mag')) return ' M';
    if (f.includes('lat') || f.includes('lon')) return '°';
    if (f.includes('gap')) return ' min';
    return '';
}
