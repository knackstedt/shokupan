
import type { ShokupanRouter } from '../../../router';
import { $childRouters, $isApplication, $mountPath } from '../../../util/symbol';
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

export async function generateAsyncApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: AsyncAPIOptions = {}): Promise<any> {
    const channels: Record<string, any> = {};

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

                if (!channels[eventName]) {
                    channels[eventName] = {
                        publish: {
                            operationId: `on${eventName.charAt(0).toUpperCase() + eventName.slice(1)}`,
                            tags,
                            message: {
                                payload: { type: 'object' },
                                ...(userSpec?.message ? userSpec.message : {})
                            },
                            ...(userSpec?.type === 'publish' ? userSpec : {})
                        }
                    };

                    if (userSpec?.summary) channels[eventName].publish.summary = userSpec.summary;
                    if (userSpec?.description) channels[eventName].publish.description = userSpec.description;
                }
                // ...

                // Analyze for outgoing events
                const { emits } = await analyzeHandler(handler);
                for (const emit of emits) {
                    if (!channels[emit.event]) {
                        channels[emit.event] = {
                            subscribe: {
                                operationId: `emit${emit.event.charAt(0).toUpperCase() + emit.event.slice(1)}`,
                                message: {
                                    payload: emit.payload
                                }
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

    return {
        asyncapi: "3.0.0",
        info: { title: "Shokupan AsyncAPI", version: "1.0.0", ...options.info },
        channels
    };
}
