import { Shokupan } from '../src/index';
import { Server } from 'socket.io';

/**
 * Sample 2: Socket.IO Chat App
 * Tests: Socket.IO plugin integration, WebSocket upgrades, room broadcasting
 */

const app = new Shokupan({
    port: 3102,
    development: true,
    enableOpenApiGen: true
});

interface ChatMessage {
    id: string;
    room: string;
    username: string;
    text: string;
    timestamp: number;
}

const messages: ChatMessage[] = [];
const rooms = new Set<string>(['general', 'tech', 'random']);

// Create Socket.IO server on the same HTTP server
const io = new Server(app.server as any, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join', (room: string) => {
        socket.join(room);
        socket.emit('joined', { room, history: messages.filter(m => m.room === room).slice(-50) });
        socket.to(room).emit('userJoined', { username: socket.data.username || 'Anonymous' });
    });

    socket.on('message', (data: { room: string; text: string }) => {
        const msg: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            room: data.room,
            username: socket.data.username || 'Anonymous',
            text: data.text,
            timestamp: Date.now()
        };
        messages.push(msg);
        if (messages.length > 1000) messages.shift();
        io.to(data.room).emit('message', msg);
    });

    socket.on('setUsername', (username: string) => {
        socket.data.username = username;
        socket.emit('usernameSet', { username });
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

// REST API for rooms and messages
app.get('/health', () => ({ status: 'ok', service: 'socketio-chat' }));

app.get('/rooms', () => ({ rooms: Array.from(rooms) }));

app.get('/messages/:room', (ctx) => {
    const room = ctx.params.room;
    const roomMessages = messages.filter(m => m.room === room).slice(-100);
    return { room, messages: roomMessages, count: roomMessages.length };
});

app.post('/rooms', async (ctx) => {
    const body = await ctx.body() as { name?: string };
    if (!body.name) return ctx.json({ error: 'Room name required' }, 400);
    rooms.add(body.name);
    return { room: body.name, created: true };
});

await app.listen();
console.log('Socket.IO Chat running on https://localhost:3102');
