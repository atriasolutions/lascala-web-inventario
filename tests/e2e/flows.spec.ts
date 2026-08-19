import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Fixtures } from './support/global-setup';

const fixtures: Fixtures = JSON.parse(readFileSync(resolve('.playwright/fixtures.json'), 'utf8'));
const EMAIL = process.env.E2E_EMAIL || 'admin@lscala.cl';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin123!';

/** Flujos críticos: solo en 390×844, el tamaño de referencia en piso. */
test.describe('flujos críticos @390', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'Solo se corre en mobile-390');
  });

  test('login real con credenciales de piso', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ ...testInfo.project.use, storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/localhost:5173\/$/, { timeout: 20_000 });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await ctx.close();
  });

  test('cambiar de sucursal desde el sheet «Más»', async ({ page }) => {
    test.skip(fixtures.branchIds.length < 2, 'La organización tiene una sola sucursal.');
    await page.goto('/');
    await page.getByRole('button', { name: 'Más' }).click();
    const sheet = page.locator('.more-sheet.open');
    await expect(sheet).toBeVisible();

    const branchSelect = sheet.locator('.ctx-select select').first();
    const options = await branchSelect.locator('option').all();
    const values = await Promise.all(options.map((o) => o.getAttribute('value')));
    const other = values.find((v) => v && v !== fixtures.branchId)!;
    await branchSelect.selectOption(other);

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('lscala_branch')), { timeout: 10_000 })
      .toBe(other);
  });

  test('POS: buscar prenda y agregarla al carro', async ({ page }) => {
    await page.goto('/vender');
    await expect(page.locator('.pos-layout')).toBeVisible();

    await page.locator('.pos-search-trigger').click();
    const modal = page.locator('.pos-modal.open');
    await expect(modal).toBeVisible();

    await page.fill('#pos-search-input', 'a');
    const firstResult = modal.locator('.pos-result-row').first();
    await expect(firstResult).toBeVisible({ timeout: 15_000 });
    await firstResult.click();

    await expect(page.locator('.pos-cart-list .pos-cart-row')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.pos-checkout-bar .btn')).toBeEnabled();
  });

  test('Gastos: abrir el sheet «Nuevo gasto»', async ({ page }) => {
    await page.goto('/gastos');
    await page.locator('.gasto-register-btn').click();
    const sheet = page.locator('.gasto-form-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Nuevo gasto' })).toBeVisible();
    // El sheet no debe provocar desborde horizontal.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
