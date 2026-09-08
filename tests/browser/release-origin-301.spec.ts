import { test, expect } from '@playwright/test';
import { collectRenderedInstallEvidence, validateVisibleInstallPins } from '../../tools/release/verify-release-origin.mjs';
test('release origin excludes comment/script/hidden/transparent install commands', async ({ page }) => {
  await page.setContent(`<main><h1>Aura3D 3.0.1</h1><!-- npm install @aura3d/engine@3.0.1 -->
    <script type="application/json">"npx create-aura3d@3.0.1"</script>
    <pre hidden>npm install @aura3d/engine@3.0.1</pre>
    <pre><span style="opacity:0">npx create-aura3d@3.0.1</span></pre>
    <pre>npm install @aura3d/engine@3.0.0</pre></main>`);
  const evidence=await page.evaluate(collectRenderedInstallEvidence);
  expect(evidence.installBlocks).toHaveLength(1);
  expect(validateVisibleInstallPins(evidence.installBlocks,'3.0.1').join(' ')).toContain('Wrong active install pin');
});
test('release origin distinguishes current instructions and explicitly historical sections', async ({ page }) => {
  await page.setContent(`<main><section><h2>Current installation</h2><pre>npm install @aura3d/engine@3.0.1\nnpx create-aura3d@3.0.1</pre></section>
    <section><h2>Historical installation instructions</h2><pre>npm install @aura3d/engine@2.0.0</pre></section></main>`);
  const evidence=await page.evaluate(collectRenderedInstallEvidence);
  expect(evidence.installBlocks.map(b=>b.scope)).toEqual(['current','historical']);
  expect(validateVisibleInstallPins(evidence.installBlocks,'3.0.1')).toEqual([]);
});
