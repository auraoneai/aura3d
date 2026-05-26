import { test, expect } from "@playwright/test";
import { AnimationClipCompat, AnimationMixerCompat, MorphTargetMixerCompat, SkeletonCompat, SkinnedMeshCompat } from "../../packages/three-compat/src";
import { createThreeCompatAnimationDiagnostics } from "../../packages/animation/src";

test("ThreeCompat animation browser proof renders skinned and morphed state", async ({ page }) => {
  const clip = new AnimationClipCompat("walk", 2, [{ target: "hips", property: "position.z", times: [0, 2], values: [0, 2] }]);
  const mixer = new AnimationMixerCompat();
  const action = mixer.clipAction(clip).play();
  mixer.update(0.75);
  const skeleton = new SkeletonCompat([{ name: "hips", parentIndex: -1 }, { name: "leg-l", parentIndex: 0 }, { name: "leg-r", parentIndex: 0 }]);
  const skinned = new SkinnedMeshCompat(skeleton);
  const morphs = new MorphTargetMixerCompat();
  morphs.setWeight("jaw-open", 0.55);
  morphs.setWeight("brow", 0.3);
  const diagnostics = createThreeCompatAnimationDiagnostics(mixer, skinned, morphs);

  await page.setContent(`
    <html>
      <body style="margin:0;background:#080a0f">
        <canvas id="animation" width="960" height="560"></canvas>
        <script>
          const diagnostics = ${JSON.stringify(diagnostics)};
          const actionTime = ${action.time};
          const canvas = document.getElementById("animation");
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0b111a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < diagnostics.loadedAnimatedAssets; i++) {
            const x = 90 + i * 150;
            const y = 160 + Math.sin(actionTime + i) * 22;
            ctx.strokeStyle = "#8bd2ff";
            ctx.lineWidth = 8;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 92); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y + 92); ctx.lineTo(x - 34, y + 150); ctx.moveTo(x, y + 92); ctx.lineTo(x + 34, y + 150); ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y - 26, 28 + diagnostics.morphTargetCount * 3, 0, Math.PI * 2); ctx.fillStyle = "#dca96a"; ctx.fill();
          }
          ctx.fillStyle = "#f0f5ff";
          ctx.font = "16px system-ui";
          ctx.fillText("loaded animated assets: " + diagnostics.loadedAnimatedAssets, 34, 42);
          ctx.fillText("bones: " + diagnostics.skinnedBoneCount + " morphs: " + diagnostics.morphTargetCount, 34, 70);
          window.__a3dAnimatedAssets = diagnostics.loadedAnimatedAssets;
          window.__a3dMorphTargets = diagnostics.morphTargetCount;
        </script>
      </body>
    </html>
  `);

  await expect.poll(async () => page.evaluate(() => window.__a3dAnimatedAssets)).toBeGreaterThanOrEqual(5);
  await expect.poll(async () => page.evaluate(() => window.__a3dMorphTargets)).toBeGreaterThanOrEqual(2);
  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 25 || data[index + 1] > 25 || data[index + 2] > 25) lit++;
    }
    return lit;
  });
  expect(litPixels).toBeGreaterThan(40000);
});
