/**
 * Utility for generating links to open files in various editors.
 * Controlled by the `IDE` environment variable or app-level configuration.
 */

import { execSync } from 'node:child_process';

let configuredIde: string | undefined;

export function configureIde(config: { ide?: string; }) {
    configuredIde = config.ide;
}

function getIdeSetting(): string {
    return (configuredIde || process.env['IDE'] || 'vscode').toLowerCase();
}

function getGitRemote(): string | undefined {
    try {
        const remote = execSync('git config --get remote.origin.url', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return remote;
    } catch {
        return undefined;
    }
}

function getWebBaseUrl(remote: string): string | undefined {
    // Handle SSH urls: git@github.com:user/repo.git -> https://github.com/user/repo
    // Handle HTTPS urls: https://github.com/user/repo.git -> https://github.com/user/repo

    let url = remote;
    if (url.startsWith('git@')) {
        url = url.replace(':', '/').replace('git@', 'https://');
    }

    if (url.endsWith('.git')) {
        url = url.slice(0, -4);
    }

    return url;
}

export function getEditorLinkPattern(): string {
    const ide = getIdeSetting();

    // Autodetection Logic for pattern
    // Note: Patterns are often used client-side where we can't exec git.
    // Ideally the server resolves the pattern once.
    if (ide === 'autodetect-vscode.dev' || ide === 'autodetect-repo') {
        const remote = process.env['REPO_URL'] ||= getGitRemote();
        if (remote) {
            const baseUrl = getWebBaseUrl(remote);
            if (baseUrl) {
                if (ide === 'autodetect-vscode.dev') {
                    // https://vscode.dev/github/user/repo
                    // Convert https://github.com/user/repo -> https://vscode.dev/github/user/repo
                    if (baseUrl.includes('github.com')) {
                        return `https://vscode.dev/${baseUrl.replace('https://', '')}/blob/main/{{relative}}#L{{line}}`;
                    }
                    // Fallback for others if vscode.dev supports them? 
                    // Currently vscode.dev is primarilly github/azure repos.
                    // We'll stick to simple vscode.dev/github logic for now or fallback.
                } else {
                    // autodetect-repo
                    if (baseUrl.includes('github')) return `${baseUrl}/blob/main/{{relative}}#L{{line}}`;
                    if (baseUrl.includes('gitlab')) return `${baseUrl}/-/blob/main/{{relative}}#L{{line}}`;
                    if (baseUrl.includes('bitbucket')) return `${baseUrl}/src/main/{{relative}}#lines-{{line}}`;
                }
            }
        }
        // Fallback pattern if detection fails
        return 'vscode://file/{{absolute}}:{{line}}:{{column}}';
    }

    // Explicit web-based overrides
    if (ide.includes('github') || ide.includes('gitlab') || ide.includes('bitbucket')) {
        if (ide.includes('github')) return 'https://github.com/blob/main/{{relative}}#L{{line}}';
        if (ide.includes('gitlab')) return 'https://gitlab.com/blob/main/{{relative}}#L{{line}}';
        if (ide.includes('bitbucket')) return 'https://bitbucket.org/src/main/{{relative}}#lines-{{line}}';
    }

    switch (ide) {
        case 'vscode-insiders':
            return 'vscode-insiders://file/{{absolute}}:{{line}}:{{column}}';
        case 'vscodium':
            return 'vscodium://file/{{absolute}}:{{line}}:{{column}}';
        case 'cursor':
            return 'cursor://file/{{absolute}}:{{line}}:{{column}}';
        case 'intellij':
        case 'idea':
            return 'idea://open?file={{absolute}}&line={{line}}';
        case 'sublime':
            return 'subl://open?url=file://{{absolute}}&line={{line}}';
        case 'neovim':
        case 'nvim':
            // Standard custom protocol often used with nvim-remote or similar
            return 'nvim://{{absolute}}:{{line}}:{{column}}';
        case 'vscode.dev':
            // Assuming local file mapping isn't possible, this might be tricky.
            // But following the pattern:
            return 'https://vscode.dev/{{absolute}}';
        case 'vscode':
        default:
            return 'vscode://file/{{absolute}}:{{line}}:{{column}}';
    }
}

export function generateEditorLink(filePath: string, line: number = 1, column: number = 1): string {
    const ide = getIdeSetting();

    // Helper for web links
    const resolveWebLink = (forcedMode?: string) => {
        const remote = process.env['REPO_URL'] ||= getGitRemote();
        if (!remote) return null;

        const baseUrl = getWebBaseUrl(remote);
        if (!baseUrl) return null;

        // Ensure strictly relative path
        const cwd = process.cwd();
        const relativePath = filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
        const branch = process.env['GIT_BRANCH'] || 'main'; // Could also allow detected branch

        if (forcedMode === 'vscode.dev') {
            if (baseUrl.includes('github.com')) {
                // https://vscode.dev/github/user/repo/blob/branch/file
                return `https://vscode.dev/${baseUrl.replace('https://', '')}/blob/${branch}/${relativePath}#L${line}`;
            }
            return null;
        }

        // Repo links
        if (baseUrl.includes('github')) {
            return `${baseUrl}/blob/${branch}/${relativePath}#L${line}`;
        }
        if (baseUrl.includes('gitlab')) {
            return `${baseUrl}/-/blob/${branch}/${relativePath}#L${line}`;
        }
        if (baseUrl.includes('bitbucket')) {
            return `${baseUrl}/src/${branch}/${relativePath}#lines-${line}`;
        }
        return null;
    };


    if (ide === 'autodetect-vscode.dev') {
        const link = resolveWebLink('vscode.dev');
        if (link) return link;
        // Fallback
    }

    if (ide === 'autodetect-repo') {
        const link = resolveWebLink();
        if (link) return link;
        // Fallback
    }

    if (['github', 'gitlab', 'bitbucket'].some(t => ide.includes(t))) {
        // This block handles explicit "github" etc. where we might assume standard patterns
        // OR we try to resolve if possible.
        // Original implementation assumed env vars or fallback.
        // Let's try resolve first.
        const link = resolveWebLink();
        if (link) return link;

        const repoUrl = process.env['REPO_URL'];
        if (repoUrl) {
            const cwd = process.cwd();
            const relativePath = filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
            const branch = process.env['GIT_BRANCH'] || 'main';
            const base = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;

            if (ide.includes('github')) return `${base}/blob/${branch}/${relativePath}#L${line}`;
            if (ide.includes('gitlab')) return `${base}/-/blob/${branch}/${relativePath}#L${line}`;
            if (ide.includes('bitbucket')) return `${base}/src/${branch}/${relativePath}#lines-${line}`;
        }

        // Fallback if no remote info found
        return `vscode://file/${filePath}:${line}:${column}`;
    }


    switch (ide) {
        case 'vscode-insiders':
            return `vscode-insiders://file/${filePath}:${line}:${column}`;
        case 'vscodium':
            return `vscodium://file/${filePath}:${line}:${column}`;
        case 'cursor':
            return `cursor://file/${filePath}:${line}:${column}`;
        case 'intellij':
        case 'idea':
            return `idea://open?file=${filePath}&line=${line}`;
        case 'sublime':
            return `subl://open?url=file://${filePath}&line=${line}`;
        case 'neovim':
        case 'nvim':
            return `nvim://${filePath}:${line}:${column}`;
        case 'vscode.dev':
            // If manual "vscode.dev" setting without autodetect, we assume local absolute path 
            // but vscode.dev can't usually open that. 
            // The user probably meant "try your best to link to vscode.dev for this file".
            // We'll try resolveWebLink first
            const link = resolveWebLink('vscode.dev');
            if (link) return link;
            return `https://vscode.dev/${filePath}`;
        case 'vscode':
        default:
            return `vscode://file/${filePath}:${line}:${column}`;
    }
}
