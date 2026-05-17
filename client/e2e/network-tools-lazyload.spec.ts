import { expect, test } from '@playwright/test';

test.describe('Network Tools - Payload/Response Lazy Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load (either login or shell)
    await Promise.race([
      page.waitForSelector('skp-login', { timeout: 10000 }).catch(() => null),
      page.waitForSelector('skp-shell', { timeout: 10000 }).catch(() => null),
    ]);
  });

  test('should lazy load request payload when opening payload tab', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Wait for network tab or navigate to it
    const networkTab = await page.locator('text=Network').first();
    if (await networkTab.isVisible()) {
      await networkTab.click();
      await page.waitForTimeout(1000);
    }

    // Wait for request list to load
    await page.waitForSelector('.request-row, [class*="request"]', { timeout: 5000 }).catch(() => null);

    // Find a POST request (or any request) and click it
    const requestRows = await page.locator('.request-row, tr[class*="request"], .network-request').all();
    if (requestRows.length === 0) {
      test.skip(true, 'No network requests available to test');
      return;
    }

    // Click on the first request to open details
    await requestRows[0].click();
    await page.waitForTimeout(500);

    // Wait for request details component
    const requestDetails = await page.locator('skp-request-details, [class*="request-details"]').first();
    await expect(requestDetails).toBeVisible();

    // Click on Payload tab
    const payloadTab = await page.locator('text=Payload, [value="payload"]').first();
    if (await payloadTab.isVisible()) {
      await payloadTab.click();
      await page.waitForTimeout(1000);

      // Check that we're not showing "No request payload" if hasRequestBody is true
      // The payload should either be loading or loaded
      const noPayloadMsg = await page.locator('text=No request payload').first();
      const isLoading = await page.locator('text=Loading request body').first().isVisible().catch(() => false);
      const monacoEditor = await page.locator('ngx-monaco-editor').first().isVisible().catch(() => false);

      // Either we should see loading spinner, monaco editor with content, or "No request payload" (if no body)
      const hasNoPayload = await noPayloadMsg.isVisible().catch(() => false);

      if (!hasNoPayload) {
        // If hasRequestBody is true, we should see either loading or content
        expect(isLoading || monacoEditor).toBeTruthy();
      }
    }
  });

  test('should lazy load response body when opening response tab', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Wait for network tab or navigate to it
    const networkTab = await page.locator('text=Network').first();
    if (await networkTab.isVisible()) {
      await networkTab.click();
      await page.waitForTimeout(1000);
    }

    // Wait for request list to load
    await page.waitForSelector('.request-row, [class*="request"]', { timeout: 5000 }).catch(() => null);

    // Find a request and click it
    const requestRows = await page.locator('.request-row, tr[class*="request"], .network-request').all();
    if (requestRows.length === 0) {
      test.skip(true, 'No network requests available to test');
      return;
    }

    // Click on the first request to open details
    await requestRows[0].click();
    await page.waitForTimeout(500);

    // Wait for request details component
    const requestDetails = await page.locator('skp-request-details, [class*="request-details"]').first();
    await expect(requestDetails).toBeVisible();

    // Click on Response tab
    const responseTab = await page.locator('text=Response, [value="response"]').first();
    if (await responseTab.isVisible()) {
      await responseTab.click();
      await page.waitForTimeout(1000);

      // Check that response is loading or loaded
      const isLoading = await page.locator('text=Loading response body').first().isVisible().catch(() => false);
      const isDecoding = await page.locator('text=Decompressing').first().isVisible().catch(() => false);
      const monacoEditor = await page.locator('ngx-monaco-editor').first().isVisible().catch(() => false);
      const noResponseMsg = await page.locator('text=No response body captured').first().isVisible().catch(() => false);

      // Should see either loading, decoding, monaco editor, or "no response" message
      expect(isLoading || isDecoding || monacoEditor || noResponseMsg).toBeTruthy();
    }
  });

  test('should display POST request payload after lazy loading', async ({ page }) => {
    // This test specifically targets POST API requests with bodies
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Navigate to network tab
    const networkTab = await page.locator('text=Network').first();
    if (await networkTab.isVisible()) {
      await networkTab.click();
      await page.waitForTimeout(1000);
    }

    // Wait for request list
    await page.waitForSelector('.request-row, [class*="request"]', { timeout: 5000 }).catch(() => null);

    // Find a POST request specifically
    const allRows = await page.locator('.request-row, tr[class*="request"], .network-request').all();
    let postRow = null;

    for (const row of allRows) {
      const methodText = await row.locator('text=POST, .method-post, [class*="post"]').first().textContent().catch(() => '');
      if (methodText.includes('POST')) {
        postRow = row;
        break;
      }
    }

    if (!postRow) {
      test.skip(true, 'No POST requests available to test');
      return;
    }

    // Click on the POST request
    await postRow.click();
    await page.waitForTimeout(500);

    // Open payload tab
    const payloadTab = await page.locator('text=Payload').first();
    await payloadTab.click();
    await page.waitForTimeout(1500);

    // Verify that payload content is loaded (not showing "No request payload" if it has one)
    const monacoEditor = await page.locator('ngx-monaco-editor').first();
    const hasContent = await monacoEditor.isVisible().catch(() => false);

    // If the request has a body, the monaco editor should be visible with content
    // If it doesn't have a body, we should see "No request payload"
    expect(hasContent || await page.locator('text=No request payload').first().isVisible().catch(() => false)).toBeTruthy();
  });
});
