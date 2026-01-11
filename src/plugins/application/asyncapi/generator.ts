
import type { ShokupanRouter } from '../../../router';
import { $childRouters, $isApplication, $mountPath, $routes } from '../../../util/symbol';
import type { AsyncAPIOptions } from '../../../util/types';

/**
 * Regex patterns for detecting emit calls.
 */
const REGEX_PATTERNS = {
    EMIT: /(?:ctx|this)\.emit\(['"]([\w:.\/-]+)['"](?:\s*,\s*({[\s\S]*?}|[^)]+))?\)/g
};

async function analyzeHandler(handler: Function): Promise<{ emits: { event: string; payload?: any; }[]; }> {
    const sourceFn = (handler as any).originalHandler || handler;
    const handlerSource = sourceFn.toString();
    const emits: { event: string; payload?: any; }[] = [];

    // Parse emit calls
    const emitMatches = Array.from(handlerSource.matchAll(REGEX_PATTERNS.EMIT));
    for (const match of emitMatches) {
        const event = match[1];
        if (event) {
            emits.push({ event, payload: { type: 'object' } }); // Default payload schema
        }
    }

    return { emits };
}

/**
 * Gets deduped AST routes if available.
 * Duplicated from openapi.ts to avoid cross-module dependency issues.
 */
async function getAstRoutes(applications: any[]) {
    const astRoutes: any[] = [];

    const getExpandedRoutes = (app: any, prefix: string = '', seen = new Set<string>()): any[] => {
        if (seen.has(app.name)) return [];
        const newSeen = new Set(seen);
        newSeen.add(app.name);

        const expanded: any[] = [];

        for (const route of app.routes) {
            expanded.push({
                ...route,
                // For events, path is the event name
                path: route.path.startsWith('/') ? route.path.slice(1) : route.path
            });
        }

        if (app.mounted) {
            for (const mount of app.mounted) {
                const targetApp = applications.find(a => a.name === mount.target || a.className === mount.target);
                if (targetApp) {
                    expanded.push(...getExpandedRoutes(targetApp, '', newSeen));
                }
            }
        }
        return expanded;
    };

    applications.forEach(app => {
        astRoutes.push(...getExpandedRoutes(app));
    });

    return astRoutes;
}

export async function generateAsyncApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: AsyncAPIOptions = {}): Promise<any> {
    const channels: Record<string, any> = {};

    // Attempt to run AST Analysis
    let astRoutes: any[] = [];
    try {
        const { OpenAPIAnalyzer } = await import('../openapi/analyzer');
        const entrypoint = (globalThis as any).Bun?.main || require.main?.filename || process.argv[1];
        const analyzer = new OpenAPIAnalyzer(process.cwd(), entrypoint);
        const { applications } = await analyzer.analyze();
        astRoutes = await getAstRoutes(applications);
    } catch (e) {
        // Silently fail if analysis cannot run
    }

    const matchedAstRoutes = new Set<any>();

    const collect = async (router: ShokupanRouter<T>, prefix = "") => {
        // Collect Event Handlers (Client -> Server)
        const eventHandlers = router.getEventHandlers();

        // Determine Router Tag
        let routerTag = "Other";
        if ((router as any)[$isApplication]) {
            routerTag = "Application";
        } else if (router.constructor.name && router.constructor.name !== "ShokupanRouter") {
            routerTag = router.constructor.name;
        } else {
            routerTag = (router as any)[$mountPath] || "Router";
        }

        if (eventHandlers) {
            for (const [eventName, handlers] of eventHandlers.entries()) {
                const handler = handlers[0]; // Take first handler for spec
                const specName = `event/${eventName}`;

                // Check for @Spec metadata
                const userSpec = (handler as any).spec;

                // Determine tags: Use userSpec tags (from decorators) or fallback to Router context
                let tags = userSpec?.tags;
                if (!tags && routerTag) {
                    tags = [{ name: routerTag }];
                }

                // Match with AST route to find emits and source info
                let astMatch = astRoutes.find(r =>
                    (r.method === 'EVENT' || r.method === 'ON') &&
                    r.path === eventName
                );

                if (!astMatch) {
                    // Heuristic matching
                    const runtimeSource = ((handler as any).originalHandler || handler).toString();
                    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
                    const normalize = (s: string) => stripComments(s).replace(/\s+/g, '');

                    const runtimeHandlerSrc = normalize(runtimeSource);

                    const eventRoutes = astRoutes.filter(r => r.method === 'EVENT' || r.method === 'ON');

                    astMatch = eventRoutes.find(r => {
                        const astHandlerSrc = normalize(r.handlerSource || r.handlerName || '');

                        if (!astHandlerSrc || astHandlerSrc.length < 5) return false;
                        return runtimeHandlerSrc.includes(astHandlerSrc) ||
                            astHandlerSrc.includes(runtimeHandlerSrc) ||
                            (r.handlerSource && runtimeHandlerSrc.includes(normalize(r.handlerSource).substring(0, 50)));
                    });
                }

                if (astMatch) matchedAstRoutes.add(astMatch);

                // Force match for debugging if needed? No.
                if (eventName === 'dynamic.event' && !astMatch) {
                    // ...
                }

                if (!channels[eventName]) {
                    channels[eventName] = {
                        publish: {
                            operationId: `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`,
                            tags,
                            message: {
                                payload: { type: 'object' },
                                ...(userSpec?.message ? userSpec.message : {})
                            },
                            ...(userSpec?.type === 'publish' ? userSpec : {}),
                            "x-source-info": astMatch?.sourceContext ? {
                                // DEBUG: Check snippet existence
                                // console.log('DEBUG sourceContext', Object.keys(astMatch.sourceContext));
                                file: astMatch.sourceContext.file,
                                line: astMatch.sourceContext.startLine,
                                snippet: astMatch.sourceContext.snippet || astMatch.handlerSource,
                                offset: astMatch.sourceContext.snippetStartLine || astMatch.sourceContext.startLine,
                                highlightLines: [astMatch.sourceContext.startLine, astMatch.sourceContext.endLine]
                            } : undefined
                        }
                    };

                    if (userSpec?.summary) channels[eventName].publish.summary = userSpec.summary;
                    if (userSpec?.description) channels[eventName].publish.description = userSpec.description;
                }

                // Analyze for outgoing events
                let emits = astMatch?.emits || [];

                if (eventName === 'trigger-dynamic') {
                    // console.log(`[Method: ${eventName}] AST Match found?`, !!astMatch);
                    if (astMatch) {
                        // console.log(`[Method: ${eventName}] Emits:`, JSON.stringify(astMatch.emits));
                    }
                }


                // Fallback to basic regex if no AST emits found
                if (emits.length === 0) {
                    const regexAnalysis = await analyzeHandler(handler);
                    emits = regexAnalysis.emits;
                }

                for (const emit of emits) {
                    if (emit.event === '__DYNAMIC_EMIT__') {
                        const warningKey = `${eventName}/Dynamic Emit`;
                        channels[warningKey] = {
                            subscribe: {
                                operationId: `dynamicEmitWarning${eventName}`,
                                summary: "Dynamic Emit Detected",
                                description: "This handler emits an event with a dynamic name that could not be determined statically.",
                                tags: tags,
                                "x-warning": true,
                                "x-source-info": {
                                    file: astMatch?.sourceContext?.file,
                                    line: emit.location?.startLine,
                                    snippet: astMatch?.handlerSource,
                                    offset: astMatch?.sourceContext?.startLine,
                                    highlightLines: emit.location ? [emit.location.startLine, emit.location.endLine] : undefined
                                },
                                message: { payload: { type: 'object' } }
                            }
                        };
                        continue;
                    }

                    if (!channels[emit.event]) {
                        channels[emit.event] = {
                            subscribe: {
                                operationId: `emit${emit.event.charAt(0).toUpperCase() + emit.event.slice(1)}`,
                                tags,
                                message: {
                                    payload: emit.payload || { type: 'object' }
                                },
                                "x-source-info": (astMatch?.sourceContext && emit.location) ? {
                                    file: astMatch.sourceContext.file,
                                    line: emit.location.startLine,
                                    snippet: astMatch.handlerSource,
                                    offset: astMatch.sourceContext.startLine,
                                    highlightLines: [emit.location.startLine, emit.location.endLine]
                                } : undefined
                            }
                        };
                    }
                }
            };
        }

        // Collect HTTP Routes (Server -> Client Emits Only)
        const httpRoutes = router[$routes];
        if (httpRoutes) {
            for (const route of httpRoutes) {
                const handler = route.handler;

                // Determine tags
                let tags = route.handlerSpec?.tags;
                if (!tags && routerTag) {
                    tags = [{ name: routerTag }];
                }

                // Find AST match for this HTTP route
                // Similar to OpenAPI logic but we only care about emits
                const methodUpper = route.method.toUpperCase();
                let astMatch = astRoutes.find(r =>
                    r.method === methodUpper &&
                    (r.path === route.path || r.path === '/' + route.path)
                );

                if (!astMatch) {
                    const runtimeSource = ((handler as any).originalHandler || handler).toString();
                    const runtimeHandlerSrc = runtimeSource.replace(/\s+/g, ' ');
                    const sameMethodRoutes = astRoutes.filter(r => r.method === methodUpper);

                    astMatch = sameMethodRoutes.find(r => {
                        const astHandlerSrc = (r.handlerSource || r.handlerName || '').replace(/\s+/g, ' ');
                        if (!astHandlerSrc || astHandlerSrc.length < 20) return false;
                        return runtimeHandlerSrc.includes(astHandlerSrc) ||
                            astHandlerSrc.includes(runtimeHandlerSrc) ||
                            (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50)));
                    });
                }

                let emits = astMatch?.emits || [];

                if (emits.length === 0) {
                    const regexAnalysis = await analyzeHandler(handler);
                    emits = regexAnalysis.emits;
                }

                for (const emit of emits) {
                    // Only add if not already defined
                    if (!channels[emit.event]) {
                        channels[emit.event] = {
                            subscribe: {
                                operationId: `emit${emit.event.charAt(0).toUpperCase() + emit.event.slice(1)}`,
                                tags,
                                message: {
                                    payload: emit.payload || { type: 'object' }
                                },
                                "x-source-info": (astMatch?.sourceContext && emit.location) ? {
                                    file: astMatch.sourceContext.file,
                                    line: emit.location.startLine,
                                    snippet: astMatch.handlerSource, // Optional: snippet of HTTP handler
                                    offset: astMatch.sourceContext.startLine,
                                    highlightLines: [emit.location.startLine, emit.location.endLine]
                                } : undefined
                            }
                        };
                    }
                }
            }
        }

        // Recursively check children
        const childRouters = router[$childRouters];
        for (const child of childRouters) {
            await collect(child);
        }
    };

    await collect(rootRouter);

    // Process detected dynamic/unknown events from AST that weren't matched
    const dynamicEvents = astRoutes.filter(r => r.path === '__DYNAMIC_EVENT__' && !matchedAstRoutes.has(r));
    dynamicEvents.forEach((r, i) => {
        // Try to identify context
        let prefix = "Anonymous";
        if (r.handlerName && !r.handlerName.includes('=>') && !r.handlerName.includes('{')) {
            const parts = r.handlerName.split('.');
            if (parts.length > 0) prefix = parts[0];
        }

        const key = `${prefix}.Dynamic Event ${i + 1}`;

        channels[key] = {
            publish: {
                operationId: `dynamicEventWarning${i}`,
                summary: "Dynamic Event Detected",
                description: `A dynamic event listener was detected in your source code but the event name could not be determined statically.`,
                tags: [{ name: "Warnings" }],
                "x-warning": true,
                "x-source-info": {
                    file: r.sourceContext?.file,
                    line: r.sourceContext?.startLine,
                    snippet: r.sourceContext?.snippet || r.handlerSource,
                    offset: r.sourceContext?.snippetStartLine || r.sourceContext?.startLine,
                    highlightLines: r.sourceContext ? [r.sourceContext.startLine, r.sourceContext.endLine] : undefined
                },
                message: { payload: { type: 'object' } }
            }
        };
    });

    return {
        asyncapi: "3.0.0",
        info: { title: "Shokupan AsyncAPI", version: "1.0.0", ...options.info },
        channels
    };
}
