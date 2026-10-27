import { expect, test } from '@playwright/test';

const usuario = process.env.E2E_ADMIN_USUARIO;
const password = process.env.E2E_ADMIN_PASSWORD;

// Escribe en la base de DATABASE_URL (branch `dev` de Neon): crea una maquilladora activa.
test('la administradora inicia sesión y crea una maquilladora', async ({ page }) => {
  if (!usuario || !password) {
    throw new Error('Faltan E2E_ADMIN_USUARIO y E2E_ADMIN_PASSWORD (defínelas en .env.local o en el shell).');
  }
  // Un nombre distinto por corrida: la tabla no exige nombres únicos, pero así se distingue la fila.
  const nombre = `E2E Maquilladora ${Date.now()}`;

  await page.goto('/admin/maquilladoras');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('heading', { name: 'Maquilladoras' })).toBeVisible();
  await page.getByRole('link', { name: 'Nueva maquilladora' }).click();

  await expect(page.getByRole('heading', { name: 'Nueva maquilladora' })).toBeVisible();
  await page.getByLabel('Nombre').fill(nombre);
  await page.getByRole('button', { name: 'Crear maquilladora' }).click();

  await expect(page).toHaveURL(/\/admin\/maquilladoras$/);
  const fila = page.getByRole('row').filter({ hasText: nombre });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Activa');
});
