import { $mcpPrompts, $mcpResources, $mcpTools } from "../util/symbol";

export * from "./di";


/**
 * MCP tool configuration
 */
export interface ToolConfig {
    name?: string;
    description?: string;
    inputSchema?: any;
}

/**
 * Decorator for MCP tools
 * @param config 
 * @returns 
 */
export function Tool(config: ToolConfig = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        target[$mcpTools] ??= new Map();
        target[$mcpTools].set(propertyKey, {
            name: config.name || propertyKey,
            description: config.description,
            inputSchema: config.inputSchema
        });
    };
}

/**
 * MCP prompt configuration
 */
export interface PromptConfig {
    name?: string;
    description?: string;
    arguments?: {
        name: string;
        description?: string;
        required?: boolean;
    }[];
}

/**
 * Decorator for MCP prompts
 * @param config 
 * @returns 
 */
export function Prompt(config: PromptConfig = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        target[$mcpPrompts] ??= new Map();
        target[$mcpPrompts].set(propertyKey, {
            name: config.name || propertyKey,
            description: config.description,
            arguments: config.arguments
        });
    };
}

/**
 * MCP resource configuration
 */
export interface ResourceConfig {
    name?: string;
    description?: string;
    mimeType?: string;
}

/**
 * Decorator for MCP resources
 * @param uri 
 * @param config 
 * @returns 
 */
export function Resource(uri: string, config: ResourceConfig = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        target[$mcpResources] ??= new Map();
        target[$mcpResources].set(propertyKey, {
            uri,
            name: config.name || propertyKey,
            description: config.description,
            mimeType: config.mimeType
        });
    };
}
