import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startExampleDevServer, type ExampleDevServer } from './example-dev-server';
import type { runBasicColor301 } from './webgpu-basic-color-301-harness';

test.describe('native generated-basic vertex color', () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  test('interpolates RGB and RGBA vertices and multiplies material color including alpha', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${server.origin}/tests/browser/webgpu-basic-color-301-harness.html`);
    await page.waitForFunction(() => typeof (window as unknown as { runBasicColor301: unknown }).runBasicColor301 === 'function');
    const report = await page.evaluate(() => (window as unknown as { runBasicColor301: typeof runBasicColor301 }).runBasicColor301());
    mkdirSync('tests/reports/webgpu-basic-color-301', { recursive: true });
    const path = 'tests/reports/webgpu-basic-color-301/report.json';
    writeFileSync(path, JSON.stringify({ ...report, errors }, null, 2));
    await testInfo.attach('native GPU vertex color numerical oracle', { path, contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(report.diagnostics.nativeGeneratedBasicSubmissions).toBe(3);
    expect(report.diagnostics.nativeGeneratedTextureSubmissions).toBe(3);
    expect(report.results).toHaveLength(6);
    for (const result of report.results) {
      for (const sample of result.samples) {
        for (let channel = 0; channel < 4; channel++) expect(Math.abs(sample.actual[channel]! - sample.expected[channel]!)).toBeLessThanOrEqual(2);
      }
      expect(new Set(result.samples.map(sample => sample.actual.join(','))).size).toBe(result.components === 0 ? 1 : 3);
    }
  });
});
