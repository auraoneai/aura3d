import { test, expect } from "@playwright/test";
import { migrateThreeToA3D } from "../../packages/three-compat/src";

test("ThreeCompat migration browser proof displays rewritten Three.js code", async ({ page }) => {
  const result = migrateThreeToA3D('import * as THREE from "three"; import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"; const renderer = new THREE.WebGLRenderer(); renderer.setSize(800,600);');
  await page.setContent(`<html><body><pre id="code"></pre><script>document.getElementById("code").textContent=${JSON.stringify(result.code)}; window.__rewritten=${result.rewrittenImports};</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__rewritten)).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#code")).toContainText("@aura3d/three-compat");
});
