const ITERATIONS = 100_000_000_000;
const fn = () => { };

function benchTruthy() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        if (fn) {
            count++;
        }
    }
    const end = performance.now();
    return end - start;
}

function benchTypeof() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        if (typeof fn === "function") {
            count++;
        }
    }
    const end = performance.now();
    return end - start;
}

// Warm up the JIT compiler
benchTruthy();
benchTypeof();

console.log(`Running ${ITERATIONS.toLocaleString()} iterations...`);

const timeTruthy = benchTruthy();
console.log(`if (fn):               ${timeTruthy.toFixed(4)}ms`);

const timeTypeof = benchTypeof();
console.log(`if (typeof fn === ...): ${timeTypeof.toFixed(4)}ms`);

const diff = ((timeTypeof / timeTruthy - 1) * 100).toFixed(2);
console.log(`\nResult: Truthy check is ${diff}% faster.`);