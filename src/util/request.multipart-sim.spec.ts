
import { describe, expect, it } from 'bun:test';
import { Shokupan } from '../shokupan';

describe('Multipart Support (Simulation)', () => {
    it('should parse multipart/form-data in processRequest', async () => {
        const app = new Shokupan();
        app.post('/upload', async (ctx) => {
            const body = await ctx.body<FormData>();
            // If body is just a string, these won't exist
            if (!(body instanceof FormData)) {
                throw new Error('Body is not FormData');
            }
            return ctx.json({
                field: body.get('field'),
                file: (body.get('file') as File)?.name
            });
        });

        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="field"',
            '',
            'value',
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="test.txt"',
            'Content-Type: text/plain',
            '',
            'content',
            `--${boundary}--`
        ].join('\r\n');

        const res = await app.testRequest({
            method: 'POST',
            url: '/upload',
            headers: {
                'content-type': `multipart/form-data; boundary=${boundary}`,
                'content-length': body.length.toString()
            },
            body: body
        });

        expect(res.status).toBe(200);
        expect(res.data).toEqual({
            field: 'value',
            file: 'test.txt'
        });
    });
});
