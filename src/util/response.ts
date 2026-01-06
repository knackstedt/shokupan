
/**
 * Custom response class to handle response state (headers, status) 
 * before the actual Response object is created.
 */
export class ShokupanResponse {
    private _headers: Headers | null = null;
    private _status = 200;

    /**
     * Get the current headers
     */
    get headers() {
        if (!this._headers) this._headers = new Headers();
        return this._headers;
    }

    /**
     * Get the current status code
     */
    get status() {
        return this._status;
    }

    /**
     * Set the status code
     */
    set status(code: number) {
        this._status = code;
    }

    /**
     * Set a response header
     * @param key Header name
     * @param value Header value
     */
    public set(key: string, value: string) {
        if (!this._headers) this._headers = new Headers();
        this._headers.set(key, value);
        return this;
    }

    /**
     * Append to a response header
     * @param key Header name
     * @param value Header value
     */
    public append(key: string, value: string) {
        if (!this._headers) this._headers = new Headers();
        this._headers.append(key, value);
        return this;
    }

    /**
     * Get a response header value
     * @param key Header name
     */
    public get(key: string) {
        return this._headers?.get(key) || null;
    }

    /**
     * Check if a header exists
     * @param key Header name
     */
    public has(key: string) {
        return this._headers?.has(key) || false;
    }

    /**
     * Internal: check if headers have been initialized/modified
     */
    public get hasPopulatedHeaders() {
        return this._headers !== null;
    }
}
