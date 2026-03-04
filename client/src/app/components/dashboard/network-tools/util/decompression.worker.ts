/// <reference lib="webworker" />

import { decompress } from './decompression';

addEventListener('message', async ({ data }) => {
    const { bodyData, encoding } = data;

    try {
        let bytes: Uint8Array;

        if (typeof bodyData === 'object' && bodyData !== null && bodyData.__binary) {
            // Decode base64 to Uint8Array
            const binaryString = atob(bodyData.data);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
        } else if (typeof bodyData === 'string') {
            bytes = new TextEncoder().encode(bodyData);
        } else {
            postMessage({ error: 'Unsupported body data type' });
            return;
        }

        const result = await decompress(bytes, encoding);
        const text = new TextDecoder().decode(result);

        postMessage({ result: text });
    } catch (err) {
        postMessage({ error: String(err) });
    }
});
