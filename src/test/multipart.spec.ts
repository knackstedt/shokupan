
import { describe, expect, it } from 'bun:test';
import { Convection } from '../convect';

describe('Multipart Support', () => {
    it('should parse multipart/form-data', async () => {
        const app = new Convection();
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

        const server = app.listen(0);
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
});
