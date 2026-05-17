import { describe, expect, it } from "bun:test";
import { Shokupan } from "../../shokupan";

describe("Security: Multipart Request Validation", () => {
    it("should reject multipart request without Content-Length", async () => {
        const app = new Shokupan();
        app.post('/upload', async (ctx) => {
            const body = await ctx.body();
            return { success: true };
        });

        const res = await app.testRequest({
            method: 'POST',
            path: '/upload',
            headers: {
                'content-type': 'multipart/form-data; boundary=---boundary'
            },
            body: '---boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\ntest\r\n---boundary--'
        });

        expect(res.status).toBe(411);
        await app.stop();
    });

    it("should accept multipart request with valid Content-Length", async () => {
        const app = new Shokupan({ development: true });
        app.post('/upload', async (ctx) => {
            const body = await ctx.body();
            return { success: true };
        });

        const body = '--boundary\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--boundary--';

        const res = await app.testRequest({
            method: 'POST',
            path: '/upload',
            headers: {
                'content-type': 'multipart/form-data; boundary=boundary',
                'content-length': body.length.toString()
            },
            body: body
        });

        if (res.status === 500) {
            console.log("Error Body:", res.data);
        }
        expect(res.status).toBe(200);
        await app.stop();
    });
});
