import { describe, expect, test } from "bun:test";
import { Cors } from "../../plugins/middleware/cors";
import { Proxy } from "../../plugins/middleware/proxy";
import { RateLimitMiddleware } from "../../plugins/middleware/rate-limit";
import { Shokupan } from "../../shokupan";

describe("Security: Network Security", () => {
    describe("CVE-7: CORS Origin Validation", () => {
        test("should reject null origin by default", async () => {
            const app = new Shokupan();
            app.use(Cors({ origin: ["https://example.com"] }));

            app.get("/api/data", (ctx) => ctx.json({ data: "sensitive" }));

            const res = await app.testRequest({
                path: "/api/data",
                headers: {
                    "origin": "null"
                }
            });

            expect(res.status).toBe(200);
            expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        });

        test("should normalize origins for case-insensitive comparison", async () => {
            const app = new Shokupan();
            app.use(Cors({ origin: ["https://example.com"] }));

            app.get("/api/data", (ctx) => ctx.json({ data: "test" }));

            const res = await app.testRequest({
                path: "/api/data",
                headers: {
                    "origin": "HTTPS://EXAMPLE.COM"
                }
            });

            expect(res.status).toBe(200);
            expect(res.headers["access-control-allow-origin"]).toBe("HTTPS://EXAMPLE.COM");
        });

        test("should reject origins not in whitelist", async () => {
            const app = new Shokupan();
            app.use(Cors({ origin: ["https://trusted.com"] }));

            app.get("/api/data", (ctx) => ctx.json({ data: "test" }));

            const res = await app.testRequest({
                path: "/api/data",
                headers: {
                    "origin": "https://evil.com"
                }
            });

            expect(res.status).toBe(200);
            expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        });
    });

    describe("CVE-8: Rate Limit IP Spoofing Protection", () => {
        test("should not trust X-Forwarded-For without trusted proxies", async () => {
            const app = new Shokupan();

            const ips: string[] = [];
            app.use(RateLimitMiddleware({
                max: 1,
                keyGenerator: (ctx) => {
                    const ip = ctx.headers.get("x-forwarded-for") || "default";
                    ips.push(ip);
                    return ip;
                }
            }));

            app.get("/test", (ctx) => ctx.text("ok"));

            await app.testRequest({
                path: "/test",
                headers: { "x-forwarded-for": "1.2.3.4" }
            });

            expect(ips[0]).toBe("1.2.3.4");
        });

        test("should parse X-Forwarded-For correctly with trusted proxies", async () => {
            const app = new Shokupan();

            const detectedIPs: string[] = [];
            app.use(RateLimitMiddleware({
                max: 5,
                trustedProxies: ["10.0.0.1", "10.0.0.2"],
                keyGenerator: (ctx) => {
                    const header = ctx.headers.get("x-forwarded-for");
                    if (header) {
                        const ips = header.split(',').map(ip => ip.trim());
                        for (let i = ips.length - 1; i >= 0; i--) {
                            if (!["10.0.0.1", "10.0.0.2"].includes(ips[i])) {
                                detectedIPs.push(ips[i]);
                                return ips[i];
                            }
                        }
                    }
                    return "unknown";
                }
            }));

            app.get("/test", (ctx) => ctx.text("ok"));

            await app.testRequest({
                path: "/test",
                headers: {
                    "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2"
                }
            });

            expect(detectedIPs[0]).toBe("1.2.3.4");
        });
    });

    describe("CVE-9: Cookie Injection Protection", () => {
        test("should reject invalid cookie domain for different host", () => {
            const isValidCookieDomain = (domain: string, currentHost: string): boolean => {
                const hostWithoutPort = currentHost.split(':')[0];
                if (domain === hostWithoutPort) return true;
                if (domain.startsWith('.')) {
                    const domainWithoutDot = domain.slice(1);
                    return hostWithoutPort.endsWith(domainWithoutDot);
                }
                return false;
            };

            expect(isValidCookieDomain("evil.com", "example.com")).toBe(false);
            expect(isValidCookieDomain("example.com", "example.com")).toBe(true);
            expect(isValidCookieDomain(".example.com", "sub.example.com")).toBe(true);
            expect(isValidCookieDomain(".example.com", "other.com")).toBe(false);
        });
    });

    describe("CVE-5: SSRF Protection", () => {
        test("should block private IP addresses by default", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "http://127.0.0.1:6379"
                }));
            }).toThrow("Proxying to private IP addresses is not allowed");
        });

        test("should block 10.x.x.x range", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "http://10.0.0.1"
                }));
            }).toThrow("Proxying to private IP addresses is not allowed");
        });

        test("should block 192.168.x.x range", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "http://192.168.1.1"
                }));
            }).toThrow("Proxying to private IP addresses is not allowed");
        });

        test("should block 172.16-31.x.x range", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "http://172.16.0.1"
                }));
            }).toThrow("Proxying to private IP addresses is not allowed");
        });

        test("should reject non-http/https protocols", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "file:///etc/passwd",
                    allowPrivateIPs: true
                }));
            }).toThrow("Invalid proxy target protocol");
        });

        test("should allow private IPs when explicitly enabled", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "http://192.168.1.1",
                    allowPrivateIPs: true
                }));
            }).not.toThrow();
        });

        test("should enforce hostname whitelist", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "https://evil.com",
                    allowedHosts: ["api.trusted.com"]
                }));
            }).toThrow("not in the allowed hosts list");
        });

        test("should allow whitelisted hosts", () => {
            expect(() => {
                new Shokupan().use(Proxy({
                    target: "https://api.trusted.com",
                    allowedHosts: ["api.trusted.com"]
                }));
            }).not.toThrow();
        });
    });

    describe("Integration: Multiple Security Layers", () => {
        test("should handle multiple security checks correctly", async () => {
            const app = new Shokupan();

            app.use(Cors({ origin: ["https://trusted.com"] }));
            app.use(RateLimitMiddleware({ max: 10 }));

            app.get("/api/data", (ctx) => {
                const query = ctx.query;
                const hasProtoKey = Object.keys(query).includes('__proto__');
                return ctx.json({
                    queryKeys: Object.keys(query),
                    hasProtoKey
                });
            });

            const res = await app.testRequest({
                path: "/api/data?__proto__[isAdmin]=true&name=test",
                headers: {
                    "origin": "https://trusted.com"
                }
            });

            expect(res.status).toBe(200);
            expect(res.data.hasProtoKey).toBe(false);
            expect(res.data.queryKeys).toContain("name");
            expect(res.data.queryKeys).not.toContain("__proto__");
            const corsHeader = res.headers["access-control-allow-origin"];
            expect(corsHeader).toBe("https://trusted.com");
        });
    });
});
