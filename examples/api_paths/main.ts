import { ApiExplorerPlugin } from '../../src/plugins/application/api-explorer/plugin';
import { AsyncApiPlugin } from '../../src/plugins/application/asyncapi/plugin';
import { Dashboard } from '../../src/plugins/application/dashboard/plugin';
import { MCPServerPlugin } from '../../src/plugins/application/mcp-server/plugin';
import { ScalarPlugin } from '../../src/plugins/application/scalar';
import { Cors } from '../../src/plugins/middleware/cors';
import { RateLimitMiddleware } from '../../src/plugins/middleware/rate-limit';
import { Shokupan } from '../../src/shokupan';
import { NestedRouter } from '../full/routes/nested_router';
import { ServiceFetchRouter } from '../full/routes/service_fetch';

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

const port = parseInt(process.env['PORT'] || '3000');

const app = new Shokupan({
    port,
    development: true,
    enableOpenApiGen: true,
    enableAsyncLocalStorage: true,
    enableAsyncApiGen: true,
    enableMiddlewareTracking: true,
    surreal: {
        connectOptions: {
            authentication: {
                username: "root",
                password: "root",
            }
        },
        url: "ws://127.0.0.1:8000"
    }
});

app.use(RateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 100 requests per minute
    message: { error: 'Too many requests, please try again later.' },
    headers: true
}));

app.event("trivial", (ctx) => {
    console.log("Trivial event received. We will now hug your face!");
});
app.event("warning", (ctx) => {
    ctx.emit(process.env['FOO'] || 'bar');
});

// Simple websocket echo server
app.event("simple", (ctx) => {
    if (true) {
        ctx.emit("simpleResponse", { message: Date.now() });
    }
    else {
        ctx.emit("simpleResponse", { message: Date.now() });
    }

    ctx.emit("error", { message: "Bad things happened here." });
});
app.event("simple.specialAction", (ctx) => {
    ctx.emit("simpleResponse", { message: Date.now() });
    ctx.emit("simple.specialResponse", { message: Date.now() });
});
app.event("simple/otherDomains", (ctx) => {
    ctx.emit("simple/otherDomainsResponse", { message: Date.now() });
});

app.event("complex/action1", async (ctx) => {
    console.log(await ctx.body());
    ctx.emit("complex/action1Result", { message: Date.now() });
});
app.event("complex/action2", async (ctx) => {
    console.log(await ctx.body());
    ctx.emit("complex/action2Result", { message: Date.now() });
});

app.mount("/nested", NestedRouter);
app.mount("/service", ServiceFetchRouter);

// This will get flagged because this path is random. 
app.get(Math.random().toString(), ctx => {
    ctx.text(ctx.params.param);
});

app.get("/path/:param", ctx => {
    ctx.text(ctx.params.param);
});
app.static("/files", {
    root: __dirname + "/static/files",
    listDirectory: true
});

app.get("/health", {
    summary: "Health Check",
    description: "Server health status"
}, (ctx) => {
    return ctx.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get("/text", ctx => ctx.text("text"));
app.get("/text2", ctx => "text2");
app.get("/json", ctx => ctx.json({ message: "json" }));
app.get("/json2", ctx => ({ message: "json2" }));
app.get("/json3", ctx => ({ message: process.env['FOO'] || 'bar' }));
app.get("/json4", ctx => ctx.json({ message: process.env['FOO'] || 'bar' }));

app.get("/large-json", ctx => ctx.json(performance));
app.get("/large-json2", ctx => ctx.json(process));

app.get("/multiResponseOptions", ctx => {
    if (Math.random() > 0.5) {
        ctx.json({ payload: "version1" });
    } else {
        ctx.json({ message: "version2" });
    }
});

app.get("multipleResponsesAtOnce", (ctx) => {
    if (true) {
        ctx.json({ message: Date.now() });
    }
    else {
        ctx.json({ message: Date.now() });
    }

    ctx.json({ message: "[Chuckles] I'm in danger." });
});

app.use(Cors({ origin: "*" }));
app.register(new Dashboard({ path: "/admin" }));
app.register(new ApiExplorerPlugin({ path: "/openapi" }));
app.register(new AsyncApiPlugin({ path: "/asyncapi" }));
app.register(new ScalarPlugin({ path: "/scalar" }));
app.register(new MCPServerPlugin({
    rootDir: './examples/api_paths'
}));

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║             🍞 Shokupan API Path sample server 🍞             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

🌐 Starting server...
`);

app.listen().then(() => {
    console.log(`
Shokupan Example Server is listening on http://localhost:${port}
    `);
});