import { test, expect } from '@playwright/test';

test.describe('AsyncAPI Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('skp-shell', { timeout: 10000 });
    
    // Click on the WebSocket API tab
    await page.click('text=WebSocket API');
    await page.waitForTimeout(1000);
  });

  test('should load AsyncAPI component', async ({ page }) => {
    // Check if the AsyncAPI component is rendered
    const asyncApi = await page.locator('skp-asyncapi');
    await expect(asyncApi).toBeVisible();
  });

  test('should display sidebar with channel groups', async ({ page }) => {
    // Check if sidebar is visible
    const sidebar = await page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    
    // Check if sidebar header is present
    const sidebarHeader = await page.locator('.sidebar-header h2');
    await expect(sidebarHeader).toHaveText('AsyncAPI');
  });

  test('should display navigation tree with channels', async ({ page }) => {
    // Wait for navigation tree to load
    await page.waitForSelector('.nav-list', { timeout: 5000 });
    
    // Check if navigation list exists
    const navList = await page.locator('.nav-list');
    await expect(navList).toBeVisible();
  });

  test('should display group labels', async ({ page }) => {
    // Wait for group labels
    await page.waitForSelector('.group-label', { timeout: 5000 });
    
    // Check if at least one group label exists
    const groupLabels = await page.locator('.group-label');
    const count = await groupLabels.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should select and display channel details', async ({ page }) => {
    // Wait for tree items
    await page.waitForSelector('.tree-item', { timeout: 5000 });
    
    // Click on first channel
    const firstChannel = await page.locator('.tree-item').first();
    if (await firstChannel.isVisible()) {
      await firstChannel.click();
      await page.waitForTimeout(500);
      
      // Check if main content shows channel details
      const mainContent = await page.locator('#doc-panel');
      await expect(mainContent).toBeVisible();
    }
  });

  test('should display console panel', async ({ page }) => {
    // Check if console panel is visible
    const consolePanel = await page.locator('.console-panel');
    await expect(consolePanel).toBeVisible();
    
    // Check if console header exists
    const consoleHeader = await page.locator('.console-header h3');
    await expect(consoleHeader).toHaveText('Console');
  });

  test('should display connection controls', async ({ page }) => {
    // Check if connection bar exists
    const connectionBar = await page.locator('.connection-bar');
    await expect(connectionBar).toBeVisible();
    
    // Check if protocol selector exists
    const protocolSelect = await page.locator('#protocol');
    await expect(protocolSelect).toBeVisible();
    
    // Check if URL input exists
    const urlInput = await page.locator('#url');
    await expect(urlInput).toBeVisible();
    
    // Check if connect button exists
    const connectBtn = await page.locator('#connect-btn');
    await expect(connectBtn).toBeVisible();
  });

  test('should display connection status', async ({ page }) => {
    // Check if status indicator exists
    const statusIndicator = await page.locator('.status-indicator');
    await expect(statusIndicator).toBeVisible();
    
    // Check if status dot exists
    const statusDot = await page.locator('#status-dot');
    await expect(statusDot).toBeVisible();
    
    // Check if connection status text exists
    const connectionStatus = await page.locator('#connection-status');
    await expect(connectionStatus).toBeVisible();
    const statusText = await connectionStatus.textContent();
    expect(['Connected', 'Disconnected']).toContain(statusText?.trim());
  });

  test('should display SEND/RECV badges correctly', async ({ page }) => {
    // Wait for tree items
    await page.waitForSelector('.tree-item', { timeout: 5000 });
    
    // Check if badges are present
    const badges = await page.locator('.badge');
    const count = await badges.count();
    if (count > 0) {
      const firstBadge = await badges.first();
      await expect(firstBadge).toBeVisible();
      
      // Check if badge has proper text (SEND or RECV)
      const badgeText = await firstBadge.textContent();
      expect(['SEND', 'RECV']).toContain(badgeText?.trim());
    }
  });

  test('should toggle sidebar collapse', async ({ page }) => {
    // Find and click the sidebar collapse button
    const collapseButton = await page.locator('#btn-collapse-nav');
    if (await collapseButton.isVisible()) {
      await collapseButton.click();
      await page.waitForTimeout(300);
      
      // Check if sidebar has collapsed class
      const sidebar = await page.locator('.sidebar');
      const hasCollapsedClass = await sidebar.evaluate((el) => 
        el.classList.contains('collapsed')
      );
      expect(hasCollapsedClass).toBeTruthy();
    }
  });

  test('should toggle console panel collapse', async ({ page }) => {
    // Find and click the console collapse button
    const collapseButton = await page.locator('#btn-collapse-console');
    if (await collapseButton.isVisible()) {
      await collapseButton.click();
      await page.waitForTimeout(300);
      
      // Check if console panel has collapsed class
      const consolePanel = await page.locator('.console-panel');
      const hasCollapsedClass = await consolePanel.evaluate((el) => 
        el.classList.contains('collapsed')
      );
      expect(hasCollapsedClass).toBeTruthy();
    }
  });

  test('should display logs container', async ({ page }) => {
    // Check if logs container exists
    const logsContainer = await page.locator('.logs-container');
    await expect(logsContainer).toBeVisible();
  });

  test('should display compose area', async ({ page }) => {
    // Check if compose area exists
    const composeArea = await page.locator('.compose-area');
    await expect(composeArea).toBeVisible();
    
    // Check if editor container exists
    const editorContainer = await page.locator('#editor-container');
    await expect(editorContainer).toBeVisible();
    
    // Check if send button exists
    const sendBtn = await page.locator('#send-btn');
    await expect(sendBtn).toBeVisible();
  });

  test('should display target event indicator', async ({ page }) => {
    // Check if target event indicator exists
    const targetEvent = await page.locator('#target-event');
    await expect(targetEvent).toBeVisible();
  });

  test('should handle empty state when no channel is selected', async ({ page }) => {
    // Check if empty state is displayed
    const emptyState = await page.locator('.empty-state');
    const isVisible = await emptyState.isVisible();
    
    if (isVisible) {
      const emptyStateText = await emptyState.textContent();
      expect(emptyStateText).toContain('Select an event');
    }
  });

  test('should display clear logs button', async ({ page }) => {
    // Check if clear logs button exists
    const clearLogsBtn = await page.locator('#clear-logs-btn');
    await expect(clearLogsBtn).toBeVisible();
  });

  test('should load AsyncAPI spec data', async ({ page }) => {
    // Wait for spec to load (check if tree items are populated)
    await page.waitForSelector('.tree-item', { timeout: 10000 });
    
    // Verify that the spec has loaded by checking for channels
    const treeItems = await page.locator('.tree-item');
    const count = await treeItems.count();
    
    // If spec loaded successfully, there should be channels
    console.log(`Found ${count} channels in AsyncAPI`);
  });

  test('should display warning channels if present', async ({ page }) => {
    // Wait for tree items
    await page.waitForSelector('.tree-item', { timeout: 5000 });
    
    // Check if any warning items exist (with warning emoji)
    const warningItems = await page.locator('.tree-item:has-text("⚠️")');
    const count = await warningItems.count();
    
    console.log(`Found ${count} warning channels`);
  });

  test('should display plugin indicators if present', async ({ page }) => {
    // Wait for tree items
    await page.waitForSelector('.tree-item', { timeout: 5000 });
    
    // Check if any plugin icons exist
    const pluginIcons = await page.locator('.builtin-icon');
    const count = await pluginIcons.count();
    
    console.log(`Found ${count} plugin indicators`);
  });
});
