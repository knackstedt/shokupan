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
    hasUnknownFields?: boolean;
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    emits?: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[];
    sourceContext?: {
        file: string;
        startLine: number;
        endLine: number;
        highlights?: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning' | 'dynamic-path'; }[];
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
    middleware: MiddlewareInfo[]; // Middleware registered on this app/router
}

interface MountInfo {
    prefix: string;
    target: string; // Controller/Router name or file path
    targetFilePath?: string;
    dependency?: DependencyInfo;
    sourceContext?: {
        file: string;
        startLine: number;
        endLine: number;
    };
}

/**
 * Middleware information extracted from AST
 */
export interface MiddlewareInfo {
    name: string;
    file: string;
    startLine: number;
    endLine: number;
    handlerSource?: string;
    responseTypes?: Record<string, any>; // e.g., { "401": { description: "...", content: {...} }, "403": {...} }
    headers?: string[]; // Headers set/modified by middleware
    scope: 'global' | 'router' | 'route';
    sourceContext?: {
        file: string;
        startLine: number;
        endLine: number;
        snippet?: string;
        snippetStartLine?: number;
        highlights?: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning'; }[];
    };
}


/**
 * Main analyzer class
 */
export class OpenAPIAnalyzer {
    private files: CollectedFile[] = [];
    private applications: ApplicationInstance[] = [];
    private program?: ts.Program;
    private entrypoint?: string;
    // Track imports per file: filePath -> { importedName -> { modulePath, exportName } }
    private imports: Map<string, Map<string, { modulePath: string; exportName?: string; }>> = new Map();

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

        // Step 3: Collect imports from all files
        await this.collectImports();

        // Step 4: Find Shokupan applications
        await this.findApplications();

        // Step 5: Extract route information
        await this.extractRoutes();

        // Step 6: Prune unreachable GenericModules
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
     * Collect all imports from source files for later resolution
     */
    private async collectImports(): Promise<void> {
        if (!this.program) return;

        for (const sourceFile of this.program.getSourceFiles()) {
            if (sourceFile.fileName.includes('node_modules')) continue;
            if (sourceFile.isDeclarationFile) continue;

            const fileImports = new Map<string, { modulePath: string; exportName?: string; }>();

            ts.forEachChild(sourceFile, (node) => {
                if (ts.isImportDeclaration(node)) {
                    const moduleSpecifier = node.moduleSpecifier;
                    if (ts.isStringLiteral(moduleSpecifier)) {
                        const modulePath = moduleSpecifier.text;

                        // Handle default import: import Foo from './foo'
                        if (node.importClause?.name) {
                            const importedName = node.importClause.name.getText(sourceFile);
                            fileImports.set(importedName, { modulePath, exportName: 'default' });
                        }

                        // Handle named imports: import { Foo, Bar } from './foo'
                        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                            for (const element of node.importClause.namedBindings.elements) {
                                const importedName = element.name.getText(sourceFile);
                                const exportName = element.propertyName?.getText(sourceFile) || importedName;
                                fileImports.set(importedName, { modulePath, exportName });
                            }
                        }

                        // Handle namespace imports: import * as foo from './foo'
                        if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
                            const importedName = node.importClause.namedBindings.name.getText(sourceFile);
                            fileImports.set(importedName, { modulePath, exportName: '*' });
                        }
                    }
                }
            });

