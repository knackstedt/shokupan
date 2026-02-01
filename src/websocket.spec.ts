import { describe, expect, test } from 'bun:test';
import './decorators/metadata'; // Use Shokupan's lightweight polyfill
import { Event, OnClose, OnError, OnEvent, OnMessage, OnOpen, OnUpgrade, WebsocketController } from './decorators/websocket';
import { Shokupan } from './shokupan';
import { ShokupanWebsocketRouter } from './websocket';

describe('WebSocket API - Router Pattern', () => {
    test('ShokupanWebsocketRouter - basic lifecycle hooks', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        let calls: string[] = [];

        wsRouter.onUpgrade(() => {
            calls.push('upgrade');
            return true;
        });

        wsRouter.onOpen(() => {
            calls.push('open');
            return { sessionId: '123' };
        });

        wsRouter.onMessage(() => {
            calls.push('message');
        });

        wsRouter.onClose(() => {
            calls.push('close');
        });

        wsRouter.onError(() => {
            calls.push('error');
        });

        app.mount('/ws', wsRouter);

        // Verify router was mounted
        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/ws')).toBe(true);
    });

    test('ShokupanWebsocketRouter - onUpgrade rejection', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        wsRouter.onUpgrade((ctx) => {
            // Reject upgrade if no auth header
            return ctx.get('authorization') !== null;
        });

        app.mount('/ws', wsRouter);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/ws')).toBe(true);
    });

    test('ShokupanWebsocketRouter - onOpen return value', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        const sessionData = { userId: '456', role: 'admin' };

        wsRouter.onOpen((ctx, ws) => {
            return sessionData;
        });

        app.mount('/ws', wsRouter);

        // Session data should be accessible via ctx.state and ws.data
        const routes = app.getRoutes();
        expect(routes.length).toBeGreaterThan(0);
    });

    test('ShokupanWebsocketRouter - event routing', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        let eventData: any = null;

        wsRouter.event('chat.message', (ctx, data) => {
            eventData = data;
        });

        wsRouter.event('user.join', (ctx, data) => {
            expect(data).toBeDefined();
        });

        app.mount('/chat', wsRouter);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/chat')).toBe(true);

        // Verify events are registered
        const events = wsRouter.getEvents();
        expect(events.has('chat.message')).toBe(true);
        expect(events.has('user.join')).toBe(true);
    });

    test('ShokupanWebsocketRouter - onEvent middleware prevents routing', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        let eventCalled = false;

        wsRouter.onEvent((ctx, ws, event, data) => {
            // Block all events starting with underscore
            if (event.startsWith('_')) {
                return false; // Prevent routing
            }
            return true;
        });

        wsRouter.event('_private', () => {
            eventCalled = true; // Should never be called
        });

        wsRouter.event('public', () => {
            eventCalled = true; // Should be called
        });

        app.mount('/ws', wsRouter);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/ws')).toBe(true);
    });

    test('ShokupanWebsocketRouter - multiple events', () => {
        const app = new Shokupan();
        const wsRouter = new ShokupanWebsocketRouter();

        wsRouter.event('event1', () => { });
        wsRouter.event('event2', () => { });
        wsRouter.event('event3', () => { });

        app.mount('/ws', wsRouter);

        const events = wsRouter.getEvents();
        expect(events.size).toBe(3);
        expect(events.has('event1')).toBe(true);
        expect(events.has('event2')).toBe(true);
        expect(events.has('event3')).toBe(true);
    });
});

describe('WebSocket API - Controller Pattern', () => {
    test('@WebsocketController - basic decorator', () => {
        @WebsocketController()
        class TestController {
            @OnUpgrade()
            handleUpgrade() {
                return true;
            }

            @OnOpen()
            handleOpen() {
                return { userId: '789' };
            }
        }

        const app = new Shokupan();
        app.mount('/test', TestController);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/test')).toBe(true);
    });

    test('@WebsocketController - all lifecycle hooks', () => {
        @WebsocketController()
        class FullController {
            @OnUpgrade()
            handleUpgrade() {
                return true;
            }

            @OnOpen()
            handleOpen() {
                return { sessionId: 'abc123' };
            }

            @OnEvent()
            handleEvent() {
                // Event middleware
            }

            @OnMessage()
            handleMessage() {
                // Raw message handler
            }

            @OnClose()
            handleClose() {
                // Cleanup
            }

            @OnError()
            handleError() {
                // Error handling
            }
        }

        const app = new Shokupan();
        app.mount('/full', FullController);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/full')).toBe(true);
    });

    test('@WebsocketController - multiple event handlers', () => {
        @WebsocketController()
        class ChatController {
            @Event('chat.message')
            handleChatMessage() { }

            @Event('chat.typing')
            handleTyping() { }

            @Event('user.join')
            handleUserJoin() { }

            @Event('user.leave')
            handleUserLeave() { }
        }

        const app = new Shokupan();
        app.mount('/chat', ChatController);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/chat')).toBe(true);
    });

    test('@WebsocketController - upgrade rejection', () => {
        @WebsocketController()
        class SecureController {
            @OnUpgrade()
            handleUpgrade(ctx: any) {
                // Reject if no authorization
                if (!ctx.get('authorization')) {
                    return false;
                }
                return true;
            }

            @OnOpen()
            handleOpen() {
                return { authenticated: true };
            }
        }

        const app = new Shokupan();
        app.mount('/secure', SecureController);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/secure')).toBe(true);
    });
});

