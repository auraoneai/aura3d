import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
await page.goto('http://127.0.0.1:7782/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

async function shot(name) {
  await page.screenshot({ path: `marketing/screenshots/${name}.png`, timeout: 60000 });
}
async function jump(scrollExpr) {
  await page.evaluate(scrollExpr);
  await page.waitForTimeout(1500);
}

await shot('v9-hero');

await jump(() => window.scrollTo(0, 420));
await page.waitForTimeout(3000);
await shot('v9-hero-stage');

await jump(() => {
  const el = document.querySelector('.manifesto');
  if (el) window.scrollTo(0, el.offsetTop - 60);
});
await shot('v9-manifesto');

const caps = ['v9-workflows', 'v9-diagnostics', 'v9-backends', 'v9-gltf'];
for (let i = 0; i < 4; i++) {
  await jump(`(() => { const caps = document.querySelectorAll('.cap'); const el = caps[${i}]; if (el) window.scrollTo(0, el.offsetTop - 60); })()`);
  await page.waitForTimeout(6000);
  await shot(caps[i] + '-head');
  await jump(`(() => { const caps = document.querySelectorAll('.cap'); const el = caps[${i}]?.querySelector('.cap__stage-wrap, .cap__details'); if (el) el.scrollIntoView({block:'center'}); })()`);
  await page.waitForTimeout(5000);
  await shot(caps[i] + '-stage');
}

await jump(() => {
  const el = document.querySelector('#gallery .gallery__head');
  if (el) window.scrollTo(0, el.offsetTop - 60);
});
await page.waitForTimeout(2500);
await shot('v9-gallery-head');

await jump(() => {
  const el = document.querySelector('#gallery .stage--feature');
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(8000);
await shot('v9-gallery-feature');

await jump(() => {
  const tiles = document.querySelectorAll('#gallery .stage--half');
  if (tiles[0]) tiles[0].scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(10000);
await shot('v9-gallery-bento');

await jump(() => {
  const el = document.querySelector('#depth');
  if (el) window.scrollTo(0, el.offsetTop - 60);
});
await shot('v9-depth');

await jump(() => {
  const el = document.querySelector('#start');
  if (el) window.scrollTo(0, el.offsetTop - 60);
});
await shot('v9-cta');

await browser.close();
