
import { describe, expect, it } from "bun:test";
import { RouterTrie } from "./trie";

describe("Router Trie", () => {
    it("should insert and find static routes", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/hello', 'handler1');

        const match = trie.search('GET', '/hello');
        expect(match).not.toBeNull();
        expect(match!.handler).toBe('handler1');
    });

    it("should return null for non-matching routes", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/hello', 'handler1');

        const match = trie.search('GET', '/world');
        expect(match).toBeNull();
    });

    it("should handle parameters", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/users/:id', 'userHandler');

        const match = trie.search('GET', '/users/123');
        expect(match).not.toBeNull();
        expect(match!.handler).toBe('userHandler');
        expect(match!.params).toEqual({ id: '123' });
    });

    it("should handle wildcards (*)", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/files/*', 'fileHandler');

        const match = trie.search('GET', '/files/doc.txt');
        expect(match).not.toBeNull();
        expect(match!.handler).toBe('fileHandler');
    });

    it("should handle recursive wildcards (**)", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/assets/**', 'assetHandler');

        const match1 = trie.search('GET', '/assets/css/style.css');
        expect(match1).not.toBeNull();
        expect(match1!.handler).toBe('assetHandler');

        const match2 = trie.search('GET', '/assets/js/vendor/jquery.js');
        expect(match2).not.toBeNull();
        expect(match2!.handler).toBe('assetHandler');
    });

    it("should prioritize static over param", () => {
        const trie = new RouterTrie<string>();
        trie.insert('GET', '/users/me', 'meHandler');
        trie.insert('GET', '/users/:id', 'userHandler');

        const match = trie.search('GET', '/users/me');
        expect(match!.handler).toBe('meHandler');

        const match2 = trie.search('GET', '/users/123');
        expect(match2!.handler).toBe('userHandler');
    });
});
