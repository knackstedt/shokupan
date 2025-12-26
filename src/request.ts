import type { Method } from './types';

export type ConvectionRequestProps = {
    method: Method;
    url: string;
    headers: Headers;
    body: any;
};

/**
 * This class is used to create a request object.
 * It is used to make requests to the router.
 */
class ConvectionRequestBase {
    method: Method;
    url: string;
    headers: Headers;
    body: any;

    async json(): Promise<any> { return JSON.parse(this.body); }
    async text(): Promise<string> { return this.body; }

    constructor(props: ConvectionRequestProps) {
        Object.assign(this, props);
        if (!(this.headers instanceof Headers)) {
            this.headers = new Headers(this.headers);
        }
    }
}

/**
 * This type is used to add properties to the request object.
 */
export type ConvectionRequest<T> = ConvectionRequestBase & T;

interface ConvectionConstructor {
    new <T extends Record<string, any>>(props: ConvectionRequestProps): ConvectionRequest<T>;
}

/**
 * This class is used to create a request object.
 * It is used to make requests to the router.
 */
export const ConvectionRequest = ConvectionRequestBase as ConvectionConstructor;
