import { Shokupan } from 'shokupan';

/**
 * Sample 8: Server-Sent Events (SSE)
 *
 * Demonstrates real-time event streaming using built-in SSE support.
 */

const app = new Shokupan({ port: 3008 });

// Simple in-memory event store for demo
const events: Array<{ id: number; time: string; message: string }> = [];
let eventId = 0;

// Health check
app.get('/health', () => ({ status: 'ok', service: 'sse' }));

// SSE endpoint — streams events to connected clients
app.get('/events', (ctx) => {
    return ctx.streamSSE(async (stream) => {
        // Send initial events
        for (const evt of events.slice(-10)) {
            await stream.writeSSE({
                id: String(evt.id),
                data: JSON.stringify(evt)
            });
        }

        // Stream new events as they happen
        while (true) {
            eventId++;
            const evt = {
                id: eventId,
                time: new Date().toISOString(),
                message: `Server event #${eventId}`
            };
            events.push(evt);

            await stream.writeSSE({
                id: String(evt.id),
                data: JSON.stringify(evt)
            });

            await stream.sleep(2000);
        }
    });
});

// Create a new event (for testing)
app.post('/events', async (ctx) => {
    const body = await ctx.body() as { message?: string };
    eventId++;
    const evt = {
        id: eventId,
        time: new Date().toISOString(),
        message: body.message || `Manual event #${eventId}`
    };
    events.push(evt);
    return { created: evt };
});

// Get recent events as JSON (for non-SSE clients)
app.get('/events/history', () => ({
    events: events.slice(-20)
}));

await app.listen();
console.log('SSE App running on http://localhost:3008');
console.log('Stream:  GET /events (text/event-stream)');
console.log('History: GET /events/history');
console.log('Create:  POST /events { "message": "hello" }');
