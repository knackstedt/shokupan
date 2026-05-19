import { Shokupan, ShokupanWebsocketRouter } from 'shokupan';

/**
 * Sample 3: WebSocket Real-time App
 *
 * Demonstrates ShokupanWebsocketRouter for real-time messaging
 * with typed events and broadcast capabilities.
 */

interface ChatMessage {
    username: string;
    text: string;
    timestamp: number;
}

const messageHistory: ChatMessage[] = [];

const wsRouter = new ShokupanWebsocketRouter();

wsRouter.event('chat.join', (ctx) => {
    ctx.emit('chat.system', { text: 'Welcome to the chat! Type a message to begin.' });
});

wsRouter.event('chat.message', async (ctx) => {
    const data = await ctx.body();
    if (!data || !data.text) {
        ctx.emit('chat.error', { text: 'Message text is required' });
        return;
    }

    const msg: ChatMessage = {
        username: data.username || 'Anonymous',
        text: data.text,
        timestamp: Date.now()
    };
    messageHistory.push(msg);

    // Keep only last 100 messages
    if (messageHistory.length > 100) {
        messageHistory.shift();
    }

    ctx.emit('chat.broadcast', msg);
});

wsRouter.event('chat.history', (ctx) => {
    ctx.emit('chat.history', { messages: messageHistory.slice(-20) });
});

wsRouter.event('ping', (ctx) => {
    ctx.emit('pong', { timestamp: Date.now() });
});

const app = new Shokupan({
    port: 3003,
    development: true,
    enableHttpBridge: true,
    enableAsyncApiGen: true
});

app.get('/health', (ctx) => {
    return ctx.json({
        status: 'ok',
        connections: wsRouter.clients?.length ?? 0,
        messages: messageHistory.length
    });
});

app.mount('/ws', wsRouter);

app.listen().then(() => {
    console.log('WebSocket Real-time App running on http://localhost:3003');
    console.log('WebSocket endpoint: ws://localhost:3003/ws');
    console.log('Events: chat.join, chat.message, chat.history, ping');
});
