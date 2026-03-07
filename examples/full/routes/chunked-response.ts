import { ShokupanRouter } from '../../../src/router';

const router = new ShokupanRouter();

/**
 * Example endpoint that demonstrates chunked transfer encoding.
 * This endpoint sends a large JSON response in chunks with delays between them,
 * allowing the dashboard to track chunk timings.
 */
router.get('/chunked-large-data', async (ctx) => {
    // Track chunk timings manually
    const chunkTimings: Array<{ timestamp: number; size: number; duration: number }> = [];
    let lastChunkTime = Date.now();
    
    // Generate a large dataset to send in chunks
    const generateChunk = (chunkIndex: number, itemsPerChunk: number) => {
        const items = [];
        for (let i = 0; i < itemsPerChunk; i++) {
            const id = chunkIndex * itemsPerChunk + i;
            items.push({
                id,
                name: `Item ${id}`,
                description: `This is a detailed description for item ${id}. It contains some text to make the payload larger.`,
                timestamp: Date.now(),
                metadata: {
                    category: `Category ${id % 10}`,
                    tags: [`tag${id % 5}`, `tag${id % 7}`, `tag${id % 3}`],
                    score: Math.random() * 100,
                    active: id % 2 === 0
                }
            });
        }
        return items;
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const totalChunks = 5;
            const itemsPerChunk = 100;

            // Send opening bracket
            const openingData = encoder.encode('{"data":[');
            controller.enqueue(openingData);
            
            const now = Date.now();
            chunkTimings.push({
                timestamp: now,
                size: openingData.length,
                duration: now - lastChunkTime
            });
            lastChunkTime = now;

            for (let i = 0; i < totalChunks; i++) {
                // Simulate processing delay between chunks
                await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

                const chunk = generateChunk(i, itemsPerChunk);
                const chunkJson = JSON.stringify(chunk).slice(1, -1); // Remove array brackets
                
                let chunkData;
                if (i > 0) {
                    chunkData = encoder.encode(',' + chunkJson);
                } else {
                    chunkData = encoder.encode(chunkJson);
                }
                
                controller.enqueue(chunkData);
                
                const chunkNow = Date.now();
                chunkTimings.push({
                    timestamp: chunkNow,
                    size: chunkData.length,
                    duration: chunkNow - lastChunkTime
                });
                lastChunkTime = chunkNow;
            }

            // Send closing bracket and metadata
            const metadata = {
                total: totalChunks * itemsPerChunk,
                chunks: totalChunks,
                generatedAt: new Date().toISOString()
            };
            const closingData = encoder.encode(`],"metadata":${JSON.stringify(metadata)}}`);
            controller.enqueue(closingData);
            
            const finalNow = Date.now();
            chunkTimings.push({
                timestamp: finalNow,
                size: closingData.length,
                duration: finalNow - lastChunkTime
            });
            
            // Store chunk timings in context for dashboard to capture
            (ctx as any)._chunkTimings = chunkTimings;
            
            controller.close();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
            'X-Content-Type-Options': 'nosniff'
        }
    });
});

/**
 * Example endpoint that demonstrates Server-Sent Events (SSE) streaming.
 * This sends events over time, which should be detected as a streamed response.
 * The framework automatically tracks chunk timings for SSE streams.
 */
router.get('/stream-events', async (ctx) => {
    return ctx.streamSSE(async (stream) => {
        const events = [
            { event: 'connection', data: JSON.stringify({ message: 'Stream started' }) },
            { event: 'progress', data: JSON.stringify({ message: 'Processing batch 1', progress: 20 }) },
            { event: 'progress', data: JSON.stringify({ message: 'Processing batch 2', progress: 40 }) },
            { event: 'progress', data: JSON.stringify({ message: 'Processing batch 3', progress: 60 }) },
            { event: 'progress', data: JSON.stringify({ message: 'Processing batch 4', progress: 80 }) },
            { event: 'progress', data: JSON.stringify({ message: 'Processing complete', progress: 100 }) },
            { event: 'done', data: JSON.stringify({ message: 'Stream finished' }) }
        ];

        for (const event of events) {
            await stream.sleep(500);
            await stream.writeSSE(event);
        }
    });
});

/**
 * Example endpoint that streams a large text file line by line.
 * The framework automatically tracks chunk timings for text streams.
 */
router.get('/stream-text', async (ctx) => {
    return ctx.streamText(async (stream) => {
        const lines = 50;
        
        for (let i = 1; i <= lines; i++) {
            await stream.sleep(100);
            await stream.write(`Line ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n`);
        }
    });
});

/**
 * Regular endpoint for comparison (non-chunked).
 */
router.get('/regular-data', async (ctx) => {
    const items = [];
    for (let i = 0; i < 500; i++) {
        items.push({
            id: i,
            name: `Item ${i}`,
            description: `Description for item ${i}`,
            timestamp: Date.now()
        });
    }

    return ctx.json({
        data: items,
        metadata: {
            total: items.length,
            generatedAt: new Date().toISOString()
        }
    });
});

export const ChunkedResponseRouter = router;

