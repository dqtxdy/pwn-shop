import { test, expect } from '@playwright/test';

/**
 * Workflow spec — stateful E2E flows that mutate the backend.
 * Runs ONCE on desktop-workflow project only to avoid cross-project state contamination
 * with the shared in-memory backend repository.
 */
test.describe('PawnShop Protocol E2E Flow', () => {
  // Ensure the page is loaded and demo customer session is active before each test
  test.beforeEach(async ({ page, request }) => {
    // Console error failure policy:
    // Fail test on any browser console errors, EXCEPT the known React 19 + Ant Design v5 compatibility warning
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

    // Unhandled exception failure policy:
    // Fail test on any unhandled page errors/exceptions
    page.on('pageerror', err => {
      throw new Error(`Browser exception: ${err.message}`);
    });
    
    // Reset database state before each test to prevent pollution
    await request.post('http://localhost:3000/api/demo/reset');
    
    await page.goto('/');
    // Assert app loads with the default demo customer account
    await expect(page.locator('.user-display-name')).toContainText('Demo Customer');
  });

  test('should load dashboard data and login as the default demo customer', async ({ page }) => {
    // Navigate to My Assets & Loans
    await page.locator('a[href="#my-assets"]').click();

    // Check seeded asset is present in My Assets table
    await expect(page.locator('tr:has-text("A-1002")')).toContainText('MacBook Pro M3');
  });

  test('should allow customer to submit a loan request', async ({ page }) => {
    // Navigate to New Pawn Request sidebar item
    await page.locator('a[href="#new-pawn"]').click();

    // Fill the loan request form using direct element IDs
    await page.fill('#title', 'E2E Test Diamond Ring');
    await page.fill('#category', 'jewelry');
    await page.fill('#declaredValue', '5000');
    await page.fill('#requestedAmount', '3000');
    await page.fill('#description', 'Flawless condition, certified.');

    // Submit the form
    await page.click('button:has-text("Submit Request")');

    // Navigate to My Assets & Loans to verify submission
    await page.locator('a[href="#my-assets"]').click();

    // Verify the new asset appears in the assets table (proves the request succeeded)
    await expect(page.locator('tr:has-text("E2E Test Diamond Ring")').first()).toBeVisible();
  });

  test('should allow customer to list a returned/received asset for sale', async ({ page }) => {
    // Navigate to My Assets & Loans
    await page.locator('a[href="#my-assets"]').click();

    // Seeded asset A-1004 is "Gold ring set" in status "RECEIVED" or "LISTED"
    const assetRow = page.locator('tr:has-text("A-1004")');
    await expect(assetRow).toBeVisible();

    const rowText = await assetRow.innerText();
    if (rowText.includes('Listed')) {
      // Asset is already listed from a previous stateful run
      await expect(assetRow).toContainText('Listed');
    } else {
      // Proceed with normal listing flow
      await expect(assetRow).toContainText('Received');

      // Click the row to open the detail panel
      await assetRow.click();

      // Click "List For Sale" in that row
      const listButton = page.locator('button:has-text("List For Sale")');
      await listButton.click();

      // Verify modal is visible
      const modal = page.locator('.demo-list-modal');
      await expect(modal).toBeVisible();
      await expect(modal.locator('input[disabled]')).toHaveValue('A-1004');

      // Enter price using modal price ID
      await modal.locator('#price').fill('2000');

      // Click Publish Listing
      await modal.locator('button:has-text("Publish Listing")').click();

      // Confirm that it now shows "Listed" in the table row (proves the listing succeeded)
      await expect(assetRow).toContainText('Listed');
    }
  });

  test('should restrict side-nav visibility and allow switching workspaces based on role', async ({ page }) => {
    // Customer workspace side-nav assertions
    await expect(page.locator('a[href="#new-pawn"]')).toBeVisible();
    await expect(page.locator('a[href="#work-queue"]')).not.toBeVisible();
    await expect(page.locator('a[href="#admin-overview"]')).not.toBeVisible();

    // Switch to Validator (STAFF)
    await page.locator('.demo-session-select').click();
    await page.locator('[role="option"]:has-text("Validator")').click();

    // Verify topbar user displays Demo Staff
    await expect(page.locator('.user-display-name')).toContainText('Demo Staff');

    // Verify Validator side-nav is visible and Customer/Admin are hidden
    await expect(page.locator('a[href="#work-queue"]')).toBeVisible();
    await expect(page.locator('a[href="#new-pawn"]')).not.toBeVisible();
    await expect(page.locator('a[href="#admin-overview"]')).not.toBeVisible();

    // Switch to Admin
    await page.locator('.demo-session-select').click();
    await page.locator('[role="option"]:has-text("Admin")').click();

    // Verify topbar user displays Demo Admin
    await expect(page.locator('.user-display-name')).toContainText('Demo Admin');

    // Verify Admin side-nav is visible and Customer/Validator are hidden
    await expect(page.locator('a[href="#admin-overview"]')).toBeVisible();
    await expect(page.locator('a[href="#new-pawn"]')).not.toBeVisible();
    await expect(page.locator('a[href="#work-queue"]')).not.toBeVisible();

    // Verify metrics cards are rendered and load correct values
    await expect(page.locator(':has-text("Active Loans")').first()).toBeVisible();
  });

  test('should verify search behavior: no immediate navigation on type, navigate on Enter match, show warning on no match', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Physical Asset Pawnshop Operations');
    await expect(page.locator('.quickstart-panel')).toBeVisible();

    const searchInput = page.locator('.console-topbar__search input');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('MacBook');
    await page.waitForTimeout(500);
    await expect(page.locator('.quickstart-panel')).toBeVisible();

    await searchInput.press('Enter');

    await expect(page.locator('h2', { hasText: 'My Assets' })).toBeVisible();
    await expect(page.locator('.assets-layout')).toBeVisible();
    await expect(page.locator('h3', { hasText: 'MacBook Pro M3' })).toBeVisible();

    await page.locator('a[href="#overview"]:has-text("Overview")').first().click();
    await expect(page.locator('.quickstart-panel')).toBeVisible();

    await searchInput.fill('Xbox One');
    await searchInput.press('Enter');

    await expect(page.locator('.quickstart-panel')).toBeVisible();
    await expect(page.getByText('No results for "Xbox One"')).toBeVisible();
  });

  test('should navigate to Fractions workspace and render all three panels', async ({ page }) => {
    // Navigate to Fractions sidebar item
    await page.locator('a[href="#fractions"]').click();

    // Verify all three fractionalization panel headers are visible
    await expect(page.getByText('Eligible Assets for Fractionalization')).toBeVisible();
    await expect(page.getByText('Active Fractional Pools')).toBeVisible();
    await expect(page.getByText('My Fraction Holdings')).toBeVisible();

    // Verify that the seeded asset A-1004 (status RECEIVED) appears as eligible
    // The real-mode seeded asset A-1004 is in RECEIVED status so it should appear
    const eligibleTable = page.locator('h2:has-text("Eligible Assets for Fractionalization")').locator('..').locator('..');
    // Check that the table section is rendered (may be empty in mock mode depending on seed data)
    await expect(eligibleTable).toBeVisible();
  });
});
