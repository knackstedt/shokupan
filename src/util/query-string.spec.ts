
import { describe, expect, it } from 'bun:test';
import { parseQuery } from './query-string';

describe('Fast Querystring Parser', () => {
    it('parses simple key-value pairs', () => {
        expect(parseQuery('foo=bar&baz=qux')).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('handles full URLs', () => {
        expect(parseQuery('http://example.com/?a=1&b=2')).toEqual({ a: '1', b: '2' });
    });

    it('handles array notation in extended mode', () => {
        expect(parseQuery('a[]=1&a[]=2')).toEqual({ a: ['1', '2'] });
    });

    it('handles implicit arrays in extended mode', () => {
        expect(parseQuery('a=1&a=2')).toEqual({ a: ['1', '2'] });
    });

    it('decodes URI components', () => {
        expect(parseQuery('a=%20Hello%20&b=World%21')).toEqual({ a: ' Hello ', b: 'World!' });
    });

    it('handles + as space', () => {
        expect(parseQuery('a=a+b')).toEqual({ a: 'a b' });
    });

    it('handles missing values', () => {
        expect(parseQuery('a&b=2')).toEqual({ a: '', b: '2' });
    });

    it('prevents prototype pollution', () => {
        const res = parseQuery('__proto__=1&constructor=2&prototype=3&a=4');
        expect(res['__proto__']).toBeUndefined();
        expect(res['constructor']).toBeUndefined();
        expect(res['prototype']).toBeUndefined();
        expect(res['a']).toBe('4');
    });

    it('strict mode throws on duplicates', () => {
        expect(() => parseQuery('a=1&a=2', 'strict')).toThrow();
    });

    it('simple mode overwrites duplicates', () => {
        expect(parseQuery('a=1&a=2', 'simple')).toEqual({ a: '2' });
    });

    it('returns empty object for URLs without query string', () => {
        expect(parseQuery('http://example.com/path')).toEqual({});
        expect(parseQuery('https://localhost:8765/dynamic/a/b/c')).toEqual({});
    });

    it('returns empty object for empty string', () => {
        expect(parseQuery('')).toEqual({});
    });

    it('returns empty object for query string with only ?', () => {
        expect(parseQuery('http://example.com/path?')).toEqual({});
    });
});
