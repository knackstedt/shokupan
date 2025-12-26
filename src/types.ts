import type { OpenAPI } from '@scalar/openapi-types';
import type { ConvectionContext } from './context';
import { $isRouter } from "./symbol";

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export type MethodAPISpec = OpenAPI.Operation;
export type GuardAPISpec = DeepPartial<OpenAPI.Operation>;
export type RouterAPISpec = OpenAPI.Operation & Pick<Required<OpenAPI.Operation>, 'tags'> & { group: string; };

export interface OpenAPIOptions {
    info?: OpenAPI.Document['info'];
    servers?: OpenAPI.Document['servers'];
    components?: OpenAPI.Document['components'];
    tags?: OpenAPI.Document['tags'];
    externalDocs?: OpenAPI.Document['externalDocs'];
    defaultTagGroup?: string;
    defaultTag?: string;
}


export type ConvectionHandler = (ctx: ConvectionContext, next?: NextFn) => Promise<any> | any;
export const HTTPMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ALL"];
export type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | "ALL";

export enum RouteParamType {
    BODY = "BODY",
    PARAM = "PARAM",
    QUERY = "QUERY",
    HEADER = "HEADER",
    REQUEST = "REQUEST",
    CONTEXT = "CONTEXT"
}

export type NextFn = () => Promise<any>;
export type Middleware = (ctx: ConvectionContext, next: NextFn) => Promise<any> | any;

export type ConvectionRouteConfig = DeepPartial<{
    name: string;
    group: string;
    openapi: DeepPartial<OpenAPI.Operation>;
}>;

export type ConvectionRoute = {
    method: Method;
    path: string;
    regex: RegExp;
    keys: string[];
    handler: ConvectionHandler;
    handlerSpec?: MethodAPISpec;
    group?: string;
    guards?: {
        handler: ConvectionHandler;
        spec?: GuardAPISpec;
    }[];
};

export type ConvectionConfig = DeepPartial<{
    port: number;
    hostname: string;
    development: boolean;
    enableAsyncLocalStorage: boolean;
    httpLogger: (ctx: ConvectionContext) => void;
    logger: {
        verbose: boolean;
        info: (msg: string, props: Record<string, any>) => void;
        debug: (msg: string, props: Record<string, any>) => void;
        warning: (msg: string, props: Record<string, any>) => void;
        error: (msg: string, props: Record<string, any>) => void;
        /**
         * Something fatally went wrong and the application cannot continue.
         */
        fatal: (msg: string, props: Record<string, any>) => void;
    };
    // Open for extension
    [key: string]: any;
}>;


export interface RequestOptions {
    path?: string;
    url?: string;
    method?: Method;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
}

export interface ProcessResult {
    status: number;
    headers: Record<string, string>;
    data: any;
}

export type ConvectionController<T = any> = (new (...args: any[]) => T) & {
    [$isRouter]?: undefined;
};



export interface StaticServeHooks {
    onRequest?: (ctx: ConvectionContext) => Promise<Response | void> | Response | void;
    onResponse?: (ctx: ConvectionContext, response: Response) => Promise<Response> | Response;
}

export interface StaticServeOptions {
    /**
     * Root directory to serve files from.
     * Can be an absolute path or relative to the CWD.
     */
    root?: string;
    /**
     * Whether to list directory contents if no index file is found.
     * @default false
     */
    listDirectory?: boolean;
    /**
     * Index file(s) to look for when a directory is requested.
     * @default ['index.html', 'index.htm']
     */
    index?: string | string[];
    /**
     * Hooks to intercept requests/responses.
     */
    hooks?: StaticServeHooks;
    /**
     * How to treat dotfiles (files starting with .)
     * 'allow': Serve them
     * 'deny': Return 403
     * 'ignore': Return 404
     * @default 'ignore'
     */
    dotfiles?: 'allow' | 'deny' | 'ignore';
    /**
     * Regex or glob patterns to exclude
     */
    exclude?: (string | RegExp)[];
    /**
     * Try to append these extensions to the path if the file is not found.
     * e.g. ['html', 'htm']
     */
    extensions?: string[];
    /**
     * OpenAPI specification for the static route.
     */
    openapi?: MethodAPISpec;
}
