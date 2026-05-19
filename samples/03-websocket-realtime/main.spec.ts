import { describe, expect, it } from 'bun:test';

describe('Sample 3: WebSocket Realtime', () => {
    it('should import ShokupanWebsocketRouter', async () => {
        const { ShokupanWebsocketRouter } = await import('shokupan');
        expect(ShokupanWebsocketRouter).toBeDefined();
    });

    it('should create a websocket router', async () => {
        const { ShokupanWebsocketRouter } = await import('shokupan');
        const router = new ShokupanWebsocketRouter();
        expect(router).toBeInstanceOf(ShokupanWebsocketRouter);
    });
});
