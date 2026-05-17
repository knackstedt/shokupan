import { test, expect } from '@playwright/test';

test.describe('API Explorer Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('skp-shell', { timeout: 10000 });
    
    // Click on the REST API tab
    await page.click('text=REST API');
    await page.waitForTimeout(1000);
  });

  test('should load API Explorer component', async ({ page }) => {
    // Check if the API Explorer component is rendered
    const apiExplorer = await page.locator('skp-api-explorer');
    await expect(apiExplorer).toBeVisible();
  });

  test('should display sidebar with API groups', async ({ page }) => {
    // Check if sidebar is visible
    const sidebar = await page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    
    // Check if sidebar header is present
    const sidebarHeader = await page.locator('.sidebar-header h1');
    await expect(sidebarHeader).toBeVisible();
  });

  test('should display navigation groups', async ({ page }) => {
    // Wait for navigation groups to load
    await page.waitForSelector('.nav-group', { timeout: 5000 });
    
    // Check if at least one nav group exists
    const navGroups = await page.locator('.nav-group');
    const count = await navGroups.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should expand/collapse navigation groups', async ({ page }) => {
    // Wait for navigation groups
    await page.waitForSelector('.nav-group', { timeout: 5000 });
    
    // Click on the first group title
    const firstGroupTitle = await page.locator('.nav-group-title').first();
    await firstGroupTitle.click();
    
    // Wait for animation
    await page.waitForTimeout(300);
    
    // Check if group is expanded (nav-items should be visible)
    const navItems = await page.locator('.nav-items').first();
    const isVisible = await navItems.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('should select and display route details', async ({ page }) => {
    // Wait for navigation groups
    await page.waitForSelector('.nav-group', { timeout: 5000 });
    
    // Expand first group
    const firstGroupTitle = await page.locator('.nav-group-title').first();
    await firstGroupTitle.click();
    await page.waitForTimeout(300);
    
    // Click on first route
    const firstRoute = await page.locator('.nav-item').first();
    if (await firstRoute.isVisible()) {
      await firstRoute.click();
      await page.waitForTimeout(500);
      
      // Check if main content shows route details
      const mainContent = await page.locator('#main-content');
      await expect(mainContent).toBeVisible();
    }
  });

  test('should toggle sidebar collapse', async ({ page }) => {
    // Find and click the sidebar toggle button
    const toggleButton = await page.locator('.toggle-sidebar');
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      await page.waitForTimeout(300);
      
      // Check if sidebar has collapsed class
      const sidebar = await page.locator('.sidebar');
      const hasCollapsedClass = await sidebar.evaluate((el) => 
        el.classList.contains('collapsed')
      );
      expect(hasCollapsedClass).toBeTruthy();
    }
  });

  test('should display HTTP method badges correctly', async ({ page }) => {
    // Wait for navigation groups
    await page.waitForSelector('.nav-group', { timeout: 5000 });
    
    // Expand first group
    const firstGroupTitle = await page.locator('.nav-group-title').first();
    await firstGroupTitle.click();
    await page.waitForTimeout(300);
    
    // Check if badges are present
    const badges = await page.locator('.badge');
    const count = await badges.count();
    if (count > 0) {
      const firstBadge = await badges.first();
      await expect(firstBadge).toBeVisible();
      
      // Check if badge has proper class (GET, POST, etc.)
      const badgeText = await firstBadge.textContent();
      expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).toContain(badgeText?.trim());
    }
  });

  test('should load and display OpenAPI spec data', async ({ page }) => {
    // Wait for spec to load (check if groups are populated)
    await page.waitForSelector('.nav-group', { timeout: 10000 });
    
    // Verify that the spec has loaded by checking for routes
    const navItems = await page.locator('.nav-item');
    const count = await navItems.count();
    
    // If spec loaded successfully, there should be routes
    console.log(`Found ${count} routes in API Explorer`);
  });

  test('should handle empty state when no route is selected', async ({ page }) => {
    // Check if empty state is displayed
    const emptyState = await page.locator('.empty-state');
    const isVisible = await emptyState.isVisible();
    
    if (isVisible) {
      const emptyStateText = await emptyState.textContent();
      expect(emptyStateText).toContain('Select a request');
    }
  });

  test('should display middleware if present', async ({ page }) => {
    // Wait for navigation groups
    await page.waitForSelector('.nav-group', { timeout: 5000 });
    
    // Check if any middleware items exist
    const middlewareItems = await page.locator('.middleware-nav-item');
    const count = await middlewareItems.count();
    
    console.log(`Found ${count} middleware items`);
  });
});
