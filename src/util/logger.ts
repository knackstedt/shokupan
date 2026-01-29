export interface Logger {
    debug(msg: string, props?: Record<string, any>): void;
    info(msg: string, props?: Record<string, any>): void;
    warn(msg: string, props?: Record<string, any>): void;
    error(msg: string, props?: Record<string, any>): void;
    fatal(msg: string, props?: Record<string, any>): void;
}

export class JsonLogger implements Logger {
    private write(level: string, msg: string, props?: Record<string, any>) {
        console.log(JSON.stringify({
            level,
            message: msg,
            timestamp: new Date().toISOString(),
            ...props
        }));
    }

    debug(msg: string, props?: Record<string, any>) { this.write('debug', msg, props); }
    info(msg: string, props?: Record<string, any>) { this.write('info', msg, props); }
    warn(msg: string, props?: Record<string, any>) { this.write('warn', msg, props); }
    error(msg: string, props?: Record<string, any>) { this.write('error', msg, props); }
    fatal(msg: string, props?: Record<string, any>) { this.write('fatal', msg, props); }
}

export class PrettyLogger implements Logger {
    private getTimestamp() {
        return new Date().toLocaleTimeString();
    }

    private formatProps(props?: Record<string, any>): string {
        if (!props || Object.keys(props).length === 0) return '';
        return '\n' + Object.entries(props)
            .map(([key, value]) => `    ${key}: ${value instanceof Error ? value.stack : typeof value === 'object' ? JSON.stringify(value) : value}`)
            .join('\n');
    }

    debug(msg: string, props?: Record<string, any>) {
        console.log(`\x1b[90m[DEBUG] ${this.getTimestamp()} - ${msg}\x1b[0m${this.formatProps(props)}`);
    }

    info(msg: string, props?: Record<string, any>) {
        console.log(`\x1b[36m[INFO]  ${this.getTimestamp()} - ${msg}\x1b[0m${this.formatProps(props)}`);
    }

    warn(msg: string, props?: Record<string, any>) {
        console.log(`\x1b[33m[WARN]  ${this.getTimestamp()} - ${msg}\x1b[0m${this.formatProps(props)}`);
    }

    error(msg: string, props?: Record<string, any>) {
        console.log(`\x1b[31m[ERROR] ${this.getTimestamp()} - ${msg}\x1b[0m${this.formatProps(props)}`);
    }

    fatal(msg: string, props?: Record<string, any>) {
        console.log(`\x1b[41m\x1b[37m[FATAL] ${this.getTimestamp()} - ${msg}\x1b[0m${this.formatProps(props)}`);
    }
}

export function createLogger(env: string = process.env.NODE_ENV || 'development'): Logger {
    if (env === 'production') {
        return new JsonLogger();
    }
    return new PrettyLogger();
}
