import { expect, test } from '@playwright/test';

// Escribe en la base de DATABASE_URL (branch `dev` de Neon): crea una reserva pendiente de pago.
test('la clienta reserva un turno individual y ve el estado de su reserva', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver horarios de Demo Maquillaje social' }).click();

  await page.getByRole('link', { name: 'Demo Ana', exact: true }).click();

  // El primer horario que el sistema ofrece: así la prueba se puede repetir sin chocar con el turno anterior.
  await page
    .getByRole('list', { name: 'Horarios libres' })
    .getByRole('button')
    .first()
    .click();

  await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible();
  // Acotado al resumen (<dd>): durante la transición todavía hay títulos de la pantalla anterior.
  await expect(page.getByRole('definition').filter({ hasText: 'Demo Maquillaje social' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Demo Ana' })).toBeVisible();

  await page.getByLabel('Tu nombre').fill('Clienta E2E');
  await page.getByLabel('Tu teléfono').fill('+51 999 888 777');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();

  await expect(page).toHaveURL(/\/reservas\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Estado de tu reserva' })).toBeVisible();
  await expect(page.getByText('Pendiente de pago')).toBeVisible();
  await expect(
    page.getByText('Tu horario está apartado. Falta completar el pago para confirmar la reserva.'),
  ).toBeVisible();

  const turno = page.getByRole('listitem').filter({ hasText: 'Clienta E2E' });
  await expect(turno).toContainText('Demo Maquillaje social');
  await expect(turno).toContainText('con Demo Ana');
});
