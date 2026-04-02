import type { ServerWebSocket } from 'bun';
import type { ShokupanContext } from './context';
import { getCallerInfo } from './decorators/util/stack';
import { getEventHandlers, isWebSocketController } from './decorators/websocket';
import type { Shokupan } from './shokupan';
import { $childControllers, $childRouters, $isWebSocketRouter, $mountPath, $routes } from './util/symbol';

/**
 * WebSocket lifecycle handlers
 */
export interface WebSocketHandlers<T = any> {
    /**
     * Called when HTTP upgrade request is received (before WebSocket connection).
     * Return false to reject the upgrade.
     */
    onUpgrade?: (ctx: ShokupanContext<T>) => boolean | void | Promise<boolean | void>;

    /**
     * Called after WebSocket connection is established.
     * Return value is automatically set to both ws.data and ctx.state.
     */
    onOpen?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>) => any | Promise<any>;

    /**
     * Called before routing to event handlers.
     * Return false or throw to prevent event routing.
     */
    onEvent?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, event: string, data: any) => boolean | void | Promise<boolean | void>;

    /**
     * Called for every message (before event parsing/routing).
     */
    onMessage?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, message: string | Buffer) => void | Promise<void>;

    /**
     * Called when WebSocket connection is closed.
     */
    onClose?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, code?: number, reason?: string) => void | Promise<void>;

    /**
     * Called when an error occurs.
     */
    onError?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, error: Error) => void | Promise<void>;

    /**
     * Called when the server is stopped.
     */
    onStop?: (app: Shokupan) => void | Promise<void>;
}

/**
 * Event handler function
 */
export type EventHandler<T = any> = (ctx: ShokupanContext<T>, data?: any) => void | Promise<void>;

/**
 * WebSocket Router for organizing WebSocket endpoints.
 * 
 * Provides lifecycle hooks and event-based message routing.
 * 
 * @example
 * ```ts
 * const wsRouter = new ShokupanWebsocketRouter();
 * 
 * wsRouter.onUpgrade((ctx) => {
 *   if (!ctx.get("authorization")) return false;
 *   return true;
 * });
 * 
 * wsRouter.onOpen((ctx, ws) => {
 *   return { userId: "123" }; // Sets ws.data and ctx.state
 * });
 * 
 * wsRouter.event("chat.message", (ctx, data) => {
 *   ctx.broadcast("chat.message", data);
 * });
 * 
 * app.mount('/ws', wsRouter);
 * ```
 */
export class ShokupanWebsocketRouter<T = any> {
    private [$isWebSocketRouter]: true = true;
    private handlers: WebSocketHandlers<T> = {};
    public middleware: any[] = [];
    private events: Map<string, EventHandler<T>> = new Map();
    private childRouters: Array<{ prefix: string; router: ShokupanWebsocketRouter<any> | any }> = [];

    /**
     * Register upgrade validation handler.
     * Called when HTTP upgrade request is received.
     * Return false to reject the upgrade.
     */
    public onUpgrade(handler: NonNullable<WebSocketHandlers<T>['onUpgrade']>): this {
        this.handlers.onUpgrade = handler;
        return this;
    }

    /**
     * Register open handler.
     * Called after WebSocket connection is established.
     * Return value is automatically set to both ws.data and ctx.state.
     */
    public onOpen(handler: NonNullable<WebSocketHandlers<T>['onOpen']>): this {
        this.handlers.onOpen = handler;
        return this;
    }

    /**
     * Register event middleware handler.
     * Called before routing to specific event handlers.
     * Return false or throw to prevent event routing.
     */
    public onEvent(handler: NonNullable<WebSocketHandlers<T>['onEvent']>): this {
        this.handlers.onEvent = handler;
        return this;
    }

    /**
     * Register message handler.
     * Called for every message before event parsing/routing.
     */
    public onMessage(handler: NonNullable<WebSocketHandlers<T>['onMessage']>): this {
        this.handlers.onMessage = handler;
        return this;
    }

    /**
     * Register close handler.
     * Called when WebSocket connection is closed.
     */
    public onClose(handler: NonNullable<WebSocketHandlers<T>['onClose']>): this {
        this.handlers.onClose = handler;
        return this;
    }

    /**
     * Register error handler.
     * Called when an error occurs.
     */
    public onError(handler: NonNullable<WebSocketHandlers<T>['onError']>): this {
        this.handlers.onError = handler;
        return this;
    }

    /**
     * Register stop handler.
     * Called when the server is stopped.
     */
    public onStop(handler: NonNullable<WebSocketHandlers<T>['onStop']>): this {
        this.handlers.onStop = handler;
        return this;
    }

