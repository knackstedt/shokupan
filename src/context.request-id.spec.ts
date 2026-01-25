import { describe, expect, it } from "bun:test";
import { ShokupanContext } from "./context";
import { Shokupan } from "./shokupan";
import { ShokupanRequest } from './util/request';

describe('Request ID Generator', () => {
    it('should use default nanoid generator when not configured', () => {
        const app = new Shokupan();
        const req = new ShokupanRequest({ method: 'GET', url: 'http://localhost/' });
        const ctx = new ShokupanContext(req, undefined, undefined, app);

        expect(ctx.requestId).toBeString();
        // Nanoid default length is 21
        expect(ctx.requestId.length).toBe(21);
    });

    it('should use custom generator when configured', () => {
        const customId = "custom-id-123";
        const app = new Shokupan({
            idGenerator: () => customId
        });
        const req = new ShokupanRequest({ method: 'GET', url: 'http://localhost/' });
        const ctx = new ShokupanContext(req, undefined, undefined, app);

        expect(ctx.requestId).toBe(customId);
    });

    it('should use custom generator returning different values', () => {
        let counter = 0;
        const app = new Shokupan({
            idGenerator: () => `req-${++counter}`
        });

        const req1 = new ShokupanRequest({ method: 'GET', url: 'http://localhost/' });
        const ctx1 = new ShokupanContext(req1, undefined, undefined, app);
        expect(ctx1.requestId).toBe('req-1');

        const req2 = new ShokupanRequest({ method: 'GET', url: 'http://localhost/' });
        const ctx2 = new ShokupanContext(req2, undefined, undefined, app);
        expect(ctx2.requestId).toBe('req-2');
    });

    // Test that the ID is cached on the context
    it('should cache whatever ID is generated', () => {
        let counter = 0;
        const app = new Shokupan({
            idGenerator: () => `req-${++counter}`
        });

        const req = new ShokupanRequest({ method: 'GET', url: 'http://localhost/' });
        const ctx = new ShokupanContext(req, undefined, undefined, app);

        // First access triggers generation
        const id1 = ctx.requestId;
        expect(id1).toBe('req-1');

        // Second access should return the same cached ID, not increment counter
        const id2 = ctx.requestId;
        expect(id2).toBe('req-1');

        // Counter should still be 1
        expect(counter).toBe(1);
    });
});
