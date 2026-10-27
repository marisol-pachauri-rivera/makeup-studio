import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Las credenciales E2E_ADMIN_* de los tests del panel viven en .env.local (no se versiona).
dotenv.config({ path: '.env.local', quiet: true });

export default defineConfig({
  testDir: './tests-play',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // `next dev` escucha en el 3000 por defecto; el proyecto no lo cambia.
  // En CI se prueba el build de producción (más parecido a Vercel que `next dev`).
  webServer: {
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 60_000,
  },
});
