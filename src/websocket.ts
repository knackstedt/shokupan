import type { ServerWebSocket } from 'bun';
import type { ShokupanContext } from './context';
import { getCallerInfo } from './decorators/util/stack';
import { $childControllers, $childRouters, $routes } from './util/symbol';

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
    private handlers: WebSocketHandlers<T> = {};
    public middleware: any[] = [];
    private events: Map<string, EventHandler<T>> = new Map();

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
     * Get registered events.
     * @internal
     */
    public getEvents(): Map<string, EventHandler<T>> {
        return this.events;
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
     * Get child routers (always empty for WebSocket router).
     * @internal
     */
    public get [$childRouters](): any[] {
        return [];
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
        return obj instanceof ShokupanWebsocketRouter;
    }
}
