import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * File information collected during scan
 */
interface CollectedFile {
    path: string;
    type: 'ts' | 'tsx' | 'cts' | 'dts' | 'mts' | 'js' | 'jsx' | 'mjs' | 'cjs' | 'map';
    content?: string;
}

/**
 * Route information extracted from AST
 */
export interface RouteInfo {
    method: string;
    path: string;
    handlerName?: string;
    handlerSource?: string;
    requestTypes?: {
        body?: any;
        query?: Record<string, string>;
        params?: Record<string, string>;
        headers?: Record<string, string>;
    };
    responseType?: string;
    responseSchema?: any;
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    emits?: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[];
    sourceContext?: {
        file: string;
        startLine: number;
        endLine: number;
        snippet?: string;
        snippetStartLine?: number;
    };
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
export interface ApplicationInstance {
    name: string;
    filePath: string;
    className: 'Shokupan' | 'ShokupanRouter' | 'Controller';
    controllerPrefix?: string;
    routes: RouteInfo[];
    mounted: MountInfo[];
}

interface MountInfo {
    prefix: string;
    target: string; // Controller/Router name or file path
    targetFilePath?: string;
    dependency?: DependencyInfo;
}

/**
 * Main analyzer class
 */
export class OpenAPIAnalyzer {
    private files: CollectedFile[] = [];
    private applications: ApplicationInstance[] = [];
    private program?: ts.Program;

    private entrypoint?: string;

    constructor(private rootDir: string, entrypoint?: string) {
        if (entrypoint) {
            this.entrypoint = path.resolve(entrypoint);
        }
    }

    /**
     * Main analysis entry point
     */
    /**
     * Main analysis entry point
     */
    public async analyze(): Promise<{ applications: ApplicationInstance[]; }> {
        // console.log(`Analyzing directory: ${this.rootDir}`);

        // Step 1: Parse TypeScript files (which might involve scanning or using entrypoint)
        await this.parseTypeScriptFiles();

        // Step 2: Process source maps if needed
        await this.processSourceMaps();

        // Step 3: Find Shokupan applications
        await this.findApplications();

        // Step 4: Extract route information
        await this.extractRoutes();

        // Step 5: Prune unreachable GenericModules
        this.pruneApplications();

        // Return the raw application data for further processing
        return { applications: this.applications };
    }

    /**
     * Remove GenericModules that are not mounted by any Shokupan application/router
     */
    private pruneApplications(): void {
        const reachable = new Set<string>();
        const queue: ApplicationInstance[] = [];

        // Seed with explicit applications (Shokupan, ShokupanRouter, Controller)
        for (const app of this.applications) {
            if (app.name !== 'GenericModule') {
                reachable.add(app.filePath);
                queue.push(app);
            }
        }

        // BFS to find all reachable modules via mounts
        while (queue.length > 0) {
            const app = queue.shift()!;

            for (const mount of app.mounted) {
                if (mount.targetFilePath && !reachable.has(mount.targetFilePath)) {
                    reachable.add(mount.targetFilePath);

                    // Find the app instance for this file
                    const mountedApp = this.applications.find(a => a.filePath === mount.targetFilePath);
                    if (mountedApp) {
                        queue.push(mountedApp);
                    }
                }
            }
        }

        // Filter out unreachable GenericModules
        const initialCount = this.applications.length;
        this.applications = this.applications.filter(app => {
            if (app.name === 'GenericModule' && !reachable.has(app.filePath)) {
                // console.log(`[Analyzer] Pruning unreachable module: ${app.filePath}`);
                return false;
            }
            return true;
        });

        // console.log(`[Analyzer] Pruned ${initialCount - this.applications.length} unreachable modules.`);
    }

