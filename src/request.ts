import type { Method } from './types';

export type ConvectionRequestProps = {
    method: Method;
    url: string;
    headers: Headers;
    body: any;
};

class ConvectionRequestBase {
    method: Method;
    url: string;
    headers: Headers;
    body: any;

    json(): Promise<any> { return JSON.parse(this.body); }
    text(): Promise<string> { return this.body; }

    constructor(props: ConvectionRequestProps) {
        Object.assign(this, props);
    }
}

export type ConvectionRequest<T> = ConvectionRequestBase & T;

interface ConvectionConstructor {
    new <T extends Record<string, any>>(props: ConvectionRequestProps): ConvectionRequest<T>;
}

export const ConvectionRequest = ConvectionRequestBase as ConvectionConstructor;

const req = new ConvectionRequest<{ foo: string; }>({
    method: "GET",
    url: "/",
    headers: new Headers(),
    body: ""
});


req.foo = "bar"; // Works perfectly with Intellsense!
req.json();      // Class methods still work.