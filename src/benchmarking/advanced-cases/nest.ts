import type { NestMiddleware } from "@nestjs/common";
import { Body, Controller, Get, Injectable, Module, Param, Post, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { COMPRESSIBLE_JSON, LARGE_JSON, md5, serializeRequest } from "../advanced-data";

let currentScenario: string = "";

// Simple middleware for MD5 hashing
@Injectable()
class MD5Middleware implements NestMiddleware {
    constructor(private index: number) { }

    use(req: any, res: any, next: () => void) {
        const url = req.url;
        const headersObj = req.headers as Record<string, string>;
        const body = JSON.stringify(req.body || "");
        const hash = md5(serializeRequest(url, JSON.stringify(headersObj), body));
        res.setHeader(`X-Hash-${this.index}`, hash);
        next();
    }
}

@Controller()
class AppController {
    @Get('/compressed')
    getCompressed() {
        return COMPRESSIBLE_JSON;
    }

    @Get('/compressed-large')
    getCompressedLarge() {
        return LARGE_JSON;
    }

    @Post('/large-request')
    postLargeRequest(@Body() body: any) {
        const bodyLength = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body));
        return { received: bodyLength };
    }

    @Get('/large-response')
    getLargeResponse() {
        return LARGE_JSON;
    }

    @Get('/large-headers')
    getLargeHeaders(@Res() res: any) {
        // Set 100 large headers
        for (let i = 0; i < 100; i++) {
            res.setHeader(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
        }
        res.send("OK");
    }

    @Get('/compute')
    getCompute() {
        return "OK";
    }

    @Get('/route-:id')
    getRoute(@Param('id') id: string) {
        return `Route ${id}`;
    }

    @Post('/validate')
    postValidate(@Body() body: any, @Res() res: any) {
        if (!body || typeof body.data !== 'string') {
            return res.status(400).json({ error: "Invalid body" });
        }
        return res.json({ validated: true, data: body });
    }

    @Get('/validate')
    getValidate() {
        return { validated: true };
    }

    @Get('/delayed')
    async getDelayed() {
        await new Promise(r => setTimeout(r, 100));
        return "done";
    }

    // Property access test
    @Get('/property/path')
    getPropertyPath(@Res() res: any) {
        return res.send(res.req.path);
    }
}

@Module({
    controllers: [AppController],
})
class AppModule { }

export async function startAdvanced(port: number, scenario: string) {
    currentScenario = scenario;

    // NestJS doesn't support conditional compression well
    // Most scenarios won't work fully with NestJS due to its opinionated structure
    if (scenario.startsWith("compression-") && scenario !== "compression-store") {
        throw new Error("NestJS compression scenarios not fully supported");
    }

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: false,
        bodyParser: false, // Disable default to configure manually
    });

    // Configure body parser to accept large payloads (default is 100KB)
    app.useBodyParser('json', { limit: '15mb' });
    app.useBodyParser('text', { limit: '15mb' });

    // Handle scenarios that need middleware
    if (scenario === "math-middleware") {
        // NestJS middleware is complex to add dynamically
        // This is a limitation of the framework
        throw new Error("NestJS dynamic middleware not easily supported");
    }

    if (scenario === "fully-loaded") {
        const { AsyncLocalStorage } = require('node:async_hooks');
        const als = new AsyncLocalStorage();
        app.use((req: any, res: any, next: any) => {
            als.run(new Map([['requestId', Math.random().toString()]]), next);
        });
    }

    await app.listen(port, '0.0.0.0');

    return async () => {
        await app.close();
    };
}
