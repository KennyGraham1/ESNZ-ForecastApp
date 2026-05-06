/**
 * Safe replacements for Math.min/max — avoids call stack overflow on large arrays
 * where spread syntax (Math.min(...arr)) would throw.
 */
export function safeMin(arr: number[]): number {
    if (!arr || arr.length === 0) return Infinity;

    let min = Infinity;
    for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        if (val < min) min = val;
    }
    return min;
}

/**
 * Calculates the maximum value in an array of numbers.
 * Safe for large arrays where Math.max(...arr) would stack overflow.
 * Returns -Infinity for empty arrays, matching Math.max() behavior.
 */
export function safeMax(arr: number[]): number {
    if (!arr || arr.length === 0) return -Infinity;

    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        if (val > max) max = val;
    }
    return max;
}

/**
 * Extends the functionality to find both min and max efficiently in one pass.
 */
export function safeMinMax(arr: number[]): { min: number; max: number } {
    if (!arr || arr.length === 0) return { min: Infinity, max: -Infinity };

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        if (val < min) min = val;
        if (val > max) max = val;
    }

    return { min, max };
}
