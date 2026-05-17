import { execSync } from "node:child_process";
import type { Middleware } from './types';

export interface Logger {
    /**
     * Print a trace level message. This is typically used for debugging purposes and HIGHLY verbose. Think V8 engine level verbose.
     * (level 1)
     */
    trace(module: string, msg: string, props?: Record<string, any>): void;
    /**
     * Print a debug level message. This is typically used for diagnostics that are too verbose for info level but would be important to enable to diagnose an issue.
     * (level 2)
     */
    debug(module: string, msg: string, props?: Record<string, any>): void;
    /**
     * Print a info level message. This is typically used for informational purposes.
     * (level 3)
     */
    info(module: string, msg: string, props?: Record<string, any>): void;
    /**
     * Print a warn level message. This is typically used for warning messages.
     * (level 4)
     */
    warn(module: string, msg: string, props?: Record<string, any>): void;
    /**
     * Print a error level message. This is typically used for errors that the application can tolerate.
     * (level 5)
     */
    error(module: string, msg: string, props?: Record<string, any>): void;
    /**
     * Print a fatal level message. This is typically used for errors that will cause the application to crash.
     * (level 6)
     */
    fatal(module: string, msg: string, props?: Record<string, any>): void;
}

export class JsonLogger implements Logger {

    constructor(private readonly level: number) { }

    private write(level: string, module: string, msg: string, props?: Record<string, any>) {
        const output = JSON.stringify({
            level,
            timestamp: new Date().toISOString(),
            module,
            message: msg,
            ...props
        }) + '\n';

        if (level === 'error' || level === 'fatal') {
            process.stderr.write(output);
        } else {
            process.stdout.write(output);
        }
    }

    trace(module: string, msg: string, props?: Record<string, any>) { this.level <= 1 && this.write('trace', module, msg, props); }
    debug(module: string, msg: string, props?: Record<string, any>) { this.level <= 2 && this.write('debug', module, msg, props); }
    info(module: string, msg: string, props?: Record<string, any>) { this.level <= 3 && this.write('info', module, msg, props); }
    warn(module: string, msg: string, props?: Record<string, any>) { this.level <= 4 && this.write('warn', module, msg, props); }
    error(module: string, msg: string, props?: Record<string, any>) { this.level <= 5 && this.write('error', module, msg, props); }
    fatal(module: string, msg: string, props?: Record<string, any>) { this.level <= 6 && this.write('fatal', module, msg, props); }
}

const THEMES = {
    dark: {
        trace: '\x1b[38;2;69;197;139m',
        debug: '\x1b[38;2;82;148;226m',
        info: '\x1b[38;2;28;198;106m',
        warn: '\x1b[38;2;242;148;76m',
        error: '\x1b[38;2;255;110;110m',
        fatal: '\x1b[38;2;255;20;20m',
        module: '\x1b[38;2;82;148;226m',
        gray: '\x1b[38;2;128;128;128m',
        time: '\x1b[38;2;69;197;139m'
    },
    light: {
        trace: '\x1b[38;2;12;157;118m',
        debug: '\x1b[38;2;2;122;232m',
        info: '\x1b[38;2;12;157;118m',
        warn: '\x1b[38;2;201;111;5m',
        error: '\x1b[38;2;200;80;80m',
        fatal: '\x1b[38;2;255;20;20m',
        module: '\x1b[38;2;2;122;232m',
        gray: '\x1b[38;2;100;100;100m',
        time: '\x1b[38;2;12;157;118m'
    }
};

const reset = '\x1b[0m';
const bold = '\x1b[1m';

let _theme: 'light' | 'dark' | undefined;
/**
 * Detect terminal theme using COLORFGBG, OSC 11, and system-level checks.
 */
