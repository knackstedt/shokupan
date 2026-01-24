import type { ShokupanContext } from '../../../../context';

export function renderStatusView(ctx: ShokupanContext, status: number, error: Error) {
    const title = `${status} ${error.message || 'Error'}`;
    const method = ctx.method;
    const path = ctx.url.pathname;

    // Additional CSS to supplement theme
    const css = `
        body {
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: var(--shokupan-font);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            overflow: hidden;
        }
        .container {
            text-align: center;
            animation: fadeIn 0.3s ease-out;
            background: var(--bg-card);
            padding: 3rem 4rem;
            border-radius: 16px;
            border: 1px solid var(--card-border);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            max-width: 600px;
        }
        h1 {
            font-size: 6rem;
            margin: 0;
            color: var(--primary);
            line-height: 1;
            font-weight: 800;
            letter-spacing: -2px;
            text-shadow: 0 4px 20px rgba(255, 179, 128, 0.2); 
        }
        h2 {
            font-size: 1.5rem;
            margin: 1rem 0 2rem 0;
            font-weight: 400;
            color: var(--text-secondary);
        }
        .meta {
            color: var(--text-muted);
            font-family: var(--shokupan-font-mono);
            font-size: 1rem;
            background: var(--bg-primary);
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            display: inline-block;
            border: 1px solid var(--border-color);
        }
        .method {
            font-weight: bold;
            margin-right: 0.5rem;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
        }
        .path {
            color: var(--text-primary);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link href="/_shokupan/error-view/theme.css" rel="stylesheet" />
    <style>${css}</style>
</head>
<body>
    <div class="container">
        <h1>${status}</h1>
        <h2>${error.message || 'An error occurred'}</h2>
        <div class="meta">
            <span class="method badge-${method}">${method}</span>
            <span class="path">${path}</span>
        </div>
    </div>
</body>
</html>`;
}
