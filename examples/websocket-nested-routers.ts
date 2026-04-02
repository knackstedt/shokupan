/**
 * Example: Nested WebSocket Routers Sharing the Same Connection
 * 
 * This example demonstrates how multiple WebSocket routers can be mounted
 * onto a parent router to share the same underlying WebSocket connection.
 * Events are automatically prefixed based on the mount path.
 */

import { Shokupan } from '../src/shokupan';
import { ShokupanWebsocketRouter } from '../src/websocket';
import { Event, WebsocketController } from '../src/decorators';

// Create a chat router with message-related events
const chatRouter = new ShokupanWebsocketRouter();

chatRouter.event('message', (ctx, data) => {
    console.log('Chat message received:', data);
    ctx.broadcast('chat.message', {
        ...data,
        timestamp: Date.now()
    });
});

chatRouter.event('typing', (ctx, data) => {
    console.log('User typing:', data);
    ctx.broadcast('chat.typing', data);
});

// Create a notification router
const notificationRouter = new ShokupanWebsocketRouter();

notificationRouter.event('subscribe', (ctx, data) => {
    console.log('Notification subscription:', data);
    ctx.emit('notifications.subscribed', { channel: data.channel });
});

notificationRouter.event('unsubscribe', (ctx, data) => {
    console.log('Notification unsubscription:', data);
    ctx.emit('notifications.unsubscribed', { channel: data.channel });
});

// Create a presence controller using decorators
@WebsocketController()
class PresenceController {
    @Event('online')
    handleOnline(ctx: any, data: any) {
        console.log('User online:', data);
        ctx.broadcast('presence.online', data);
    }

    @Event('offline')
    handleOffline(ctx: any, data: any) {
        console.log('User offline:', data);
        ctx.broadcast('presence.offline', data);
    }

    @Event('status')
    handleStatus(ctx: any, data: any) {
        console.log('User status update:', data);
        ctx.emit('presence.status.updated', data);
    }
}

// Create the main WebSocket router
const mainRouter = new ShokupanWebsocketRouter();

// Add authentication via onUpgrade
mainRouter.onUpgrade((ctx) => {
    const token = ctx.get('authorization');
    if (!token) {
        console.log('WebSocket upgrade rejected: No authorization token');
        return false;
    }
    console.log('WebSocket upgrade accepted');
    return true;
});

// Initialize session data on connection
mainRouter.onOpen((ctx, ws) => {
    const userId = ctx.get('x-user-id') || 'anonymous';
    console.log(`WebSocket connection opened for user: ${userId}`);
    
    // Return session data that will be available in ws.data and ctx.state
    return {
        userId,
        connectedAt: Date.now()
    };
});

// Add a ping/pong event at the main level
mainRouter.event('ping', (ctx) => {
    ctx.emit('pong', { timestamp: Date.now() });
});

// Mount child routers - they share the same WebSocket connection!
// Events will be prefixed: chat.message, chat.typing, notifications.subscribe, etc.
mainRouter.mount('chat', chatRouter);
mainRouter.mount('notifications', notificationRouter);
mainRouter.mount('presence', PresenceController);

// Create the Shokupan app and mount the main router
const app = new Shokupan({ port: 3000 });

// Mount the main router - this creates a SINGLE WebSocket endpoint
// that handles all events from all nested routers
app.mount('/ws', mainRouter);

// Add a simple HTTP endpoint for testing
app.get('/', (ctx) => {
    return ctx.html(`
<!DOCTYPE html>
<html>
<head>
    <title>Nested WebSocket Routers Example</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .event { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 5px; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        #status { font-weight: bold; }
        #messages { max-height: 400px; overflow-y: auto; }
    </style>
</head>
<body>
    <h1>Nested WebSocket Routers Example</h1>
    <p>Status: <span id="status">Disconnected</span></p>
    
    <div>
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
    </div>
    
    <h2>Send Events</h2>
    <div>
        <button onclick="sendEvent('ping')">Ping</button>
        <button onclick="sendEvent('chat.message', {text: 'Hello!'})">Chat Message</button>
        <button onclick="sendEvent('chat.typing', {user: 'Alice'})">Chat Typing</button>
        <button onclick="sendEvent('notifications.subscribe', {channel: 'updates'})">Subscribe Notifications</button>
        <button onclick="sendEvent('presence.online', {user: 'Bob'})">Presence Online</button>
    </div>
    
    <h2>Received Events</h2>
    <div id="messages"></div>
    
    <script>
        let ws = null;
        
        function connect() {
            ws = new WebSocket('ws://localhost:3000/ws');
            
            ws.onopen = () => {
                document.getElementById('status').textContent = 'Connected';
                addMessage('system', 'Connected to WebSocket');
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                addMessage('received', JSON.stringify(data, null, 2));
            };
            
            ws.onclose = () => {
                document.getElementById('status').textContent = 'Disconnected';
                addMessage('system', 'Disconnected from WebSocket');
            };
            
            ws.onerror = (error) => {
                addMessage('error', 'WebSocket error: ' + error);
            };
        }
        
        function disconnect() {
            if (ws) {
                ws.close();
                ws = null;
            }
        }
        
        function sendEvent(event, data = {}) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                alert('Not connected!');
                return;
            }
            
            const payload = { event, data };
            ws.send(JSON.stringify(payload));
            addMessage('sent', JSON.stringify(payload, null, 2));
        }
        
        function addMessage(type, content) {
            const div = document.createElement('div');
            div.className = 'event';
            div.innerHTML = '<strong>' + type + ':</strong><br><pre>' + content + '</pre>';
            document.getElementById('messages').prepend(div);
        }
    </script>
</body>
</html>
    `);
});

// Start the server
app.listen().then(() => {
    console.log('Server started on http://localhost:3000');
    console.log('');
    console.log('Available WebSocket events:');
    console.log('  - ping (main router)');
    console.log('  - chat.message (chat router)');
    console.log('  - chat.typing (chat router)');
    console.log('  - notifications.subscribe (notification router)');
    console.log('  - notifications.unsubscribe (notification router)');
    console.log('  - presence.online (presence controller)');
    console.log('  - presence.offline (presence controller)');
    console.log('  - presence.status (presence controller)');
    console.log('');
    console.log('All events share the SAME WebSocket connection at ws://localhost:3000/ws');
});
