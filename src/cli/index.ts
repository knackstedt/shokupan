#!/usr/bin/env bun
import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { OpenAPIAnalyzer } from '../plugins/application/openapi/analyzer';

const templates = {
    controller: (name: string) => `import { Controller, Get, Ctx } from 'shokupan';
import { ShokupanContext } from 'shokupan';

@Controller('/${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}')
export class ${name}Controller {
    @Get('/')
    public index(@Ctx() ctx: ShokupanContext) {
        return { message: 'Hello from ${name}Controller' };
    }
}
`,
    middleware: (name: string) => `import { ShokupanContext, NextFn } from 'shokupan';

/**
 * ${name} Middleware
 */
export const ${name}Middleware = async (ctx: ShokupanContext, next: NextFn) => {
    // Before next
    // console.log('${name} Middleware - Request');

    const result = await next();

    // After next
    // console.log('${name} Middleware - Response');
    
    return result;
};
`,
    plugin: (name: string) => `import { ShokupanRouter } from 'shokupan';
import { ShokupanContext } from 'shokupan';

export interface ${name}Options {
    // Define options here
}

export class ${name}Plugin extends ShokupanRouter {
    constructor(private options: ${name}Options = {}) {
        super();
        this.init();
    }

    private init() {
        this.get('/', (ctx: ShokupanContext) => {
            return { message: '${name} Plugin Active' };
        });
    }
}
`
};

async function scaffold() {
    console.clear();
    p.intro(`Shokupan CLI Scaffolder`);

    // Check if running in a project root
    if (!fs.existsSync('package.json')) {
        p.note('Warning: No package.json found in current directory. Are you in the project root?');
    }

    const project = await p.group(
        {
            type: () => p.select({
                message: 'What do you want to scaffold?',
                options: [
                    { value: 'controller', label: 'Controller' },
                    { value: 'middleware', label: 'Middleware' },
                    { value: 'plugin', label: 'Plugin' },
                ],
            }),
            name: () => p.text({
                message: 'Name (PascalCase, e.g. UserAuth):',
                validate: (value) => {
                    if (!value) return 'Name is required';
                    if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) return 'Please use PascalCase';
                    return undefined;
                },
            }),
            dir: () => p.text({
                message: 'Output directory (leave empty for default):',
                placeholder: 'src/controllers',
            }),
        },
        {
            onCancel: () => {
                p.cancel('Operation cancelled.');
                process.exit(0);
            },
        }
    );

    const type = project.type as keyof typeof templates;
    const name = project.name;
    let dir = project.dir;

    if (!dir || dir.trim() === '') {
        switch (type) {
            case 'controller': dir = 'src/controllers'; break;
            case 'middleware': dir = 'src/middleware'; break;
            case 'plugin': dir = 'src/plugins'; break;
        }
    }

    // Convert PascalCase to kebab-case for filename
    const kebabName = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const fileName = `${kebabName}.ts`;

    const finalPath = path.join(process.cwd(), dir, fileName);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(finalPath))) {
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    }

    // Check for overwrite
    if (fs.existsSync(finalPath)) {
        const overwrite = await p.confirm({
            message: `File ${finalPath} already exists. Overwrite?`,
            initialValue: false
        });

        if (p.isCancel(overwrite) || !overwrite) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
    }

    const s = p.spinner();
    s.start(`Creating ${type}...`);

    await setTimeout(500); // Artificial delay to show spinner

    const content = templates[type](name);
    fs.writeFileSync(finalPath, content);

    s.stop(`Created ${type}`);

    const nextSteps = `  -> ${finalPath}
Make sure to register it in your main application file if necessary.`;

    p.note(nextSteps, 'Next steps');

    p.outro(`Problems? Open an issue at https://github.com/dotglitch/shokupan`);
}

async function analyze() {
    await generate(true);
}

