import { describe, expect, it } from 'bun:test';

describe('Sample 3: WebSocket Realtime', () => {
    it('should import ShokupanWebsocketRouter', async () => {
        const { ShokupanWebsocketRouter } = await import('../../src/index');
        expect(ShokupanWebsocketRouter).toBeDefined();
    }, { timeout: 15000 });

    it('should create a websocket router', async () => {
        const { ShokupanWebsocketRouter } = await import('../../src/index');
        const router = new ShokupanWebsocketRouter();
        expect(router).toBeInstanceOf(ShokupanWebsocketRouter);
    }, { timeout: 15000 });
});
