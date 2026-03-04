import { decompressSync, gunzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';

/**
 * Utility to decompress data based on content encoding.
 * Supports gzip, deflate, br (Brotli), and zstd.
 */
export async function decompress(data: Uint8Array, encoding: string): Promise<Uint8Array> {
    const enc = encoding.toLowerCase().trim();

    try {
        if (enc === 'gzip') {
            return gunzipSync(data);
        }

        if (enc === 'deflate') {
            return decompressSync(data);
        }

        if (enc === 'br') {
            const brotliModule: any = await import('brotli-wasm');
            const brotli = await (brotliModule.default || brotliModule);
            return brotli.decompress(data);
        }

        if (enc === 'zstd') {
            return zstdDecompress(data);
        }
    } catch (err) {
        console.error(`Decompression failed for encoding "${encoding}":`, err);
        throw err;
    }

    // Default: return original data if encoding is unknown or 'identity'
    return data;
}

/**
 * Checks if an encoding is supported for decompression.
 */
export function isSupportedEncoding(encoding: string | undefined): boolean {
    if (!encoding) return false;
    const enc = encoding.toLowerCase().trim();
    return ['gzip', 'deflate', 'br', 'zstd'].includes(enc);
}
