import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../..',
  testMatch: ['tests/browser/webgpu-bloom-hdr-301.spec.ts', 'tests/browser/webgpu-post-j2.spec.ts', 'tests/browser/gpu-particle-a4.spec.ts', 'tests/browser/webgpu-temporal-device-loss-301.spec.ts', 'tests/browser/webgpu-basic-color-301.spec.ts', 'tests/browser/particle-collision-resident-301.spec.ts', 'tests/browser/webgpu-extension-atlas-301.spec.ts'],
  workers: 1,
  timeout: 240_000,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-angle=metal', '--enable-unsafe-webgpu'] },
    screenshot: 'only-on-failure',
    trace: process.env.NATIVE_PERFORMANCE_TRACE === 'off' ? 'off' : 'retain-on-failure',
  },
  reporter: [['line'], ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'tests/reports/native-ci/browser.json' }]],
});
