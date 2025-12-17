
// reproduce_overflow.js

function testOverflow(size) {
    console.log(`Testing array size: ${size}`);
    const arr = new Array(size).fill(0).map((_, i) => i);

    try {
        const min = Math.min(...arr);
        console.log(`Success! Min: ${min}`);
    } catch (e) {
        console.error(`Failed with size ${size}: ${e.message}`);
        return false;
    }
    return true;
}

// Bisect to find limit
let low = 1000;
let high = 200000; // 200k usually fails
let limit = 0;

if (!testOverflow(high)) {
    console.log("High size failed, finding limit...");
    // Just show that 200k fails, which matches our hypothesis
} else {
    console.log("200k worked? Maybe Node.js stack size is larger or spread implementation is optimized.");
    // Try bigger
    testOverflow(1000000);
}
