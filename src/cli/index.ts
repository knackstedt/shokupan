#!/usr/bin/env bun
import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

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

async function main() {
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

    p.outro(`Problems? Open an issue at https://github.com/dotglitch/express.ts`);
}

main().catch(console.error);;
