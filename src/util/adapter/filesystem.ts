
export interface FileSystemAdapter {
    readFile(path: string): Promise<Uint8Array | string | ReadableStream>;
    stat?(path: string): Promise<{ size: number; mtime: Date; }>;
}

let fs: typeof import("node:fs/promises") | undefined;

/**
 * Default file system adapter that uses Bun.file for Bun and Node.js fs.promises for Node.js.
 */
export class DefaultFileSystemAdapter implements FileSystemAdapter {
    async readFile(path: string): Promise<Uint8Array | string | ReadableStream> {
        // @ts-ignore
        if (typeof Bun !== "undefined") {
            // @ts-ignore
            return Bun.file(path);
        } else {
            // Dynamic import for Node.js compatibility without top-level import
            fs ??= await import('node:fs/promises');
            return fs.readFile(path);
        }
    }

    async stat(path: string): Promise<{ size: number; mtime: Date; }> {
        // @ts-ignore
        if (typeof Bun !== "undefined") {
            // @ts-ignore
            const file = Bun.file(path);
            return {
                size: file.size,
                mtime: new Date(file.lastModified)
            };
        } else {
            fs ??= await import('node:fs/promises');
            const stats = await fs.stat(path);
            return {
                size: stats.size,
                mtime: stats.mtime
            };
        }
    }
}

export class NoOpFileSystemAdapter implements FileSystemAdapter {
    async readFile(path: string): Promise<Uint8Array | string | ReadableStream> {
        throw new Error("File system access is not supported in this environment (NoOpFileSystemAdapter).");
    }
}