async function generate(legacyAnalyzeMode = false) {
    if (!legacyAnalyzeMode) {
        console.clear();
        p.intro(`Shokupan Spec Generator`);
    } else {
        console.clear();
        p.intro(`Shokupan OpenAPI Analyzer (Legacy)`);
    }

    const args = process.argv.slice(2);
    let directory = process.cwd();
    let openApiPath = 'openapi.json';
    let httpApiPath = 'http-api.json';
    let asyncApiPath = 'asyncapi.json';
    let skipOpenApi = false;
    let skipHttpApi = false;
    let skipAsyncApi = false;

    // Parse command line arguments
    const cmdIndex = legacyAnalyzeMode ? args.indexOf('analyze') : args.indexOf('generate');

    if (cmdIndex !== -1 && args.length > cmdIndex + 1) {
        const nextArg = args[cmdIndex + 1];
        if (!nextArg.startsWith('--')) {
            directory = path.resolve(nextArg);
        }
    }

    // Helper to get arg value
    const getArgValue = (flag: string) => {
        const index = args.indexOf(flag);
        if (index !== -1 && args.length > index + 1) {
            return args[index + 1];
        }
        return null;
    };

    const dirArg = getArgValue('--dir');
    if (dirArg) directory = path.resolve(dirArg);

    const outArg = getArgValue('--output'); // Legacy support
    if (outArg) openApiPath = outArg;

    const openApiArg = getArgValue('--openapi');
    if (openApiArg) openApiPath = openApiArg;

    const httpApiArg = getArgValue('--http-api');
    if (httpApiArg) httpApiPath = httpApiArg;

    const asyncApiArg = getArgValue('--asyncapi');
    if (asyncApiArg) asyncApiPath = asyncApiArg;

    let astPath = 'shokupan-ast.json';
    const astArg = getArgValue('--ast');
    if (astArg) astPath = astArg;

    if (args.includes('--skip-openapi')) skipOpenApi = true;
    if (args.includes('--skip-http-api')) skipHttpApi = true;
    if (args.includes('--skip-asyncapi')) skipAsyncApi = true;
    const exportAst = args.includes('--ast');

    if (legacyAnalyzeMode) {
        skipHttpApi = true;
        skipAsyncApi = true;
    }

    // Verify directory exists
    if (!fs.existsSync(directory)) {
        p.cancel(`Directory not found: ${directory}`);
        process.exit(1);
    }

    const s = p.spinner();
    s.start(`Analyzing directory: ${directory}`);

    const warnings: any[] = [];

    try {
        const analyzer = new OpenAPIAnalyzer(directory);
        const analysis = await analyzer.analyze();

        s.message('Generating specifications...');

        // Collect Warnings from Analysis
        const applications = analysis.applications || [];

        let pathCount = 0;
        let eventCount = 0;

        // Process Applications for Warnings and Counts
        for (const app of applications) {
            for (const route of app.routes) {
                if (['EVENT', 'ON'].includes(route.method.toUpperCase())) {
                    eventCount++;
                } else {
                    pathCount++;
                }

                if (route.path === '__DYNAMIC_EVENT__' || route.path.includes('__DYNAMIC_EVENT__')) {
                    warnings.push({
                        type: 'dynamic-path',
                        message: 'Dynamic path/event detected',
                        detail: `Method: ${route.method}`,
                        location: route.sourceContext
                    });
                }

                if (route.emits) {
                    for (const emit of route.emits) {
                        if (emit.event === '__DYNAMIC_EMIT__') {
                            warnings.push({
                                type: 'dynamic-emit',
                                message: 'Dynamic emit detected',
                                detail: `Handler: ${route.handlerName}`,
                                location: { file: route.sourceContext?.file, line: emit.location?.startLine }
                            });
                        }
                    }
                }
            }
        }

        // 1. Generate Extended OpenAPI (HTTP API)
        let httpApiSpec: any = null;
        if (!skipHttpApi || !skipOpenApi) { // We need it for compliant spec too
            // Use generating function from analyzer if available, or construct basic spec
            // OpenAPIAnalyzer has generateOpenAPISpec
            httpApiSpec = analyzer.generateOpenAPISpec();

            // Enrich with middleware registry (manual match from AST)
            const middlewareRegistry: Record<string, any> = {};
            let mwId = 0;
            for (const app of applications) {
                if (app.middleware) {
                    for (const mw of app.middleware) {
                        const id = `middleware-${mwId++}`;
                        middlewareRegistry[id] = { ...mw, id };
                    }
                }
            }
            if (Object.keys(middlewareRegistry).length > 0) {
                httpApiSpec["x-middleware-registry"] = middlewareRegistry;
            }

            // Filter out EVENT methods from HTTP API spec if analyzer included them
            if (httpApiSpec.paths) {
                for (const pathKey of Object.keys(httpApiSpec.paths)) {
                    for (const method of Object.keys(httpApiSpec.paths[pathKey])) {
                        if (['event', 'on'].includes(method.toLowerCase())) {
                            delete httpApiSpec.paths[pathKey][method];
                        }
                    }
                    if (Object.keys(httpApiSpec.paths[pathKey]).length === 0) {
                        delete httpApiSpec.paths[pathKey];
                    }
                }
            }
        }

        // 2. Generate Compliant OpenAPI
        if (!skipOpenApi && httpApiSpec) {
            const compliantSpec = JSON.parse(JSON.stringify(httpApiSpec));

            // Strip extensions
            const stripExtensions = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                    obj.forEach(stripExtensions);
                    return;
                }
                for (const key of Object.keys(obj)) {
                    if (key.startsWith('x-')) {
                        delete obj[key];
                    } else {
                        stripExtensions(obj[key]);
                    }
                }
            };
            stripExtensions(compliantSpec);

            const fullOutputPath = path.resolve(openApiPath);
            fs.writeFileSync(fullOutputPath, JSON.stringify(compliantSpec, null, 2));
            if (!legacyAnalyzeMode) p.note(`OpenAPI spec written to: ${fullOutputPath}`, 'OpenAPI');
            else p.note(`OpenAPI spec written to: ${fullOutputPath}`, 'Success');
        }

        // 3. Save HTTP API
        if (!skipHttpApi && httpApiSpec) {
            const fullOutputPath = path.resolve(httpApiPath);
            fs.writeFileSync(fullOutputPath, JSON.stringify(httpApiSpec, null, 2));
            if (!legacyAnalyzeMode) p.note(`HTTP API spec written to: ${fullOutputPath}`, 'HTTP API');
        }

        // 4. Generate AsyncAPI
        if (!skipAsyncApi) {
            const asyncApiSpec: any = {
                asyncapi: "3.0.0",
                info: { title: "Shokupan AsyncAPI", version: "1.0.0" },
                channels: {}
            };

            for (const app of applications) {
                for (const route of app.routes) {
                    // 1. Subscribe (Event Handlers)
                    if (['EVENT', 'ON'].includes(route.method.toUpperCase())) {
                        const eventName = route.path;
                        // Prevent overwriting
                        if (!asyncApiSpec.channels[eventName]) {
                            asyncApiSpec.channels[eventName] = {
                                publish: { // Client publishes to server
                                    operationId: `on${eventName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                    message: { payload: { type: 'object' } },
                                    "x-source-info": [route.sourceContext]
                                }
                            };
                        } else {
                            // Append source info if possible? AsyncAPI 3.0 allows multiple refs?
                            // Simplified: just prefer first or merge info (not easy here)
                        }
                    }

                    // 2. Publish (Emits)
                    if (route.emits) {
                        for (const emit of route.emits) {
                            const eventName = emit.event;
                            if (!asyncApiSpec.channels[eventName]) {
                                asyncApiSpec.channels[eventName] = {
                                    subscribe: { // Client subscribes to server
                                        operationId: `emit${eventName.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                        message: { payload: emit.payload || { type: 'object' } }
                                    }
                                };
                            }
                        }
                    }
                }
            }

            const fullOutputPath = path.resolve(asyncApiPath);
            fs.writeFileSync(fullOutputPath, JSON.stringify(asyncApiSpec, null, 2));
            if (!legacyAnalyzeMode) p.note(`AsyncAPI spec written to: ${fullOutputPath}`, 'AsyncAPI');
        }

        // 5. Export AST
        if (exportAst || legacyAnalyzeMode) {
            const outPath = legacyAnalyzeMode ? openApiPath : astPath;
            const fullOutputPath = path.resolve(outPath);
            fs.writeFileSync(fullOutputPath, JSON.stringify({ applications }, null, 2));
            p.note(`AST written to: ${fullOutputPath}`, 'AST');
        }

        s.stop('Generation complete');

        // Show Warnings
        if (warnings.length > 0) {
            p.note(`${warnings.length} warnings detected during generation.`, 'Warnings');
            const groupedArgs = warnings.reduce((acc, w) => {
                if (!acc[w.type]) acc[w.type] = [];
                acc[w.type].push(w);
                return acc;
            }, {} as Record<string, any[]>);

            for (const [type, items] of Object.entries(groupedArgs)) {
                const count = (items as any[]).length;
                console.log(`\n  ${type} (${count}):`);
                (items as any[]).slice(0, 5).forEach(w => {
                    console.log(`    - ${w.message} ${w.detail ? `(${w.detail})` : ''}`);
                    if (w.location) console.log(`      at ${w.location.file}:${w.location.line}`);
                });
                if (count > 5) console.log(`      ... and ${count - 5} more`);
            }
        }

        if (!legacyAnalyzeMode) {
            p.note(`Found ${pathCount} paths and ${eventCount} events`, 'Summary');
        } else {
            // Legacy summary kept simple
            // We can't easily get the count from 'spec' variable that was in old code b/c we generate differently now.
            p.note(`Found ${pathCount} unique paths`, 'Summary');
        }

        p.outro('Done!');
    } catch (error: any) {
        s.stop('Analysis failed');
        p.cancel(`Error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'analyze') {
        await analyze();
    } else if (command === 'generate') {
        await generate(false);
    } else if (command === 'scaffold' || !command) {
        // Default to scaffold for backwards compatibility
        await scaffold();
    } else {
        console.log('Shokupan CLI');
        console.log('');
        console.log('Commands:');
        console.log('  scaffold (default) - Scaffold controllers, middleware, or plugins');
        console.log('  generate           - Generate compliant OpenAPI, HTTP API, and AsyncAPI specs');
        console.log('  analyze <dir>      - Content analysis (Legacy/OpenAPI only)');
        console.log('');
        console.log('Usage:');
        console.log('  shokupan scaffold');
        console.log('  shokupan generate [--dir <dir>] [--openapi <path>] [--http-api <path>] [--asyncapi <path>] [--ast [<path>]]');
        console.log('  shokupan analyze <directory> [--output openapi.json]');
        process.exit(0);
    }
}

main().catch(console.error);
