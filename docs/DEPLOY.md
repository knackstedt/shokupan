# GitHub Pages Setup

The documentation is configured to automatically deploy to GitHub Pages when you push to the `dev` branch.

## One-Time Setup

1. **Enable GitHub Pages in your repository:**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Pages**
   - Under "Build and deployment"
   - Set **Source** to: **GitHub Actions**

2. **Push the workflow:**
   ```bash
   git add .github/workflows/deploy-docs.yml
   git add docs/
   git commit -m "Add documentation site with GitHub Pages deployment"
   git push origin dev
   ```

3. **First deployment:**
   - The workflow will run automatically on push
   - Or manually trigger it from the **Actions** tab
   - After ~2-3 minutes, your docs will be live!

## Accessing Your Docs

Your documentation will be available at:
```
https://<your-username>.github.io/<repository-name>/
```

For this project:
```
https://shokupan.dev/
```

## Updating Documentation

The docs will automatically redeploy whenever you:
- Push changes to files in the `docs/` directory
- Push changes to the workflow file

## Manual Deployment

You can also manually trigger a deployment:
1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Select **Deploy Documentation to GitHub Pages**
4. Click **Run workflow**

## Troubleshooting

- **404 errors:** Make sure GitHub Pages source is set to "GitHub Actions" (not "Deploy from a branch")
- **Build failures:** Check the Actions tab for error logs
- **Permissions errors:** The workflow has the necessary permissions configured

## Local Preview

Before deploying, you can preview locally:
```bash
cd docs
bun run build
bun run preview
```
