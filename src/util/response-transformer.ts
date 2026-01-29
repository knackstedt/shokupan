import type { BodyInit } from "bun";

/**
 * Response transformer function
 * Converts data to a specific format and returns response metadata
 */
export interface ResponseTransformer {
    /**
     * MIME type(s) this transformer handles
     * Can be a string or array of strings
     */
    contentType: string | string[];

    /**
     * Serialize the data
     * @param data The data to serialize
     * @returns Serialized body and optional headers
     */
    serialize: (data: any) => {
        body: BodyInit;
        headers?: Record<string, string>;
    } | Promise<{
        body: BodyInit;
        headers?: Record<string, string>;
    }>;

    /**
     * Optional: Quality value for content negotiation (0-1)
     * Higher values = preferred format when multiple matches exist
     */
    quality?: number;
}

/**
 * Parsed Accept header entry
 */
interface AcceptEntry {
    type: string;
    subtype: string;
    quality: number;
    params: Record<string, string>;
}

/**
 * Response transformer registry
 * Manages registered transformers and performs content negotiation
 */
export class ResponseTransformerRegistry {
    private transformers: Map<string, ResponseTransformer> = new Map();
    private defaultTransformer?: string;

    /**
     * Register a response transformer
     * @param transformer The transformer to register
     */
    register(transformer: ResponseTransformer): void {
        const contentTypes = Array.isArray(transformer.contentType)
            ? transformer.contentType
            : [transformer.contentType];

        for (const contentType of contentTypes) {
            this.transformers.set(contentType.toLowerCase(), transformer);
        }
    }

    /**
     * Get a transformer by exact content type match
     * @param contentType The content type to look up
     * @returns The transformer or undefined
     */
    getTransformer(contentType: string): ResponseTransformer | undefined {
        return this.transformers.get(contentType.toLowerCase());
    }

    /**
     * Set the default transformer content type
     * @param contentType The content type to use as default
     */
    setDefault(contentType: string): void {
        this.defaultTransformer = contentType.toLowerCase();
    }

    /**
     * Get the default transformer
     * @returns The default transformer or undefined
     */
    getDefault(): ResponseTransformer | undefined {
        if (!this.defaultTransformer) {
            return undefined;
        }
        return this.transformers.get(this.defaultTransformer);
    }

    /**
     * Perform content negotiation based on Accept header
     * @param acceptHeader The Accept header value
     * @returns The best matching transformer or undefined
     */
    negotiate(acceptHeader: string): ResponseTransformer | undefined {
        if (!acceptHeader || acceptHeader === '*/*') {
            return this.getDefault();
        }

        const accepts = this.parseAcceptHeader(acceptHeader);

        // Sort by quality value (highest first)
        accepts.sort((a, b) => b.quality - a.quality);

        for (const accept of accepts) {
            // Try exact match
            const exactMatch = this.findExactMatch(accept);
            if (exactMatch) {
                return exactMatch;
            }

            // Try wildcard match (e.g., application/*)
            const wildcardMatch = this.findWildcardMatch(accept);
            if (wildcardMatch) {
                return wildcardMatch;
            }
        }

        // No match found, use default
        return this.getDefault();
    }

    /**
     * Parse Accept header into structured entries
     * @param acceptHeader The Accept header value
     * @returns Array of parsed accept entries
     */
    private parseAcceptHeader(acceptHeader: string): AcceptEntry[] {
        const entries: AcceptEntry[] = [];
        const parts = acceptHeader.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            const [mediaRange, ...params] = trimmed.split(';');
            const [type, subtype] = mediaRange.split('/');

            let quality = 1.0;
            const parsedParams: Record<string, string> = {};

            for (const param of params) {
                const [key, value] = param.split('=').map(s => s.trim());
                if (key === 'q') {
                    quality = parseFloat(value) || 1.0;
                } else {
                    parsedParams[key] = value;
                }
            }

            entries.push({
                type: type.trim(),
                subtype: subtype?.trim() || '*',
                quality,
                params: parsedParams
            });
        }

        return entries;
    }

    /**
     * Find exact content type match
     * @param accept The accept entry to match
     * @returns The matching transformer or undefined
     */
    private findExactMatch(accept: AcceptEntry): ResponseTransformer | undefined {
        const contentType = `${accept.type}/${accept.subtype}`;
        return this.transformers.get(contentType.toLowerCase());
    }

    /**
     * Find wildcard content type match
     * @param accept The accept entry to match
     * @returns The matching transformer or undefined
     */
    private findWildcardMatch(accept: AcceptEntry): ResponseTransformer | undefined {
        // Handle */* wildcard (accept anything)
        if (accept.type === '*' && accept.subtype === '*') {
            return this.getDefault();
        }

        // Handle type/* wildcard (e.g., application/*)
        if (accept.subtype === '*') {
            for (const [contentType, transformer] of this.transformers) {
                const [type] = contentType.split('/');
                if (type === accept.type.toLowerCase()) {
                    return transformer;
                }
            }
        }

        return undefined;
    }

    /**
     * Get all registered content types
     * @returns Array of registered content types
     */
    getRegisteredTypes(): string[] {
        return Array.from(this.transformers.keys());
    }
}
