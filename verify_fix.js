
const ARRAY_SIZE = 200000; // Large enough to cause stack overflow typically (depends on recursion limit)

// Generate large array
console.log(`Generating array of size ${ARRAY_SIZE}...`);
const largeArray = new Array(ARRAY_SIZE).fill(0).map(() => Math.random());

// Unsafe method (Standard Match.min/max with spread)
function unsafeMin(arr) {
    try {
        return Math.min(...arr);
    } catch (e) {
        console.error("❌ Unsafe method failed as expected:", e.message);
        return null; // Return null to indicate failure
    }
}

// Safe method (Iterative)
function safeMin(arr) {
    let min = Infinity;
    const len = arr.length;
    for (let i = 0; i < len; i++) {
        const val = arr[i];
        if (val < min) min = val;
    }
    return min;
}

function safeMax(arr) {
    let max = -Infinity;
    const len = arr.length;
    for (let i = 0; i < len; i++) {
        const val = arr[i];
        if (val > max) max = val;
    }
    return max;
}

console.log("Testing unsafe method...");
const unsafeResult = unsafeMin(largeArray);

console.log("Testing safe method...");
const start = performance.now();
const safeMinResult = safeMin(largeArray);
const safeMaxResult = safeMax(largeArray);
const end = performance.now();

console.log(`✅ Safe method completed in ${(end - start).toFixed(2)}ms`); // Fixed precision for readability
console.log(`Min: ${safeMinResult}, Max: ${safeMaxResult}`);

if (unsafeResult === null && safeMinResult !== undefined) {
    console.log("SUCCESS: Unsafe method failed, Safe method succeeded.");
} else {
    // It's possible the array wasn't large enough to crash unsafe method on this specific machine configuration
    console.log("NOTE: Unsafe method did not crash. Consider increasing ARRAY_SIZE to reproduce overflow.");
}
