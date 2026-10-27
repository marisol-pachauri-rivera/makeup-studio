import { expect, test } from '@playwright/test';

// Escribe en la base de DATABASE_URL (branch `dev` de Neon): crea una reserva grupal con dos líneas de turno.
test('la clienta reserva para un grupo de dos y ve el estado de su reserva', async ({ page }) => {
  // Integrante 1: Demo Maquillaje social con Demo Ana (el primer horario que el sistema ofrece).
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver horarios de Demo Maquillaje social' }).click();
  await page.getByRole('link', { name: 'Demo Ana', exact: true }).click();
  await page.getByRole('list', { name: 'Horarios libres' }).getByRole('button').first().click();

  await expect(page.getByRole('heading', { name: 'Confirmá tu reserva' })).toBeVisible();
  await page.getByRole('switch', { name: 'Reservar para un grupo' }).check();
  await page.getByLabel('Nombre de la integrante 1').fill('Integrante Uno');

  // Integrante 2: Demo Peinado con Demo Bea. Otra maquilladora, para que los turnos no se solapen.
  await page.getByRole('button', { name: 'Agregar integrante' }).click();
  await page.getByLabel('Nombre de la integrante 2').fill('Integrante Dos');
  await page.getByRole('button', { name: 'Elegir horario de Integrante Dos' }).click();

  await page.getByRole('link', { name: 'Ver horarios de Demo Peinado' }).click();
  await page.getByRole('link', { name: 'Demo Bea', exact: true }).click();
  await page.getByRole('list', { name: 'Horarios libres' }).getByRole('button').first().click();

  await expect(page.getByRole('heading', { name: 'Integrantes del grupo' })).toBeVisible();
  await page.getByLabel('Tu nombre (quien reserva)').fill('Clienta E2E Grupo');
  await page.getByLabel('Tu teléfono').fill('+51 999 888 777');
  await page.getByRole('button', { name: 'Confirmar reserva del grupo' }).click();

  await expect(page).toHaveURL(/\/reservas\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Estado de tu reserva' })).toBeVisible();
  await expect(page.getByText('Pendiente de pago')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tus turnos' })).toBeVisible();

  const uno = page.getByRole('listitem').filter({ hasText: 'Integrante Uno' });
  await expect(uno).toContainText('Demo Maquillaje social');
  await expect(uno).toContainText('con Demo Ana');
  const dos = page.getByRole('listitem').filter({ hasText: 'Integrante Dos' });
  await expect(dos).toContainText('Demo Peinado');
  await expect(dos).toContainText('con Demo Bea');
  await expect(page.getByText('Monto total del grupo:')).toBeVisible();
});
