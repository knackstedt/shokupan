let renderToString: any;
async function getRenderToString() {
    if (!renderToString) {
        renderToString = (await import('preact-render-to-string')).default;
    }
    return renderToString;
}
import type { ShokupanContext } from '../../../../context';
import { getReasonPhrase } from '../reason-phrases';

interface StatusPageProps {
    status: number;
    message: string;
    method: string;
    path: string;
    image?: string;
    requestId?: string;
    hideErrorMessage?: boolean;
}

const statusImages: Record<number, string> = {
    400: '400.webp',
    401: '401.webp',
    403: '403.webp',
    404: '404.webp',
    418: '418.webp',
    429: '429.webp',
    500: '500.webp',
    502: '502.webp',
    503: '503.webp',
};


const StatusPage = ({ method, status, image, message, path, requestId, hideErrorMessage = false }: StatusPageProps) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{status} - {(!hideErrorMessage && message) || getReasonPhrase(status)}</title>
            <link href="/_shokupan/error-view/theme.css" rel="stylesheet" />
            <style dangerouslySetInnerHTML={{
                __html: `
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    background: linear-gradient(135deg, #FFF8E7 0%, #FFE8CC 100%);
                    color: #3D2817;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 2rem;
                    overflow-x: hidden;
                }
                
                .container {
                    text-align: center;
                    max-width: 600px;
                    animation: fadeIn 0.6s ease-out;
                }
                
                @keyframes fadeIn {
                    from { 
                        opacity: 0; 
                        transform: translateY(30px) scale(0.95);
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0) scale(1);
                    }
                }

                .bread-container {
                    position: relative;
                    margin: 0 auto 2rem;
                }

                .bread-image {
                    inset: 0;
                    max-width: 400px;
                    filter: drop-shadow(0 10px 30px rgba(61, 40, 23, 0.15));
                    animation: float 3s ease-in-out infinite;
                }

                .bread-image-overlay {
                    inset: 0;
                    width: 100%;
                    position: absolute;
                    user-select: none;
                    filter: drop-shadow(0 10px 30px rgba(61, 40, 23, 0.15));
                    animation: float 3s ease-in-out infinite;
                }
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                
                h1 {
                    font-size: 3rem;
                    font-weight: 700;
                    color: #8B4513;
                    margin-bottom: 1rem;
                    letter-spacing: -1px;
                }
                
                .message {
                    font-size: 1.5rem;
                    color: #A0522D;
                    margin-bottom: 2rem;
                    font-weight: 500;
                }
                
                .subtitle {
                    font-size: 1rem;
                    color: #8B7355;
                    margin-bottom: 2.5rem;
                    line-height: 1.6;
                }
                
                .info-card {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    padding: 1.5rem;
                    margin: 2rem auto;
                    max-width: 500px;
                    border: 2px solid rgba(139, 69, 19, 0.1);
                    box-shadow: 0 4px 15px rgba(139, 69, 19, 0.1);
                }
                
                .request-info {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                    font-family: 'Monaco', 'Menlo', monospace;
                    font-size: 0.9rem;
                    color: #654321;
                }
                
                .method-badge {
                    background: linear-gradient(135deg, #D2691E 0%, #8B4513 100%);
                    color: white;
                    padding: 0.4rem 0.8rem;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 0.85rem;
                    letter-spacing: 0.5px;
                    box-shadow: 0 2px 5px rgba(139, 69, 19, 0.3);
                }
                
                .path {
                    color: #5D4037;
                    font-weight: 500;
                    word-break: break-all;
                }
                
                .action-button {
                    display: inline-block;
                    background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
                    color: white;
                    text-decoration: none;
                    padding: 1rem 2rem;
                    border-radius: 50px;
                    font-weight: 600;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(245, 124, 0, 0.3);
                    border: none;
                    cursor: pointer;
                }
                
                .action-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(245, 124, 0, 0.4);
                }
                
                .decorative-elements {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: -1;
                    overflow: hidden;
                }
                
                .flour-particle {
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    background: rgba(255, 255, 255, 0.5);
                    border-radius: 50%;
                    animation: float-particle 8s infinite ease-in-out;
                }
                
                .flour-particle:nth-child(1) { left: 10%; top: 20%; animation-delay: 0s; }
                .flour-particle:nth-child(2) { left: 80%; top: 30%; animation-delay: 1s; }
                .flour-particle:nth-child(3) { left: 20%; top: 70%; animation-delay: 2s; }
                .flour-particle:nth-child(4) { left: 90%; top: 60%; animation-delay: 3s; }
                .flour-particle:nth-child(5) { left: 50%; top: 10%; animation-delay: 4s; }
                
                @keyframes float-particle {
                    0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 0.3; }
                    25% { transform: translate(20px, -20px) rotate(90deg); opacity: 0.6; }
                    50% { transform: translate(-20px, 20px) rotate(180deg); opacity: 0.3; }
                    75% { transform: translate(20px, 20px) rotate(270deg); opacity: 0.6; }
                }
                
                @media (max-width: 600px) {
                    h1 { font-size: 2rem; }
                    .message { font-size: 1.2rem; }
                    .bread-image { max-width: 280px; }
                    .info-card { padding: 1rem; }
                }

                .meta {
                    color: var(--text-muted);
                    font-family: var(--shokupan-font-mono);
                    padding: 0.75rem 1.5rem;
                    border-radius: 8px;
                    display: inline-block;
                }

                .request-id {
                    color: #8B7355;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    transition: background 0.2s;
                }

                .request-id:hover {
                    background: rgba(139, 69, 19, 0.1);
                }
            `}} />
            <script dangerouslySetInnerHTML={{
                __html: `
                function copyText(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        // Could show a toast here
                    });
                }
            `}} />
        </head>
        <body>
            <div class="decorative-elements">
                <div class="flour-particle"></div>
                <div class="flour-particle"></div>
                <div class="flour-particle"></div>
                <div class="flour-particle"></div>
                <div class="flour-particle"></div>
            </div>

            <div class="container">
                <div class="bread-container">
                    {status === 404 ? (
                        <>
                            <img
                                src="/_shokupan/error-view/404.webp"
                                alt="Bread character looking for missing ingredients"
                                class="bread-image"
                            />
                            <img
                                src="/_shokupan/error-view/404_overlay-1.webp"
                                class="bread-image-overlay"
                                style={{ 'animationDelay': '.75s' }}
                            />
                            <img
                                src="/_shokupan/error-view/404_overlay-2.webp"
                                class="bread-image-overlay"
                                style={{ 'animationDelay': '1.5s' }}
                            />
                            <img
                                src="/_shokupan/error-view/404_overlay-3.webp"
                                class="bread-image-overlay"
                                style={{ 'animationDelay': '2.25s' }}
                            />
                        </>
                    ) : (
                        <img src={`/_shokupan/error-view/${statusImages[status]}`} alt={`${status} illustration`} class="bread-image" style={{ animation: 'none' }} />
                    )}
                </div>
                <h1>{status}</h1>
                <div class="message">{(!hideErrorMessage && message) || getReasonPhrase(status) || 'Oops! Something went wrong'}</div>
                <p class="subtitle">
                    {status == 404 ? 'We searched high and low, but this page seems to have wandered off...<br />Perhaps it\'s still rising in the oven? 🍞' : 'Something went wrong. Please try again later.'}
                </p>
                {!hideErrorMessage && message && message !== 'Not Found' && (
                    <p class="subtitle" style="color: #A0522D; margin-top: -1rem;">
                        {message}
                    </p>
                )}

                <div class="info-card">
                    <div class="request-info meta">
                        <span class="method-badge">{method}</span>
                        <span class="path">{path}</span>
                        {requestId && (
                            <span
                                class="request-id"
                                {...{ onclick: `copyText('${requestId}')` }}
                                title="Click to copy Request ID"
                            >
                                ID: {requestId}
                            </span>
                        )}
                    </div>
                </div>

                <a href="/" class="action-button">
                    ← Back to Home
                </a>
            </div>
        </body>
    </html>
);

export async function renderStatusView(ctx: ShokupanContext, status: number, error: Error, options: { requestId?: string, hideErrorMessage?: boolean; } = {}) {
    const props = {
        status,
        message: error.message || 'Error',
        method: ctx.method,
        path: ctx.url.pathname,
        requestId: options.requestId || ctx.requestId,
        hideErrorMessage: options.hideErrorMessage
    };

    return '<!DOCTYPE html>\n' + (await getRenderToString())(StatusPage(props));
}
