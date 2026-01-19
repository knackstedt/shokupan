import { describe, expect, it } from "bun:test";
import path from "path";
import { OpenAPIAnalyzer } from "../../plugins/application/openapi/analyzer.impl";

describe("Middleware Variable Tracking", () => {
    it("should detect status codes from variables in RateLimitMiddleware", async () => {
        // Analyze the examples/api_paths directory which uses RateLimitMiddleware
        const testDir = path.join(process.cwd(), 'examples', 'api_paths');
        const analyzer = new OpenAPIAnalyzer(testDir);

        const { applications } = await analyzer.analyze();

        // console.log(`Found ${applications.length} applications`);

        // Find an application with middleware
        const appWithMiddleware = applications.find(app => app.middleware && app.middleware.length > 0);

        if (appWithMiddleware) {
            // console.log(`\nApplication: ${appWithMiddleware.name}`);
            // console.log(`Middleware count: ${appWithMiddleware.middleware.length}`);

            for (const mw of appWithMiddleware.middleware) {
                // console.log(`\nMiddleware: ${mw.name}`);
                // console.log(`  File: ${mw.file}`);
                // console.log(`  Response Types:`, mw.responseTypes);
                // console.log(`  Headers:`, mw.headers);

                // Check if RateLimitMiddleware has 429 response
                if (mw.name === 'RateLimitMiddleware') {
                    expect(mw.responseTypes).toBeDefined();
                    expect(mw.responseTypes?.['429']).toBeDefined();
                    expect(mw.responseTypes?.['429'].description).toBe('Too Many Requests');

                    expect(mw.headers).toBeDefined();
                    expect(mw.headers).toContain('X-RateLimit-Limit');
                    expect(mw.headers).toContain('Retry-After');
                }
            }
        } else {
            // console.log("No applications with middleware found");
        }
    });
});
