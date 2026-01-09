
// Constants
export const FRAMEWORKS = ["shokupan", "shokupan-npm", "fastify", "express", "koa", "hapi", "nest", "hono", "elysia"];
export const RUNTIMES = ["bun", "node", "deno"];
export const BUN_ONLY_FRAMEWORKS = ["elysia"]; // Frameworks that only work on Bun
export const BUN_REUSE_PORT_FRAMEWORKS = ["shokupan", "elysia", "hono"]; // Frameworks supporting Bun's reusePort (Bun.serve)

// Framework/scenario exclusions - scenarios that frameworks don't support
export const FRAMEWORK_EXCLUSIONS: Record<string, string[]> = {
    "express": ["compression-brotli", "compression-zstd"],
    "koa": ["compression-brotli", "compression-zstd"],
    "hapi": ["compression-brotli", "compression-zstd"],
    "nest": ["compression-gzip", "compression-brotli", "compression-deflate", "compression-zstd", "math-middleware"],
    "fastify": ["compression-zstd"],
    "hono": ["compression-brotli", "compression-zstd"],
    "elysia": ["compression-gzip", "compression-brotli", "compression-deflate", "compression-zstd"],
};

// Runtime-specific exclusions - scenarios that don't work on specific runtimes
export const RUNTIME_EXCLUSIONS: Record<string, Record<string, string[]>> = {
    "node": {
        // Shokupan on Node.js has issues with POST requests due to undici Request duplex requirement
        "shokupan": ["fully-loaded", "compression-zstd"]
    },
    "bun": {
        // Express body-parser has issues with large payloads on Bun
        "express": ["large-payload-request"],
        // Koa compression middleware has stream issues on Bun
        "koa": ["compression-gzip", "compression-deflate"]
    }
};

// Types
export type ScenarioConfig = {
    name: string;
    endpoints: string[];
    connections: number;
    duration: number;
    durationEstimate?: number; // per runtime
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
    processCount?: number; // Single process count (legacy, for non-scaling scenarios)
    processCounts?: number[]; // Array of process counts to test for scaling comparison
};

export type MemorySample = {
    timestamp: number;      // Milliseconds since benchmark start
    rss: number;           // Resident Set Size (MB)
};

export type BenchmarkResult = {
    requests: number;
    latency: number;
    throughput: number;
    error?: string;
    percentiles?: Record<string, number>;
    memory?: MemorySample[];  // Memory samples collected during benchmark
};

export type ScenarioResults = Record<string, BenchmarkResult>; // endpoint -> result
export type RuntimeResults = Record<string, ScenarioResults>; // scenario -> endpoints -> result
export type FrameworkResults = Record<string, RuntimeResults>; // runtime -> scenario -> endpoints -> result
export type AllResults = Record<string, FrameworkResults>; // framework -> runtime -> scenario -> endpoints -> result

export type SystemInfo = {
    os: string;
    kernel: string;
    node: string;
    bun: string;
    cpu: {
        model: string;
        speed: number;
        cores: number;
    };
    memory: {
        total: number;
    };
};

export type HistoryEntry = {
    timestamp: number;
    system?: SystemInfo;
    results: AllResults;
};

// Scenarios
export const SCENARIOS: Record<string, ScenarioConfig> = {
    // Compression tests - test each algorithm separately
    "compression-gzip": {
        name: "Compression (gzip)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "gzip" }
    },
    "compression-brotli": {
        name: "Compression (brotli)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "br" }
    },
    "compression-deflate": {
        name: "Compression (deflate)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "deflate" }
    },
    "compression-zstd": {
        name: "Compression (zstd)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "zstd" }
    },
    "compression-store": {
        name: "No Compression (baseline)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: {}
    },

    // Large payload tests
    "large-payload-request": {
        name: "Large Request Payload (10MB POST)",
        endpoints: ["/large-request"],
        connections: 50,
        duration: 10,
        durationEstimate: 13,
        method: "POST",
        body: "x".repeat(10 * 1024 * 1024), // 10MB plain text
        headers: { "Content-Type": "text/plain" }
    },
    "large-payload-response": {
        name: "Large Response Payload (5MB JSON)",
        endpoints: ["/large-response"],
        connections: 50,
        duration: 10,
        durationEstimate: 13
    },
    "large-payload-headers": {
        name: "Large Headers (100 headers)",
        endpoints: ["/large-headers"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
    },

    // Math middleware test
    "math-middleware": {
        name: "10 MD5 Middleware Chain",
        endpoints: ["/compute"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
    },

    // Scaling test
    "scaling": {
        name: "1000 Route Handlers (Scaling)",
        endpoints: Array.from({ length: 10 }, (_, i) => `/route-${Math.floor(Math.random() * 1000)}`),
        connections: 100,
        duration: 10,
        durationEstimate: 110
    },

    // Fully loaded test
    "fully-loaded": {
        name: "Fully Loaded (Validators + ALS)",
        endpoints: ["/validate"],
        connections: 100,
        duration: 10,
        durationEstimate: 13,
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" }
    },

    // Long pending test - tests high concurrency with small delays
    "long-pending": {
        name: "High Concurrency (10000 concurrent, 100ms delay)",
        endpoints: ["/delayed"],
        connections: 10000,
        duration: 10,
        durationEstimate: 13.5,
        timeout: 30 // Allow enough time for responses
    },

    // Property access test - simple property read performance
    "property-access": {
        name: "Property Access (path)",
        endpoints: ["/property/path"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
    },

    // Multi-process scaling test - compares 1, 2, and 4 worker performance
    // "multi-process": {
    //     name: "Multi-Process Scaling",
    //     endpoints: ["/small-get", "/large-get", "/large-post"],
    //     connections: 500,
    //     duration: 60, // Increase duration to allow for initial CPU blocking (serialization of large payloads)
    //     durationEstimate: 560,
    //     processCounts: [1, 2, 4], // Test with 1, 2, and 4 workers for comparison
    //     timeout: 60 // Increase timeout for high concurrency/large payload
    // }
};