            if (fileImports.size > 0) {
                this.imports.set(sourceFile.fileName, fileImports);
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
                    mounted: [],
                    middleware: []
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
                        mounted: [],
                        middleware: []
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
                            mounted: [],
                            middleware: []
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
                    hasUnknownFields: analysis.hasUnknownFields,
                    emits: analysis.emits,
                    sourceContext: {
                        file: sourceFile.fileName,
                        startLine: sourceFile.getLineAndCharacterOfPosition(methodNode.getStart()).line + 1,
                        endLine: sourceFile.getLineAndCharacterOfPosition(methodNode.getEnd()).line + 1,
                        highlights: analysis.highlights
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
                            } else if (methodName === 'use') {
                                // Extract middleware info
                                const middleware = this.extractMiddlewareFromCall(node, sourceFile);
                                if (middleware) {
                                    // If attached to root application, mark as global
                                    if (app.className === 'Shokupan') {
                                        middleware.scope = 'global';
                                    }
                                    app.middleware.push(middleware);
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
     * Resolve string value from expression (literals, concatenation, templates, constants)
     */
    private resolveStringValue(node: ts.Node, sourceFile: ts.SourceFile): string | null {
        if (ts.isStringLiteral(node)) {
            return node.text;
        }
        if (ts.isNoSubstitutionTemplateLiteral(node)) {
            return node.text;
        }
        if (ts.isTemplateExpression(node)) {
            let result = node.head.text;
            for (const span of node.templateSpans) {
                const val = this.resolveStringValue(span.expression, sourceFile);
                if (val === null) return null;
                result += val + span.literal.text;
            }
            return result;
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            const left = this.resolveStringValue(node.left, sourceFile);
            const right = this.resolveStringValue(node.right, sourceFile);
            if (left !== null && right !== null) {
                return left + right;
            }
            return null;
        }
        if (ts.isParenthesizedExpression(node)) {
            return this.resolveStringValue(node.expression, sourceFile);
        }
        if (ts.isIdentifier(node)) {
            if (this.program) {
                const checker = this.program.getTypeChecker();
                const symbol = checker.getSymbolAtLocation(node);
                if (symbol && symbol.valueDeclaration && ts.isVariableDeclaration(symbol.valueDeclaration) && symbol.valueDeclaration.initializer) {
                    return this.resolveStringValue(symbol.valueDeclaration.initializer, sourceFile);
                }
            }
            // Fallback: Check top-level statements in same file if not using TypeChecker or finding symbol failed
            // (Only for const/let defined in the same file)
            // ... Simple scan omitted for now as program.getTypeChecker returns reliable results if program is created correctly.
        }

        return null;
    }

    /**
     * Extract route information from a route call (e.g., app.get('/path', handler))
     */
    private extractRouteFromCall(node: ts.CallExpression, sourceFile: ts.SourceFile, method: string): RouteInfo | null {
        const args = node.arguments;

        if (args.length < 2) return null;

        const pathArg = args[0];
        let routePath = this.resolveStringValue(pathArg, sourceFile);

        let dynamicHighlights: { startLine: number; endLine: number; type: 'dynamic-path'; }[] = [];

        if (!routePath) {
            if (['EVENT', 'ON'].includes(method.toUpperCase())) {
                routePath = '__DYNAMIC_EVENT__';
            } else {
                routePath = '__DYNAMIC_ROUTE__';
            }

            // Capture location of the dynamic expression for highlighting
            const start = sourceFile.getLineAndCharacterOfPosition(pathArg.getStart());
            const end = sourceFile.getLineAndCharacterOfPosition(pathArg.getEnd());

            dynamicHighlights.push({
                startLine: start.line + 1,
                endLine: end.line + 1,
                type: 'dynamic-path'
            });
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
            requestTypes: handlerInfo.requestTypes,
            responseType: handlerInfo.responseType,
            responseSchema: handlerInfo.responseSchema,
            emits: handlerInfo.emits,
            ...metadata,
            sourceContext: {
                file: sourceFile.fileName,
                startLine: sourceFile.getLineAndCharacterOfPosition(handlerArg.getStart()).line + 1,
                endLine: sourceFile.getLineAndCharacterOfPosition(handlerArg.getEnd()).line + 1,
                highlights: [...(handlerInfo.highlights || []), ...dynamicHighlights]
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
        hasUnknownFields?: boolean;
        emits?: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[];
        highlights?: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning'; }[];
    } {
        // Get TypeChecker for type resolution
        const typeChecker = this.program?.getTypeChecker();
        const requestTypes: RouteInfo['requestTypes'] = {};
        let responseType: string | undefined;
        let responseSchemas: any[] = []; // Track multiple schemas from different code paths
        let hasExplicitReturnType = false;
        const emits: { event: string; payload?: any; location?: { startLine: number; endLine: number; }; }[] = [];
        const highlights: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning'; }[] = [];

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
                    responseSchemas.push(returnSchema);
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
                            const schema = this.convertExpressionToSchema(node.arguments[0], sourceFile, scope, typeChecker);
                            responseSchemas.push(schema);
                            responseType = 'object';
                        }
                        return;
                    }
                    else if (callProp === 'text') {
                        responseType = 'string';
                        return;
                    }
                    else if (callProp === 'html' || callProp === 'jsx') {
                        responseType = 'html';
                        return;
                    }
                }
            }

            // Case 2: Direct object return
            // Only use this if we haven't found a better schema yet, or if it looks specific
            // And if we don't have an explicit return type
            if (!hasExplicitReturnType && responseSchemas.length === 0) {
                const schema = this.convertExpressionToSchema(node, sourceFile, scope, typeChecker);
                if (schema && (schema.type !== 'object' || Object.keys(schema.properties || {}).length > 0)) {
                    responseSchemas.push(schema);
                    responseType = schema.type;
                }
            }

            // Fallback to text matching if schema inference failed and we still don't have a type
            if (responseSchemas.length === 0 && !responseType) {
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
                    if (node.initializer) {
                        // Handle simple identifier: const varName = ...
                        if (ts.isIdentifier(node.name)) {
                            const varName = node.name.getText(sourceFile);

                            // Check if initializer is a type assertion on ctx.body()
                            let initializer = node.initializer;
                            if (ts.isAsExpression(initializer)) {
                                if (this.isCtxBodyCall(initializer.expression, sourceFile)) {
                                    const schema = this.convertTypeNodeToSchema(initializer.type, sourceFile);
                                    if (schema) {
                                        requestTypes.body = schema;
                                        scope.set(varName, schema);
                                    }
                                } else {
                                    const schema = this.convertExpressionToSchema(initializer, sourceFile, scope, typeChecker);
                                    scope.set(varName, schema);
                                }
                            } else {
                                const schema = this.convertExpressionToSchema(initializer, sourceFile, scope, typeChecker);
                                scope.set(varName, schema);
                            }
                        }
                        // Handle array destructuring: const [a, b] = ...
                        else if (ts.isArrayBindingPattern(node.name)) {
                            // Get the initializer schema
                            const initializerSchema = this.convertExpressionToSchema(node.initializer, sourceFile, scope, typeChecker);

                            // If the initializer is an array, try to infer element types
                            if (initializerSchema?.type === 'array' && initializerSchema.items) {
                                // Track each destructured element with the array's item type
                                for (let i = 0; i < node.name.elements.length; i++) {
                                    const element = node.name.elements[i];
                                    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                                        const elementName = element.name.getText(sourceFile);
                                        scope.set(elementName, initializerSchema.items);
                                    }
                                }
                            } else {
                                // For non-array initializers or unknown types, track as unknown
                                for (let i = 0; i < node.name.elements.length; i++) {
                                    const element = node.name.elements[i];
                                    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                                        const elementName = element.name.getText(sourceFile);
                                        scope.set(elementName, { 'x-unknown': true });
                                    }
                                }
                            }
                        }
                        // Handle object destructuring: const { a, b } = ...
                        else if (ts.isObjectBindingPattern(node.name)) {
                            const initializerSchema = this.convertExpressionToSchema(node.initializer, sourceFile, scope, typeChecker);

                            // If the initializer is an object with properties, extract the types
                            if (initializerSchema?.type === 'object' && initializerSchema.properties) {
                                for (let i = 0; i < node.name.elements.length; i++) {
                                    const element = node.name.elements[i];
                                    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                                        const elementName = element.name.getText(sourceFile);
                                        const propertySchema = initializerSchema.properties[elementName];
                                        scope.set(elementName, propertySchema || { 'x-unknown': true });
                                    }
                                }
                            } else {
                                // For non-object initializers, track as any
                                for (let i = 0; i < node.name.elements.length; i++) {
                                    const element = node.name.elements[i];
                                    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                                        const elementName = element.name.getText(sourceFile);
                                        scope.set(elementName, { 'x-unknown': true });
                                    }
                                }
                            }
                        }
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

