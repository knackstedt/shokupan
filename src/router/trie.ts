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

    // Recursive segment (**)
    recursiveChild?: Node<T>;

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
            if (segment === '**') {
                if (!node.recursiveChild) {
                    node.recursiveChild = this.createNode();
                }
                node = node.recursiveChild;
            }
            else if (segment === '*') {
                if (!node.wildcardChild) {
                    node.wildcardChild = this.createNode();
                }
                node = node.wildcardChild;
            }
            else if (segment.startsWith(':')) {
                const paramName = segment.slice(1);
                if (!node.paramChild) {
                    node.paramChild = this.createNode();
                    node.paramChild.paramName = paramName;
                }
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
    }

    public search(method: string, path: string): RouteMatch<T> | null {
        const segments = this.splitPath(path);
        const params: Record<string, string> = {};

        const match = this.findNode(this.root, segments, 0, params);

        if (match && match.handlers) {
            const handler = match.handlers[method] || match.handlers['ALL'];
            if (handler) {
                return { handler, params };
            }
            if (method === 'HEAD' && match.handlers['GET']) {
                return { handler: match.handlers['GET'], params };
            }
        }

        return null;
    }

    private findNode(node: Node<T>, segments: string[], index: number, params: Record<string, string>): Node<T> | null {
        // Base case: verified all segments
        if (index === segments.length) {
            if (node.handlers) return node;

            // If we are at the end, checks if we have a recursive child that matches empty?
            // e.g. /files/** matches /files
            if (node.recursiveChild && node.recursiveChild.handlers) {
                return node.recursiveChild;
            }
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
            delete params[node.paramChild.paramName!];
        }

        // 3. Single Wildcard Match (*)
        if (node.wildcardChild) {
            // Strictly match one segment
            const result = this.findNode(node.wildcardChild, segments, index + 1, params);
            if (result) return result;
        }

        // 4. Recursive Wildcard Match (**)
        if (node.recursiveChild) {
            // Greedy or non-greedy?
            // We need to match 'remaining segments' against recursive child.
            // But recursive child is a Node that might have further structure OR be terminal.

            // Try matching 0 to N segments.
            // We iterate from N down to 0 (greedy) or 0 to N?
            // Standard is usually longest match wins? Or first match?
            // "Correct" catch-all usually means it consumes as much as needed.
            // Let's try consuming k segments.

            const remaining = segments.length - index;
            for (let k = 0; k <= remaining; k++) {
                // Skip k segments
                const result = this.findNode(node.recursiveChild, segments, index + k, params);
                if (result) return result;
            }
        }

        return null;
    }

    private splitPath(path: string): string[] {
        if (path === '/' || path === '') return [];
        const s = path.startsWith('/') ? path.slice(1) : path;
        if (s === '') return [];
        return s.split('/');
    }
}