function getTheme(): 'light' | 'dark' {
    if (_theme) return _theme;

    // 1. COLORFGBG
    const colorfgbg = process.env['COLORFGBG'];
    if (colorfgbg) {
        const parts = colorfgbg.split(';');
        if (parts.length > 1) {
            const bg = parseInt(parts[parts.length - 1]);
            // Standard ANSI colors 0-7 are dark, 8-15 are light/bright
            if (bg >= 0 && bg <= 7) return _theme = 'dark';
            if (bg >= 8 && bg <= 15) return _theme = 'light';
        }
    }

    // 2. OSC 11 (Query Background Color)
    // This is best-effort. If we can't do it synchronously and safely, we move on.
    if (process.stdout.isTTY) {
        try {
            // We use a small shell script to probe OSC 11 and read the response.
            // This is safer than trying to manage raw TTY state in JS synchronously.
            const probe = `
                if [ -t 0 ]; then
                    stty -echo
                    printf "\\033]11;?\\007"
                    read -d $'\\a' -s -t 0.1 response
                    stty echo
                    echo $response
                fi
            `;
            const response = execSync(probe, { shell: '/bin/bash', stdio: ['inherit', 'pipe', 'ignore'] }).toString();
            if (response.includes('rgb:')) {
                const match = response.match(/rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
                if (match) {
                    const r = parseInt(match[1], 16);
                    const g = parseInt(match[2], 16);
                    const b = parseInt(match[3], 16);
                    // Simple perceived brightness formula
                    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / (Math.pow(16, match[1].length) - 1);
                    return _theme = brightness > 0.5 ? 'light' : 'dark';
                }
            }
        } catch (e) {
            // OSC 11 failed or timed out, continue to fallbacks
        }
    }

    // 3. AppleInterfaceStyle
    if (process.platform === 'darwin') {
        try {
            const style = execSync('defaults read -g AppleInterfaceStyle', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (style === 'Dark') return _theme = 'dark';
        } catch (e) {
            // Key doesn't exist usually means Light
            return _theme = 'light';
        }
    }

    // 4. Linux - GSettings (GNOME/Cinnamon/etc.)
    else if (process.platform === 'linux') {
        try {
            const style = execSync('gsettings get org.gnome.desktop.interface color-scheme', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().replace(/'/g, '');
            if (style === 'prefer-dark' || style.includes('dark')) return _theme = 'dark';
            if (style === 'prefer-light' || style.includes('light')) return _theme = 'light';
        } catch (e) { }

        // 5. Linux - DBus Freedesktop Appearance (Modern cross-DE standard)
        try {
            const style = execSync("dbus-send --session --print-reply=literal --dest=org.freedesktop.portal.Desktop /org/freedesktop/portal/desktop org.freedesktop.portal.Settings.Read string:'org.freedesktop.appearance' string:'color-scheme'", { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
            if (style.includes('uint32 1')) return _theme = 'dark';
            if (style.includes('uint32 2')) return _theme = 'light';
        } catch (e) { }
    }

    return _theme = 'dark';
}

export class ConsoleLogger implements Logger {

    private readonly palette: typeof THEMES['dark'];

    constructor(private readonly level: number) {
        // Only run the theme calculation code when the logger that needs it is initialized. 
        // This prevents the theme calculation from running when this logger is not used.
        this.palette = THEMES[getTheme()];
    }

    private write(level: string, module: string, msg: string, props: Record<string, any>) {
        const color = (this.palette as any)[level];
        const timestamp = new Date().toTimeString().slice(0, 8);
        process.stdout.write(`${this.palette.time}${timestamp} ${color}${bold}${level.toUpperCase().padEnd(5)}${reset} ${this.palette.gray}[${this.palette.module}${module}${this.palette.gray}] ${reset}${msg}\n`);
    }

    trace(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 1 && this.write("trace", module, msg, props);
    }

    debug(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 2 && this.write("debug", module, msg, props);
    }

    info(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 3 && this.write("info", module, msg, props);
    }

    warn(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 4 && this.write("warn", module, msg, props);
    }

    error(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 5 && this.write("error", module, msg, props);
    }

    fatal(module: string, msg: string, props?: Record<string, any>) {
        this.level <= 6 && this.write("fatal", module, msg, props);
    }
}

/**
 * Create a new logger instance.
 * @param level the minimum level of messages to log
 * @returns logger instance
 */
export function createLogger(level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' = process.env.NODE_ENV == 'test' ? 'warn' : 'info'): Logger {

    const levelInt = {
        'trace': 1,
        'debug': 2,
        'info': 3,
        'warn': 4,
        'error': 5,
        'fatal': 6
    }[level];

    if (process.env.NODE_ENV === 'production') {
        return new JsonLogger(levelInt);
    }
    return new ConsoleLogger(levelInt);
}

/**
 * Create a new logger instance for HTTP requests.
 * @returns middleware
 */
export function createHTTPLogger(): Middleware {
    const log = createLogger('info');

    const printDuration = (duration: number) => {
        if (duration < 1) return (duration * 1000).toFixed(2) + 'µs';
        if (duration < 10) return duration.toFixed(2) + 'ms';
        if (duration < 2000) return duration.toFixed(0) + 'ms';
        if (duration < 5000) return (duration / 1000).toFixed(2) + 's';
        return Math.round(duration / 1000) + 's';
    };

    const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token', 'proxy-authorization']);

    const sanitizeHeaders = (headers: Headers): Record<string, string> => {
        const result: Record<string, string> = {};
        headers.forEach((value, key) => {
            const lowerKey = key.toLowerCase();
            result[key] = SENSITIVE_HEADERS.has(lowerKey) ? '[REDACTED]' : value;
        });
        return result;
    };

    if (process.env.NODE_ENV === 'production') {
        return async (ctx, next) => {
            const status = ctx.response.status ?? 200;
            const d = performance.now();
            const result = await next();

            const props = {
                duration: printDuration(performance.now() - d),
                method: ctx.method,
                url: ctx.url,
                status: status,
                headers: sanitizeHeaders(ctx.request.headers),
                length: ctx.response.get('content-length') ?? -1,
                ip: ctx.request.ip,
                ua: ctx.request.header('user-agent'),

            };

            if (status >= 500) {
                log.error('http', `${ctx.method}:${status} ${ctx.url}`, props);
            } else {
                log.info('http', `${ctx.method}:${status} ${ctx.url}`, props);
            }

            return result;
        };
    }

    return async (ctx, next) => {
        const d = performance.now();
        const result = await next();

        const methodColor = {
            GET: '\x1b[32m',      // Green
            POST: '\x1b[36m',     // Cyan
            PUT: '\x1b[33m',      // Yellow
            DELETE: '\x1b[31m',   // Red
            PATCH: '\x1b[35m',    // Magenta
            default: '\x1b[37m'   // White
        }[ctx.method] || '\x1b[37m';

        const status = ctx.response.status ?? 200;
        let statusColor = '\x1b[37m'; // Default white
        if (status >= 500) statusColor = '\x1b[31m';      // Red
        else if (status >= 400) statusColor = '\x1b[33m'; // Yellow
        else if (status >= 300) statusColor = '\x1b[36m'; // Cyan
        else if (status >= 200) statusColor = '\x1b[32m'; // Green

        if (status >= 500) {
            log.error('http', `${methodColor}${ctx.method}\x1b[30m ${ctx.url} ${statusColor}${status} \x1b[1;36m${printDuration(performance.now() - d)}\x1b[0m`);
        } else {
            log.info('http', `${methodColor}${ctx.method}\x1b[30m ${ctx.url} ${statusColor}${status} \x1b[1;36m${printDuration(performance.now() - d)}\x1b[0m`);
        }

        return result;
    };
}