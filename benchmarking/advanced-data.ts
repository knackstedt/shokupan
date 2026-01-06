import { createHash } from "node:crypto";

// Large JSON response (~5MB) for compression and large payload testing
export const LARGE_JSON = generateLargeJSON();

// Large request body (~10MB)
export const LARGE_REQUEST_BODY = generateLargeText(10 * 1024 * 1024);

// Large headers (100 headers) for header stress testing
export const LARGE_HEADERS = generateLargeHeaders();

function generateLargeJSON() {
    const items = [];
    for (let i = 0; i < 10000; i++) {
        items.push({
            id: i,
            name: `Item ${i}`,
            description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
            timestamp: new Date().toISOString(),
            tags: ["benchmark", "performance", "test", "large", "json", "data"],
            metadata: {
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                version: 1,
                author: "benchmark-suite",
                nested: {
                    level1: {
                        level2: {
                            level3: {
                                value: "deeply nested value",
                                numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                            }
                        }
                    }
                }
            },
            // Additional properties to increase size
            properties: Array.from({ length: 20 }, (_, idx) => ({
                key: `prop_${idx}`,
                value: `value_${idx}`,
                type: "string"
            }))
        });
    }
    return {
        total: items.length,
        items,
        metadata: {
            generated: new Date().toISOString(),
            size: "~5MB",
            purpose: "Advanced benchmark testing"
        }
    };
}

function generateLargeText(size: number): string {
    const chunk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ".repeat(100);
    const numChunks = Math.ceil(size / chunk.length);
    return chunk.repeat(numChunks).substring(0, size);
}

function generateLargeHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
        headers[`X-Custom-Header-${i}`] = `Value-${i}-`.padEnd(200, 'x');
    }
    return headers;
}

/**
 * Calculate MD5 hash of a string
 */
export function md5(input: string): string {
    return createHash('md5').update(input).digest('hex');
}

/**
 * Serialize request data for hashing performance test
 */
export function serializeRequest(url: string, headers: string, body: string): string {
    return `${url}||${headers}||${body}`;
}

/**
 * Get the actual byte size of the LARGE_JSON
 */
export function getLargeJSONSize(): number {
    return Buffer.byteLength(JSON.stringify(LARGE_JSON));
}

/**
 * Smaller compressible response (100KB) for compression testing
 */
export const COMPRESSIBLE_JSON = {
    data: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        text: "This is a highly compressible text that repeats many times. ".repeat(20),
        timestamp: new Date().toISOString()
    }))
};
