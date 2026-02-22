---
title: Multipart Streaming
description: Learn how to handle large file uploads without buffering the entire payload into memory.
---

Shokupan handles most `multipart/form-data` requests automatically and exposes them conveniently via `await ctx.body<FormData>()`. 
However, by default, the framework will buffer the entire body into memory to enforce `maxBodySize` constraints before parsing. 
This is usually fine for small forms, but if you are handling large files (e.g., hundreds of megabytes or gigabytes), buffering 
the entire file in memory can crash your application or severely degrade performance.

To support large file uploads natively, Shokupan enables you to bypass automatic body parsing and stream chunks directly 
to disk leveraging Bun's native disk-backed streaming.

## 1. Disable Automatic Body Parsing

You must first disable the eagerly parsed `maxBodySize` constraints for the routes that accept large files, otherwise the framework will try to read the entire request stream before your handler runs to verify the payload size. 

Currently, this is a global flag on the application configuration. In the future, this may be configurable per-route.

```typescript
import { Shokupan } from '@dotglitch/shokupan';

const app = new Shokupan({
    disableBodyParsing: true
});
```

*Note: Enforcing upload limits while `disableBodyParsing` is active is up to your application logic.*

## 2. Use `ctx.nativeFormData()`

Inside your route handler, use `ctx.nativeFormData()` instead of `ctx.body()`. 

`nativeFormData()` exposes the underlying JS runtime's `FormData` parser directly. Bun natively parses the boundary stream in C++ and automatically writes substantial file chunks directly to a temporary disk location behind the scenes to avoid consuming memory.

```typescript
app.post('/upload', async (ctx) => {
    // Bun will stream the large file to disk under the hood
    const formData = await ctx.nativeFormData();
    
    // The File object acts as a disk-backed Blob
    const file = formData.get('myLargeFile') as File;
    
    if (!file) {
        return ctx.text('Missing file', 400);
    }
    
    console.log(`Received file: ${file.name}, size: ${file.size} bytes`);
    
    // Example: Copy the temporary disk-backed file to its final destination
    // e.g. using Bun.write
    await Bun.write(`./uploads/${file.name}`, file);

    return ctx.json({ success: true });
});
```

## Advanced: Accessing the Raw Stream

If you want absolute control and wish to avoid even the temporary disk-backing behavior (e.g., streaming the bytes immediately to an S3 bucket as they arrive), you can access the raw HTTP request stream directly using `ctx.nativeStream`.

```typescript
app.post('/stream-to-s3', async (ctx) => {
    const rawStream = ctx.nativeStream; // ReadableStream<Uint8Array> | null
    
    if (!rawStream) return ctx.text('Empty body', 400);

    // Provide the stream to your cloud provider sdk
    await s3Client.upload({
        Bucket: 'my-bucket',
        Key: 'large-upload.bin',
        Body: rawStream
    });
    
    return ctx.json({ uploaded: true });
})
```

By combining `disableBodyParsing` with `ctx.nativeStream` or `ctx.nativeFormData()`, you gain complete control over how memory and disk resources are utilized for large requests.
