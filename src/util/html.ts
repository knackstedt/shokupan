
/**
 * Escapes unsafe characters in a string for use in HTML using named character references.
 *
 * @param unsafe - The input value to escape. If not a string, it will be coerced to one.
 * @returns The escaped string.
 */
export function escapeHtml(unsafe: unknown): string {
    if (unsafe === null || unsafe === undefined) return '';
    const str = String(unsafe);
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Safely serializes data to JSON for embedding in a <script> tag.
 * Prevents Script Injection via </script> tags.
 *
 * @param data - The data to serialize.
 * @returns The JSON string with </script> escaped.
 */
export function safeScriptJson(data: any): string {
    const json = JSON.stringify(data);
    if (json === undefined) return 'undefined';
    return json.replace(/<\/script>/g, '<\\/script>');
}
