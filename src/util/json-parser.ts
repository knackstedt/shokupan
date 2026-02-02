/**
 * JSON parser utilities for Shokupan
 * Supports multiple JSON parsing libraries with different performance characteristics
 */

type JSONParser = (text: string) => any;

let parseJsonLib: any;
let secureJsonParseLib: any;

/**
 * Get the appropriate JSON parser based on the configuration
 * @param parserType - The type of parser to use
 * @returns A JSON parsing function
 */
export function getJSONParser(parserType: 'native' | 'parse-json' | 'secure-json-parse' = 'native'): JSONParser {
    switch (parserType) {
        case 'parse-json':
            if (!parseJsonLib) {
                try {
                    const lib = require('parse-json');
                    // parse-json exports a default function
                    parseJsonLib = lib.default || lib;
                } catch (e) {
                    if (process.env.NODE_ENV !== 'test') process.stderr.write('parse-json not installed, falling back to native JSON.parse. Install with: bun add parse-json\n');
                    return JSON.parse;
                }
            }
            return parseJsonLib;

        case 'secure-json-parse':
            if (!secureJsonParseLib) {
                try {
                    const lib = require('secure-json-parse');
                    secureJsonParseLib = lib.parse || lib.default?.parse || lib;
                } catch (e) {
                    if (process.env.NODE_ENV !== 'test') process.stderr.write('secure-json-parse not installed, falling back to native JSON.parse. Install with: bun add secure-json-parse\n');
                    return JSON.parse;
                }
            }
            return secureJsonParseLib;

        case 'native':
        default:
            return JSON.parse;
    }
}
