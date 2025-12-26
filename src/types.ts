import type { OpenAPI } from '@scalar/openapi-types';
import type { ConvectionContext } from './context';
import { $isRouter } from "./symbol";

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export type MethodAPISpec = OpenAPI.Operation & Pick<Required<OpenAPI.Operation>, 'summary' | 'responses'>;
export type GuardAPISpec = DeepPartial<OpenAPI.Operation>;
export type RouterAPISpec = OpenAPI.Operation & Pick<Required<OpenAPI.Operation>, 'tags'> & { group: string; };

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
    openapi: DeepPartial<OpenAPI.Operation>;
}>;

export type ConvectionRoute = {
    method: Method;
    path: string;
    regex: RegExp;
    keys: string[];
    handler: ConvectionHandler;
    handlerSpec?: MethodAPISpec;
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


