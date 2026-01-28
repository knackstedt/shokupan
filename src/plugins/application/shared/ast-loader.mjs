/**
 * AST Loading State Manager
 * Handles displaying loading indicators while AST analysis is in progress
 */

/**
 * Check if AST is still being analyzed
 * @param {object} spec - OpenAPI or AsyncAPI spec
 * @returns {boolean}
 */
export function isASTAnalyzing(spec) {
    return spec && spec['x-ast-status'] === 'analyzing';
}

/**
 * Check if AST analysis is complete
 * @param {object} spec - OpenAPI or AsyncAPI spec
 * @returns {boolean}
 */
export function isASTComplete(spec) {
    return spec && spec['x-ast-status'] === 'completed';
}

/**
 * Check if AST analysis failed
 * @param {object} spec - OpenAPI or AsyncAPI spec
 * @returns {boolean}
 */
export function isASTFailed(spec) {
    return spec && spec['x-ast-status'] === 'failed';
}

/**
 * Show overlay-style loading indicator
 * @param {string} message - Optional custom message
 * @returns {HTMLElement} The overlay element
 */
export function showASTLoadingOverlay(message = 'Analyzing your codebase...') {
    const existingOverlay = document.getElementById('ast-loading-overlay');
    if (existingOverlay) return existingOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'ast-loading-overlay';
    overlay.className = 'ast-loading-overlay';
    overlay.innerHTML = `
        <div class="ast-loading-content">
            <div class="ast-loading-spinner"></div>
            <div class="ast-loading-title">Please Wait</div>
            <div class="ast-loading-message">${message}</div>
            <div class="ast-loading-progress">This may take a few moments...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Show banner-style loading indicator (less intrusive)
 * @param {string} message - Optional custom message
 * @returns {HTMLElement} The banner element
 */
export function showASTLoadingBanner(message = 'AST analysis in progress...') {
    const existingBanner = document.getElementById('ast-loading-banner');
    if (existingBanner) return existingBanner;

    const banner = document.createElement('div');
    banner.id = 'ast-loading-banner';
    banner.className = 'ast-loading-banner';
    banner.innerHTML = `
        <div class="ast-loading-banner-spinner"></div>
        <div class="ast-loading-banner-text">${message}</div>
    `;

    // Insert at the top of the body
    document.body.insertBefore(banner, document.body.firstChild);
    return banner;
}

/**
 * Hide loading overlay
 */
export function hideASTLoadingOverlay() {
    const overlay = document.getElementById('ast-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Hide loading banner
 */
export function hideASTLoadingBanner() {
    const banner = document.getElementById('ast-loading-banner');
    if (banner) {
        banner.remove();
    }
}

/**
 * Poll for spec updates until AST analysis completes
 * @param {string} specUrl - URL to fetch the spec from
 * @param {function} onComplete - Callback when analysis completes
 * @param {number} interval - Polling interval in ms (default: 2000)
 * @param {number} maxAttempts - Maximum polling attempts (default: 60)
 */
export async function pollForASTCompletion(specUrl, onComplete, interval = 2000, maxAttempts = 60) {
    let attempts = 0;

    const poll = async () => {
        if (attempts >= maxAttempts) {
            console.warn('AST analysis polling timed out');
            hideASTLoadingOverlay();
            hideASTLoadingBanner();
            return;
        }

        attempts++;

        try {
            const response = await fetch(specUrl);
            const spec = await response.json();

            if (isASTComplete(spec) || isASTFailed(spec)) {
                hideASTLoadingOverlay();
                hideASTLoadingBanner();
                if (onComplete) {
                    onComplete(spec);
                }
                return;
            }

            // Still analyzing, poll again
            if (isASTAnalyzing(spec)) {
                setTimeout(poll, interval);
            }
        } catch (error) {
            console.error('Error polling for AST completion:', error);
            setTimeout(poll, interval);
        }
    };

    poll();
}

/**
 * Initialize AST loading state for a page
 * Checks spec status and shows appropriate loading indicator
 * @param {object} spec - OpenAPI or AsyncAPI spec
 * @param {string} specUrl - URL to poll for updates
 * @param {function} onComplete - Callback when analysis completes
 * @param {boolean} useBanner - Use banner instead of overlay (default: false)
 */
export function initASTLoadingState(spec, specUrl, onComplete, useBanner = false) {
    if (isASTAnalyzing(spec)) {
        if (useBanner) {
            showASTLoadingBanner();
        } else {
            showASTLoadingOverlay();
        }

        // Start polling for completion
        pollForASTCompletion(specUrl, onComplete);
    } else if (isASTComplete(spec)) {
        // Analysis already complete, nothing to do
        hideASTLoadingOverlay();
        hideASTLoadingBanner();
    } else if (isASTFailed(spec)) {
        // Analysis failed, hide loading indicators
        hideASTLoadingOverlay();
        hideASTLoadingBanner();
    }
}
