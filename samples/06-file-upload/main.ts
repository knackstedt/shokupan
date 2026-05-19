import { Shokupan } from 'shokupan';
import { mkdir, existsSync } from 'fs';
import { join } from 'path';

/**
 * Sample 6: File Upload with Multipart Streaming
 *
 * Demonstrates handling multipart form uploads, file streaming,
 * and serving uploaded files.
 */

const app = new Shokupan({ port: 3006 });

const uploadDir = './uploads';
if (!existsSync(uploadDir)) {
    mkdir(uploadDir, { recursive: true }, () => { });
}

// Health check
app.get('/health', () => ({ status: 'ok', service: 'file-upload' }));

// Upload endpoint — handles multipart form data
app.post('/upload', async (ctx) => {
    const formData = await ctx.request.formData();
    const files: Array<{ name: string; size: number; type: string; saved: string }> = [];

    for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
            const file = value;
            const buffer = Buffer.from(await file.arrayBuffer());
            const filename = `${Date.now()}-${file.name}`;
            const filepath = join(uploadDir, filename);

            await Bun.write(filepath, buffer);

            files.push({
                name: file.name,
                size: file.size,
                type: file.type,
                saved: filename
            });
        }
    }

    return ctx.json({
        message: 'Upload successful',
        files
    });
});

// List uploaded files
app.get('/files', async () => {
    const dir = Bun.file(uploadDir);
    const files: Array<{ name: string; size: number }> = [];

    try {
        for await (const entry of await dir.stream()) {
            const info = await Bun.file(join(uploadDir, entry)).stat();
            files.push({ name: entry, size: info.size });
        }
    } catch {
        // Directory might be empty or not exist
    }

    return { files };
});

// Download a file
app.get('/files/:name', async (ctx) => {
    const filename = ctx.params.name;
    const filepath = join(uploadDir, filename);

    if (!existsSync(filepath)) {
        return ctx.json({ error: 'File not found' }, 404);
    }

    const file = Bun.file(filepath);
    return new Response(file, {
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
});

// Stream a file (for large files)
app.get('/stream/:name', async (ctx) => {
    const filename = ctx.params.name;
    const filepath = join(uploadDir, filename);

    if (!existsSync(filepath)) {
        return ctx.json({ error: 'File not found' }, 404);
    }

    const file = Bun.file(filepath);
    return ctx.pipe(file.stream());
});

await app.listen();
console.log('File Upload App running on http://localhost:3006');
console.log('Upload: POST /upload with multipart form');
console.log('List:   GET /files');
console.log('Stream: GET /stream/:name');
