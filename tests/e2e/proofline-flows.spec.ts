import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = join(process.cwd(), 'docs', 'screenshots');

test.describe('PROOFLINE End-to-End Casework, Provenance, Approvals & Screenshots', () => {
  test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test('navigates complete merchant workflow without console errors, captures UI screenshots, and verifies mobile layout', async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let expectingPayPal428 = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (expectingPayPal428 && text.includes('428 (Precondition Required)')) {
          return;
        }
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // 1. Login screen & Autofill merchant sign-in
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Merchant Operator Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Autofill demo login' })).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '01-login.png'), fullPage: true });

    await page.getByRole('button', { name: 'Autofill demo login' }).click();
    await page.getByRole('button', { name: 'Sign in to workspace' }).click();

    // 2. Operations Dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: 'Operations Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PayPal Sandbox', exact: true })).toBeVisible();

    // 3. Guided Demo -> Seed USD 850 Freelance Website Scenario
    await page.getByRole('link', { name: 'Guided Demo', exact: true }).click();
    await page.waitForURL('**/demo');
    await expect(page.getByText(/DEMO DATA — NOT A LIVE CUSTOMER RECORD/i).first()).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '02-demo-guide.png'), fullPage: true });

    await page.getByRole('button', { name: /Seed USD 850 Demo Scenario|Verify Demo Fixture/i }).click();
    await expect(page.getByText('PP-D-DEMO-850-WEBDEV').first()).toBeVisible();

    // Return to Dashboard & switch to Demo Fixtures to screenshot populated charts & KPIs
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('button', { name: 'Demo Fixtures', exact: true }).click();
    await expect(page.getByRole('link', { name: 'PP-D-DEMO-850-WEBDEV' }).first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '03-dashboard-demo.png'), fullPage: true });

    // 4. Disputes Register (AG Grid)
    await page.getByRole('link', { name: 'Disputes', exact: true }).click();
    await page.waitForURL('**/disputes');
    await expect(page.getByRole('heading', { name: 'Disputes Register' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'PP-D-DEMO-850-WEBDEV' }).first()).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '04-disputes-grid.png'), fullPage: true });

    // Trigger Sync Sandbox Disputes without PayPal config -> must surface real configuration error, not fake success
    expectingPayPal428 = true;
    await page.getByRole('button', { name: 'Sync Sandbox Disputes' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: 'PAYPAL_NOT_CONFIGURED' })).toBeVisible();
    expectingPayPal428 = false;

    // 5. Open Case Dossier -> Investigation & Provenance
    await page.getByRole('link', { name: 'PP-D-DEMO-850-WEBDEV' }).first().click();
    await page.waitForURL('**/disputes/*');
    await expect(page.getByText('PROOF_OF_FULFILLMENT').first()).toBeVisible();
    await expect(page.getByText(/Evidence-Backed Claims/i)).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '05-dispute-investigation.png'), fullPage: true });

    // Click Inspect Source on ProvenancePill -> Drawer opens with SHA-256 digest
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Inspect source' }).first().click();
    await expect(page.getByText('SHA-256 Digest')).toBeVisible();
    await expect(page.getByText('Extracted Text (Untrusted Source Content)')).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '06-evidence-inspector.png'), fullPage: false });
    await page.getByRole('button', { name: 'Close inspector' }).click();

    // 6. Delivery Timeline tab
    await page.getByRole('tab', { name: /Timeline/i }).click();
    await expect(page.getByText(/embedded document dates/i)).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '07-dispute-timeline.png'), fullPage: true });

    // 7. Response Studio PDF compilation & Approval Gate
    await page.getByRole('tab', { name: /Response Studio/i }).click();
    await expect(page.getByRole('heading', { name: /Response & Evidence Composer/i })).toBeVisible();

    await page
      .getByLabel('Factual Merchant Response Notes')
      .fill(
        'SOW-DEMO-2026-104 website deliverables were deployed electronically and acknowledged by buyer via email.'
      );

    // Check first attachment (SOW contract pdf) & compile provenance PDF bundle
    const checkboxes = page.locator('form input[type="checkbox"]');
    if ((await checkboxes.count()) > 0) {
      await checkboxes.first().check();
    }

    await page.getByRole('button', { name: 'Compile Provenance PDF Bundle' }).click();
    await expect(page.getByText(/Compiled PayPal-ready provenance PDF/i)).toBeVisible();

    await page.getByRole('button', { name: /Create Submission Draft|Save Draft Changes/i }).click();
    await expect(page.getByText(/Draft saved/i)).toBeVisible();

    await page.getByLabel(/I have reviewed the exact response notes/i).check();
    await page.getByRole('button', { name: /Approve Exact Submission/i }).click();
    await expect(page.getByText(/Submission approved/i)).toBeVisible();
    await page.screenshot({
      path: join(SCREENSHOT_DIR, '08-response-studio-approved.png'),
      fullPage: true
    });

    // 8. Global Evidence Library
    await page.getByRole('link', { name: 'Evidence Library', exact: true }).click();
    await page.waitForURL('**/evidence');
    await expect(page.getByText('website_development_contract.pdf').first()).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '09-evidence-library.png'), fullPage: true });

    // 9. Activity Audit Ledger
    await page.getByRole('link', { name: 'Activity Ledger', exact: true }).click();
    await page.waitForURL('**/activity');
    await expect(page.getByText('submission.approved').first()).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '10-activity-ledger.png'), fullPage: true });

    // 10. Settings Overview & Mobile Responsive Check
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL('**/settings');
    await expect(page.getByText('Workspace Storage & Background Processing')).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, '11-settings.png'), fullPage: true });

    // Mobile viewport horizontal overflow check
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflow).toBe(false);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
