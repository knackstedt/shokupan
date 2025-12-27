#!/usr/bin/env bun
import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { analyzeDirectory } from './openapi-analyzer';

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
    console.clear();
    p.intro(`Shokupan OpenAPI Analyzer`);

    const args = process.argv.slice(2);
    let directory = process.cwd();
    let outputPath = 'openapi.json';

    // Parse command line arguments
    // analyze [directory] [--output file.json]
    const analyzeIndex = args.indexOf('analyze');
    if (analyzeIndex !== -1 && args.length > analyzeIndex + 1) {
        const nextArg = args[analyzeIndex + 1];
        if (!nextArg.startsWith('--')) {
            directory = path.resolve(nextArg);
        }
    }

    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args.length > outputIndex + 1) {
        outputPath = args[outputIndex + 1];
    }

    // Verify directory exists
    if (!fs.existsSync(directory)) {
        p.cancel(`Directory not found: ${directory}`);
        process.exit(1);
    }

    const s = p.spinner();
    s.start(`Analyzing directory: ${directory}`);

    try {
        const spec = await analyzeDirectory(directory);

        s.stop('Analysis complete');

        // Write to file
        const fullOutputPath = path.resolve(outputPath);
        fs.writeFileSync(fullOutputPath, JSON.stringify(spec, null, 2));

        p.note(`OpenAPI spec written to: ${fullOutputPath}`, 'Success');

        // Show summary
        const pathCount = Object.keys(spec.paths || {}).length;
        p.note(`Found ${pathCount} unique paths`, 'Summary');

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
    } else if (command === 'scaffold' || !command) {
        // Default to scaffold for backwards compatibility
        await scaffold();
    } else {
        console.log('Shokupan CLI');
        console.log('');
        console.log('Commands:');
        console.log('  scaffold (default) - Scaffold controllers, middleware, or plugins');
        console.log('  analyze <directory> - Analyze a Shokupan application and generate OpenAPI spec');
        console.log('');
        console.log('Usage:');
        console.log('  shokupan scaffold');
        console.log('  shokupan analyze <directory> [--output openapi.json]');
        process.exit(0);
    }
}

main().catch(console.error);
