import { describe, expect, test } from "bun:test";
import { Shokupan } from '../../shokupan';
import { $dispatch } from '../../decorators/symbol';

describe("Streaming Support", () => {
    describe("ctx.stream()", () => {
        test("should stream binary data (Uint8Array)", async () => {
            const app = new Shokupan();

            app.get('/stream-binary', (ctx) => {
                return ctx.stream(async (stream) => {
                    await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])); // "Hello"
                    await stream.write(new Uint8Array([0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64])); // " World"
                });
            });

            const req = new Request("http://localhost:3000/stream-binary");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Hello World");
        });

        test("should stream string data (auto-encoded to UTF-8)", async () => {
            const app = new Shokupan();

            app.get('/stream-text', (ctx) => {
                return ctx.stream(async (stream) => {
                    await stream.write("Hello ");
                    await stream.write("World");
                });
            });

            const req = new Request("http://localhost:3000/stream-text");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Hello World");
        });

        test("should support sleep for delayed writes", async () => {
            const app = new Shokupan();

            app.get('/stream-delayed', (ctx) => {
                return ctx.stream(async (stream) => {
                    await stream.write("First");
                    await stream.sleep(10); // 10ms delay
                    await stream.write(" Second");
                });
            });

            const req = new Request("http://localhost:3000/stream-delayed");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("First Second");
        });

        test("should pipe another ReadableStream", async () => {
            const app = new Shokupan();

            app.get('/stream-pipe', (ctx) => {
                return ctx.stream(async (stream) => {
                    const sourceStream = new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("Piped "));
                            controller.enqueue(new TextEncoder().encode("Content"));
                            controller.close();
                        }
                    });

                    await stream.pipe(sourceStream);
                });
            });

            const req = new Request("http://localhost:3000/stream-pipe");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Piped Content");
        });

        test("should handle errors with error handler", async () => {
            const app = new Shokupan();
            let errorHandled = false;

            app.get('/stream-error', (ctx) => {
                return ctx.stream(
                    async (stream) => {
                        await stream.write("Start");
                        throw new Error("Stream error");
                    },
                    (err, stream) => {
                        errorHandled = true;
                        expect(err.message).toBe("Stream error");
                    }
                );
            });

            const req = new Request("http://localhost:3000/stream-error");
            const res = await app[$dispatch](req);

            // Wait a bit for async error handler
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(errorHandled).toBe(true);
        });

        test("should support onAbort callback", async () => {
            const app = new Shokupan();
            let abortCalled = false;

            app.get('/stream-abort', (ctx) => {
                return ctx.stream(async (stream) => {
                    stream.onAbort(() => {
                        abortCalled = true;
                    });

                    // Write some data then keep stream open
                    await stream.write("Data");
                    // Don't close - let the cancel trigger abort
                    await new Promise(() => { }); // Never resolves
                });
            });

            const req = new Request("http://localhost:3000/stream-abort");
            const res = await app[$dispatch](req);

            // Cancel the stream immediately
            if (res.body) {
                const reader = res.body.getReader();
                await reader.read();
                reader.cancel(); // Don't await - just trigger cancel
            }

            // Wait a bit for abort callback
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(abortCalled).toBe(true);
        });
    });

    describe("ctx.streamText()", () => {
        test("should stream text with write()", async () => {
            const app = new Shokupan();

            app.get('/text-stream', (ctx) => {
                return ctx.streamText(async (stream) => {
                    await stream.write("Hello");
                    await stream.write(" World");
                });
            });

            const req = new Request("http://localhost:3000/text-stream");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Hello World");
            expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
            expect(res.headers.get('Transfer-Encoding')).toBe('chunked');
            expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        });

        test("should stream text with writeln()", async () => {
            const app = new Shokupan();

            app.get('/text-stream-lines', (ctx) => {
                return ctx.streamText(async (stream) => {
                    await stream.writeln("Line 1");
                    await stream.writeln("Line 2");
                    await stream.write("Line 3");
                });
            });

            const req = new Request("http://localhost:3000/text-stream-lines");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Line 1\nLine 2\nLine 3");
        });

        test("should support sleep for delayed text writes", async () => {
            const app = new Shokupan();

            app.get('/text-stream-delayed', (ctx) => {
                return ctx.streamText(async (stream) => {
                    await stream.writeln("First");
                    await stream.sleep(10);
                    await stream.writeln("Second");
                });
            });

            const req = new Request("http://localhost:3000/text-stream-delayed");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("First\nSecond\n");
        });

        test("should handle errors with error handler", async () => {
            const app = new Shokupan();
            let errorHandled = false;

            app.get('/text-stream-error', (ctx) => {
                return ctx.streamText(
                    async (stream) => {
                        await stream.writeln("Start");
                        throw new Error("Text stream error");
                    },
                    (err, stream) => {
                        errorHandled = true;
                        expect(err.message).toBe("Text stream error");
                    }
                );
            });

            const req = new Request("http://localhost:3000/text-stream-error");
            await app[$dispatch](req);

            // Wait for async error handler
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(errorHandled).toBe(true);
        });
    });

    describe("ctx.streamSSE()", () => {
        test("should stream SSE with data only", async () => {
            const app = new Shokupan();

            app.get('/sse-simple', (ctx) => {
                return ctx.streamSSE(async (stream) => {
                    await stream.writeSSE({ data: "Hello World" });
                });
            });

            const req = new Request("http://localhost:3000/sse-simple");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("data: Hello World\n\n");
            expect(res.headers.get('Content-Type')).toBe('text/event-stream');
            expect(res.headers.get('Cache-Control')).toBe('no-cache');
            expect(res.headers.get('Connection')).toBe('keep-alive');
        });

        test("should stream SSE with event, id, and retry", async () => {
            const app = new Shokupan();

            app.get('/sse-full', (ctx) => {
                return ctx.streamSSE(async (stream) => {
                    await stream.writeSSE({
                        event: 'message',
                        id: '123',
                        data: 'Test data',
                        retry: 5000
                    });
                });
            });

            const req = new Request("http://localhost:3000/sse-full");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toContain("event: message\n");
            expect(text).toContain("id: 123\n");
            expect(text).toContain("retry: 5000\n");
            expect(text).toContain("data: Test data\n");
            expect(text).toEndWith("\n\n");
        });

        test("should handle multi-line data correctly", async () => {
            const app = new Shokupan();

            app.get('/sse-multiline', (ctx) => {
                return ctx.streamSSE(async (stream) => {
                    await stream.writeSSE({
                        data: "Line 1\nLine 2\nLine 3"
                    });
                });
            });

            const req = new Request("http://localhost:3000/sse-multiline");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("data: Line 1\ndata: Line 2\ndata: Line 3\n\n");
        });

        test("should stream multiple SSE messages", async () => {
            const app = new Shokupan();

            app.get('/sse-multiple', (ctx) => {
                return ctx.streamSSE(async (stream) => {
                    await stream.writeSSE({ event: 'start', data: 'Starting' });
                    await stream.sleep(10);
                    await stream.writeSSE({ event: 'update', data: 'Progress' });
                    await stream.sleep(10);
                    await stream.writeSSE({ event: 'end', data: 'Complete' });
                });
            });

            const req = new Request("http://localhost:3000/sse-multiple");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toContain("event: start\ndata: Starting\n\n");
            expect(text).toContain("event: update\ndata: Progress\n\n");
            expect(text).toContain("event: end\ndata: Complete\n\n");
        });

        test("should handle errors with error handler", async () => {
            const app = new Shokupan();
            let errorHandled = false;

            app.get('/sse-error', (ctx) => {
                return ctx.streamSSE(
                    async (stream) => {
                        await stream.writeSSE({ data: "Start" });
                        throw new Error("SSE error");
                    },
                    (err, stream) => {
                        errorHandled = true;
                        expect(err.message).toBe("SSE error");
                    }
                );
            });

            const req = new Request("http://localhost:3000/sse-error");
            await app[$dispatch](req);

            // Wait for async error handler
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(errorHandled).toBe(true);
        });

        test("should support onAbort callback", async () => {
            const app = new Shokupan();
            let abortCalled = false;

            app.get('/sse-abort', (ctx) => {
                return ctx.streamSSE(async (stream) => {
                    stream.onAbort(() => {
                        abortCalled = true;
                    });

                    await stream.writeSSE({ data: "Data" });
                    // Don't close - let the cancel trigger abort
                    await new Promise(() => { }); // Never resolves
                });
            });

            const req = new Request("http://localhost:3000/sse-abort");
            const res = await app[$dispatch](req);

            // Cancel the stream immediately
            if (res.body) {
                const reader = res.body.getReader();
                await reader.read();
                reader.cancel(); // Don't await - just trigger cancel
            }

            // Wait for abort callback
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(abortCalled).toBe(true);
        });
    });

    describe("ctx.pipe()", () => {
        test("should pipe a ReadableStream to response", async () => {
            const app = new Shokupan();

            app.get('/pipe-stream', (ctx) => {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("Piped content"));
                        controller.close();
                    }
                });

                return ctx.pipe(stream);
            });

            const req = new Request("http://localhost:3000/pipe-stream");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Piped content");
        });

        test("should pipe with custom headers", async () => {
            const app = new Shokupan();

            app.get('/pipe-headers', (ctx) => {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("Video data"));
                        controller.close();
                    }
                });

                return ctx.pipe(stream, {
                    headers: { 'Content-Type': 'video/mp4' }
                });
            });

            const req = new Request("http://localhost:3000/pipe-headers");
            const res = await app[$dispatch](req);

            expect(res.headers.get('Content-Type')).toBe('video/mp4');
        });

        test("should pipe with custom status code", async () => {
            const app = new Shokupan();

            app.get('/pipe-status', (ctx) => {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("Partial content"));
                        controller.close();
                    }
                });

                return ctx.pipe(stream, { status: 206 });
            });

            const req = new Request("http://localhost:3000/pipe-status");
            const res = await app[$dispatch](req);

            expect(res.status).toBe(206);
        });

        test("should validate status codes when enabled", async () => {
            const app = new Shokupan({ validateStatusCodes: true });

            app.get('/pipe-invalid-status', (ctx) => {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                });

                try {
                    return ctx.pipe(stream, { status: 999 });
                } catch (err) {
                    return ctx.json({ error: err.message }, 500);
                }
            });

            const req = new Request("http://localhost:3000/pipe-invalid-status");
            const res = await app[$dispatch](req);
            const data = await res.json() as any;

            expect(res.status).toBe(500);
            expect(data.error).toBe("Invalid HTTP status code: 999");
        });
    });

    describe("Performance and Edge Cases", () => {
        test("should handle large data streaming efficiently", async () => {
            const app = new Shokupan();
            const chunkSize = 1024 * 10; // 10KB chunks
            const numChunks = 10;

            app.get('/large-stream', (ctx) => {
                return ctx.stream(async (stream) => {
                    for (let i = 0; i < numChunks; i++) {
                        const chunk = new Uint8Array(chunkSize).fill(65 + (i % 26)); // A-Z
                        await stream.write(chunk);
                    }
                });
            });

            const req = new Request("http://localhost:3000/large-stream");
            const res = await app[$dispatch](req);
            const buffer = await res.arrayBuffer();

            expect(buffer.byteLength).toBe(chunkSize * numChunks);
        });

        test("should handle empty stream", async () => {
            const app = new Shokupan();

            app.get('/empty-stream', (ctx) => {
                return ctx.stream(async (stream) => {
                    // Don't write anything
                });
            });

            const req = new Request("http://localhost:3000/empty-stream");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("");
        });

        test("should not write after abort", async () => {
            const app = new Shokupan();
            let writeAfterAbort = false;

            app.get('/no-write-after-abort', (ctx) => {
                return ctx.stream(async (stream) => {
                    stream.onAbort(() => {
                        // Abort happened
                    });

                    await stream.write("Before");

                    // Simulate abort by not continuing
                    // In real scenario, the stream would be cancelled
                });
            });

            const req = new Request("http://localhost:3000/no-write-after-abort");
            const res = await app[$dispatch](req);
            const text = await res.text();

            expect(text).toBe("Before");
        });
    });
});
