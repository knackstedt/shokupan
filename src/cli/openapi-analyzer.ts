import type { OpenAPI } from '@scalar/openapi-types';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * File information collected during scan
 */
interface CollectedFile {
    path: string;
    type: 'ts' | 'js' | 'map';
    content?: string;
}

/**
 * Route information extracted from AST
 */
interface RouteInfo {
    method: string;
    path: string;
    handlerName?: string;
    requestTypes?: {
        body?: string;
        query?: Record<string, string>;
        params?: Record<string, string>;
        headers?: Record<string, string>;
    };
    responseType?: string;
}

/**
 * Dependency information
 */
interface DependencyInfo {
    packageName: string;
    version?: string;
    importPath: string;
    isExternal: boolean;
}

/**
 * Application/Router instance found in code
 */
interface ApplicationInstance {
    name: string;
    filePath: string;
    className: 'Shokupan' | 'ShokupanRouter';
    routes: RouteInfo[];
    mounted: MountInfo[];
}

interface MountInfo {
    prefix: string;
    target: string; // Controller/Router name or file path
    dependency?: DependencyInfo;
}

/**
 * Main analyzer class
 */
export class OpenAPIAnalyzer {
    private files: CollectedFile[] = [];
    private applications: ApplicationInstance[] = [];
    private program?: ts.Program;

    constructor(private rootDir: string) { }

    /**
     * Main analysis entry point
     */
    public async analyze(): Promise<OpenAPI.Document> {
        console.log(`Analyzing directory: ${this.rootDir}`);

        // Step 1: Scan directory for files
        await this.scanDirectory(this.rootDir);

        // Step 2: Process source maps if needed
        await this.processSourceMaps();

        // Step 3: Parse TypeScript files
        await this.parseTypeScriptFiles();

        // Step 4: Find Shokupan applications
        await this.findApplications();

        // Step 5: Extract route information
        await this.extractRoutes();

        // Step 6: Generate OpenAPI spec
        return this.generateOpenAPISpec();
    }

