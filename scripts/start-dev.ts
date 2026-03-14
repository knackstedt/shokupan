#!/usr/bin/env bun
/**
 * scripts/start-dev.ts
 *
 * Unified dev launcher with tabbed interface:
 *   1. Finds free ports via get-port
 *   2. Spawns `ng serve` in ./client on that port
 *   3. Spawns the Shokupan server with ANGULAR_DEV_PORT in its env
 *   4. Displays output in 2 tabs with TAB/arrow key navigation
 *
 * Usage:  bun run dev  (or:  bun run scripts/start-dev.ts)
 */
import { spawn } from 'bun';
import getPort from 'get-port';
import { stdin, stdout } from 'process';

const ngPort = await getPort({ port: [4200, 4201, 4202, 4300, 4400, 4500] });
const apiPort = await getPort({ port: [3200, 3201, 3202, 3300, 3400, 3500] });

// Terminal UI state
let activeTab = 0; // 0 = Angular, 1 = API
const tabs = ['Angular', 'API'];
const buffers = [[], []]; // Store output lines for each tab
const maxBufferSize = 2000; // Increased buffer size
let angularStarted = false;
let apiStarted = false;
let scrollOffset = [0, 0]; // Scroll position for each tab
let searchMode = false;
let searchQuery = '';
let searchResults = [];
let searchIndex = 0;

// Terminal control sequences
const clearScreen = '\x1b[2J\x1b[H';
const hideCursor = '\x1b[?25l';
const showCursor = '\x1b[?25h';
const saveCursor = '\x1b[s';
const restoreCursor = '\x1b[u';

// Setup raw mode for keyboard input and enable mouse tracking
stdin.setRawMode(true);
stdin.resume();
stdout.write(hideCursor);
stdout.write('\x1b[?1000h'); // Enable mouse tracking
stdout.write('\x1b[?1006h'); // Enable SGR mouse mode for better compatibility

function drawUI() {
    stdout.write(clearScreen);
    
    // Draw tab headers
    let tabHeader = '';
    for (let i = 0; i < tabs.length; i++) {
        const isActive = i === activeTab;
        const tabName = tabs[i];
        if (isActive) {
            tabHeader += `\x1b[0m ${tabName} \x1b[0m`; // Underlined for active tab
        } else {
            tabHeader += `\x1b[2m ${tabName} \x1b[0m`; // Gray for inactive tabs
        }
        if (i < tabs.length - 1) tabHeader += '│';
    }
    
    // Add status and indicators
    const activeTabName = tabs[activeTab];
    const statusParts = [];
    
    // Show startup status only if processes haven't started
    if (!angularStarted && !apiStarted) {
        statusParts.push('🔄 Starting both processes...');
    } else if (!angularStarted) {
        statusParts.push('🔄 Starting Angular...');
    } else if (!apiStarted) {
        statusParts.push('🔄 Starting API...');
    } else {
        statusParts.push('✅ Both processes running');
    }
    
    statusParts.push(`viewing ${activeTabName}`);
    
    if (searchMode) {
        statusParts.push(`search: "${searchQuery}"`);
        if (searchResults.length > 0) {
            statusParts.push(`${searchIndex + 1}/${searchResults.length}`);
        }
    }
    
    const statusText = statusParts.join(' | ');
    stdout.write(`${tabHeader} \x1b[2m(${statusText})\x1b[0m\n`);
    stdout.write('─'.repeat(process.stdout.columns || 80) + '\n');
    
    // Calculate available space for content
    const totalRows = process.stdout.rows || 24;
    const headerRows = 2; // Tab header + separator
    const helpRows = 1; // Help text at bottom
    const contentRows = totalRows - headerRows - helpRows;
    
    const activeBuffer = buffers[activeTab];
    const currentScrollOffset = scrollOffset[activeTab];
    
    // Prepare display lines with search highlighting if needed
    let displayLines = activeBuffer;
    if (searchMode && searchResults.length > 0) {
        displayLines = activeBuffer.map((line, index) => {
            if (searchResults.includes(index)) {
                const highlighted = line.replace(
                    new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                    '\x1b[43m\x1b[30m$&\x1b[0m'
                );
                return searchResults[searchIndex] === index ? `\x1b[7m${highlighted}\x1b[0m` : highlighted;
            }
            return line;
        });
    }
    
    // Calculate what lines to show based on scroll position
    const totalLines = displayLines.length;
    let startLine = 0;
    
    if (totalLines > contentRows) {
        // If we have more content than fits, use scroll offset
        if (currentScrollOffset === 0) {
            // Show most recent lines (bottom of buffer)
            startLine = totalLines - contentRows;
        } else {
            // Use scroll offset from bottom
            startLine = Math.max(0, totalLines - contentRows - currentScrollOffset);
        }
    }
    
    const endLine = Math.min(totalLines, startLine + contentRows);
    
    // Display the content lines
    for (let i = startLine; i < endLine; i++) {
        stdout.write(displayLines[i] + '\n');
    }
    
    // Fill any remaining space to push help to bottom
    const displayedLines = endLine - startLine;
    const remainingSpace = contentRows - displayedLines;
    for (let i = 0; i < remainingSpace; i++) {
        stdout.write('\n');
    }
    
    // Show help text
    const helpText = searchMode 
        ? '[ESC: Exit search | Enter: Next result | Ctrl+C: Exit]'
        : '[TAB/←→: Switch tabs | ↑↓: Scroll | PgUp/PgDn: Page | /: Search | Ctrl+C: Exit]';
    stdout.write(`\x1b[2m${helpText}\x1b[0m`);
}

