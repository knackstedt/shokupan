export const MEDIUM_JSON = {
    id: 1,
    name: "Benchmark Item",
    timestamp: new Date().toISOString(),
    tags: ["benchmark", "performance", "test", "json", "data", "medium"],
    nested: {
        layer1: {
            layer2: {
                value: "Some nested string value",
                numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            }
        }
    },
    description: "This is a medium sized JSON object used for benchmarking purposes. It contains some strings, numbers, arrays, and nested objects to simulate a typical API response."
};