    /**
     * Recursively scan directory for TypeScript/JavaScript files
     */
    private async scanDirectory(dir: string): Promise<void> {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // Skip node_modules for source files (we'll handle deps separately)
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
                        continue;
                    }
                    await this.scanDirectory(fullPath);
                } else {
                    const ext = path.extname(entry.name);
                    if (ext === '.ts') {
                        this.files.push({ path: fullPath, type: 'ts' });
                    } else if (ext === '.js') {
                        this.files.push({ path: fullPath, type: 'js' });
                    } else if (ext === '.map') {
                        this.files.push({ path: fullPath, type: 'map' });
                    }
                }
            }
        } catch (error: any) {
            // Silently skip directories that don't exist or can't be read
            if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
                throw error;
            }
        }
    }

    /**
     * Process source maps to reconstruct TypeScript
     */
    private async processSourceMaps(): Promise<void> {
        // Find JS files that have corresponding .map files
        const jsFiles = this.files.filter(f => f.type === 'js');
        const mapFiles = this.files.filter(f => f.type === 'map');

        for (const jsFile of jsFiles) {
            const mapFile = mapFiles.find(m => m.path === jsFile.path + '.map');

            if (mapFile && !this.files.some(f => f.path === jsFile.path.replace(/\.js$/, '.ts'))) {
                // We have .js + .map but no .ts file
                // For now, we'll just parse the JS file directly
                // Full source map reconstruction would require the 'source-map' library
                console.log(`Note: Found ${jsFile.path} with source map but no .ts file. Will parse JS directly.`);
            }
        }
    }

    /**
     * Parse TypeScript files and create AST
     */
    private async parseTypeScriptFiles(): Promise<void> {
        const tsFiles = this.files.filter(f => f.type === 'ts' || f.type === 'js');
        const fileNames = tsFiles.map(f => f.path);

        // Create TypeScript program
        this.program = ts.createProgram(fileNames, {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            allowJs: true,
            skipLibCheck: true,
            skipDefaultLibCheck: true,
        });
    }

    /**
     * Find all Shokupan/ShokupanRouter instances
     */
    private async findApplications(): Promise<void> {
        if (!this.program) return;

        const typeChecker = this.program.getTypeChecker();

        for (const sourceFile of this.program.getSourceFiles()) {
            // Skip node_modules
            if (sourceFile.fileName.includes('node_modules')) continue;

            ts.forEachChild(sourceFile, (node) => {
                this.visitNode(node, sourceFile, typeChecker);
            });
        }
    }

    /**
     * Visit AST node to find application instances
     */
    private visitNode(node: ts.Node, sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): void {
        // Look for: new Shokupan() or new ShokupanRouter()
        if (ts.isVariableDeclaration(node) && node.initializer) {
            if (ts.isNewExpression(node.initializer)) {
                const expr = node.initializer;
                const className = expr.expression.getText(sourceFile);

                if (className === 'Shokupan' || className === 'ShokupanRouter') {
                    const varName = node.name.getText(sourceFile);

                    this.applications.push({
                        name: varName,
                        filePath: sourceFile.fileName,
                        className: className as 'Shokupan' | 'ShokupanRouter',
                        routes: [],
                        mounted: []
                    });
                }
            }
        }

        // Recursively visit children
        ts.forEachChild(node, (child) => this.visitNode(child, sourceFile, typeChecker));
    }

    /**
     * Extract route information from applications
     */
    private async extractRoutes(): Promise<void> {
        if (!this.program) return;

        for (const app of this.applications) {
            const sourceFile = this.program.getSourceFile(app.filePath);
            if (!sourceFile) continue;

            this.extractRoutesFromFile(app, sourceFile);
        }
    }

    /**
     * Extract routes from a specific file
     */
    private extractRoutesFromFile(app: ApplicationInstance, sourceFile: ts.SourceFile): void {
        const visit = (node: ts.Node) => {
            // Look for method calls: app.get(...), app.post(...), app.mount(...)
            if (ts.isCallExpression(node)) {
                const expr = node.expression;

                if (ts.isPropertyAccessExpression(expr)) {
                    const objName = expr.expression.getText(sourceFile);
                    const methodName = expr.name.getText(sourceFile);

                    // Check if this is our application instance
                    if (objName === app.name) {
                        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(methodName)) {
                            // Extract route info
                            const route = this.extractRouteFromCall(node, sourceFile, methodName.toUpperCase());
                            if (route) {
                                app.routes.push(route);
                            }
                        } else if (methodName === 'mount') {
                            // Extract mount info
                            const mount = this.extractMountFromCall(node, sourceFile);
                            if (mount) {
                                app.mounted.push(mount);
                            }
                        }
                    }
                }
            }

            ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);
    }

    /**
     * Extract route information from a route call (e.g., app.get('/path', handler))
     */
    private extractRouteFromCall(node: ts.CallExpression, sourceFile: ts.SourceFile, method: string): RouteInfo | null {
        const args = node.arguments;

        if (args.length < 2) return null;

        const pathArg = args[0];
        let routePath = '/';

        if (ts.isStringLiteral(pathArg)) {
            routePath = pathArg.text;
        }

        // Extract handler information
        const handlerArg = args[args.length - 1];
        const handlerInfo = this.analyzeHandler(handlerArg, sourceFile);

        return {
            method,
            path: routePath,
            handlerName: handlerArg.getText(sourceFile).substring(0, 50), // Truncate for display
            requestTypes: handlerInfo.requestTypes,
            responseType: handlerInfo.responseType
        };
    }

    /**
     * Analyze a route handler to extract type information
     */
    private analyzeHandler(handler: ts.Node, sourceFile: ts.SourceFile): {
        requestTypes?: RouteInfo['requestTypes'];
        responseType?: string;
    } {
        const requestTypes: RouteInfo['requestTypes'] = {};
        let responseType: string | undefined;

        // Handle arrow functions and function expressions
        if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) {
            const body = handler.body;

            // Visit the handler body to find ctx usage
            const visit = (node: ts.Node) => {
                // Look for ctx.body, ctx.query, ctx.params, ctx.headers, ctx.get
                if (ts.isPropertyAccessExpression(node)) {
                    const objText = node.expression.getText(sourceFile);
                    const propText = node.name.getText(sourceFile);

                    if (objText === 'ctx' || objText.endsWith('.ctx')) {
                        if (propText === 'body') {
                            requestTypes.body = 'any'; // Would need deeper analysis
                        } else if (propText === 'query') {
                            if (!requestTypes.query) requestTypes.query = {};
                        } else if (propText === 'params') {
                            if (!requestTypes.params) requestTypes.params = {};
                        } else if (propText === 'headers') {
                            if (!requestTypes.headers) requestTypes.headers = {};
                        }
                    }
                }

                // Look for return statements to infer response type
                if (ts.isReturnStatement(node) && node.expression) {
                    const returnText = node.expression.getText(sourceFile);
                    if (returnText.startsWith('{')) {
                        responseType = 'object';
                    } else if (returnText.startsWith('[')) {
                        responseType = 'array';
                    } else if (returnText.startsWith('"') || returnText.startsWith("'")) {
                        responseType = 'string';
                    }
                }

                ts.forEachChild(node, visit);
            };

            if (body) {
                ts.forEachChild(body, visit);
            }
        }

        return { requestTypes, responseType };
    }

    /**
     * Extract mount information from mount call
     */
    private extractMountFromCall(node: ts.CallExpression, sourceFile: ts.SourceFile): MountInfo | null {
        const args = node.arguments;

        if (args.length < 2) return null;

        const pathArg = args[0];
        const targetArg = args[1];

        let prefix = '/';
        if (ts.isStringLiteral(pathArg)) {
            prefix = pathArg.text;
        }

        const target = targetArg.getText(sourceFile);

        // Check if target is from node_modules
        const dependency = this.checkIfExternalDependency(target, sourceFile);

        return {
            prefix,
            target,
            dependency
        };
    }

    /**
     * Check if a reference is to an external dependency
     */
    private checkIfExternalDependency(identifier: string, sourceFile: ts.SourceFile): DependencyInfo | undefined {
        // This is a simplified check - in a full implementation, 
        // we'd track imports and resolve them

        // For now, check if there's an import statement for this identifier
        const imports: ts.ImportDeclaration[] = [];

        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                imports.push(node);
            }
        });

        for (const imp of imports) {
            const moduleSpecifier = imp.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const modulePath = moduleSpecifier.text;

                // Check if it's a node_modules import (no relative path)
                if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
                    const namedBindings = imp.importClause?.namedBindings;

                    if (namedBindings && ts.isNamedImports(namedBindings)) {
                        for (const element of namedBindings.elements) {
                            if (element.name.text === identifier) {
                                // Try to read package version
                                const version = this.getPackageVersion(modulePath);

                                return {
                                    packageName: modulePath,
                                    version,
                                    importPath: modulePath,
                                    isExternal: true
                                };
                            }
                        }
                    }
                }
            }
        }

        return undefined;
    }

    /**
     * Get package version from package.json
     */
    private getPackageVersion(packageName: string): string | undefined {
        try {
            const packageJsonPath = path.join(this.rootDir, 'node_modules', packageName, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                return packageJson.version;
            }
        } catch (e) {
            // Ignore
        }
        return undefined;
    }

    /**
     * Generate OpenAPI specification
     */
    private generateOpenAPISpec(): any {
        const paths: Record<string, any> = {};

        for (const app of this.applications) {
            for (const route of app.routes) {
                const pathKey = route.path;

                if (!paths[pathKey]) {
                    paths[pathKey] = {};
                }

                const method = route.method.toLowerCase();
                const operation: any = {
                    summary: `${route.method} ${route.path}`,
                    responses: {
                        '200': {
                            description: 'Successful response',
                            content: route.responseType ? {
                                'application/json': {
                                    schema: this.typeToSchema(route.responseType)
                                }
                            } : undefined
                        }
                    }
                };

                // Add request body if detected
                if (route.requestTypes?.body) {
                    operation.requestBody = {
                        content: {
                            'application/json': {
                                schema: { type: 'object' }
                            }
                        }
                    };
                }

                // Add query/path parameters
                const parameters: any[] = [];

                if (route.requestTypes?.query) {
                    for (const [key] of Object.entries(route.requestTypes.query)) {
                        parameters.push({
                            name: key,
                            in: 'query',
                            schema: { type: 'string' }
                        });
                    }
                }

                if (route.requestTypes?.params) {
                    for (const [key] of Object.entries(route.requestTypes.params)) {
                        parameters.push({
                            name: key,
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        });
                    }
                }

                if (parameters.length > 0) {
                    operation.parameters = parameters;
                }

                paths[pathKey][method] = operation;
            }
        }

        return {
            openapi: '3.1.0',
            info: {
                title: 'Shokupan API',
                version: '1.0.0',
                description: 'Auto-generated from Shokupan application analysis'
            },
            paths,
            components: {
                schemas: {}
            }
        };
    }

    /**
     * Convert a type string to an OpenAPI schema
     */
    private typeToSchema(type: string): any {
        switch (type) {
            case 'string':
                return { type: 'string' };
            case 'number':
                return { type: 'number' };
            case 'boolean':
                return { type: 'boolean' };
            case 'array':
                return { type: 'array', items: {} };
            case 'object':
            default:
                return { type: 'object' };
        }
    }
}

/**
 * Analyze a directory and generate OpenAPI spec
 */
export async function analyzeDirectory(directory: string): Promise<any> {
    const analyzer = new OpenAPIAnalyzer(directory);
    return await analyzer.analyze();
}