function addToBuffer(tabIndex, line) {
    const wasAtBottom = scrollOffset[tabIndex] === 0; // Track if we were at bottom
    
    if (buffers[tabIndex].length >= maxBufferSize) {
        buffers[tabIndex].shift(); // Remove oldest line
        // Don't adjust scroll offset when removing old lines
    }
    
    const cleanLine = line.replace(/\n$/, '').replace(/\r$/, ''); // Remove trailing newlines/carriage returns
    if (cleanLine.trim()) { // Only add non-empty lines
        buffers[tabIndex].push(cleanLine);
        
        // Keep at bottom if we were at bottom (auto-scroll)
        if (wasAtBottom) {
            scrollOffset[tabIndex] = 0;
        }
    }
    
    // Only redraw if this is the active tab to reduce flicker
    if (tabIndex === activeTab) {
        drawUI();
    }
}

function showPrettyStartupLog() {
    if (angularStarted && apiStarted) {
        const banner = [
            '🍞 ═══════════════════════════════════════════════════════════',
            '   Shokupan Development Environment Ready!',
            '   ─────────────────────────────────────────────────────────',
            `   🌐 Angular Dev Server: http://localhost:${ngPort}`,
            `   🚀 API Server:        http://localhost:${apiPort}`,
            `   🔗 Proxied App:       http://localhost:${apiPort}/_app/`,
            '   ─────────────────────────────────────────────────────────',
            '   Use TAB or arrow keys to switch between tabs',
            '═══════════════════════════════════════════════════════════'
        ];
        
        banner.forEach(line => {
            addToBuffer(0, `\x1b[32m${line}\x1b[0m`);
            addToBuffer(1, `\x1b[32m${line}\x1b[0m`);
        });
    }
}

function performSearch(query) {
    if (!query) {
        searchResults = [];
        searchIndex = 0;
        return;
    }
    
    const activeBuffer = buffers[activeTab];
    searchResults = [];
    
    activeBuffer.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
            searchResults.push(index);
        }
    });
    
    searchIndex = 0;
    if (searchResults.length > 0) {
        scrollOffset[activeTab] = Math.max(0, searchResults[0] - 5);
    }
}

// Handle keyboard input
stdin.on('data', (key) => {
    const keyStr = key.toString();
    
    if (keyStr === '\u0003') { // Ctrl+C
        stdout.write(showCursor);
        ng.kill();
        server.kill();
        process.exit(0);
    } else if (searchMode) {
        if (keyStr === '\x1b') { // ESC - exit search
            searchMode = false;
            searchQuery = '';
            searchResults = [];
            searchIndex = 0;
            drawUI();
        } else if (keyStr === '\r') { // Enter - next search result
            if (searchResults.length > 0) {
                searchIndex = (searchIndex + 1) % searchResults.length;
                scrollOffset[activeTab] = Math.max(0, searchResults[searchIndex] - 5);
                drawUI();
            }
        } else if (keyStr === '\x7f' || keyStr === '\b') { // Backspace
            searchQuery = searchQuery.slice(0, -1);
            performSearch(searchQuery);
            drawUI();
        } else if (keyStr.length === 1 && keyStr.charCodeAt(0) >= 32 && keyStr.charCodeAt(0) <= 126) { // Printable characters
            searchQuery += keyStr;
            performSearch(searchQuery);
            drawUI();
        }
    } else {
        if (keyStr === '\t' || keyStr === '\x1b[C' || keyStr === '\x1b[D') { // TAB or left/right arrows
            activeTab = (activeTab + 1) % tabs.length;
            drawUI();
        } else if (keyStr === '\x1b[A') { // Up arrow - scroll up (show older content)
            const totalRows = process.stdout.rows || 24;
            const contentRows = totalRows - 3; // Header + separator + help
            const maxScrollUp = Math.max(0, buffers[activeTab].length - contentRows);
            scrollOffset[activeTab] = Math.min(maxScrollUp, scrollOffset[activeTab] + 1);
            drawUI();
        } else if (keyStr === '\x1b[B') { // Down arrow - scroll down (show newer content)
            scrollOffset[activeTab] = Math.max(0, scrollOffset[activeTab] - 1);
            drawUI();
        } else if (keyStr.startsWith('\x1b[<') && keyStr.includes('64;')) { // Mouse wheel up
            const totalRows = process.stdout.rows || 24;
            const contentRows = totalRows - 3;
            const maxScrollUp = Math.max(0, buffers[activeTab].length - contentRows);
            scrollOffset[activeTab] = Math.min(maxScrollUp, scrollOffset[activeTab] + 3); // Scroll 3 lines up
            drawUI();
        } else if (keyStr.startsWith('\x1b[<') && keyStr.includes('65;')) { // Mouse wheel down
            scrollOffset[activeTab] = Math.max(0, scrollOffset[activeTab] - 3); // Scroll 3 lines down
            drawUI();
        } else if (keyStr === '\x1b[5~') { // Page Up
            const pageSize = (process.stdout.rows || 24) - 4;
            scrollOffset[activeTab] = Math.max(0, scrollOffset[activeTab] - pageSize);
            drawUI();
        } else if (keyStr === '\x1b[6~') { // Page Down
            const pageSize = (process.stdout.rows || 24) - 4;
            const maxScroll = Math.max(0, buffers[activeTab].length - pageSize);
            scrollOffset[activeTab] = Math.min(maxScroll, scrollOffset[activeTab] + pageSize);
            drawUI();
        } else if (keyStr === '/') { // Start search
            searchMode = true;
            searchQuery = '';
            searchResults = [];
            searchIndex = 0;
            drawUI();
        }
    }
});

