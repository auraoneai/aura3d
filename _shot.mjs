import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0,200)));
await page.goto('http://127.0.0.1:7782/', { waitUntil: 'domcontentloaded' });

await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/v7-hero.png' });

await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2.2 }));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/v7-workflows.png' });

await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 3.5 }));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/v7-diagnostics.png' });

await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 4.8 }));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/v7-backends.png' });

await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 6.0 }));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/v7-gltf.png' });

await page.evaluate(() => document.querySelector('#gallery')?.scrollIntoView({block:'start'}));
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/v7-gallery.png' });

console.log('errs:', errs);
await browser.close();