    /**
     * Register an event handler.
     * 
     * @param name - Event name
     * @param handler - Handler function
     * 
     * @example
     * ```ts
     * router.event("chat.message", (ctx, data) => {
     *   ctx.broadcast("chat.message", data);
     * });
     * ```
     */
    public event(name: string, handler: EventHandler<T>): this {
        const info = getCallerInfo(2);
        if (info) {
            (handler as any).source = {
                file: info.file,
                line: info.line
            };
        }
        this.events.set(name, handler);
        return this;
    }

    /**
     * Get registered handlers.
     * @internal
     */
    public getHandlers(): WebSocketHandlers<T> {
        return this.handlers;
    }

    /**
     * Get registered events (local only, not including children).
     * @internal
     */
    public getEvents(): Map<string, EventHandler<T>> {
        return this.events;
    }

    /**
     * Get all events including from child routers, with prefixed event names.
     * @internal
     */
    public getAllEvents(): Map<string, EventHandler<T>> {
        const allEvents = new Map<string, EventHandler<T>>();
        
        // Add local events
        for (const [event, handler] of this.events) {
            allEvents.set(event, handler);
        }
        
        // Add child router events with prefix
        for (const { prefix, router } of this.childRouters) {
            if (ShokupanWebsocketRouter.isWebSocketRouter(router)) {
                const childEvents = router.getAllEvents();
                for (const [event, handler] of childEvents) {
                    const prefixedEvent = prefix ? `${prefix}.${event}` : event;
                    allEvents.set(prefixedEvent, handler);
                }
            } else if (isWebSocketController(router)) {
                // Handle controller
                const instance = typeof router === 'function' ? new router() : router;
                const constructor = instance.constructor;
                const eventHandlers = getEventHandlers(constructor);
                
                for (const eh of eventHandlers) {
                    const eventMethod = instance[eh.methodName as string];
                    if (eventMethod) {
                        const handler: EventHandler<T> = async (ctx, data) => {
                            return eventMethod.call(instance, ctx, data);
                        };
                        const prefixedEvent = prefix ? `${prefix}.${eh.event}` : eh.event;
                        allEvents.set(prefixedEvent, handler);
                    }
                }
            }
        }
        
        return allEvents;
    }

    /**
     * Get registered event handlers.
     * @internal
     */
    public getEventHandlers(): Map<string, EventHandler<T>[]> {
        const map = new Map<string, EventHandler<T>[]>();
        for (const [key, value] of this.events) {
            map.set(key, [value]);
        }
        return map;
    }

    /**
     * Mount a child WebSocket router or controller to share the same connection.
     * Events from the child will be prefixed with the mount path.
     * 
     * @param prefix - Event prefix for the child router (e.g., "chat" makes "message" become "chat.message")
     * @param router - Child WebSocket router or controller to mount
     * 
     * @example
     * ```ts
     * const mainRouter = new ShokupanWebsocketRouter();
     * const chatRouter = new ShokupanWebsocketRouter();
     * chatRouter.event("message", (ctx, data) => { ... });
     * 
     * // Events will be accessible as "chat.message"
     * mainRouter.mount("chat", chatRouter);
     * ```
     */
    public mount(prefix: string, router: ShokupanWebsocketRouter<any> | any): this {
        // Normalize prefix - remove leading/trailing dots
        const normalizedPrefix = prefix.replace(/^\.+|\.+$/g, '');
        
        // Mark the child router as mounted
        if (router && typeof router === 'object') {
            (router as any)[$mountPath] = normalizedPrefix;
        }
        
        this.childRouters.push({ prefix: normalizedPrefix, router });
        return this;
    }

    /**
     * Get child routers.
     * @internal
     */
    public get [$childRouters](): any[] {
        return this.childRouters.map(c => c.router);
    }

    /**
     * Get local routes (always empty for WebSocket router as it handles its own routing).
     * @internal
     */
    public get [$routes](): any[] {
        return [];
    }

    /**
     * Get child controllers (always empty).
     * @internal
     */
    public get [$childControllers](): any[] {
        return [];
    }

    public getRoutes(): any[] {
        return [];
    }

    /**
     * Registry Accessor to support Dashboard Graph
     */
    public get registry() {
        // Collect event handlers
        const events: any[] = [];
        this.events.forEach((handler, name) => {
            events.push({
                type: 'event',
                name,
                handlerName: handler.name,
                metadata: (handler as any).source ? { file: (handler as any).source.file, line: (handler as any).source.line } : undefined,
                _fn: handler
            });
        });

        return {
            metadata: undefined,
            middleware: [],
            routes: [],
            routers: [],
            controllers: [],
            events
        };
    }

    /**
     * Check if this is a WebSocket router instance.
     * @internal
     */
    public static isWebSocketRouter(obj: any): obj is ShokupanWebsocketRouter {
        return obj && typeof obj === 'object' && obj[$isWebSocketRouter] === true;
    }

