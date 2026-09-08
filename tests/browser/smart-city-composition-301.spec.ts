import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { startExampleDevServer } from './example-dev-server';
import { analyzePngDifferenceBounds } from './showcase-visual-quality';
import { sourceIdentity, sameSource } from '../../tools/muse3jsparity-readiness/source-identity';
import { routePrimaryProbeThresholds as thresholds } from '../../tools/showcase-library/route-primary-probes.mjs';

const producerPath = 'tests/browser/smart-city-composition-301.spec.ts';
const reportDirectory = 'tests/reports/smart-city-composition-301';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const panelSelector = 'header,nav,aside,#hud,#panel,[class*="hud"],[class*="panel"],[class*="controls"],[class*="topbar"],[class*="commandbar"],[class*="telemetry"]';

const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }] as const;
const states = ['command', 'coreselected', 'flythrough'] as const;

test.describe('Q02 Smart City retains its typed primary subject through desktop/mobile camera and panel interaction', () => {
  test.describe.configure({ mode: 'serial' });
  for (const viewport of viewports) for (const state of states) {
    test(`${viewport.name}:${state}`, async ({ page }) => {
      test.setTimeout(600_000);
      const source = sourceIdentity(process.cwd());
      const producer = { path: producerPath, sha256: hash(readFileSync(producerPath)) };
      const id = `${viewport.name}:${state}`;
      const errors: string[] = [];
      mkdirSync(reportDirectory, { recursive: true });
      page.on('pageerror', error => errors.push(error.message));
      const server = await startExampleDevServer();
      try {
        await page.setViewportSize(viewport);
        await page.goto(`${server.origin}/apps/showcase-smart-city-control/?compositionProbe=1`, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => page.evaluate(() => (window as any).__AURA3D_SHOWCASE_SMART_CITY_CONTROL__?.diagnostics?.rendererRuntime?.backend),
          { timeout: 120_000, intervals: [100, 250, 500, 1_000] }).toBe('production-runtime');
        console.log(`[Q02 SmartCity] ${id} starting`);
        // Quiesce the production RAF owner before a control rebuild. setScene()
        // then mounts one explicit deterministic frame instead of rendering the
        // flythrough continuously while this software-rendered proof waits.
        await page.evaluate(() => (window as any).__AURA3D_COMPOSITION_PROBE__.pauseForCapture());
        console.log(`[Q02 SmartCity] ${id} paused`);
        if (state === 'coreselected') await page.locator('[data-district="core"]').click();
        if (state === 'flythrough') await page.locator('[data-camera="flythrough"]').click();
        await expect.poll(() => page.evaluate(state => {
          const evidence = (window as any).__AURA3D_SHOWCASE_SMART_CITY_CONTROL__;
          return evidence?.status === 'ready' && evidence?.diagnostics?.rendererRuntime?.backend === 'production-runtime'
            && evidence.interactionState.cameraMode === (state === 'flythrough' ? 'flythrough' : 'command')
            && (state !== 'coreselected' || evidence.interactionState.selectedBuildingId === 'core-tower-3');
        }, state), { timeout: 120_000, intervals: [100, 250, 500, 1_000] }).toBe(true);
        console.log(`[Q02 SmartCity] ${id} state-ready`);
        await page.evaluate(() => (window as any).__AURA3D_COMPOSITION_PROBE__.settleSubjectPose());
        console.log(`[Q02 SmartCity] ${id} settled`);
        const visiblePath = `${reportDirectory}/${id}-visible.png`;
        const suppressedPath = `${reportDirectory}/${id}-suppressed.png`;
        const visiblePng = await page.screenshot({ path: visiblePath, scale: 'css', timeout: 150_000 });
        console.log(`[Q02 SmartCity] ${id} visible-captured`);
        const context = await page.evaluate(() => {
          const evidence = (window as any).__AURA3D_SHOWCASE_SMART_CITY_CONTROL__;
          const canvas = document.querySelector('canvas')!.getBoundingClientRect();
          const x = Math.max(0, canvas.x), y = Math.max(0, canvas.y);
          return { interactionState: evidence.interactionState, rendererRuntime: evidence.diagnostics.rendererRuntime,
            analysisCrop: { x, y, width: Math.min(innerWidth, canvas.right) - x, height: Math.min(innerHeight, canvas.bottom) - y } };
        });
        await page.evaluate(() => (window as any).__AURA3D_COMPOSITION_PROBE__.setSubjectSuppressed(true));
        const suppressedPng = await page.screenshot({ path: suppressedPath, scale: 'css', timeout: 150_000 });
        console.log(`[Q02 SmartCity] ${id} suppressed-captured`);
        const metrics = analyzePngDifferenceBounds(visiblePng, suppressedPng, context.analysisCrop);
        const panels = await page.evaluate(({ selector, bounds }) => {
          if (!bounds) return [];
          return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return !element.querySelector('canvas') && rect.width >= 2 && rect.height >= 2 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > .01;
          }).map(element => {
            const r = element.getBoundingClientRect();
            const overlap = Math.max(0, Math.min(bounds.x + bounds.width, r.right) - Math.max(bounds.x, r.left))
              * Math.max(0, Math.min(bounds.y + bounds.height, r.bottom) - Math.max(bounds.y, r.top));
            return { selector: element.id ? `#${element.id}` : element.tagName.toLowerCase() + '.' + [...element.classList].join('.'),
              rect: { x: r.x, y: r.y, width: r.width, height: r.height }, overlapRatio: overlap / (bounds.width * bounds.height) };
          });
        }, { selector: panelSelector, bounds: metrics.bounds });
        const controls = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-camera],[data-district]')].filter(element => {
          const r = element.getBoundingClientRect(), style = getComputedStyle(element);
          return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }).map(element => { const r = element.getBoundingClientRect(); return { selector: element.dataset.camera ? `[data-camera="${element.dataset.camera}"]` : `[data-district="${element.dataset.district}"]`, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }; }));
        const controlsInViewport = controls.length > 0 && controls.every(({rect:r}) => r.x >= 0 && r.y >= 0 && r.x+r.width <= viewport.width && r.y+r.height <= viewport.height);
        const maxPanelOverlap = Math.max(0, ...panels.map(panel => panel.overlapRatio));
        const result = { id, viewport: { width: viewport.width, height: viewport.height }, state, ...context,
          visible: { path: visiblePath, sha256: hash(visiblePng) }, suppressed: { path: suppressedPath, sha256: hash(suppressedPng) },
          metrics, panels, maxPanelOverlap, controls, controlsInViewport, errors, source, producer };
        writeFileSync(resolve(reportDirectory, `${id}.json`), JSON.stringify(result, null, 2));
        expect(metrics.changedPixels).toBeGreaterThanOrEqual(thresholds.minNonBlankPixels);
        expect(metrics.colorBuckets).toBeGreaterThanOrEqual(thresholds.minColorBuckets);
        expect(metrics.bounds?.width).toBeGreaterThanOrEqual(thresholds.minForegroundWidth);
        expect(metrics.bounds?.height).toBeGreaterThanOrEqual(thresholds.minForegroundHeight);
        expect(metrics.readabilityScore).toBeGreaterThanOrEqual(thresholds.minReadabilityScore);
        expect(metrics.clipped).toBe(false);
        expect(maxPanelOverlap).toBeLessThanOrEqual(.08);
        expect(controlsInViewport).toBe(true);
        expect(errors).toEqual([]);
        expect(sameSource(source, sourceIdentity(process.cwd()))).toBe(true);
        console.log(`[Q02 SmartCity] ${id} passed`);
      } finally { await server.close(); }
    });
  }

  test('aggregates all six current-source cases', () => {
    const source = sourceIdentity(process.cwd());
    const producer = { path: producerPath, sha256: hash(readFileSync(producerPath)) };
    const expected = viewports.flatMap(viewport => states.map(state => `${viewport.name}:${state}`));
    const cases = expected.map(id => JSON.parse(readFileSync(resolve(reportDirectory, `${id}.json`), 'utf8')));
    const errors = cases.flatMap(entry => entry.errors ?? []);
    expect(cases.map(entry => entry.id)).toEqual(expected);
    for (const entry of cases) {
      expect(sameSource(entry.source, source), `${entry.id} source`).toBe(true);
      expect(entry.producer).toEqual(producer);
      expect(hash(readFileSync(entry.visible.path))).toBe(entry.visible.sha256);
      expect(hash(readFileSync(entry.suppressed.path))).toBe(entry.suppressed.sha256);
    }
    expect(errors).toEqual([]);
    writeFileSync(resolve(reportDirectory, 'report.json'), JSON.stringify({
      schema: 'aura3d.smart-city-composition-301/v1', source, producer, generatedAt: new Date().toISOString(), cases, errors, pass: true
    }, null, 2));
  });
});