                // Look for ctx calls (json, text, html, send, emit) to highlight
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                    const objText = node.expression.expression.getText(sourceFile);
                    const propText = node.expression.name.getText(sourceFile);

                    if (objText === 'ctx' || objText.endsWith('.ctx') || objText === 'this') {
                        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

                        if (['text', 'html', 'jsx'].includes(propText)) {
                            // text/html/jsx are always strings, so statically valid
                            highlights.push({ startLine, endLine, type: 'return-success' });
                        } else if (propText === 'json') {
                            // Check if we can extract a schema for the argument
                            let isStatic = false;
                            if (node.arguments.length > 0) {
                                const schema = this.convertExpressionToSchema(node.arguments[0], sourceFile, scope, typeChecker);
                                // If schema is not just a bare object or any, it's static
                                if (schema && (schema.type !== 'object' || (schema.properties && Object.keys(schema.properties).length > 0))) {
                                    isStatic = true;
                                }
                            }
                            highlights.push({ startLine, endLine, type: isStatic ? 'return-success' : 'return-warning' });
                        } else if (['send', 'emit'].includes(propText)) {
                            highlights.push({ startLine, endLine, type: 'emit' });
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
                if (ts.isReturnStatement(node)) {
                    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

                    let isStatic = false;
                    if (node.expression) {
                        const schemasBeforeReturn = responseSchemas.length;
                        analyzeReturnExpression(node.expression);
                        // If analyzeReturnExpression added schemas, it's static
                        if (responseSchemas.length > schemasBeforeReturn) {
                            isStatic = true;
                        }
                    } else if (hasExplicitReturnType) {
                        // void return or similar
                        isStatic = true;
                    }

                    highlights.push({ startLine, endLine, type: isStatic ? 'return-success' : 'return-warning' });
                }

                // Implicit Return (Concise Arrow Function)
                // e.g. (ctx) => ctx.json(...) or .then(res => ctx.json(res))
                if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
                    // For concise arrow function, the body IS the return value
                    const startLine = sourceFile.getLineAndCharacterOfPosition(node.body.getStart()).line + 1;
                    const endLine = sourceFile.getLineAndCharacterOfPosition(node.body.getEnd()).line + 1;

                    const schemasBeforeReturn = responseSchemas.length;
                    analyzeReturnExpression(node.body as ts.Expression);

                    let isStatic = false;
                    if (responseSchemas.length > schemasBeforeReturn) {
                        isStatic = true;
                    }

                    highlights.push({ startLine, endLine, type: isStatic ? 'return-success' : 'return-warning' });
                }

                // Implicit Return call (e.g. ctx.json(...) as a statement without return)
                if (ts.isExpressionStatement(node)) {
                    analyzeReturnExpression(node.expression);

                    // Check for ctx.emit() or this.emit()
                    if (ts.isCallExpression(node.expression)) {
                        const expr = node.expression;
                        if (ts.isPropertyAccessExpression(expr.expression)) {
                            const objText = expr.expression.expression.getText(sourceFile);
                            const propText = expr.expression.name.getText(sourceFile);

                            if (((objText === 'ctx' || objText.endsWith('.ctx')) || (objText === 'this' || objText.endsWith('.this'))) && propText === 'emit') {
                                if (expr.arguments.length >= 1) {
                                    const eventNameArg = expr.arguments[0];
                                    if (ts.isStringLiteral(eventNameArg)) {
                                        const eventName = eventNameArg.text;
                                        let payload = { type: 'object' };

                                        if (expr.arguments.length >= 2) {
                                            payload = this.convertExpressionToSchema(expr.arguments[1], sourceFile, scope, typeChecker);
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

        // Merge multiple response schemas using oneOf if there are multiple distinct schemas
        let finalResponseSchema: any | undefined;
        if (responseSchemas.length > 1) {
            // Check if all schemas are identical - if so, just use one
            const uniqueSchemas = this.deduplicateSchemas(responseSchemas);
            if (uniqueSchemas.length === 1) {
                finalResponseSchema = uniqueSchemas[0];
            } else {
                // Multiple different schemas - use oneOf
                finalResponseSchema = {
                    oneOf: uniqueSchemas
                };
            }
        } else if (responseSchemas.length === 1) {
            finalResponseSchema = responseSchemas[0];
        }

        return {
            requestTypes,
            responseType,
            responseSchema: finalResponseSchema,
            hasUnknownFields: finalResponseSchema ? this.hasUnknownFields(finalResponseSchema) : false,
            emits,
            highlights
        };
    }

    /**
     * Convert an Expression node to an OpenAPI schema (best effort)
     */
    private convertExpressionToSchema(node: ts.Expression, sourceFile: ts.SourceFile, scope: Map<string, any>, typeChecker?: ts.TypeChecker): any {
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
                    const valueSchema = this.convertExpressionToSchema(prop.initializer, sourceFile, scope, typeChecker);

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
                schema.items = this.convertExpressionToSchema(node.elements[0], sourceFile, scope, typeChecker);
            } else {
                schema.items = {};
            }
            return schema;
        }

        // Conditional (Ternary) Expression: cond ? trueVal : falseVal
        if (ts.isConditionalExpression(node)) {
            const trueSchema = this.convertExpressionToSchema(node.whenTrue, sourceFile, scope, typeChecker);
            // const falseSchema = this.convertExpressionToSchema(node.whenFalse, sourceFile, scope);

            // Simplified: return true branch schema. Ideally we'd do oneOf
            return trueSchema;
        }

        // Template Expression: `Hello ${name}`
        if (ts.isTemplateExpression(node)) {
            return { type: 'string' };
        }

        // Await Expression: await somePromise
        if (ts.isAwaitExpression(node)) {
            // Unwrap the await and analyze the underlying expression
            return this.convertExpressionToSchema(node.expression, sourceFile, scope, typeChecker);
        }

        // Call Expression: Date.now(), Math.random(), etc.
        if (ts.isCallExpression(node)) {
            const callText = node.getText(sourceFile);

            // Common numeric-returning functions
            if (callText.startsWith('Date.now()') ||
                callText.startsWith('Math.') ||
                callText.startsWith('Number(') ||
                callText.startsWith('parseInt(') ||
                callText.startsWith('parseFloat(')) {
                return { type: 'number' };
            }

            // String-returning functions
            if (callText.startsWith('String(') ||
                callText.endsWith('.toString()') ||
                callText.endsWith('.join(')) {
                return { type: 'string' };
            }

            // Boolean-returning functions
            if (callText.startsWith('Boolean(')) {
                return { type: 'boolean' };
            }

            // Array-returning functions
            if (callText.endsWith('.split(') ||
                callText.endsWith('.map(') ||
                callText.endsWith('.filter(')) {
                return { type: 'array', items: {} };
            }

            // For unknown function calls, default to any (empty schema)
            return { 'x-unknown': true };
        }

        // Binary Expression: a + b, a - b, etc.
        if (ts.isBinaryExpression(node)) {
            const operator = node.operatorToken.kind;

            // Arithmetic operators return number
            if (operator === ts.SyntaxKind.PlusToken ||
                operator === ts.SyntaxKind.MinusToken ||
                operator === ts.SyntaxKind.AsteriskToken ||
                operator === ts.SyntaxKind.SlashToken ||
                operator === ts.SyntaxKind.PercentToken ||
                operator === ts.SyntaxKind.AsteriskAsteriskToken) {

                // Special case: + with strings is concatenation
                if (operator === ts.SyntaxKind.PlusToken) {
                    const leftSchema = this.convertExpressionToSchema(node.left, sourceFile, scope, typeChecker);
                    const rightSchema = this.convertExpressionToSchema(node.right, sourceFile, scope, typeChecker);

                    // If either operand is a string, result is string
                    if (leftSchema.type === 'string' || rightSchema.type === 'string') {
                        return { type: 'string' };
                    }
                }

                return { type: 'number' };
            }

            // Comparison operators return boolean
            if (operator === ts.SyntaxKind.GreaterThanToken ||
                operator === ts.SyntaxKind.LessThanToken ||
                operator === ts.SyntaxKind.GreaterThanEqualsToken ||
                operator === ts.SyntaxKind.LessThanEqualsToken ||
                operator === ts.SyntaxKind.EqualsEqualsToken ||
                operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                operator === ts.SyntaxKind.ExclamationEqualsToken ||
                operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
                return { type: 'boolean' };
            }

            // Logical operators - infer from operands
            if (operator === ts.SyntaxKind.AmpersandAmpersandToken ||
                operator === ts.SyntaxKind.BarBarToken) {
                const leftSchema = this.convertExpressionToSchema(node.left, sourceFile, scope, typeChecker);
                const rightSchema = this.convertExpressionToSchema(node.right, sourceFile, scope, typeChecker);

                // For ||, if right is a string literal (common fallback pattern), result is string
                if (operator === ts.SyntaxKind.BarBarToken && rightSchema.type === 'string') {
                    return { type: 'string' };
                }

                // Return the non-boolean schema if available, otherwise boolean
                if (leftSchema.type && leftSchema.type !== 'boolean') {
                    return leftSchema;
                }
                if (rightSchema.type && rightSchema.type !== 'boolean') {
                    return rightSchema;
                }
                return { type: 'boolean' };
            }

            // Bitwise operators return number
            if (operator === ts.SyntaxKind.AmpersandToken ||
                operator === ts.SyntaxKind.BarToken ||
                operator === ts.SyntaxKind.CaretToken ||
                operator === ts.SyntaxKind.LessThanLessThanToken ||
                operator === ts.SyntaxKind.GreaterThanGreaterThanToken ||
                operator === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken) {
                return { type: 'number' };
            }
        }

        // PropertyAccessExpression (e.g., process.env, performance.now)
        if (ts.isPropertyAccessExpression(node) && typeChecker) {
            try {
                const type = typeChecker.getTypeAtLocation(node);
                const schema = this.convertTypeToSchema(type, typeChecker);
                // Only return if we got a meaningful schema
                if (schema && (schema.type !== 'object' || schema.properties)) {
                    return schema;
                }
            } catch (e) {
                // Type resolution failed, fall through to default handling
            }
        }

        // Identifier (Variable reference)
        if (ts.isIdentifier(node)) {
            const name = node.getText(sourceFile);
            const scopedSchema = scope.get(name);
            if (scopedSchema) return scopedSchema;

            // Try to resolve type using TypeChecker for built-ins and globals
            if (typeChecker) {
                try {
                    const type = typeChecker.getTypeAtLocation(node);
                    const schema = this.convertTypeToSchema(type, typeChecker);
                    // Only return if we got a meaningful schema
                    if (schema && (schema.type !== 'object' || schema.properties)) {
                        return schema;
                    }
                } catch (e) {
                    // Type resolution failed, fall through to unknown
                }
            }

            return { type: 'object', 'x-unknown': true }; // Unknown reference
        }

        // Literals
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { type: 'string' };
        if (ts.isNumericLiteral(node)) return { type: 'number' };
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean' };

        // Unknown
        return { type: 'object', 'x-unknown': true };
    }

    /**
     * Deduplicate schemas by comparing their JSON representations
     */
    private deduplicateSchemas(schemas: any[]): any[] {
        const seen = new Map<string, any>();
        for (const schema of schemas) {
            const key = JSON.stringify(schema);
            if (!seen.has(key)) {
                seen.set(key, schema);
            }
        }
        return Array.from(seen.values());
    }

    /**
     * Check if a schema contains fields with unknown types
     */
    private hasUnknownFields(schema: any): boolean {
        if (!schema) return false;
        if (schema['x-unknown']) return true;

        if (schema.type === 'object' && schema.properties) {
            return Object.values(schema.properties).some((prop: any) =>
                this.hasUnknownFields(prop)
            );
        }

        if (schema.type === 'array' && schema.items) {
            return this.hasUnknownFields(schema.items);
        }

        return false;
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
     * Convert a TypeScript Type (from type checker) to an OpenAPI schema
     */
    private convertTypeToSchema(type: ts.Type, typeChecker: ts.TypeChecker, depth: number = 0): any {
        // Prevent infinite recursion on circular types
        if (depth > 5) {
            return { type: 'object', description: 'Complex type (max depth reached)' };
        }

        // Handle primitive types
        if (type.flags & ts.TypeFlags.String) return { type: 'string' };
        if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
        if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
        if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
        if (type.flags & ts.TypeFlags.Undefined) return { type: 'object', nullable: true };
        if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) return {};

        // Handle literal types
        if (type.flags & ts.TypeFlags.StringLiteral) {
            const literalType = type as ts.StringLiteralType;
            return { type: 'string', enum: [literalType.value] };
        }
        if (type.flags & ts.TypeFlags.NumberLiteral) {
            const literalType = type as ts.NumberLiteralType;
            return { type: 'number', enum: [literalType.value] };
        }
        if (type.flags & ts.TypeFlags.BooleanLiteral) {
            // TypeScript represents true/false as separate types
            const intrinsicName = (type as any).intrinsicName;
            return { type: 'boolean', enum: [intrinsicName === 'true'] };
        }

        // Handle union types
        if (type.flags & ts.TypeFlags.Union) {
            const unionType = type as ts.UnionType;
            const schemas = unionType.types.map(t => this.convertTypeToSchema(t, typeChecker, depth + 1));

            // If all schemas are the same primitive type, just use one
            const uniqueTypes = new Set(schemas.map(s => s.type));
            if (uniqueTypes.size === 1 && schemas[0].type !== 'object') {
                return schemas[0];
            }

            return { oneOf: schemas };
        }

        // Handle array types
        if (typeChecker.isArrayType(type)) {
            const typeArgs = (type as any).typeArguments || (type as any).resolvedTypeArguments;
            if (typeArgs && typeArgs.length > 0) {
                return {
                    type: 'array',
                    items: this.convertTypeToSchema(typeArgs[0], typeChecker, depth + 1)
                };
            }
            return { type: 'array', items: {} };
        }

        // Handle object types
        if (type.flags & ts.TypeFlags.Object) {
            const properties: Record<string, any> = {};
            const required: string[] = [];

            // Get properties from the type
            const props = typeChecker.getPropertiesOfType(type);

            // Limit number of properties to prevent huge schemas
            const maxProps = 50;
            const propsToProcess = props.slice(0, maxProps);

            for (const prop of propsToProcess) {
                const propName = prop.getName();
                const propType = typeChecker.getTypeOfSymbol(prop);

                // Skip function properties to keep schema clean
                const signatures = propType.getCallSignatures();
                if (signatures && signatures.length > 0) {
                    continue;
                }

                properties[propName] = this.convertTypeToSchema(propType, typeChecker, depth + 1);

                // Check if property is optional
                if (!(prop.flags & ts.SymbolFlags.Optional)) {
                    required.push(propName);
                }
            }

            const schema: any = { type: 'object' };

            if (Object.keys(properties).length > 0) {
                schema.properties = properties;
                if (required.length > 0) {
                    schema.required = required;
                }
            }

            // Add note if we truncated properties
            if (props.length > maxProps) {
                schema.description = `Type with ${props.length} properties (showing ${maxProps})`;
            }

            return schema;
        }

        // Fallback for unhandled types
        return { type: 'object', description: 'Complex type' };
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
            dependency,
            sourceContext: {
                file: sourceFile.fileName,
                startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
            }
        };
    }

    /**
     * Extract middleware information from .use() call
     */
    private extractMiddlewareFromCall(node: ts.CallExpression, sourceFile: ts.SourceFile): MiddlewareInfo | null {
        const args = node.arguments;

        if (args.length < 1) return null;

        const middlewareArg = args[0];

        // Get middleware name from the function/identifier
        let middlewareName = 'anonymous';
        let isImportedIdentifier = false;

        if (ts.isIdentifier(middlewareArg)) {
            middlewareName = middlewareArg.getText(sourceFile);
            isImportedIdentifier = true;
        } else if (ts.isCallExpression(middlewareArg) && ts.isIdentifier(middlewareArg.expression)) {
            // Middleware factory pattern: app.use(RateLimitMiddleware({...}))
            middlewareName = middlewareArg.expression.getText(sourceFile);
            isImportedIdentifier = true;
        } else if (ts.isFunctionExpression(middlewareArg) || ts.isArrowFunction(middlewareArg)) {
            middlewareName = 'inline-middleware';
        }

        // Analyze middleware for response types and headers
        let analysis = this.analyzeMiddleware(middlewareArg, sourceFile);

        // If this is an imported identifier, try to resolve and analyze the definition
        if (isImportedIdentifier) {
            const resolvedAnalysis = this.resolveImportedMiddlewareDefinition(middlewareName, sourceFile);
            // Merge resolved analysis with local analysis
            if (resolvedAnalysis.responseTypes) {
                analysis.responseTypes = { ...resolvedAnalysis.responseTypes, ...analysis.responseTypes };
            }
            if (resolvedAnalysis.headers) {
                analysis.headers = [...(resolvedAnalysis.headers || []), ...(analysis.headers || [])];
                // Deduplicate headers
                analysis.headers = Array.from(new Set(analysis.headers));
            }
        }

        return {
            name: middlewareName,
            file: sourceFile.fileName,
            startLine: sourceFile.getLineAndCharacterOfPosition(middlewareArg.getStart()).line + 1,
            endLine: sourceFile.getLineAndCharacterOfPosition(middlewareArg.getEnd()).line + 1,
            handlerSource: middlewareArg.getText(sourceFile),
            responseTypes: analysis.responseTypes,
            headers: analysis.headers,
            scope: 'router', // Will be updated during collection based on context
            sourceContext: {
                file: sourceFile.fileName,
                startLine: sourceFile.getLineAndCharacterOfPosition(middlewareArg.getStart()).line + 1,
                endLine: sourceFile.getLineAndCharacterOfPosition(middlewareArg.getEnd()).line + 1,
                snippet: middlewareArg.getText(sourceFile),
                highlights: analysis.highlights
            }
        };
    }

    /**
     * Analyze middleware function to extract response types and headers
     */
    private analyzeMiddleware(middleware: ts.Node, sourceFile: ts.SourceFile): {
        responseTypes?: Record<string, any>;
        headers?: string[];
        highlights?: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning'; }[];
    } {
        const responseTypes: Record<string, any> = {};
        const headers: string[] = [];
        const highlights: { startLine: number; endLine: number; type: 'emit' | 'return-success' | 'return-warning'; }[] = [];

        // Track variables and their values (simple tracking for numeric literals)
        const variableValues = new Map<string, number | string>();

        // Walk the AST to find variable declarations and response calls
        const visit = (node: ts.Node) => {
            // Track variable declarations: const statusCode = 429
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                const varName = node.name.getText(sourceFile);
                if (node.initializer) {
                    // Check if initializer is a numeric literal
                    if (ts.isNumericLiteral(node.initializer)) {
                        const value = parseInt(node.initializer.text);
                        if (!isNaN(value)) {
                            variableValues.set(varName, value);
                        }
                    }
                    // Check for: const statusCode = options.statusCode || 429
                    else if (ts.isBinaryExpression(node.initializer) && node.initializer.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                        // Get the right side (default value)
                        if (ts.isNumericLiteral(node.initializer.right)) {
                            const value = parseInt(node.initializer.right.text);
                            if (!isNaN(value)) {
                                variableValues.set(varName, value);
                            }
                        }
                    }
                }
            }

            // Detect response calls: ctx.json(..., statusCode) or ctx.json(..., 429)
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const obj = node.expression.expression.getText(sourceFile);
                const prop = node.expression.name.getText(sourceFile);

                if (obj === 'ctx' && ['json', 'text', 'html', 'jsx'].includes(prop)) {
                    // Check if there's a second argument (status code)
                    if (node.arguments.length >= 2) {
                        const statusArg = node.arguments[1];
                        let statusCode: number | undefined;

                        // Case 1: Literal number: ctx.json(..., 429)
                        if (ts.isNumericLiteral(statusArg)) {
                            statusCode = parseInt(statusArg.text);
                        }
                        // Case 2: Variable reference: ctx.json(..., statusCode)
                        else if (ts.isIdentifier(statusArg)) {
                            const varName = statusArg.getText(sourceFile);
                            const value = variableValues.get(varName);
                            if (typeof value === 'number') {
                                statusCode = value;
                            }
                        }

                        if (statusCode && statusCode >= 100 && statusCode < 600) {
                            const statusStr = String(statusCode);
                            if (!responseTypes[statusStr]) {
                                let description = `Error response (${statusCode})`;
                                if (statusCode === 401) description = 'Unauthorized';
                                else if (statusCode === 403) description = 'Forbidden';
                                else if (statusCode === 429) description = 'Too Many Requests';
                                else if (statusCode === 500) description = 'Internal Server Error';

                                const content: Record<string, any> = {};
                                if (prop === 'json') {
                                    content['application/json'] = { schema: { type: 'object' } };
                                } else if (prop === 'text') {
                                    content['text/plain'] = { schema: { type: 'string' } };
                                } else if (prop === 'html' || prop === 'jsx') {
                                    content['text/html'] = { schema: { type: 'string' } };
                                }

                                responseTypes[statusStr] = {
                                    description,
                                    ...(Object.keys(content).length > 0 ? { content } : {})
                                };
                            }
                        }
                    }
                }

                // Detect header setting: ctx.set("Header-Name", ...), res.headers.set("Header-Name", ...)
                if (['set', 'header'].includes(prop)) {
                    if (node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
                        const headerName = node.arguments[0].text;
                        if (headerName && !headers.includes(headerName)) {
                            headers.push(headerName);
                        }
                    }
                }
            }

            // Recursively visit child nodes
            ts.forEachChild(node, visit);
        };

        // Start traversal
        visit(middleware);

        // Detect common rate-limit specific headers (fallback regex check on source string)
        const middlewareSource = middleware.getText(sourceFile);
        if (middlewareSource.includes('X-RateLimit')) {
            const rateLimitHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'];
            for (const header of rateLimitHeaders) {
                if (middlewareSource.includes(header) && !headers.includes(header)) {
                    headers.push(header);
                }
            }
        }

        // TODO: Add highlighting for response code locations in the future
        // For now, we'll skip this to keep implementation simpler

        return {
            responseTypes: Object.keys(responseTypes).length > 0 ? responseTypes : undefined,
            headers: headers.length > 0 ? headers : undefined,
            highlights: highlights.length > 0 ? highlights : undefined
        };
    }

    /**
     * Resolve an imported middleware identifier and analyze its definition
     */
    private resolveImportedMiddlewareDefinition(middlewareName: string, sourceFile: ts.SourceFile): {
        responseTypes?: Record<string, any>;
        headers?: string[];
    } {
        // Check if this middleware is imported
        const fileImports = this.imports.get(sourceFile.fileName);
        if (!fileImports || !fileImports.has(middlewareName)) {
            return {};
        }

        const importInfo = fileImports.get(middlewareName)!;
        const modulePath = importInfo.modulePath;

        // Skip external/node_modules imports for now
        if (!modulePath.startsWith('.')) {
            return {};
        }

        // Resolve the absolute path
        const dir = path.dirname(sourceFile.fileName);
        let absolutePath = path.resolve(dir, modulePath);

        // Try to find the file with different extensions
        const extensions = ['.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
        let resolvedPath: string | undefined;

        for (const ext of extensions) {
            const testPath = absolutePath + ext;
            if (fs.existsSync(testPath)) {
                resolvedPath = testPath;
                break;
            }
        }

        if (!resolvedPath && fs.existsSync(absolutePath)) {
            resolvedPath = absolutePath;
        }

        if (!resolvedPath) {
            return {};
        }

        // Get the source file for the imported module
        const importedSourceFile = this.program?.getSourceFile(resolvedPath);
        if (!importedSourceFile) {
            return {};
        }

        // Find the exported function/variable that matches our import
        let middlewareNode: ts.Node | undefined;

        const exportName = importInfo.exportName || middlewareName;

        ts.forEachChild(importedSourceFile, (node) => {
            // Handle: export function RateLimitMiddleware(...) { ... }
            if (ts.isFunctionDeclaration(node) && node.name?.getText(importedSourceFile) === exportName) {
                const modifiers = node.modifiers;
                if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                    middlewareNode = node;
                }
            }

            // Handle: export const RateLimitMiddleware = (...) => { ... }
            if (ts.isVariableStatement(node)) {
                const modifiers = node.modifiers;
                if (modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                    for (const declaration of node.declarationList.declarations) {
                        if (ts.isIdentifier(declaration.name) && declaration.name.getText(importedSourceFile) === exportName) {
                            middlewareNode = declaration.initializer;
                        }
                    }
                }
            }
        });

        if (!middlewareNode) {
            return {};
        }

        // Analyze the middleware definition
        return this.analyzeMiddleware(middlewareNode, importedSourceFile);
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
