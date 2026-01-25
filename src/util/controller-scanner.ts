
import { ShokupanContext } from '../context';
import { compose } from '../middleware';
import { traceHandler } from '../plugins/application/opentelemetry';
import { ResilienceFactory } from '../plugins/resilience/factory';
import type { ShokupanRouter } from '../router';
import { Container } from './di';
import { getCallerInfo } from './stack';
import {
    $controllerPath,
    $eventMethods,
    $isMounted,
    $mcpPrompts,
    $mcpResources,
    $mcpTools,
    $middleware,
    $mountPath,
    $resilienceConfig,
    $routeArgs,
    $routeMethods,
    $routeSpec
} from './symbol';
import { HTTPMethods, type Method, RouteParamType } from './types';

export class ControllerScanner {
    public static scan<T extends Record<string, any>>(router: ShokupanRouter<T>, prefix: string, controller: any) {
        let instance = controller;
        if (typeof controller === 'function') {
            // DI Resolution
            instance = Container.resolve(controller as any);

            // Controller Parameter Decorator (@Controller('prefix'))
            const controllerPath = (controller as any)[$controllerPath];
            if (controllerPath !== undefined) {
                // Combine mount prefix + controller path
                const p1 = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                const p2 = controllerPath.startsWith("/") ? controllerPath : "/" + controllerPath;
                prefix = (p1 + p2);
                // Normalize
                if (!prefix) prefix = "/";
            }
        }
        else {
            // Controller is an instance, read metadata from constructor
            const ctor = instance.constructor;
            const controllerPath = (ctor as any)[$controllerPath];
            if (controllerPath !== undefined) {
                const p1 = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                const p2 = controllerPath.startsWith("/") ? controllerPath : "/" + controllerPath;
                prefix = (p1 + p2);
                if (!prefix) prefix = "/";
            }
        }

        instance[$mountPath] = prefix;

        // Capture metadata for controller instance
        const info = getCallerInfo();
        (instance as any).metadata = {
            file: info.file,
            line: info.line,
            name: instance.constructor.name
        };

        router.bindController(instance);

        // Get Middleware for Controller
        const controllerMiddleware = (typeof controller === 'function' ? (controller as any)[$middleware] : (instance as any)[$middleware]) || [];

        // Get all method names from the prototype (for classes)
        const proto = Object.getPrototypeOf(instance);
        const methods = new Set<string>();

        // Scan prototype chain
        let current = proto;
        while (current !== undefined && current !== Object.prototype) {
            Object.getOwnPropertyNames(current).forEach(name => methods.add(name));
            current = Object.getPrototypeOf(current);
        }
        // Also scan own properties (for objects or bound methods)
        Object.getOwnPropertyNames(instance).forEach(name => methods.add(name));

        const decoratedRoutes = (instance as any)[$routeMethods] || (proto && (proto as any)[$routeMethods]);
        const decoratedArgs = (instance as any)[$routeArgs] || (proto && (proto as any)[$routeArgs]);
        const methodMiddlewareMap = (instance as any)[$middleware] || (proto && (proto as any)[$middleware]);
        const decoratedEvents = (instance as any)[$eventMethods] || (proto && (proto as any)[$eventMethods]);
        const mcpTools = (instance as any)[$mcpTools] || (proto && (proto as any)[$mcpTools]);
        const mcpPrompts = (instance as any)[$mcpPrompts] || (proto && (proto as any)[$mcpPrompts]);

        const mcpResources = (instance as any)[$mcpResources] || (proto && (proto as any)[$mcpResources]);
        const resilienceConfigMap = (instance as any)[$resilienceConfig] || (proto && (proto as any)[$resilienceConfig]);

        let routesAttached = 0;
        for (let i = 0; i < Array.from(methods).length; i++) {
            const name = Array.from(methods)[i];
            if (name === "constructor") continue;
            if (["arguments", "caller", "callee"].includes(name)) continue;

            const originalHandler = (instance as any)[name];
            if (typeof originalHandler !== "function") continue;

            let method: Method | undefined;
            let subPath = "";

            // 1. Check for Decorator Metadata
            let methodSource: { file: string, line: number; } | undefined;

            const routeConfig = decoratedRoutes?.get(name);
            if (routeConfig !== undefined) {
                method = routeConfig.method;
                subPath = routeConfig.path;
                methodSource = routeConfig.source;
            }
            // 2. Fallback to Convention
            else {
                // Check if name starts with HTTP verb
                for (let j = 0; j < HTTPMethods.length; j++) {
                    const m = HTTPMethods[j];
                    if (name.toUpperCase().startsWith(m)) {
                        method = m as Method;
                        const rest = name.slice(m.length);
                        if (rest.length === 0) {
                            subPath = "/";
                        }
                        else {
                            subPath = "";
                            let buffer = "";
                            const flush = () => {
                                if (buffer.length > 0) {
                                    subPath += "/" + buffer.toLowerCase();
                                    buffer = "";
                                }
                            };
                            for (let i = 0; i < rest.length; i++) {
                                const char = rest[i];
                                if (char === "$") {
                                    flush();
                                    subPath += "/:";
                                    continue;
                                }
                                buffer += char;
                            }
                            if (buffer.length > 0) flush();

                            subPath = rest
                                .replace(/\$/g, "/:") // $id -> /:id
                                .replace(/([a-z0-9])([A-Z])/g, "$1/$2") // camelCase -> camel/Case
                                .toLowerCase();

                            if (!subPath.startsWith("/")) {
                                subPath = "/" + subPath;
                            }
                        }
                        break;
                    }
                }
            }

            // Skip empty methods
            if (method !== undefined && (method as any) !== '') {
                routesAttached++;
                const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                const cleanSubPath = subPath === "/" ? "" : subPath;

                let joined: string;
                if (cleanSubPath.length === 0) {
                    joined = cleanPrefix;
                }
                else if (cleanSubPath.startsWith("/")) {
                    joined = cleanPrefix + cleanSubPath;
                }
                else {
                    joined = cleanPrefix + "/" + cleanSubPath;
                }

                const fullPath = joined || "/";
                const normalizedPath = fullPath.replace(/\/+/g, "/");

                // -- Compose Handler with Middleware and Param Resolution --
                const methodMw = (methodMiddlewareMap instanceof Map) ? (methodMiddlewareMap.get(name) || []) : [];
                const allMiddleware = [...controllerMiddleware, ...methodMw];

                // Check for Args
                const routeArgs = decoratedArgs && decoratedArgs.get(name);

                // Create Wrapper
                const wrappedHandler = async (ctx: ShokupanContext<T>) => {
                    // Resolve Arguments
                    let args: any[] = [ctx];

                    if (routeArgs?.length > 0) {
                        args = [];
                        // Sort by index
                        const sortedArgs = [...routeArgs].sort((a: any, b: any) => a.index - b.index);

                        // Fill args array
                        for (let k = 0; k < sortedArgs.length; k++) {
                            const arg = sortedArgs[k];
                            switch (arg.type) {
                                case RouteParamType.BODY:
                                    args[arg.index] = await ctx.body();
                                    break;
                                case RouteParamType.PARAM:
                                    args[arg.index] = arg.name ? ctx.params[arg.name] : ctx.params;
                                    break;
                                case RouteParamType.QUERY: {
                                    const url = new URL(ctx.req.url);
                                    if (arg.name) {
                                        const vals = url.searchParams.getAll(arg.name);
                                        args[arg.index] = vals.length > 1 ? vals : vals[0];
                                    } else {
                                        const query: Record<string, any> = {};
                                        const keys = Object.keys(url.searchParams);
                                        for (let k = 0; k < keys.length; k++) {
                                            const key = keys[k];
                                            const vals = url.searchParams.getAll(key);
                                            query[key] = vals.length > 1 ? vals : vals[0];
                                        }
                                        args[arg.index] = query;
                                    }
                                    break;
                                }
                                case RouteParamType.HEADER:
                                    args[arg.index] = arg.name ? ctx.req.headers.get(arg.name) : ctx.req.headers;
                                    break;
                                case RouteParamType.REQUEST:
                                    args[arg.index] = ctx.req;
                                    break;
                                case RouteParamType.CONTEXT:
                                    args[arg.index] = ctx;
                                    break;
                                case RouteParamType.SERVICE:
                                    args[arg.index] = Container.resolve(arg.token);
                                    break;
                            }
                        }
                    }

                    const tracedOriginalHandler = ctx.app?.applicationConfig.enableTracing
                        ? traceHandler(originalHandler, normalizedPath)
                        : originalHandler;

                    return tracedOriginalHandler.apply(instance, args);
                };

                // Apply Middleware wrapping
                let finalHandler = wrappedHandler;
                if (allMiddleware.length > 0) {
                    const composed = compose(allMiddleware);
                    finalHandler = async (ctx) => {
                        return composed(ctx, () => wrappedHandler(ctx));
                    };
                }

                // Resilience Policy Wrapping
                const config = resilienceConfigMap?.get(name);
                if (config) {
                    const policy = ResilienceFactory.createPolicy(config);
                    const baseHandler = finalHandler;
                    finalHandler = async (ctx) => {
                        return policy.execute(() => baseHandler(ctx));
                    };
                }

                (finalHandler as any).originalHandler = originalHandler;
                if (finalHandler !== wrappedHandler) {
                    (wrappedHandler as any).originalHandler = originalHandler;
                }

                // Inject Controller Name as Tag
                const tagName = instance.constructor.name;

                // Retrieve @Spec metadata
                const decoratedSpecs = (instance as any)[$routeSpec] || (proto && (proto as any)[$routeSpec]);
                const userSpec = decoratedSpecs && decoratedSpecs.get(name);

                // Merge with existing spec from decorator if available
                const spec = { tags: [tagName], ...userSpec };

                router.add({
                    method,
                    path: normalizedPath,
                    handler: finalHandler,
                    spec,
                    controller: instance,
                    metadata: methodSource || (instance as any).metadata,
                    middleware: allMiddleware
                });
            }

            // 3. Check for Event Decorator
            const eventConfig = decoratedEvents?.get(name);
            if (eventConfig !== undefined) {
                routesAttached++;
                const routeArgs = decoratedArgs?.get(name);

                const wrappedHandler = async (ctx: ShokupanContext<T>) => {
                    let args: any[] = [ctx];
                    if (routeArgs?.length > 0) {
                        args = [];
                        const sortedArgs = [...routeArgs].sort((a: any, b: any) => a.index - b.index);
                        for (let k = 0; k < sortedArgs.length; k++) {
                            const arg = sortedArgs[k];
                            switch (arg.type) {
                                case RouteParamType.BODY:
                                    args[arg.index] = await ctx.body();
                                    break;
                                case RouteParamType.CONTEXT:
                                    args[arg.index] = ctx;
                                    break;
                                case RouteParamType.REQUEST:
                                    args[arg.index] = ctx.req;
                                    break;
                                case RouteParamType.HEADER:
                                    args[arg.index] = arg.name ? ctx.req.headers.get(arg.name) : ctx.req.headers;
                                    break;
                                default:
                                    args[arg.index] = undefined;
                            }
                        }
                    }
                    return originalHandler.apply(instance, args);
                };

                // Attach metadata to the handler for AsyncAPI generator
                const decoratedSpecs = (instance as any)[$routeSpec] || (proto && (proto as any)[$routeSpec]);
                const userSpec = decoratedSpecs && decoratedSpecs.get(name);

                const spec = { tags: [{ name: instance.constructor.name }], ...userSpec };
                (wrappedHandler as any).spec = spec;
                (wrappedHandler as any).originalHandler = originalHandler;

                router.event(eventConfig.eventName, wrappedHandler);
            }

            // 4. Check for MCP Tools
            const toolConfig = mcpTools?.get(name);
            if (toolConfig) {
                const handler = originalHandler.bind(instance);
                router.tool(toolConfig.name || name, toolConfig.inputSchema, handler);
            }

            // 5. Check for MCP Prompts
            const promptConfig = mcpPrompts?.get(name);
            if (promptConfig) {
                const handler = originalHandler.bind(instance);
                router.prompt(promptConfig.name || name, promptConfig.arguments, handler);
            }

            // 6. Check for MCP Resources
            const resourceConfig = mcpResources?.get(name);
            if (resourceConfig) {
                const handler = originalHandler.bind(instance);
                router.resource(resourceConfig.uri, {
                    name: resourceConfig.name || name,
                    description: resourceConfig.description,
                    mimeType: resourceConfig.mimeType
                }, handler);
            }
        }

        if (routesAttached === 0) {
            console.warn(`No routes attached to controller ${instance.constructor.name}`);
        }
        instance[$isMounted] = true;
    }
}
