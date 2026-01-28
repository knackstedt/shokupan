
import type { ShokupanRouter } from '../../../router';
import { $appRoot, $childRouters, $isApplication, $mountPath, $routes } from '../../../util/symbol';
import type { AsyncAPIOptions } from '../../../util/types';
import { getAstRoutes } from '../shared/ast-utils';

/**
 * Regex patterns for detecting emit calls.
 */

/**
 * Check if a schema contains fields with unknown types
 */
function hasUnknownFields(schema: any): boolean {
    if (!schema) return false;
    if (schema['x-unknown']) return true;

    if (schema.type === 'object' && schema.properties) {
        return Object.values(schema.properties).some((prop: any) =>
            hasUnknownFields(prop)
        );
    }

    if (schema.type === 'array' && schema.items) {
        return hasUnknownFields(schema.items);
    }

    return false;
}

/**
 * Gets deduped AST routes if available.
 * Duplicated from openapi.ts to avoid cross-module dependency issues.
 */

export async function generateAsyncApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: AsyncAPIOptions = {}): Promise<any> {
    const channels: Record<string, any> = {};

    // Attempt to run AST Analysis
    let astRoutes: any[] = [];
    let astMiddlewareRegistry: Record<string, any> = {};
    let applications: any[] = [];
    let astStatus: 'analyzing' | 'completed' | 'failed' | 'disabled' = 'disabled';

    try {
        // Check if async AST scanning is enabled
        const rootApp = (rootRouter as any)[$appRoot] || rootRouter;
        const useAsyncScanning = rootApp?.applicationConfig?.enableAsyncAstScanning ?? true;

        if (useAsyncScanning) {
            // Use async worker-based analyzer
            const { getGlobalAnalyzer } = await import('../../../util/ast-analyzer-worker');
            const entrypoint = (globalThis as any).Bun?.main || require.main?.filename || process.argv[1];
            const timeout = rootApp?.applicationConfig?.astAnalysisTimeout ?? 30000;

            const analyzer = getGlobalAnalyzer(process.cwd(), entrypoint, timeout);

            // Check current state
            const state = analyzer.getState();

            if (state === 'completed') {
                // Use cached results
                const result = analyzer.getResult();
                if (result) {
                    applications = result.applications;
                    astStatus = 'completed';
                }
            } else if (state === 'analyzing') {
                // Analysis in progress
                astStatus = 'analyzing';
                // Don't wait, return partial spec
            } else if (state === 'failed') {
                // Previous analysis failed
                astStatus = 'failed';
                if (options.warnings) {
                    const error = analyzer.getError();
                    options.warnings.push({
                        type: 'ast-analysis-failed',
                        message: 'AST Analysis failed',
                        detail: error?.message || 'Unknown error'
                    });
                }
            } else {
                // Not started yet - start it but don't wait
                analyzer.analyze().then(result => {
                    // Analysis completed in background
                }).catch(err => {
                    // Analysis failed, but we've already returned the spec
                });
                astStatus = 'analyzing';
            }
        } else {
            // Use synchronous analyzer (old behavior)
            const { OpenAPIAnalyzer } = await import('../openapi/analyzer');
            const entrypoint = (globalThis as any).Bun?.main || require.main?.filename || process.argv[1];
            const analyzer = new OpenAPIAnalyzer(process.cwd(), entrypoint);
            const analysisResult = await analyzer.analyze();
            applications = analysisResult.applications;
            astStatus = 'completed';
        }

        if (applications.length > 0) {
            astRoutes = await getAstRoutes(applications, {
                includePrefix: false,
                pathTransform: (p) => p.startsWith('/') ? p.slice(1) : p
            });

            // Build middleware registry from AST-analyzed applications
            let middlewareId = 0;
            for (const app of applications) {
                if (app.middleware && app.middleware.length > 0) {
                    for (const mw of app.middleware) {
                        const id = `middleware-${middlewareId++}`;
                        astMiddlewareRegistry[id] = {
                            ...mw,
                            id,
                            usedBy: [] // Will be populated when processing events
                        };
                    }
                }
            }
        }
    } catch (e) {
        // Silently fail if analysis cannot run
        astStatus = 'failed';
        if (options.warnings) {
            options.warnings.push({
                type: 'ast-analysis-failed',
                message: 'AST Analysis failed or skipped',
                detail: e.message
            });
        }
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
                // Iterate through all handlers to accumulate source info
                for (const handler of handlers) {
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

                    const sourceInfo = ((handler as any).source || astMatch?.sourceContext) ? {
                        file: (handler as any).source?.file || astMatch?.sourceContext?.file,
                        line: (handler as any).source?.line || astMatch?.sourceContext?.startLine,
                        startLine: (handler as any).source?.line || astMatch?.sourceContext?.startLine,
                        endLine: astMatch?.sourceContext?.endLine,
                        highlightLines: astMatch?.sourceContext ? [astMatch.sourceContext.startLine, astMatch.sourceContext.endLine] : undefined
                    } : undefined;

                    const message = {
                        ...(userSpec?.message || {})
                    };
                    let inferenceFailed = false;

                    if (!message.payload) {
                        if (astMatch) {
                            if (astMatch.requestTypes?.body) {
                                message.payload = astMatch.requestTypes.body;
                                // Check if generic object
                                if (message.payload.type === 'object' &&
                                    !message.payload.properties &&
                                    !message.payload.additionalProperties &&
                                    Object.keys(message.payload).length === 1) {
                                    inferenceFailed = true;
                                }
                            } else {
                                // Valid AST match but no body usage -> Payload is unused
                            }
                        } else {
                            // Default to object if no AST and no user spec
                            message.payload = { type: 'object' };
                            inferenceFailed = true;
                        }
                    }

                    if (!channels[eventName]) {
                        const publishOp = {
                            operationId: `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`,
                            tags,
                            message,
                            ...(userSpec?.type === 'publish' ? userSpec : {}),
                            "x-source-info": sourceInfo ? [sourceInfo] : [],
                            "x-shokupan-source": {
                                ...sourceInfo,
                                pluginName: (handler as any).pluginName
                            }
                        };

                        if (inferenceFailed) {
                            (publishOp as any)['x-warning'] = true;
                            if (!publishOp.summary) publishOp.summary = "Payload Inference Failed";
                            if (!publishOp.description) publishOp.description = "The payload format could not be statically inferred from the source code. Please add a type assertion or @Spec decorator.";
                        }

                        // Apply user-defined summary/description if not already set by inferenceFailed warning
                        if (userSpec?.summary && !publishOp.summary) publishOp.summary = userSpec.summary;
                        if (userSpec?.description && !publishOp.description) publishOp.description = userSpec.description;

                        channels[eventName] = {
                            publish: publishOp
                        };
                    } else {
                        // Accumulate source info from additional handlers
                        if (sourceInfo) {
                            if (!channels[eventName].publish["x-source-info"]) {
                                channels[eventName].publish["x-source-info"] = [];
                            }
                            const exists = channels[eventName].publish["x-source-info"].some((s: any) =>
                                s.file === sourceInfo.file && s.line === sourceInfo.line
                            );
                            if (!exists) {
                                channels[eventName].publish["x-source-info"].push(sourceInfo);
                            }
                        }
                    }

                    // Analyze for outgoing events
                    let emits = astMatch?.emits || [];

                    for (const emit of emits) {
                        if (emit.event === '__DYNAMIC_EMIT__') {
                            const warningKey = `${eventName}/Dynamic Emit`;
                            if (options.warnings) {
                                options.warnings.push({
                                    type: 'dynamic-emit',
                                    message: 'Dynamic emit detected',
                                    detail: `Event: ${eventName}`,
                                    location: { file: astMatch?.sourceContext?.file, line: emit.location?.startLine }
                                });
                            }
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
                                        startLine: emit.location?.startLine,
                                        endLine: emit.location?.endLine,
                                        highlightLines: emit.location ? [emit.location.startLine, emit.location.endLine] : undefined
                                    },
                                    "x-shokupan-source": {
                                        file: astMatch?.sourceContext?.file,
                                        line: emit.location?.startLine,
                                    },
                                    message: { payload: { type: 'object' } }
                                }
                            };
                            continue;
                        }

                        const emitStart = emit.location?.startLine;
                        const emitEnd = emit.location?.endLine;

                        const newSourceInfo = (sourceInfo && emitStart) ? {
                            file: sourceInfo.file,
                            line: emitStart,
                            startLine: emitStart,
                            endLine: emitEnd,
                            highlightLines: sourceInfo.highlightLines,
                            emitHighlightLines: [emitStart, emitEnd]
                        } : undefined;

                        if (!channels[emit.event]) {
                            const payload = emit.payload || { type: 'object' };
                            const warning = hasUnknownFields(payload);

                            channels[emit.event] = {
                                subscribe: {
                                    operationId: `emit${emit.event.charAt(0).toUpperCase() + emit.event.slice(1)}`,
                                    tags,
                                    message: {
                                        payload
                                    },
                                    ...(warning ? {
                                        'x-warning': true,
                                        'x-warning-reason': 'Payload contains fields with unknown types that could not be statically analyzed'
                                    } : {}),
                                    "x-source-info": newSourceInfo ? [newSourceInfo] : [],
                                    "x-shokupan-source": (sourceInfo && emitStart) ? {
                                        file: sourceInfo.file,
                                        line: emitStart,
                                        pluginName: (handler as any).pluginName
                                    } : undefined
                                }
                            };
                        } else {
                            if (newSourceInfo) {
                                if (!channels[emit.event].subscribe["x-source-info"]) {
                                    channels[emit.event].subscribe["x-source-info"] = [];
                                }
                                const existing = channels[emit.event].subscribe["x-source-info"];
                                const exists = existing.some((s: any) =>
                                    s.file === newSourceInfo.file && s.line === newSourceInfo.line
                                );
                                if (!exists) {
                                    existing.push(newSourceInfo);
                                }
                            }
                        }
                    }
                }
            } // end for handler
        }; // end for eventHandlers

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

                // Find AST match
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

                // Reconstruct SourceInfo for reuse
                const sourceInfo = ((handler as any).source || astMatch?.sourceContext) ? {
                    file: (handler as any).source?.file || astMatch?.sourceContext?.file,
                    line: (handler as any).source?.line || astMatch?.sourceContext?.startLine,
                    startLine: (handler as any).source?.line || astMatch?.sourceContext?.startLine,
                    endLine: astMatch?.sourceContext?.endLine,
                    highlightLines: astMatch?.sourceContext ? [astMatch.sourceContext.startLine, astMatch.sourceContext.endLine] : undefined
                } : undefined;

                let emits = astMatch?.emits || [];

                for (const emit of emits) {
                    const emitStart = emit.location?.startLine;
                    const emitEnd = emit.location?.endLine;

                    const newSourceInfo = (sourceInfo && emitStart) ? {
                        file: sourceInfo.file,
                        line: emitStart,
                        startLine: emitStart,
                        endLine: emitEnd,
                        highlightLines: sourceInfo.highlightLines,
                        emitHighlightLines: [emitStart, emitEnd]
                    } : undefined;

                    // Only add if not already defined
                    if (!channels[emit.event]) {
                        const payload = emit.payload || { type: 'object' };
                        const warning = hasUnknownFields(payload);

                        channels[emit.event] = {
                            subscribe: {
                                operationId: `emit${emit.event.charAt(0).toUpperCase() + emit.event.slice(1)}`,
                                tags,
                                message: {
                                    payload
                                },
                                ...(warning ? {
                                    'x-warning': true,
                                    'x-warning-reason': 'Payload contains fields with unknown types that could not be statically analyzed'
                                } : {}),
                                "x-source-info": newSourceInfo ? [newSourceInfo] : [],
                                "x-shokupan-source": (sourceInfo && emitStart) ? {
                                    file: sourceInfo.file,
                                    line: emitStart,
                                } : undefined
                            }
                        };
                    } else {
                        if (newSourceInfo) {
                            if (!channels[emit.event].subscribe["x-source-info"]) {
                                channels[emit.event].subscribe["x-source-info"] = [];
                            }
                            const existing = channels[emit.event].subscribe["x-source-info"];
                            const exists = existing.some((s: any) =>
                                s.file === newSourceInfo.file && s.line === newSourceInfo.line
                            );
                            if (!exists) {
                                existing.push(newSourceInfo);
                            }
                        }
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
        if (options.warnings) {
            options.warnings.push({
                type: 'dynamic-event',
                message: 'Dynamic event listener detected',
                detail: `Event listener with dynamic name`,
                location: { file: r.sourceContext?.file, line: r.sourceContext?.startLine }
            });
        }

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
                    startLine: r.sourceContext?.startLine,
                    endLine: r.sourceContext?.endLine,
                    highlightLines: r.sourceContext ? [r.sourceContext.startLine, r.sourceContext.endLine] : undefined
                },
                "x-shokupan-source": {
                    file: r.sourceContext?.file,
                    line: r.sourceContext?.startLine,
                },
                message: { payload: { type: 'object' } }
            }
        };
    });

    return {
        asyncapi: "3.0.0",
        info: { title: "Shokupan AsyncAPI", version: "1.0.0", ...options.info },
        channels,
        "x-middleware-registry": astMiddlewareRegistry,
        "x-ast-status": astStatus
    };
};
