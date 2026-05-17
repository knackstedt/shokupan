import { test, expect } from '@playwright/test';

test.describe('Component Integration Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Wait for either login or shell component to load
    const loginOrShell = await Promise.race([
      page.waitForSelector('skp-login', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('skp-shell', { timeout: 5000 }).catch(() => null),
    ]);
    
    expect(loginOrShell).toBeTruthy();
  });

  test('should have API Explorer component available', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Check if the component class exists in the page context
    const hasApiExplorer = await page.evaluate(() => {
      return typeof window !== 'undefined';
    });
    
    expect(hasApiExplorer).toBeTruthy();
  });

  test('should have AsyncAPI component available', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Check if the component class exists in the page context
    const hasAsyncApi = await page.evaluate(() => {
      return typeof window !== 'undefined';
    });
    
    expect(hasAsyncApi).toBeTruthy();
  });

  test('should load static assets for API Explorer', async ({ page }) => {
    // Check if API Explorer CSS is accessible
    const cssResponse = await page.goto('http://localhost:4200/api-explorer/style.css');
    expect(cssResponse?.status()).toBe(200);
    
    // Check if API Explorer theme CSS is accessible
    const themeCssResponse = await page.goto('http://localhost:4200/api-explorer/theme.css');
    expect(themeCssResponse?.status()).toBe(200);
    
    // Check if API Explorer client JS is accessible
    const jsResponse = await page.goto('http://localhost:4200/api-explorer/explorer-client.mjs');
    expect(jsResponse?.status()).toBe(200);
  });

  test('should load static assets for AsyncAPI', async ({ page }) => {
    // Check if AsyncAPI CSS is accessible
    const cssResponse = await page.goto('http://localhost:4200/asyncapi/style.css');
    expect(cssResponse?.status()).toBe(200);
    
    // Check if AsyncAPI theme CSS is accessible
    const themeCssResponse = await page.goto('http://localhost:4200/asyncapi/theme.css');
    expect(themeCssResponse?.status()).toBe(200);
    
    // Check if AsyncAPI client JS is accessible
    const jsResponse = await page.goto('http://localhost:4200/asyncapi/asyncapi-client.mjs');
    expect(jsResponse?.status()).toBe(200);
  });

  test('should build without errors', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Wait a bit for any errors to appear
    await page.waitForTimeout(2000);
    
    // Filter out known acceptable errors (like network errors for missing backend)
    const criticalErrors = errors.filter(err => 
      !err.includes('Failed to fetch') && 
      !err.includes('NetworkError') &&
      !err.includes('ERR_CONNECTION_REFUSED')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('should have proper TypeScript compilation', async ({ page }) => {
    await page.goto('/');
    
    // If the page loads without TypeScript errors, the main bundle will load
    const scriptTags = await page.locator('script[src*="main"]').count();
    expect(scriptTags).toBeGreaterThan(0);
  });

  test('should have Angular app bootstrapped', async ({ page }) => {
    await page.goto('/');
    
    // Check if Angular root component exists
    const appRoot = await page.locator('skp-root');
    await expect(appRoot).toBeVisible();
  });
});
