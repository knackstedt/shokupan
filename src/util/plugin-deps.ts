/**
 * Plugin dependency loader with helpful error messages
 * Provides lazy loading for optional plugin dependencies
 */

interface DependencyInfo {
    name: string;
    installCommand: string;
    pluginName: string;
}

const dependencyCache = new Map<string, any>();

/**
 * Loads a plugin dependency with helpful error message if not installed
 * @param packageName The npm package to load
 * @param pluginName The shokupan plugin that requires it
 * @param installCommand Optional custom install command
 */
export async function loadPluginDependency(
    packageName: string,
    pluginName: string,
    installCommand?: string
): Promise<any> {
    // Check cache first
    if (dependencyCache.has(packageName)) {
        return dependencyCache.get(packageName);
    }

    try {
        const module = await import(packageName);
        dependencyCache.set(packageName, module);
        return module;
    } catch (e: any) {
        const cmd = installCommand || `bun add ${packageName}`;
        throw new Error(
            `The ${pluginName} plugin requires ${packageName} to be installed.\n` +
            `Install it with: ${cmd}\n\n` +
            `Original error: ${e.message}`
        );
    }
}

/**
 * Loads multiple plugin dependencies
 * @param dependencies Array of dependency info
 */
export async function loadPluginDependencies(
    dependencies: Array<{
        package: string;
        plugin: string;
        installCommand?: string;
    }>
): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const dep of dependencies) {
        results[dep.package] = await loadPluginDependency(
            dep.package,
            dep.plugin,
            dep.installCommand
        );
    }

    return results;
}

/**
 * Checks if a package is available without throwing
 * @param packageName The npm package to check
 */
export async function isPackageAvailable(packageName: string): Promise<boolean> {
    try {
        await import(packageName);
        return true;
    } catch {
        return false;
    }
}