    /**
     * Get all handlers merged from this router and children.
     * Child handlers are called after parent handlers.
     * @internal
     */
    public getAllHandlers(): WebSocketHandlers<T> {
        const merged: WebSocketHandlers<T> = { ...this.handlers };
        
        // Collect child handlers
        const childUpgradeHandlers: NonNullable<WebSocketHandlers<T>['onUpgrade']>[] = [];
        const childOpenHandlers: NonNullable<WebSocketHandlers<T>['onOpen']>[] = [];
        const childEventHandlers: NonNullable<WebSocketHandlers<T>['onEvent']>[] = [];
        const childMessageHandlers: NonNullable<WebSocketHandlers<T>['onMessage']>[] = [];
        const childCloseHandlers: NonNullable<WebSocketHandlers<T>['onClose']>[] = [];
        const childErrorHandlers: NonNullable<WebSocketHandlers<T>['onError']>[] = [];
        
        for (const { router } of this.childRouters) {
            if (ShokupanWebsocketRouter.isWebSocketRouter(router)) {
                const childHandlers = router.getAllHandlers();
                if (childHandlers.onUpgrade) childUpgradeHandlers.push(childHandlers.onUpgrade);
                if (childHandlers.onOpen) childOpenHandlers.push(childHandlers.onOpen);
                if (childHandlers.onEvent) childEventHandlers.push(childHandlers.onEvent);
                if (childHandlers.onMessage) childMessageHandlers.push(childHandlers.onMessage);
                if (childHandlers.onClose) childCloseHandlers.push(childHandlers.onClose);
                if (childHandlers.onError) childErrorHandlers.push(childHandlers.onError);
            }
        }
        
        // Merge onUpgrade: parent runs first, any false rejects
        if (this.handlers.onUpgrade || childUpgradeHandlers.length > 0) {
            const parentHandler = this.handlers.onUpgrade;
            merged.onUpgrade = async (ctx) => {
                if (parentHandler) {
                    const result = await parentHandler(ctx);
                    if (result === false) return false;
                }
                for (const handler of childUpgradeHandlers) {
                    const result = await handler(ctx);
                    if (result === false) return false;
                }
                return true;
            };
        }
        
        // Merge onOpen: parent runs first, children can augment state
        if (this.handlers.onOpen || childOpenHandlers.length > 0) {
            const parentHandler = this.handlers.onOpen;
            merged.onOpen = async (ctx, ws) => {
                let state: any;
                if (parentHandler) {
                    state = await parentHandler(ctx, ws);
                }
                for (const handler of childOpenHandlers) {
                    const childState = await handler(ctx, ws);
                    if (childState !== undefined) {
                        state = { ...state, ...childState };
                    }
                }
                return state;
            };
        }
        
        // Merge onEvent: parent runs first, any false prevents routing
        if (this.handlers.onEvent || childEventHandlers.length > 0) {
            const parentHandler = this.handlers.onEvent;
            merged.onEvent = async (ctx, ws, event, data) => {
                if (parentHandler) {
                    const result = await parentHandler(ctx, ws, event, data);
                    if (result === false) return false;
                }
                for (const handler of childEventHandlers) {
                    const result = await handler(ctx, ws, event, data);
                    if (result === false) return false;
                }
                return true;
            };
        }
        
        // Merge onMessage: all handlers are called in order
        if (this.handlers.onMessage || childMessageHandlers.length > 0) {
            const parentHandler = this.handlers.onMessage;
            merged.onMessage = async (ctx, ws, message) => {
                if (parentHandler) {
                    await parentHandler(ctx, ws, message);
                }
                for (const handler of childMessageHandlers) {
                    await handler(ctx, ws, message);
                }
            };
        }
        
        // Merge onClose: all handlers are called in order
        if (this.handlers.onClose || childCloseHandlers.length > 0) {
            const parentHandler = this.handlers.onClose;
            merged.onClose = async (ctx, ws, code, reason) => {
                if (parentHandler) {
                    await parentHandler(ctx, ws, code, reason);
                }
                for (const handler of childCloseHandlers) {
                    await handler(ctx, ws, code, reason);
                }
            };
        }
        
        // Merge onError: all handlers are called in order
        if (this.handlers.onError || childErrorHandlers.length > 0) {
            const parentHandler = this.handlers.onError;
            merged.onError = async (ctx, ws, error) => {
                if (parentHandler) {
                    await parentHandler(ctx, ws, error);
                }
                for (const handler of childErrorHandlers) {
                    await handler(ctx, ws, error);
                }
            };
        }
        
        return merged;
    }

    /**
     * Execute onStop hooks recursively.
     * @internal
     */
    public async runOnStopHooks(app: Shokupan): Promise<void> {
        if (this.handlers.onStop) {
            await this.handlers.onStop(app);
        }
        
        // Run child onStop hooks
        for (const { router } of this.childRouters) {
            if (ShokupanWebsocketRouter.isWebSocketRouter(router)) {
                await router.runOnStopHooks(app);
            }
        }
    }
}