    /**
     * Recursively scan directory for TypeScript/JavaScript files
     */
    private async scanDirectory(dir: string): Promise<void> {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const fullPath = path.join(dir, entry.name);

                // Skip node_modules for source files (we'll handle deps separately)
                if (entry.isDirectory()) {
                    if (["node_modules", ".git", "dist"].includes(entry.name)) {
                        continue;
                    }
                    await this.scanDirectory(fullPath);
                } else {
                    const ext = path.extname(entry.name);
                    if ([".ts", ".tsx", ".cts", ".dts", ".mts", ".js", ".jsx", ".mjs", ".cjs", ".map"].includes(ext)) {
                        this.files.push({ path: fullPath, type: ext.slice(1) as any });
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

        for (let i = 0; i < jsFiles.length; i++) {
            const jsFile = jsFiles[i];
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
        let fileNames: string[] = [];

        if (this.entrypoint) {
            // If entrypoint is provided, let TypeScript resolve dependencies
            fileNames = [this.entrypoint];
            // console.log(`[Analyzer] Using entrypoint: ${this.entrypoint}`);
        } else {
            // Otherwise, scan the directory manually
            await this.scanDirectory(this.rootDir);
            const tsFiles = this.files.filter(f => f.type === 'ts' || f.type === 'js');
            fileNames = tsFiles.map(f => f.path);
            // console.log(`[Analyzer] Scanning directory, found ${fileNames.length} files`);
        }

        // Create TypeScript program
        this.program = ts.createProgram(fileNames, {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            allowJs: true,
            moduleResolution: ts.ModuleResolutionKind.Node10,
            rootDir: this.rootDir,
            skipLibCheck: true,
            skipDefaultLibCheck: true,
        });

        // If using entrypoint, update this.files with what TS found in the project
        if (this.entrypoint) {
            this.files = this.program.getSourceFiles()
                .filter(sf => !sf.fileName.includes('node_modules'))
                .map(sf => ({ path: sf.fileName, type: sf.fileName.endsWith('.js') ? 'js' : 'ts' }));
        }
    }

    /**
     * Find all Shokupan/ShokupanRouter instances
     */
    private async findApplications(): Promise<void> {
        if (!this.program) return;

        const typeChecker = this.program.getTypeChecker();

        for (let i = 0; i < this.program.getSourceFiles().length; i++) {
            const sourceFile = this.program.getSourceFiles()[i];
            // Skip node_modules and declaration files/tests
            if (sourceFile.fileName.includes('node_modules')) continue;
            if (sourceFile.isDeclarationFile) continue;

            // Allow analyzing test files if we are pointing explicitly to a test directory (fixtures)
            // OR if the file is in a fixtures directory (used for OpenAPI spec generation from test apps)
            // OR if the file IS the entrypoint
            const isTestEnv = this.rootDir.includes('/test/') ||
                this.rootDir.includes('/tests/') ||
                this.rootDir.includes('/fixtures/') ||
                (this.entrypoint && (this.entrypoint.includes('/test/') || this.entrypoint.includes('/tests/')));

            const isFixtureFile = sourceFile.fileName.includes('/fixtures/');
            const isEntrypoint = this.entrypoint && sourceFile.fileName === this.entrypoint;

            // console.log(`[Analyzer] check ${sourceFile.fileName}: isTestEnv=${isTestEnv}, isFixture=${isFixtureFile}, isEntry=${isEntrypoint}`);

            if (!isTestEnv && !isFixtureFile && !isEntrypoint) {
                if (sourceFile.fileName.includes('/test/') || sourceFile.fileName.includes('/tests/')) {
                    // console.log(`[Analyzer] Skipping test file: ${sourceFile.fileName}`);
                    continue;
                }
                if (sourceFile.fileName.includes('/base_test/')) continue;
                if (sourceFile.fileName.includes('.test.ts') || sourceFile.fileName.includes('.spec.ts')) continue;
            }

            ts.forEachChild(sourceFile, (node) => {
                this.visitNode(node, sourceFile, typeChecker);
            });
        }
    }

    /**
     * Visit AST node to find application instances
     */
    private visitNode(node: ts.Node, sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker): void {
        // Look for: class FooController ... @Controller(...)
        if (ts.isClassDeclaration(node)) {
            // Check for @Controller decorator
            let isController = false;
            let controllerPrefix: string | undefined;
            let className = node.name?.getText(sourceFile);

            const decorators: ts.Decorator[] = (node as any).decorators || node.modifiers?.filter((m: any) => ts.isDecorator(m));

            if (decorators) {
                const controllerDecorator = decorators.find((d: any) => {
                    const expr = d.expression;
                    if (ts.isCallExpression(expr)) {
                        const identifier = expr.expression.getText(sourceFile);
                        return identifier === 'Controller';
                    }
                    return false;
                });
                if (controllerDecorator) {
                    isController = true;
                    const expr = controllerDecorator.expression as ts.CallExpression;
                    if (expr.arguments.length > 0 && ts.isStringLiteral(expr.arguments[0])) {
                        controllerPrefix = expr.arguments[0].text;
                    }
                }
            }

            // Fallback: Check for method decorators (@Get, @Post, etc.)
            if (!isController) {
                const hasRouteDecorators = node.members.some(m => {
                    // Trust 175 as MethodDeclaration if TS matches mostly, or just check members
                    if (ts.isMethodDeclaration(m) || m.kind === 175 || m.kind === 170 || m.kind === 171) {
                        const decs = (m as any).decorators || (m as any).modifiers?.filter((mod: any) => ts.isDecorator(mod));
                        if (decs) {
                            return decs.some((d: any) => {
                                const expr = d.expression;
                                if (ts.isCallExpression(expr)) {
                                    const identifier = expr.expression.getText(sourceFile);
                                    return ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'event'].includes(identifier.toLowerCase());
                                }
                                return false;
                            });
                        }
                    }
                    return false;
                });
                if (hasRouteDecorators) {
                    isController = true;
                }
            }

            if (isController && className) {
                this.applications.push({
                    name: className,
                    filePath: sourceFile.fileName,
                    className: 'Controller',
                    controllerPrefix,
                    routes: [],
                    mounted: []
                });
            }
        }

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

        // Look for standalone route calls in files that don't instantiate an app
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr)) {
                const method = expr.name.getText(sourceFile);
                if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'event', 'on'].includes(method)) {
                    const existing = this.applications.find(a => a.filePath === sourceFile.fileName);
                    if (!existing) {
                        this.applications.push({
                            name: 'GenericModule',
                            filePath: sourceFile.fileName,
                            className: 'Shokupan',
                            routes: [],
                            mounted: []
                        });
                    }
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

        for (let i = 0; i < this.applications.length; i++) {
            const app = this.applications[i];
            const sourceFile = this.program.getSourceFile(app.filePath);
            if (!sourceFile) continue;

            this.extractRoutesFromFile(app, sourceFile);
        }
    }

