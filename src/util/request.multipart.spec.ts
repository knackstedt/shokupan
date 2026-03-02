
import { describe, expect, it } from 'bun:test';
import { Shokupan } from '../shokupan';

describe('Multipart Support', () => {
    it('should parse multipart/form-data', async () => {
        const app = new Shokupan({ development: false });
        app.post('/upload', async (ctx) => {
            const body = await ctx.body<FormData>();
            return ctx.json({
                field: body.get('field'),
                file: (body.get('file') as File)?.name
            });
        });

        const formData = new FormData();
        formData.append('field', 'value');
        formData.append('file', new Blob(['content']), 'test.txt');

        const server = await app.listen(0);
        const res = await fetch(`http://localhost:${server.port}/upload`, {
            method: 'POST',
            body: formData
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({
            field: 'value',
            file: 'test.txt'
        });

        server.stop();
    });

    it('should allow nativeFormData and nativeStream for large files', async () => {
        const app = new Shokupan({ development: false, disableBodyParsing: true });

        app.post('/native-form', async (ctx) => {
            try {
                const formData = await ctx.nativeFormData();
                return ctx.json({
                    file: (formData.get('file') as File)?.name
                });
            } catch (err: any) {
                console.error("native-form error:", err);
                return ctx.text(err.message || 'Error', 500);
            }
        });

        app.post('/native-stream', async (ctx) => {
            const stream = ctx.nativeStream;
            let size = 0;
            if (stream) {
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.length;
                }
            }
            return ctx.json({ size });
        });

        const formData = new FormData();
        formData.append('file', new Blob(['content']), 'test.txt');

        const server = await app.listen(0);

        // Test nativeFormData
        const res1 = await fetch(`http://localhost:${server.port}/native-form`, {
            method: 'POST',
            body: formData
        });
        expect(res1.status).toBe(200);
        expect(await res1.json()).toEqual({ file: 'test.txt' });

        // Test nativeStream
        const res2 = await fetch(`http://localhost:${server.port}/native-stream`, {
            method: 'POST',
            body: "raw streaming body test"
        });
        expect(res2.status).toBe(200);
        expect(await res2.json()).toEqual({ size: 23 });

        server.stop();
    });
});
