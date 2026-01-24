export const $isApplication = Symbol.for("Shokupan.app");
export const $appRoot = Symbol.for("Shokupan.app-root");
export const $isMounted = Symbol.for("Shokupan.isMounted");
export const $routeMethods = Symbol.for("Shokupan.routeMethods");
export const $eventMethods = Symbol.for("Shokupan.eventMethods");
export const $routeArgs = Symbol.for("Shokupan.routeArgs");
export const $controllerPath = Symbol.for("Shokupan.controllerPath");
export const $middleware = Symbol.for("Shokupan.middleware");
export const $isRouter = Symbol.for("Shokupan.router");
export const $parent = Symbol.for("Shokupan.parent");
export const $childRouters = Symbol.for("Shokupan.child-routers");
export const $childControllers = Symbol.for("Shokupan.child-controllers");
export const $mountPath = Symbol.for("Shokupan.mount-path");
export const $dispatch = Symbol.for("Shokupan.dispatch");
export const $routes = Symbol.for("Shokupan.routes");
export const $routeSpec = Symbol.for("Shokupan.routeSpec");



///
/// Context object "hidden" props that aren't intended for external use.
/// We use Symbols to hide them internally.
///
export const $url = Symbol.for("Shokupan.ctx.url");
export const $requestId = Symbol.for("Shokupan.ctx.requestId");
export const $debug = Symbol.for("Shokupan.ctx.debug");
export const $finalResponse = Symbol.for("Shokupan.ctx.finalResponse");
export const $rawBody = Symbol.for("Shokupan.ctx.rawBody");
export const $cachedBody = Symbol.for("Shokupan.ctx.cachedBody");
export const $bodyType = Symbol.for("Shokupan.ctx.bodyType");
export const $bodyParsed = Symbol.for("Shokupan.ctx.bodyParsed");
export const $bodyParseError = Symbol.for("Shokupan.ctx.bodyParseError");
export const $routeMatched = Symbol.for("Shokupan.ctx.routeMatched");
export const $cachedHostname = Symbol.for("Shokupan.ctx.cachedHostname");
export const $cachedProtocol = Symbol.for("Shokupan.ctx.cachedProtocol");
export const $cachedHost = Symbol.for("Shokupan.ctx.cachedHost");
export const $cachedOrigin = Symbol.for("Shokupan.ctx.cachedOrigin");
export const $cachedQuery = Symbol.for("Shokupan.ctx.cachedQuery");
export const $cachedCookies = Symbol.for("Shokupan.ctx.cachedCookies");
export const $ws = Symbol.for("Shokupan.ctx.ws");
export const $socket = Symbol.for("Shokupan.ctx.socket");
export const $io = Symbol.for("Shokupan.ctx.io");

export const $mcpTools = Symbol.for("Shokupan.mcp.tools");
export const $mcpPrompts = Symbol.for("Shokupan.mcp.prompts");
export const $mcpResources = Symbol.for("Shokupan.mcp.resources");

export const $resilienceConfig = Symbol.for("Shokupan.resilience.config");