    /**
     * Extract routes from a Controller class
     */
    private extractRoutesFromController(app: ApplicationInstance, classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): void {
        const methods = classNode.members.filter(m => ts.isMethodDeclaration(m) || m.kind === 175);

        for (let i = 0; i < methods.length; i++) {
            const method = methods[i];
            const methodNode = method as any; // Cast to any to access decorators in newer/older TS mix
            if (!methodNode.decorators && !methodNode.modifiers) continue;

            const decorators = methodNode.decorators || methodNode.modifiers?.filter((m: any) => ts.isDecorator(m));
            if (!decorators) continue;

            // Find route decorators: @Get, @Post, etc.
            const routeDecorator = decorators.find((d: any) => {
                const expr = d.expression;
                if (ts.isCallExpression(expr)) {
                    const identifier = expr.expression.getText(sourceFile);
                    return ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'event'].includes(identifier.toLowerCase());
                }
                return false;
            });

            if (routeDecorator && ts.isCallExpression(routeDecorator.expression)) {
                const decoratorName = routeDecorator.expression.expression.getText(sourceFile);
                const httpMethod = decoratorName.toUpperCase();
                let routePath = '/';

                // Get path
                const pathArg = routeDecorator.expression.arguments[0];
                if (pathArg && ts.isStringLiteral(pathArg)) {
                    routePath = pathArg.text;
                }

                // Normalize path params: /users/:id -> /users/{id}
                routePath = routePath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

                // Handler Name (Class.method)
                const handlerName = `${app.name}.${methodNode.name.getText(sourceFile)}`;

                // Analyze the method body
                const analysis = this.analyzeHandler(methodNode, sourceFile);

                app.routes.push({
                    method: httpMethod,
                    path: routePath,
                    handlerName: handlerName,
                    handlerSource: methodNode.getText(sourceFile),
                    requestTypes: analysis.requestTypes,
                    responseType: analysis.responseType,
                    responseSchema: analysis.responseSchema,
                    emits: analysis.emits,
                    sourceContext: {
                        file: sourceFile.fileName,
                        startLine: sourceFile.getLineAndCharacterOfPosition(methodNode.getStart()).line + 1,
                        endLine: sourceFile.getLineAndCharacterOfPosition(methodNode.getEnd()).line + 1
                    }
                });
            }
        }
    };

