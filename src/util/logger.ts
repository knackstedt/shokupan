import { createConsola, type ConsolaInstance } from "consola";

export interface Logger {
    debug(module: string, msg: string, props?: Record<string, any>): void;
    info(module: string, msg: string, props?: Record<string, any>): void;
    warn(module: string, msg: string, props?: Record<string, any>): void;
    error(module: string, msg: string, props?: Record<string, any>): void;
    fatal(module: string, msg: string, props?: Record<string, any>): void;
}

export class JsonLogger implements Logger {
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

    debug(module: string, msg: string, props?: Record<string, any>) { this.write('debug', module, msg, props); }
    info(module: string, msg: string, props?: Record<string, any>) { this.write('info', module, msg, props); }
    warn(module: string, msg: string, props?: Record<string, any>) { this.write('warn', module, msg, props); }
    error(module: string, msg: string, props?: Record<string, any>) { this.write('error', module, msg, props); }
    fatal(module: string, msg: string, props?: Record<string, any>) { this.write('fatal', module, msg, props); }
}

export class ConsolaLogger implements Logger {
    private consola: ConsolaInstance;

    constructor(level: number = 4) {
        this.consola = createConsola({
            level,
            reporters: [
                // This forces Consola to use the standard console.log/error methods
                // which VS Code's debugger will actually see.
                {
                    log: (logObj) => {
                        const method = logObj.type in console ? logObj.type : "log";
                        console[method](...logObj.args);
                    }
                }
            ]
        });
    }

    debug(module: string, msg: string, props?: Record<string, any>) {
        this.consola.withTag(module).debug(msg, props || '');
    }

    info(module: string, msg: string, props?: Record<string, any>) {
        this.consola.withTag(module).info(msg, props || '');
    }

    warn(module: string, msg: string, props?: Record<string, any>) {
        this.consola.withTag(module).warn(msg, props || '');
    }

    error(module: string, msg: string, props?: Record<string, any>) {
        this.consola.withTag(module).error(msg, props || '');
    }

    fatal(module: string, msg: string, props?: Record<string, any>) {
        this.consola.withTag(module).fatal(msg, props || '');
    }
}

export function createLogger(env: string = process.env.NODE_ENV || 'development'): Logger {
    if (env === 'production') {
        return new JsonLogger();
    }
    return new ConsolaLogger();
}

