import type { ShokupanRequest } from "./request";
import type { ShokupanConfig } from "./types";

/**
 * Keys that can pollute the prototype chain if assigned to an object.
 * Used to strip dangerous keys from JSON.parse results.
 */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively strip `__proto__`, `constructor`, and `prototype` keys from a
 * parsed JSON value. This prevents prototype pollution when the parsed object
 * is later merged into other objects via Object.assign, spread, or deep merge.
 *
 * `JSON.parse` preserves `__proto__` as an own property on the result object.
 * While this alone doesn't pollute the prototype, the property becomes a
 * pollution vector if the object is passed to an unsafe merge function.
 */
function stripPrototypePollutionKeys(value: any): any {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (item && typeof item === 'object') {
                value[i] = stripPrototypePollutionKeys(item);
            }
        }
        return value;
    }
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
                delete value[key];
            } else {
                const child = value[key];
                if (child && typeof child === 'object') {
                    value[key] = stripPrototypePollutionKeys(child);
                }
            }
        }
        return value;
    }
    return value;
}

/**
 * Utility class for parsing request bodies.
 * Handles size limits, parsing, and caching logic detached from the Context.
 */
export class BodyParser {

    /**
     * Parses the body of a request based on Content-Type header.
     * @param req The ShokupanRequest object
     * @param config Application configuration for limits and parser options
     * @returns The parsed body or throws an error
     */
    static async parse(req: ShokupanRequest<any>, config: ShokupanConfig = {}): Promise<{ type: string, body: any; }> {
        const contentType = req.headers.get("content-type") || "";
        const maxBodySize = config.maxBodySize ?? 10 * 1024 * 1024; // Default 10MB

        if (contentType.includes("application/json") || contentType.includes("+json")) {
            return {
                type: 'json',
                body: await BodyParser.parseJson(req, config.jsonParser || 'native', maxBodySize)
            };
        } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            return {
                type: 'formData',
                body: await BodyParser.parseFormData(req, maxBodySize)
            };
        } else {
            return {
                type: 'text',
                body: await BodyParser.readRawBody(req, maxBodySize)
            };
        }
    }

    /**
     * Parsing helper for JSON
     */
    static async parseJson(req: ShokupanRequest<any>, parserType: 'native' | 'parse-json' | 'secure-json-parse', maxBodySize: number): Promise<any> {
        // To enforce maxBodySize, we must read the raw body ourselves
        const rawText = await BodyParser.readRawBody(req, maxBodySize);

        if (parserType === 'native') {
            // Handle empty body definition
            if (!rawText) return {};
            // Security: strip __proto__/constructor/prototype keys from the
            // parsed result to prevent prototype pollution when the body is
            // later merged into other objects. secure-json-parse does this
            // automatically, but the native parser does not.
            return stripPrototypePollutionKeys(JSON.parse(rawText));
        } else {
            const { getJSONParser } = await import('./json-parser');
            const parser = getJSONParser(parserType);
            return parser(rawText);
        }
    }

    /**
     * Parsing helper for FormData
     * Security: Enforces maxBodySize by reading the raw body stream before
     * handing it to formData(), so the limit cannot be bypassed via a spoofed
     * Content-Length header.
     */
    static async parseFormData(req: ShokupanRequest<any>, maxBodySize: number): Promise<FormData> {
        // Enforce Content-Length header presence, unless chunked
        if (!req.headers.has('content-length') && req.headers.get('transfer-encoding') !== 'chunked') {
            const err = new Error("Length Required");
            (err as any).status = 411;
            throw err;
        }

        // Read and size-limit the raw body stream first
        const rawBuffer = await BodyParser.readRawBufferBody(req, maxBodySize);

        // Reconstruct a synthetic Request so the runtime can parse FormData
        // from the already-read buffer (avoids re-reading a consumed stream).
        const syntheticReq = new Request('http://localhost', {
            method: 'POST',
            headers: req.headers,
            body: rawBuffer.buffer as ArrayBuffer
        });
        return syntheticReq.formData();
    }

    /**
     * Reads raw body as Uint8Array with size enforcement (used by parseFormData).
     */
    static async readRawBufferBody(req: ShokupanRequest<any>, maxBodySize: number): Promise<Uint8Array> {
        if (typeof (req as any).body === 'string') {
            const enc = new TextEncoder().encode((req as any).body);
            if (enc.byteLength > maxBodySize) {
                const err = new Error("Payload Too Large");
                (err as any).status = 413;
                throw err;
            }
            return enc;
        }

        const reader = req.body?.getReader();
        if (!reader) return new Uint8Array(0);

        const chunks: Uint8Array[] = [];
        let totalSize = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                totalSize += value.length;
                if (totalSize > maxBodySize) {
                    const err = new Error("Payload Too Large");
                    (err as any).status = 413;
                    throw err;
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    /**
     * Reads raw body as string with size enforcement
     */
    static async readRawBody(req: ShokupanRequest<any>, maxBodySize: number): Promise<string> {
        // Handle test case where body is already a string
        if (typeof (req as any).body === 'string') {
            const body = (req as any).body;
            if (body.length > maxBodySize) {
                const err = new Error("Payload Too Large");
                (err as any).status = 413;
                throw err;
            }
            return body;
        }

        const reader = req.body?.getReader();
        if (!reader) {
            return '';
        }

        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                totalSize += value.length;
                if (totalSize > maxBodySize) {
                    const err = new Error("Payload Too Large");
                    (err as any).status = 413;
                    throw err;
                }

                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        // Efficiently combine chunks into single buffer
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return new TextDecoder().decode(result);
    }
}