    /**
     * Extract routes from a specific file
     */
    private extractRoutesFromFile(app: ApplicationInstance, sourceFile: ts.SourceFile): void {
        if (app.className === 'Controller') {
            const classNode = sourceFile.statements.find(s => ts.isClassDeclaration(s) && s.name?.getText(sourceFile) === app.name) as ts.ClassDeclaration;
            if (classNode) {
                this.extractRoutesFromController(app, classNode, sourceFile);
            }
        } else {
            // Existing logic for app/router instances
            const visit = (node: ts.Node) => {
                // ... (rest of the existing logic)
                // Look for method calls: app.get(...), app.post(...), app.mount(...)
                if (ts.isCallExpression(node)) {
                    const expr = node.expression;

                    if (ts.isPropertyAccessExpression(expr)) {
                        const objName = expr.expression.getText(sourceFile);
                        const methodName = expr.name.getText(sourceFile);

                        // Check if this is our application instance
                        // For GenericModule, we accept any variable name as it's likely an argument (e.g. app.event)
                        if (objName === app.name || (app.name === 'GenericModule' && node.arguments.length >= 2)) {
                            // console.log(`[Analyzer] Inspecting route call: ${objName}.${methodName} in ${app.name}`);
                            if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'on', 'event'].includes(methodName.toLowerCase())) {
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
        } else {
            routePath = '__DYNAMIC_EVENT__';
        }

        // Normalize path params: /users/:id -> /users/{id}
        // This ensures matching with runtime-generated keys
        const normalizedPath = routePath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

        let metadata: any = {};

        // Check for metadata argument (3 args: path, metadata, handler)
        if (args.length >= 3 && ts.isObjectLiteralExpression(args[1])) {
            const metaObj = args[1];
            // Extract summary, description, tags, etc.
            const rawMeta = this.convertExpressionToSchema(metaObj, sourceFile, new Map());

            // convertExpressionToSchema returns a schema-like object { type: 'object', properties: {...} }
            // But we want the actual values if they are literals.
            // convertExpressionToSchema is designed for SCHEMAS, not values.
            // We need a simpler value extractor or just parse the props directly for this specific case.

            for (let i = 0; i < metaObj.properties.length; i++) {
                const prop = metaObj.properties[i];
                if (ts.isPropertyAssignment(prop) && prop.name) {
                    const name = prop.name.getText(sourceFile);
                    const val = prop.initializer;

                    if (ts.isStringLiteral(val)) {
                        metadata[name] = val.text;
                    } else if (ts.isArrayLiteralExpression(val) && name === 'tags') {
                        metadata.tags = val.elements
                            .filter(e => ts.isStringLiteral(e))
                            .map(e => (e as ts.StringLiteral).text);
                    } else if (name === 'operationId' && ts.isStringLiteral(val)) {
                        metadata.operationId = val.text;
                    }
                }
            }
        }

        // Extract handler information
        const handlerArg = args[args.length - 1];
        const handlerInfo = this.analyzeHandler(handlerArg, sourceFile);

        return {
            method,
            path: normalizedPath,
            handlerName: handlerArg.getText(sourceFile).substring(0, 50), // Truncate for display
            handlerSource: handlerArg.getText(sourceFile),
            responseType: handlerInfo.responseType,
            responseSchema: handlerInfo.responseSchema,
            emits: handlerInfo.emits,
            ...metadata,
            sourceContext: {
                file: sourceFile.fileName,
                startLine: sourceFile.getLineAndCharacterOfPosition(handlerArg.getStart()).line + 1,
                endLine: sourceFile.getLineAndCharacterOfPosition(handlerArg.getEnd()).line + 1,
                snippet: (() => {
                    const funcStart = sourceFile.getLineAndCharacterOfPosition(handlerArg.getStart()).line;
                    const funcEnd = sourceFile.getLineAndCharacterOfPosition(handlerArg.getEnd()).line;
                    const maxLine = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line;

                    const startLine = Math.max(0, funcStart - 5);
                    const endLine = Math.min(maxLine, funcEnd + 5);

                    const startPos = sourceFile.getPositionOfLineAndCharacter(startLine, 0);
                    // End position of the last line (using getPositionOfLineAndCharacter for next line - 1 char? No. just use line start of next line?)
                    // Safest is getPositionOfLineAndCharacter(endLine + 1, 0) if exists, else EOF.
                    let endPos = sourceFile.getEnd();
                    if (endLine < maxLine) {
                        endPos = sourceFile.getPositionOfLineAndCharacter(endLine + 1, 0);
                    } else {
                        // Get end of file
                        endPos = sourceFile.getEnd();
                    }

                    return sourceFile.text.substring(startPos, endPos);
                })(),
                snippetStartLine: Math.max(0, sourceFile.getLineAndCharacterOfPosition(handlerArg.getStart()).line - 5) + 1
            }
        };
    }

    /**
     * Analyze a route handler to extract type information
     */
    private analyzeHandler(handler: ts.Node, sourceFile: ts.SourceFile): {
        requestTypes?: RouteInfo['requestTypes'];
        responseType?: string;
        responseSchema?: any;
        emits?: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[];
    } {
        const requestTypes: RouteInfo['requestTypes'] = {};
        let responseType: string | undefined;
        let responseSchema: any | undefined;
        let hasExplicitReturnType = false;
        const emits: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[] = [];

        // Simple scope to track variable types (name -> schema)
        const scope = new Map<string, any>();

        // Pre-populate scope with function parameters
        if (ts.isFunctionLike(handler)) {
            handler.parameters.forEach(param => {
                if (ts.isIdentifier(param.name) && param.type) {
                    const paramName = param.name.getText(sourceFile);
                    // Resolving TypeReference for parameters (e.g. User) would require partial type checker or expanded scope logic
                    // For now, we rely on basic types
                    const paramType = this.convertTypeNodeToSchema(param.type, sourceFile);
                    if (paramType) {
                        scope.set(paramName, paramType);
                    }
                }
            });

            // Check for explicit return type annotation
            if (handler.type) {
                const returnSchema = this.convertTypeNodeToSchema(handler.type, sourceFile);
                if (returnSchema) {
                    responseSchema = returnSchema;
                    responseType = returnSchema.type;
                    hasExplicitReturnType = true;
                }
            }
        }

        // Helper to analyze an expression that is being returned (either explicitly or implicitly)
        const analyzeReturnExpression = (expr: ts.Expression) => {
            let node = expr;
            // Unwrap await
            if (ts.isAwaitExpression(node)) {
                node = node.expression;
            }


            // Case 1: return ctx.json(...) or ctx.text(...)
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const callObj = node.expression.expression.getText(sourceFile);
                const callProp = node.expression.name.getText(sourceFile);

                if (callObj === 'ctx' || callObj.endsWith('.ctx')) {
                    if (callProp === 'json') {
                        if (node.arguments.length > 0) {
                            responseSchema = this.convertExpressionToSchema(node.arguments[0], sourceFile, scope);
                            responseType = 'object';
                        }
                        return;
                    }
                    else if (callProp === 'text') {
                        responseType = 'string';
                        return;
                    }
                }
            }

            // Case 2: Direct object return
            // Only use this if we haven't found a better schema yet, or if it looks specific
            // And if we don't have an explicit return type
            if (!hasExplicitReturnType && (!responseSchema || responseSchema.type === 'object')) {
                const schema = this.convertExpressionToSchema(node, sourceFile, scope);
                if (schema && (schema.type !== 'object' || Object.keys(schema.properties || {}).length > 0)) {
                    responseSchema = schema;
                    responseType = schema.type;
                }
            }

            // Fallback to text matching if schema inference failed and we still don't have a type
            if (!responseSchema && !responseType) {
                const returnText = node.getText(sourceFile);
                if (returnText.startsWith('{')) {
                    responseType = 'object';
                } else if (returnText.startsWith('[')) {
                    responseType = 'array';
                } else if (returnText.startsWith('"') || returnText.startsWith("'")) {
                    responseType = 'string';
                }
            }
        };

        // Handle arrow functions
        let body: ts.Block | undefined;
        // Also check for Kind 175 (Method/Accessor in some TS versions)
        if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) || ts.isMethodDeclaration(handler) || handler.kind === 175) {
            // TS method has .body which is FunctionBody (Block) or undefined
            body = (handler as any).body;

            // Visit the handler body to find ctx usage
            const visit = (node: ts.Node) => {
                // Track variable declarations
                if (ts.isVariableDeclaration(node)) {
                    if (node.initializer && ts.isIdentifier(node.name)) {
                        const varName = node.name.getText(sourceFile);
                        const schema = this.convertExpressionToSchema(node.initializer, sourceFile, scope);
                        scope.set(varName, schema);
                    }
                }

                // Check for type assertions on ctx.body()
                if (ts.isAsExpression(node)) {
                    if (this.isCtxBodyCall(node.expression, sourceFile)) {
                        const schema = this.convertTypeNodeToSchema(node.type, sourceFile);
                        if (schema) {
                            requestTypes.body = schema;

                            // Track variables assigned to this body
                            if (ts.isVariableDeclaration(node.parent)) {
                                const varName = node.parent.name.getText(sourceFile);
                                scope.set(varName, schema);
                            }
                        }
                    }
                }

                // Look for ctx usage
                if (ts.isPropertyAccessExpression(node)) {
                    const objText = node.expression.getText(sourceFile);
                    const propText = node.name.getText(sourceFile);

                    if (objText === 'ctx' || objText.endsWith('.ctx')) {
                        if (propText === 'body') {
                            if (!requestTypes.body) {
                                requestTypes.body = { type: 'object' };
                            }
                        } else if (propText === 'query') {
                            if (!requestTypes.query) requestTypes.query = {};
                        } else if (propText === 'params') {
                            if (!requestTypes.params) requestTypes.params = {};
                        } else if (propText === 'headers') {
                            if (!requestTypes.headers) requestTypes.headers = {};
                        }
                    }
                }

                // Explicit Return
                if (ts.isReturnStatement(node) && node.expression) {
                    analyzeReturnExpression(node.expression);
                }

                // Implicit Return (Concise Arrow Function)
                // e.g. (ctx) => ctx.json(...) or .then(res => ctx.json(res))
                if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
                    analyzeReturnExpression(node.body as ts.Expression);
                }

                // Implicit Return call (e.g. ctx.json(...) as a statement without return)
                if (ts.isExpressionStatement(node)) {
                    analyzeReturnExpression(node.expression);

                    // Check for ctx.emit()
                    if (ts.isCallExpression(node.expression)) {
                        const expr = node.expression;
                        if (ts.isPropertyAccessExpression(expr.expression)) {
                            const objText = expr.expression.expression.getText(sourceFile);
                            const propText = expr.expression.name.getText(sourceFile);

                            if ((objText === 'ctx' || objText.endsWith('.ctx')) && propText === 'emit') {
                                if (expr.arguments.length >= 1) {
                                    const eventNameArg = expr.arguments[0];
                                    if (ts.isStringLiteral(eventNameArg)) {
                                        const eventName = eventNameArg.text;
                                        let payload = { type: 'object' };

                                        if (expr.arguments.length >= 2) {
                                            payload = this.convertExpressionToSchema(expr.arguments[1], sourceFile, scope);
                                        }

                                        const emitLoc = {
                                            startLine: sourceFile.getLineAndCharacterOfPosition(expr.getStart()).line + 1,
                                            endLine: sourceFile.getLineAndCharacterOfPosition(expr.getEnd()).line + 1
                                        };
                                        emits.push({ event: eventName, payload, location: emitLoc });
                                    } else {
                                        const emitLoc = {
                                            startLine: sourceFile.getLineAndCharacterOfPosition(expr.getStart()).line + 1,
                                            endLine: sourceFile.getLineAndCharacterOfPosition(expr.getEnd()).line + 1
                                        };
                                        emits.push({ event: '__DYNAMIC_EMIT__', payload: { type: 'object' }, location: emitLoc });
                                    }
                                }
                            }
                        }
                    }
                }

                ts.forEachChild(node, visit);
            };

            if (ts.isBlock(body)) {
                ts.forEachChild(body, visit);
            } else {
                // Main handler is an implicit return: app.get('/', (ctx) => ctx.json(...))
                analyzeReturnExpression(body);
                // Also verify children (e.g. if body is a CallExpression, verify args??)
                // analyzeReturnExpression analyzes the expression itself.
                // But we ALSO want to visit children to find other usages (request types)
                // or nested arrow functions in a call chain (e.g. chaining .then())
                ts.forEachChild(body, visit);
            }
        }