// ── Angular dev server ─────────────────────────────────────────────────────
const ng = spawn({
    cmd: ['ng', 'serve', '--port', String(ngPort), '--no-open', '--configuration', 'development'],
    cwd: new URL('../client', import.meta.url).pathname,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
});

// Handle Angular output
async function readAngularOutput() {
    const reader = ng.stdout.getReader();
    const decoder = new TextDecoder();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    addToBuffer(0, line);
                    // Check if Angular has started - look for multiple indicators
                    if (line.includes('Local:') || line.includes('served at') || 
                        line.includes('Application bundle generation complete') ||
                        (line.includes('localhost') && line.includes('4200'))) {
                        if (!angularStarted) {
                            angularStarted = true;
                            showPrettyStartupLog();
                        }
                    }
                }
            });
        }
    } catch (error) {
        // Process ended
    } finally {
        reader.releaseLock();
    }
}

async function readAngularErrors() {
    const reader = ng.stderr.getReader();
    const decoder = new TextDecoder();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    addToBuffer(0, `\x1b[31m${line}\x1b[0m`); // Red for errors
                }
            });
        }
    } catch (error) {
        // Process ended
    } finally {
        reader.releaseLock();
    }
}

// ── Shokupan server ────────────────────────────────────────────────────────
const serverEnv = { ...process.env, ANGULAR_DEV_PORT: String(ngPort), PORT: String(apiPort) };

const server = spawn({
    cmd: ['bun', '--watch', 'main.ts'],
    cwd: new URL('../examples/full', import.meta.url).pathname,
    env: serverEnv,
    stdout: 'pipe',
    stderr: 'pipe',
});

// Handle API server output
async function readServerOutput() {
    const reader = server.stdout.getReader();
    const decoder = new TextDecoder();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    addToBuffer(1, line);
                    // Check if API has started - look for multiple indicators
                    if (line.includes('listening') || line.includes('Server running') || 
                        line.includes(`${apiPort}`) || line.includes('INFO') ||
                        (line.includes('localhost') && line.includes('320'))) {
                        if (!apiStarted) {
                            apiStarted = true;
                            showPrettyStartupLog();
                        }
                    }
                }
            });
        }
    } catch (error) {
        // Process ended
    } finally {
        reader.releaseLock();
    }
}

async function readServerErrors() {
    const reader = server.stderr.getReader();
    const decoder = new TextDecoder();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    addToBuffer(1, `\x1b[31m${line}\x1b[0m`); // Red for errors
                }
            });
        }
    } catch (error) {
        // Process ended
    } finally {
        reader.releaseLock();
    }
}

// Kill child processes when parent exits
process.on('SIGINT', () => {
    stdout.write(showCursor);
    stdout.write('\x1b[?1000l'); // Disable mouse tracking
    stdout.write('\x1b[?1006l'); // Disable SGR mouse mode
    ng.kill();
    server.kill();
    process.exit(0);
});

process.on('exit', () => {
    stdout.write(showCursor);
    stdout.write('\x1b[?1000l'); // Disable mouse tracking
    stdout.write('\x1b[?1006l'); // Disable SGR mouse mode
});

// Initial UI draw
drawUI();

// Start reading output streams
readAngularOutput();
readAngularErrors();
readServerOutput();
readServerErrors();

await Promise.all([ng.exited, server.exited]);
