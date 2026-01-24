import { file } from 'bun';

export interface SourceContext {
    lines: {
        line: number;
        code: string;
        isTarget: boolean;
    }[];
    startLine: number;
    file: string;
}

export async function readSourceContext(filePath: string | undefined, line: number, contextLines: number = 5): Promise<SourceContext | null> {
    if (!filePath || filePath.startsWith('node:') || filePath.startsWith('bun:') || filePath.includes('node_modules')) {
        return null;
    }

    // Remove file:// prefix if present
    const path = filePath.startsWith('file://') ? filePath.slice(7) : filePath;

    try {
        const f = file(path);
        if (!await f.exists()) return null;

        const content = await f.text();
        const allLines = content.split('\n');

        // Line is 1-indexed in stack trace, but 0-indexed in array
        const targetIndex = line - 1;

        if (targetIndex < 0 || targetIndex >= allLines.length) return null;

        const start = Math.max(0, targetIndex - contextLines);
        const end = Math.min(allLines.length, targetIndex + contextLines + 1);

        const subset = allLines.slice(start, end).map((code, i) => ({
            line: start + i + 1,
            code,
            isTarget: (start + i + 1) === line
        }));

        return {
            lines: subset,
            startLine: start + 1,
            file: path
        };
    } catch (e) {
        return null;
    }
}
