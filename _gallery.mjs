import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
page.on('pageerror', e => console.log(`[err] ${e.message.slice(0,200)}`));
const demos = ['gallery', 'water-lab', 'ocean-observatory', 'reactor-post', 'smart-city', 'data-galaxy', 'product-configurator', 'robotics-lab', 'physics-playground', 'fog-cathedral', 'digital-twin'];
for (const d of demos) {
  await page.goto(`http://127.0.0.1:5180/apps/advanced-examples-gallery/#${d}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `screenshots/adv-${d}.png` });
  console.log(`captured ${d}`);
}
await browser.close();
