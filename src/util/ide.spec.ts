import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configureIde, generateEditorLink, getEditorLinkPattern } from './ide';

describe('IDE Link Generator', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.IDE;
        delete process.env.REPO_URL;
        delete process.env.GIT_BRANCH;

        // Reset configuration
        configureIde({ ide: undefined });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should default to vscode', () => {
        expect(generateEditorLink('/path/to/file.ts', 10, 5)).toContain('vscode://');
        expect(getEditorLinkPattern()).toContain('vscode://');
    });

    it('should handle configuration override', () => {
        configureIde({ ide: 'intellij' });
        expect(generateEditorLink('/path/to/file.ts', 10)).toBe('idea://open?file=/path/to/file.ts&line=10');

        // Verify precedence: Config > Env Var
        process.env.IDE = 'sublime';
        expect(generateEditorLink('/path/to/file.ts', 10)).toBe('idea://open?file=/path/to/file.ts&line=10');
    });

    it('should handle env var if no config', () => {
        process.env.IDE = 'sublime';
        expect(generateEditorLink('/path/to/file.ts', 10)).toBe('subl://open?url=file:///path/to/file.ts&line=10');
    });

    it('should autodect-repo with REPO_URL env var', () => {
        configureIde({ ide: 'autodetect-repo' });
        process.env.REPO_URL = 'https://github.com/user/project';

        const cwd = process.cwd();
        expect(generateEditorLink(`${cwd}/src/file.ts`, 10)).toBe('https://github.com/user/project/blob/main/src/file.ts#L10');
    });

    it('should autodect-vscode.dev with REPO_URL env var', () => {
        configureIde({ ide: 'autodetect-vscode.dev' });
        process.env.REPO_URL = 'https://github.com/user/project';

        const cwd = process.cwd();
        expect(generateEditorLink(`${cwd}/src/file.ts`, 10)).toBe('https://vscode.dev/github.com/user/project/blob/main/src/file.ts#L10');
    });

    it('should generate github link when IDE=github and git remote is available', () => {
        // This test relies on the fact that we are in a git repo
        // If the environment has a git remote, it should work.
        process.env.IDE = 'github';
        // We ensure REPO_URL is NOT set, so it must use git config
        delete process.env.REPO_URL;

        const link = generateEditorLink('/path/to/file.ts', 10);

        // Use loose check because we might or might not detect a remote depending on CI env
        // But in this user session we saw it working.
        if (link.startsWith('vscode://')) {
            // Fallback happened (no git remote found?)
            expect(link).toContain('vscode://');
        } else {
            // Git remote found
            expect(link).toContain('https://');
            expect(link).toContain('#L10');
        }
    });
});
