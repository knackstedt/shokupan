import express from "express";
import { COMPRESSIBLE_JSON, LARGE_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const app = express();
    app.use(express.json({ limit: '50mb' }));

    switch (scenario) {
        case "compression-gzip":
        case "compression-deflate":
            // Express compression middleware
            const compression = require('compression');
            app.use(compression());
            app.get("/compressed", (req, res) => {
                res.json(COMPRESSIBLE_JSON);
            });
            app.get("/compressed-large", (req, res) => {
                res.json(LARGE_JSON);
            });
            break;

        case "compression-brotli":
        case "compression-zstd":
            // Express compression doesn't support brotli/zstd by default
            throw new Error("Express compression middleware doesn't support brotli/zstd");

        case "compression-store":
            app.get("/compressed", (req, res) => {
                res.json(COMPRESSIBLE_JSON);
            });
            app.get("/compressed-large", (req, res) => {
                res.json(LARGE_JSON);
            });
            break;

        case "large-payload-request":
            app.use(express.text({ limit: '50mb', type: 'text/plain' }));
            app.post("/large-request", (req, res) => {
                const bodyLength = typeof req.body === 'string' ? req.body.length : Buffer.byteLength(req.body || '');
                res.json({ received: bodyLength });
            });
            break;

        case "large-payload-response":
            app.get("/large-response", (req, res) => {
                res.json(LARGE_JSON);
            });
            break;

        case "large-payload-headers":
            app.get("/large-headers", (req, res) => {
                for (let i = 0; i < 100; i++) {
                    res.setHeader(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                }
                res.send("OK");
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                app.use((req, res, next) => {
                    const url = req.url;
                    const headers = JSON.stringify(req.headers);
                    const body = JSON.stringify(req.body || "");
                    const hash = md5(serializeRequest(url, headers, body));
                    res.setHeader(`X-Hash-${i}`, hash);
                    next();
                });
            }
            app.get("/compute", (req, res) => {
                res.send("OK");
            });
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                app.get(`/route-${i}`, (req, res) => {
                    res.send(`Route ${i}`);
                });
            }
            break;

        case "fully-loaded":
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            app.use((req, res, next) => {
                als.run(new Map([['requestId', Math.random().toString()]]), next);
            });

            app.use((req, res, next) => {
                if (req.method === "POST") {
                    const body = req.body as any;
                    if (!body || typeof body.data !== 'string') {
                        return res.status(400).json({ error: "Invalid body" });
                    }
                }
                next();
            });

            app.post("/validate", (req, res) => {
                res.json({ validated: true, data: req.body });
            });
            app.get("/validate", (req, res) => {
                res.json({ validated: true });
            });
            break;

        case "long-pending":
            app.get("/delayed", async (req, res) => {
                await new Promise(r => setTimeout(r, 100));
                res.send("done");
            });
            break;

        // Property access test
        case "property-access":
            app.get("/property/path", (req, res) => {
                res.send(req.path);
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    const server = app.listen(port);

    return async () => {
        server.close();
    };
}