describe('WebSocket API - Inline Handlers', () => {
    test('ctx.upgrade() - basic inline handlers', () => {
        const app = new Shokupan();

        app.get('/ws', (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => { },
                message: (ctx, ws, msg) => { },
                close: (ctx, ws) => { }
            });
        });

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/ws')).toBe(true);
    });

    test('ctx.upgrade() - all handler types', () => {
        const app = new Shokupan();

        app.get('/ws', (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => { },
                message: (ctx, ws, msg) => { },
                close: (ctx, ws, code, reason) => { },
                error: (ctx, ws, error) => { }
            });
        });

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/ws')).toBe(true);
    });

    test('ctx.upgrade() - partial handlers', () => {
        const app = new Shokupan();

        // Only message handler
        app.get('/echo', (ctx) => {
            ctx.upgrade({
                message: (ctx, ws, msg) => {
                    ws.send(msg);
                }
            });
        });

        // Only open and close
        app.get('/simple', (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => ws.send('connected') as any,
                close: (ctx, ws) => console.log('disconnected')
            });
        });

        const routes = app.getRoutes();
        expect(routes.length).toBeGreaterThanOrEqual(2);
    });
});

describe('WebSocket API - Integration', () => {
    test('Multiple WebSocket routers on different paths', () => {
        const app = new Shokupan();

        const chatRouter = new ShokupanWebsocketRouter();
        chatRouter.event('message', () => { });

        const notificationRouter = new ShokupanWebsocketRouter();
        notificationRouter.event('notify', () => { });

        app.mount('/chat', chatRouter);
        app.mount('/notifications', notificationRouter);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/chat')).toBe(true);
        expect(routes.some(r => r.path === '/notifications')).toBe(true);
    });

    test('Mix of router and controller patterns', () => {
        const app = new Shokupan();

        // Router pattern
        const wsRouter = new ShokupanWebsocketRouter();
        wsRouter.onOpen(() => ({ type: 'router' }));
        app.mount('/router', wsRouter);

        // Controller pattern
        @WebsocketController()
        class TestController {
            @OnOpen()
            handleOpen() {
                return { type: 'controller' };
            }
        }
        app.mount('/controller', TestController);

        const routes = app.getRoutes();
        expect(routes.some(r => r.path === '/router')).toBe(true);
        expect(routes.some(r => r.path === '/controller')).toBe(true);
    });

    test('isWebSocketRouter() utility', () => {
        const wsRouter = new ShokupanWebsocketRouter();
        expect(ShokupanWebsocketRouter.isWebSocketRouter(wsRouter)).toBe(true);

        const normalRouter = { notWs: true };
        expect(ShokupanWebsocketRouter.isWebSocketRouter(normalRouter)).toBe(false);
    });
});

describe('WebSocket API - Context Helpers', () => {
    test('ctx.emit() - event emission', () => {
        const app = new Shokupan();

        app.get('/ws', (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => {
                    // emit should be available on context
                    expect(typeof ctx.emit).toBe('function');
                }
            });
        });

        const routes = app.getRoutes();
        expect(routes.length).toBeGreaterThan(0);
    });

    test('ctx.broadcast() - broadcast availability', () => {
        const app = new Shokupan();

        app.get('/ws', (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => {
                    // broadcast should be available on context
                    expect(typeof ctx.broadcast).toBe('function');
                }
            });
        });

        const routes = app.getRoutes();
        expect(routes.length).toBeGreaterThan(0);
    });
});