        return { requestTypes, responseType, responseSchema, emits };
    }

    /**
     * Convert an Expression node to an OpenAPI schema (best effort)
     */
    private convertExpressionToSchema(node: ts.Expression, sourceFile: ts.SourceFile, scope: Map<string, any>): any {
        // Object Literal: { a: 1, b: "text" }
        if (ts.isObjectLiteralExpression(node)) {
            const schema: any = {
                type: 'object',
                properties: {},
                required: []
            };

            for (let i = 0; i < node.properties.length; i++) {
                const prop = node.properties[i];
                if (ts.isPropertyAssignment(prop)) {
                    const name = prop.name.getText(sourceFile);
                    const valueSchema = this.convertExpressionToSchema(prop.initializer, sourceFile, scope);

                    schema.properties[name] = valueSchema;
                    schema.required.push(name); // Properties in literal return are required
                }
                else if (ts.isShorthandPropertyAssignment(prop)) {
                    const name = prop.name.getText(sourceFile);
                    // Check scope for variable
                    const scopedSchema = scope.get(name);
                    schema.properties[name] = scopedSchema || { type: 'object' };
                    schema.required.push(name);
                }
            }
            if (schema.required.length === 0) {
                delete schema.required;
            }
            return schema;
        }

        // Array Literal: [1, 2]
        if (ts.isArrayLiteralExpression(node)) {
            const schema: any = { type: 'array' };
            if (node.elements.length > 0) {
                // Infer item type from first element
                schema.items = this.convertExpressionToSchema(node.elements[0], sourceFile, scope);
            } else {
                schema.items = {};
            }
            return schema;
        }

        // Conditional (Ternary) Expression: cond ? trueVal : falseVal
        if (ts.isConditionalExpression(node)) {
            const trueSchema = this.convertExpressionToSchema(node.whenTrue, sourceFile, scope);
            // const falseSchema = this.convertExpressionToSchema(node.whenFalse, sourceFile, scope);

            // Simplified: return true branch schema. Ideally we'd do oneOf
            return trueSchema;
        }

        // Template Expression: `Hello ${name}`
        if (ts.isTemplateExpression(node)) {
            return { type: 'string' };
        }

        // Identifier (Variable reference)
        if (ts.isIdentifier(node)) {
            const name = node.getText(sourceFile);
            const scopedSchema = scope.get(name);
            if (scopedSchema) return scopedSchema;
            return { type: 'object' }; // Unknown reference
        }

        // Literals
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { type: 'string' };
        if (ts.isNumericLiteral(node)) return { type: 'number' };
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean' };

        // Unknown
        return { type: 'object' };
    }

    /**
     * Check if an expression is a call to ctx.body()
     */
    private isCtxBodyCall(node: ts.Expression, sourceFile: ts.SourceFile): boolean {
        // Handle await ctx.body()
        if (ts.isAwaitExpression(node)) {
            return this.isCtxBodyCall(node.expression, sourceFile);
        }

        // Handle ctx.body()
        if (ts.isCallExpression(node)) {
            // Check expression: ctx.body
            if (ts.isPropertyAccessExpression(node.expression)) {
                const objText = node.expression.expression.getText(sourceFile);
                const propText = node.expression.name.getText(sourceFile);
                return (objText === 'ctx' || objText.endsWith('.ctx')) && propText === 'body';
            }
        }

        return false;
    }

    /**
     * Convert a TypeScript TypeNode to an OpenAPI schema
     */
    private convertTypeNodeToSchema(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): any {
        switch (typeNode.kind) {
            case ts.SyntaxKind.StringKeyword:
                return { type: 'string' };
            case ts.SyntaxKind.NumberKeyword:
                return { type: 'number' };
            case ts.SyntaxKind.BooleanKeyword:
                return { type: 'boolean' };
            case ts.SyntaxKind.AnyKeyword:
            case ts.SyntaxKind.UnknownKeyword:
                return {}; // Any/Unknown -> empty schema (accepts anything)

            case ts.SyntaxKind.TypeLiteral: {
                const literal = typeNode as ts.TypeLiteralNode;
                const schema: any = {
                    type: 'object',
                    properties: {},
                    required: []
                };

                for (let i = 0; i < literal.members.length; i++) {
                    const member = literal.members[i];
                    if (ts.isPropertySignature(member) && member.type) {
                        const name = member.name.getText(sourceFile);
                        const propSchema = this.convertTypeNodeToSchema(member.type, sourceFile);

                        schema.properties[name] = propSchema;

                        // Property is required unless it has a question token
                        if (!member.questionToken) {
                            schema.required.push(name);
                        }
                    }
                }

                if (schema.required.length === 0) {
                    delete schema.required;
                }

                return schema;
            }

            case ts.SyntaxKind.ArrayType: {
                const arrayType = typeNode as ts.ArrayTypeNode;
                return {
                    type: 'array',
                    items: this.convertTypeNodeToSchema(arrayType.elementType, sourceFile)
                };
            }

            // Handle Type References (e.g. Array<string>)
            case ts.SyntaxKind.TypeReference: {
                const typeRef = typeNode as ts.TypeReferenceNode;
                const typeName = typeRef.typeName.getText(sourceFile);

                if (typeName === 'Array' && typeRef.typeArguments?.length > 0) {
                    return {
                        type: 'array',
                        items: this.convertTypeNodeToSchema(typeRef.typeArguments[0], sourceFile)
                    };
                }

                if (typeName === 'Promise' && typeRef.typeArguments?.length > 0) {
                    return this.convertTypeNodeToSchema(typeRef.typeArguments[0], sourceFile);
                }

                // For other references, we default to string or object as fallback
                // A fuller implementation would resolve the reference
                return { type: 'object', description: `Ref: ${typeName}` };
            }

            default:
                return { type: 'object' };
        }
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
        let targetFilePath: string | undefined;

        if (!dependency) {
            // Check for internal import
            let modulePath: string | undefined;
            ts.forEachChild(sourceFile, (node) => {
                if (targetFilePath || modulePath) return; // Found

                if (ts.isImportDeclaration(node)) {
                    const specifier = node.moduleSpecifier;
                    if (ts.isStringLiteral(specifier)) {
                        const path = specifier.text;
                        if (path.startsWith('.')) {
                            // Check default import: import target from './...'
                            if (node.importClause?.name?.getText(sourceFile) === target) {
                                modulePath = path;
                            }
                            // Check named imports: import { target } from './...'
                            else if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                                for (const element of node.importClause.namedBindings.elements) {
                                    if (element.name.getText(sourceFile) === target) {
                                        modulePath = path;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (modulePath) {
                const dir = path.dirname(sourceFile.fileName);
                const absolutePath = path.resolve(dir, modulePath);

                // Try to resolve extension
                const extensions = ['.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
                for (const ext of extensions) {
                    if (fs.existsSync(absolutePath + ext)) {
                        targetFilePath = absolutePath + ext;
                        break;
                    }
                    // If absolutePath ends in /index (implicit)
                    // Or if modulePath points to directory
                }
                // Try straight (if user included extension)
                if (!targetFilePath && fs.existsSync(absolutePath)) {
                    targetFilePath = absolutePath;
                }
                // Try directory index
                if (!targetFilePath && fs.existsSync(path.join(absolutePath, 'index.ts'))) {
                    targetFilePath = path.join(absolutePath, 'index.ts');
                }

                // Normalize result?
            }
        }

        return {
            prefix,
            target,
            targetFilePath,
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

        for (let i = 0; i < imports.length; i++) {
            const imp = imports[i];
            const moduleSpecifier = imp.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const modulePath = moduleSpecifier.text;

                // Check if it's a node_modules import (no relative path)
                if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) {
                    const namedBindings = imp.importClause?.namedBindings;

                    if (namedBindings && ts.isNamedImports(namedBindings)) {
                        for (let j = 0; j < namedBindings.elements.length; j++) {
                            const element = namedBindings.elements[j];
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
    public generateOpenAPISpec(): any {
        const paths: Record<string, any> = {};

        const collectRoutes = (app: ApplicationInstance, prefix: string = '') => {
            // Add direct routes
            for (let i = 0; i < app.routes.length; i++) {
                const route = app.routes[i];
                // Ensure prefix handles slashes correctly
                const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                const cleanPath = route.path.startsWith('/') ? route.path : '/' + route.path;
                const fullPath = (cleanPrefix + cleanPath) || '/';

                // Normalization is already done in extractRouteFromCall, but double check
                const pathKey = fullPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

                if (!paths[pathKey]) {
                    paths[pathKey] = {};
                }

                const method = route.method.toLowerCase();
                const operation: any = {
                    summary: route.summary || `${route.method.toUpperCase()} ${pathKey}`,
                    description: route.description,
                    tags: route.tags,
                    operationId: route.operationId,
                    responses: {
                        '200': {
                            description: 'Successful response'
                        }
                    }
                };

                // Clean up undefined
                if (!operation.description) delete operation.description;
                if (!operation.tags) delete operation.tags;
                if (!operation.operationId) delete operation.operationId;

                // Add inferred response schema
                if (route.responseSchema) {
                    operation.responses['200'].content = {
                        'application/json': {
                            schema: route.responseSchema
                        }
                    };
                } else if (route.responseType) {
                    // Fallback to basic type
                    const contentType = route.responseType === 'string' ? 'text/plain' : 'application/json';
                    operation.responses['200'].content = {
                        [contentType]: {
                            schema: { type: route.responseType }
                        }
                    };
                } else {
                    // Default object
                    operation.responses['200'].content = {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    };
                }

                // Add request body schema if available
                if (route.requestTypes?.body) {
                    operation.requestBody = {
                        content: {
                            'application/json': {
                                schema: route.requestTypes.body
                            }
                        }
                    };
                }

                // Add query/path parameters
                const parameters: any[] = [];

                if (route.requestTypes?.query) {
                    const entries = Object.entries(route.requestTypes.query);
                    for (let i = 0; i < entries.length; i++) {
                        const [key] = entries[i];
                        parameters.push({
                            name: key,
                            in: 'query',
                            schema: { type: 'string' }
                        });
                    }
                }

                if (route.requestTypes?.params) {
                    // Also check for path params implied by the URL {param}
                    // But assume extractRouteFromCall handled explicit ones?
                    // Let's just trust requestTypes for now
                    const entries = Object.entries(route.requestTypes.params);
                    for (let i = 0; i < entries.length; i++) {
                        const [key] = entries[i];
                        parameters.push({
                            name: key,
                            in: 'path',
                            required: true,
                            schema: { type: 'string' }
                        });
                    }
                }

                // Extract params from path if not explicitly typed but present in URL
                // This backfills untyped params so they appear in spec
                const pathParams = pathKey.match(/{([^}]+)}/g);
                if (pathParams) {
                    pathParams.forEach(p => {
                        const name = p.slice(1, -1);
                        if (!parameters.some(param => param.name === name && param.in === 'path')) {
                            parameters.push({
                                name,
                                in: 'path',
                                required: true,
                                schema: { type: 'string' } // Default to string
                            });
                        }
                    });
                }

                if (parameters.length > 0) {
                    operation.parameters = parameters;
                }

                paths[pathKey][method] = operation;
            }

            // Recurse into mounted apps
            for (let i = 0; i < app.mounted.length; i++) {
                const mount = app.mounted[i];
                // We need to resolve the ApplicationInstance for the target
                // The 'mounted' array currently only stores { prefix, target, dependency }
                // We need to find the AppInstance that matches 'target' class name

                // Note: This simple matching by class name might be brittle if multiple files have same class name
                // In a full implementation we would resolve the file path.
                const mountedApp = this.applications.find(a => a.name === mount.target || a.className === mount.target);

                if (mountedApp) {
                    // Prevent infinite recursion
                    if (mountedApp === app) continue;

                    const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                    const mountPrefix = mount.prefix.startsWith('/') ? mount.prefix : '/' + mount.prefix;
                    const nextPrefix = cleanPrefix + mountPrefix;

                    collectRoutes(mountedApp, nextPrefix);
                }
            }
        };

        for (let i = 0; i < this.applications.length; i++) {
            const app = this.applications[i];
            // We only want to start collection from "root" apps? 
            // Or just collect everything? 
            // If we collect everything, we might duplicate routes if they are mounted.
            // Current findApplications finds ALL instances.

            // Heuristic: If this app is mounted by another app, don't collect it as root.
            // But we don't have back-references easily.
            // Simplified: Just collect everything for now, but realize that un-mounted routers might show up as root.
            // Ideally we need to find the "Main" app (root).

            // For now, let's collect all, but we might have duplicates if we traverse mounts.
            // Let's rely on the user to only have one Main entrypoint usually.
            // Or we can try to detect if it is mounted.

            const isMounted = this.applications.some(parent =>
                parent.mounted.some(m => m.target === app.name || m.target === app.className)
            );

            if (!isMounted) {
                collectRoutes(app);
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
}

/**
 * Analyze a directory and generate OpenAPI spec
 */
export async function analyzeDirectory(directory: string): Promise<any> {
    const analyzer = new OpenAPIAnalyzer(directory);
    return await analyzer.analyze();
}
