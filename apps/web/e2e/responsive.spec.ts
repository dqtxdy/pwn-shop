import { test, expect } from '@playwright/test';

// Helper to open the side navigation drawer on mobile/tablet viewports where it is collapsed
const openSidebarIfMobile = async (page) => {
  const toggle = page.locator('button[class*="navigation-toggle"], [aria-label="Open navigation"]');
  if (await toggle.isVisible()) {
    await toggle.click();
    // Wait for the slide-out drawer animation
    await page.waitForTimeout(500);
  }
};

/**
 * Responsive layout spec — read-only, no state mutations.
 * Runs on all 3 viewport projects (desktop, tablet, mobile).
 * Asserts that the UI is usable at each viewport without breaking layout.
 */
test.describe('PawnShop Protocol – Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Console error failure policy
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known React 19 + AntD / Cloudscape compatibility warnings, specifically aria-haspopup
        if (
          text.includes('antd: compatible') ||
          text.includes('React is 16 ~ 18') ||
          text.includes('aria-haspopup')
        ) {
          console.log(`[Browser Console Warning Ignored] ${text}`);
          return;
        }
        throw new Error(`Browser console error: ${text}`);
      } else {
        console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      }
    });

    page.on('pageerror', err => {
      throw new Error(`Browser exception: ${err.message}`);
    });

    await page.goto('/');
    // Assert app loads with Demo Customer at every viewport
    await expect(page.locator('.user-display-name')).toContainText('Demo Customer');
  });

  test('topbar and session selector are visible', async ({ page }) => {
    const sessionSelector = page.locator('.demo-session-selector');
    await expect(sessionSelector).toBeVisible();

    // User display name in topbar is visible
    await expect(page.locator('.user-display-name')).toBeVisible();
  });

  test('workspace headers are visible', async ({ page }) => {
    const mainHeader = page.locator('h1', { hasText: 'Physical Asset Pawnshop Operations' });
    await expect(mainHeader).toBeVisible();
  });

  test('main table fits within viewport width (horizontal scroll is acceptable)', async ({ page }) => {
    // Open sidebar menu if running on mobile viewport
    await openSidebarIfMobile(page);

    // Navigate to My Assets & Loans view
    await page.locator('a[href="#my-assets"]').click();

    const viewportSize = page.viewportSize();
    if (viewportSize) {
      const tableWrapper = page.locator('.demo-table-wrapper').first();
      await expect(tableWrapper).toBeVisible();
      const box = await tableWrapper.boundingBox();
      if (box) {
        // The table must not overflow beyond the viewport width
        expect(box.width).toBeLessThanOrEqual(viewportSize.width);
      }
    }
  });

  test('primary controls are visible and not clipped', async ({ page }) => {
    // Open sidebar menu if running on mobile viewport
    await openSidebarIfMobile(page);

    // Navigate to New Pawn Request view
    await page.locator('a[href="#new-pawn"]').click();

    // Submit Request button should always be visible and enabled for Demo Customer
    const submitBtn = page.locator('button:has-text("Submit Request")');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test('take screenshots', async ({ page }, testInfo) => {
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width === 1440) {
      // 1. Customer Workspace Desktop
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(1000);
      const customerDesktop = await page.screenshot();
      await testInfo.attach('customer_desktop', {
        body: customerDesktop,
        contentType: 'image/png'
      });

      // 2. Customer Workspace Mobile
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1000);
      const customerMobile = await page.screenshot();
      await testInfo.attach('customer_mobile', {
        body: customerMobile,
        contentType: 'image/png'
      });

      // Restore Desktop
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(1000);

      // 3. Switch to Validator Workspace Desktop
      await page.locator('.demo-session-select').click();
      await page.locator('[role="option"]:has-text("Validator")').click();
      await page.waitForSelector('.user-display-name:has-text("Demo Staff")');
      await page.waitForTimeout(1000);
      const validatorDesktop = await page.screenshot();
      await testInfo.attach('validator_desktop', {
        body: validatorDesktop,
        contentType: 'image/png'
      });

      // 4. Switch to Admin Workspace Desktop
      await page.locator('.demo-session-select').click();
      await page.locator('[role="option"]:has-text("Admin")').click();
      await page.waitForSelector('.user-display-name:has-text("Demo Admin")');
      await page.waitForTimeout(1000);
      const adminDesktop = await page.screenshot();
      await testInfo.attach('admin_desktop', {
        body: adminDesktop,
        contentType: 'image/png'
      });
    }
  });
});

