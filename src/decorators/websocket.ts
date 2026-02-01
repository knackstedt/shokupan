import { $eventMethods } from '../util/symbol';
import './util/metadata'; // Use Shokupan's lightweight polyfill

// Metadata keys for WebSocket decorators
const WS_METADATA_KEY = Symbol.for('Shokupan.websocket:metadata');
const WS_UPGRADE_KEY = Symbol.for('Shokupan.websocket:onUpgrade');
const WS_OPEN_KEY = Symbol.for('Shokupan.websocket:onOpen');
const WS_EVENT_KEY = Symbol.for('Shokupan.websocket:onEvent');
const WS_MESSAGE_KEY = Symbol.for('Shokupan.websocket:onMessage');
const WS_CLOSE_KEY = Symbol.for('Shokupan.websocket:onClose');
const WS_ERROR_KEY = Symbol.for('Shokupan.websocket:onError');
const WS_EVENTS_KEY = Symbol.for('Shokupan.websocket:events');

/**
 * WebSocket controller metadata
 * @internal
 */
export interface WebSocketMetadata {
    isWebSocketController: boolean;
    path?: string;
}

/**
 * Event metadata
 * @internal
 */
export interface EventMetadata {
    event: string;
    methodName: string;
}

/**
 * Marks a class as a WebSocket controller.
 * 
 * @param path Optional base path for the WebSocket endpoint
 * 
 * @example
 * ```ts
 * @WebsocketController()
 * class ChatController {
 *   @OnOpen()
 *   handleOpen(ctx: ShokupanContext, ws: WebSocket) {
 *     return { userId: "123" };
 *   }
 * }
 * 
 * app.mount('/chat', ChatController);
 * ```
 */
export function WebsocketController(path?: string): ClassDecorator {
    return function (target: any) {
        const metadata: WebSocketMetadata = {
            isWebSocketController: true,
            path
        };
        Reflect.defineMetadata(WS_METADATA_KEY, metadata, target);
    };
}

/**
 * Decorator for WebSocket upgrade validation handler.
 * Return false to reject the upgrade.
 * 
 * @example
 * ```ts
 * @OnUpgrade()
 * handleUpgrade(ctx: ShokupanContext) {
 *   if (!ctx.get("authorization")) return false;
 *   return true;
 * }
 * ```
 */
export function OnUpgrade(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_UPGRADE_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for WebSocket open handler.
 * Return value is automatically set to ws.data and ctx.state.
 * 
 * @example
 * ```ts
 * @OnOpen()
 * handleOpen(ctx: ShokupanContext, ws: WebSocket) {
 *   return { userId: getUserId(ctx) };
 * }
 * ```
 */
export function OnOpen(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_OPEN_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for event middleware handler.
 * Runs before routing to specific event handlers.
 * Return false or throw to prevent event routing.
 * 
 * @example
 * ```ts
 * @OnEvent()
 * handleEvent(ctx: ShokupanContext, ws: WebSocket, event: string, data: any) {
 *   if (event.startsWith("_")) return false; // Block private events
 * }
 * ```
 */
export function OnEvent(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_EVENT_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for raw message handler.
 * Called for every message before event parsing/routing.
 * 
 * @example
 * ```ts
 * @OnMessage()
 * handleMessage(ctx: ShokupanContext, ws: WebSocket, msg: string) {
 *   console.log("Received:", msg);
 * }
 * ```
 */
export function OnMessage(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_MESSAGE_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for WebSocket close handler.
 * 
 * @example
 * ```ts
 * @OnClose()
 * handleClose(ctx: ShokupanContext, ws: WebSocket) {
 *   console.log("Client disconnected");
 * }
 * ```
 */
export function OnClose(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_CLOSE_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for WebSocket error handler.
 * 
 * @example
 * ```ts
 * @OnError()
 * handleError(ctx: ShokupanContext, ws: WebSocket, error: Error) {
 *   console.error("WebSocket error:", error);
 * }
 * ```
 */
export function OnError(): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        Reflect.defineMetadata(WS_ERROR_KEY, propertyKey, target.constructor);
    };
}

/**
 * Decorator for event-specific handlers.
 * 
 * @param event Event name to handle
 * 
 * @example
 * ```ts
 * @Event("chat.message")
 * handleChatMessage(ctx: ShokupanContext, data: any) {
 *   ctx.broadcast("chat.message", data);
 * }
 * ```
 */
export function Event(event: string): MethodDecorator {
    return function (target: any, propertyKey: string | symbol) {
        // Native Shokupan metadata for ControllerScanner
        target[$eventMethods] ??= new Map();
        target[$eventMethods].set(propertyKey, { eventName: event });

        const events = Reflect.getMetadata(WS_EVENTS_KEY, target.constructor) || [];
        events.push({ event, methodName: propertyKey });
        Reflect.defineMetadata(WS_EVENTS_KEY, events, target.constructor);
    };
}

/**
 * Check if a class is a WebSocket controller.
 * @internal
 */
export function isWebSocketController(target: any): boolean {
    const metadata = Reflect.getMetadata(WS_METADATA_KEY, target) ||
        (target.constructor ? Reflect.getMetadata(WS_METADATA_KEY, target.constructor) : undefined);
    return metadata?.isWebSocketController === true;
}

/**
 * Get WebSocket controller metadata.
 * @internal
 */
export function getWebSocketMetadata(target: any): WebSocketMetadata | undefined {
    return Reflect.getMetadata(WS_METADATA_KEY, target) ||
        (target.constructor ? Reflect.getMetadata(WS_METADATA_KEY, target.constructor) : undefined);
}

/**
 * Get the onUpgrade handler method name.
 * @internal
 */
export function getUpgradeHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_UPGRADE_KEY, target);
}

/**
 * Get the onOpen handler method name.
 * @internal
 */
export function getOpenHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_OPEN_KEY, target);
}

/**
 * Get the onEvent handler method name.
 * @internal
 */
export function getEventMiddlewareHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_EVENT_KEY, target);
}

/**
 * Get the onMessage handler method name.
 * @internal
 */
export function getMessageHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_MESSAGE_KEY, target);
}

/**
 * Get the onClose handler method name.
 * @internal
 */
export function getCloseHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_CLOSE_KEY, target);
}

/**
 * Get the onError handler method name.
 * @internal
 */
export function getErrorHandler(target: any): string | symbol | undefined {
    return Reflect.getMetadata(WS_ERROR_KEY, target);
}

/**
 * Get all event handlers.
 * @internal
 */
export function getEventHandlers(target: any): EventMetadata[] {
    return Reflect.getMetadata(WS_EVENTS_KEY, target) || [];
}
