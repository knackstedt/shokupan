import type { ShokupanRequest } from "./request";
import type { ShokupanConfig } from "./types";

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
            return JSON.parse(rawText);
        } else {
            const { getJSONParser } = await import('./json-parser');
            const parser = getJSONParser(parserType);
            return parser(rawText);
        }
    }

    /**
     * Parsing helper for FormData
     */
    static async parseFormData(req: ShokupanRequest<any>, maxBodySize: number): Promise<FormData> {
        const clHeader = req.headers.get("content-length");
        if (!clHeader) {
            const err = new Error("Length Required");
            (err as any).status = 411;
            throw err;
        }

        const cl = parseInt(clHeader, 10);
        if (isNaN(cl)) {
            const err = new Error("Bad Request");
            (err as any).status = 400;
            throw err;
        }

        if (cl > maxBodySize) {
            const err = new Error("Payload Too Large");
            (err as any).status = 413;
            throw err;
        }
        // NOTE: Does not enforce limit during streaming for FormData in this implementation
        return req.formData();
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
