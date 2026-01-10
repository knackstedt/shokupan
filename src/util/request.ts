import type { Method } from './types';

export type ShokupanRequestProps = {
    method: Method;
    url: string;
    headers: Headers | Record<string, string>;
    body: any;
};

/**
 * This class is used to create a request object.
 * It is used to make requests to the router.
 */
class ShokupanRequestBase {
    method: Method;
    url: string;
    headers: Headers;
    body: any;

    async json(): Promise<any> { return JSON.parse(this.body); }
    async text(): Promise<string> { return this.body; }
    async formData(): Promise<FormData> {
        if (this.body instanceof FormData) {
            return this.body;
        }
        return new Response(this.body, { headers: this.headers }).formData() as any;
    }

    constructor(props: ShokupanRequestProps) {
        Object.assign(this, props);
        if (!(this.headers instanceof Headers)) {
            this.headers = new Headers(this.headers);
        }
    }
}

/**
 * This type is used to add properties to the request object.
 */
export type ShokupanRequest<T> = ShokupanRequestBase & T;

interface ShokupanConstructor {
    new <T extends Record<string, any>>(props: ShokupanRequestProps): ShokupanRequest<T>;
}

/**
 * This class is used to create a request object.
 * It is used to make requests to the router.
 */
export const ShokupanRequest = ShokupanRequestBase as ShokupanConstructor;
