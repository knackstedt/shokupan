import type { Method, ShokupanHandler } from '../types';

export interface RouteMatch<T = any> {
    handler: ShokupanHandler<T>;
    params: Record<string, string>;
    // Reference to the baked handler if strictly needed, 
    // but typically we insert the optimal handler (baked) into the trie.
}

interface Node<T> {
    // Static path segments
    children: Record<string, Node<T>>;

    // Parameter segment (e.g. :id)
    paramChild?: Node<T>;
    paramName?: string;

    // Wildcard segment (*)
    wildcardChild?: Node<T>;

    // Handlers stored at this node
    handlers?: Record<string, ShokupanHandler<T>>;

    // Optional: Keep track of path pattern for debugging
    pathPattern?: string;
}

export class RouterTrie<T = any> {
    private root: Node<T>;

    constructor() {
        this.root = this.createNode();
    }

    private createNode(): Node<T> {
        return {
            children: {},
        };
    }

    public insert(method: Method, path: string, handler: ShokupanHandler<T>) {
        let node = this.root;
        const segments = this.splitPath(path);

        for (const segment of segments) {
            // Check for wildcard first as it consumes the rest usually, 
            // but standard Trie logic treats * as just a segment unless it's a catch-all
            // Shokupan: * matches everything usually.

            if (segment === '*') {
                if (!node.wildcardChild) {
                    node.wildcardChild = this.createNode();
                }
                node = node.wildcardChild;
                // In many routers, * is terminal or consumes "rest".
                // If we treat * as a segment, we can support /files/*/edit
                // But typically * is catch-all.
                // Assuming standard segment matching for now, but usually * means "rest"
                // Let's support eager wildcard matching.
                // If segment is precisely *, we treat it as wildcard node.
                // NOTE: Shokupan's regex allowed * anywhere. 
                // Simple Trie supports * as a named segment usually.
                // If we want "rest of path", we need to mark it.
            }
            else if (segment.startsWith(':')) {
                const paramName = segment.slice(1);
                if (!node.paramChild) {
                    node.paramChild = this.createNode();
                    node.paramChild.paramName = paramName;
                }
                // Check conflict? (Different param names at same level)
                // For now, first wins or overwrite name (usually dangerous).
                // We'll assume one param per level.
                node = node.paramChild;
                node.paramName = paramName;
            }
            else {
                if (!node.children[segment]) {
                    node.children[segment] = this.createNode();
                }
                node = node.children[segment];
            }
        }

        if (!node.handlers) {
            node.handlers = {};
        }
        node.handlers[method] = handler;
        // Also support 'ALL'
        if (method === 'ALL') {
            // We'll handle ALL lookup logic in search
        }
    }

    public search(method: string, path: string): RouteMatch<T> | null {
        const segments = this.splitPath(path);
        const params: Record<string, string> = {};

        // Recursive search to handle backtracking if needed (e.g. static vs param)
        // But for performance, iterative is better if we have strict precedence.
        // Precedence: Static > Param > Wildcard

        // Use a stack-based approach or recursion for simplicity first?
        // Recursion is easier to read and allows backtracking (if static fails, try param).

        const match = this.findNode(this.root, segments, 0, params);

        if (match && match.handlers) {
            const handler = match.handlers[method] || match.handlers['ALL'];
            if (handler) {
                return { handler, params };
            }
            // Fallback for HEAD -> GET
            if (method === 'HEAD' && match.handlers['GET']) {
                return { handler: match.handlers['GET'], params };
            }
        }

        return null;
    }

    private findNode(node: Node<T>, segments: string[], index: number, params: Record<string, string>): Node<T> | null {
        // Base case: verified all segments
        if (index === segments.length) {
            // Using * wildcard at the end is common. 
            // If the node has handlers, return it.
            if (node.handlers) return node;

            // If we are at the end, but the node has a wildcard child, 
            // the wildcard might match "empty" rest? usually no.
            // But strict path match means we are done.
            return null;
        }

        const segment = segments[index];

        // 1. Static Match
        const child = node.children[segment];
        if (child) {
            const result = this.findNode(child, segments, index + 1, params);
            if (result) return result;
        }

        // 2. Param Match
        if (node.paramChild) {
            params[node.paramChild.paramName!] = segment;
            const result = this.findNode(node.paramChild, segments, index + 1, params);
            if (result) return result;
            // Backtrack: remove param
            delete params[node.paramChild.paramName!];
        }

        // 3. Wildcard Match
        // Wildcard usually matches the rest of the path?
        // If we implemented * as "match one segment", simple recursion works.
        // If * matches "rest", we consume all remaining segments.
        if (node.wildcardChild) {
            // Check if we handle "rest" or single segment.
            // Regex ".*" matches rest.
            // So if we hit a wildcard node, we should probably stop and return it?
            // Only if the wildcard node has a handler.
            if (node.wildcardChild.handlers) {
                return node.wildcardChild;
            }
            // If nested after wildcard (e.g. /files/*/edit), recurse
            const result = this.findNode(node.wildcardChild, segments, index + 1, params);
            if (result) return result;
        }

        return null;
    }

    private splitPath(path: string): string[] {
        if (path === '/' || path === '') return [];
        // Helper to split but ignore empty strings logic
        // "/a/b" -> ["a", "b"]
        // "a/b" -> ["a", "b"]
        const s = path.startsWith('/') ? path.slice(1) : path;
        if (s === '') return [];

        // Fast split?
        return s.split('/');
    }
}
