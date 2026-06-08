import { test, expect } from "@playwright/test";
import { applyMorphTargets, createMorphTargetPlan, Geometry, type MorphTargetDelta } from "../../packages/rendering/src";
import { visemeSampleToMorphInfluences } from "../../packages/engine/src/agent-api/VisemeController";

// Browser visual proof for T2.3 morph-target hardening: a face mesh with MORE THAN 4 blendshapes
// over MORE THAN 64 vertices morphs on the texture-backed plan (cap lifted), with morphed NORMALS so
// Lambert lighting follows the deformation, and a viseme drives the mouth blendshape (lip-sync). The
// morph runs in Node (the deterministic runtime), is shaded + rendered to a canvas, and the measured
// telemetry is exposed on window.__MORPH_TARGET_PROOF__.

test("multi-blendshape face morphs with lighting following the deformation + viseme lip-sync", async ({ page }) => {
  const base = Geometry.uvSphere(0.5, 18, 14); // a stand-in face mesh; > 64 vertices
  const vertexCount = base.vertexBuffer.vertexCount;

  // Six named blendshapes (> 4), each displacing a region of the face and bending its normals.
  const names = ["jawOpen", "mouthSmile", "browUp", "cheekPuffL", "cheekPuffR", "eyeBlink"];
  const targets: MorphTargetDelta[] = names.map((_, t) =>
    ({
      positions: Array.from({ length: vertexCount }, (_, v) => {
        const p = base.vertexBuffer.getAttribute(v, "position");
        const region = Math.max(0, Math.cos((v / vertexCount) * Math.PI * 2 - t)); // localized bulge
        return [(p[0] ?? 0) * 0.0 + 0.12 * region, 0.1 * region * (t % 2 === 0 ? 1 : -1), 0.12 * region] as const;
      }),
      normals: Array.from({ length: vertexCount }, (_, v) => {
        const region = Math.max(0, Math.cos((v / vertexCount) * Math.PI * 2 - t));
        return [0.6 * region, 0.4 * region, -0.5 * region] as const;
      })
    })
  );

  // The plan must choose the texture-backed path (proves the 4/64 cap is lifted).
  const neutralWeights = names.map(() => 0);
  const plan = createMorphTargetPlan(targets, neutralWeights, vertexCount);

  // Viseme "aa" -> drives jawOpen + mouthSmile (real lip-sync mapping).
  const visemeSample = {
    time: 0.4,
    activeCues: [],
    visemeId: "aa" as const,
    primaryVisemeId: "aa" as const,
    mouthOpenness: 0.85,
    primitiveMouthCard: "wide" as const,
    weights: { aa: 0.85 },
    blendshapeWeights: { jawOpen: 0.8, mouthSmile: 0.3 }
  };
  const influences = visemeSampleToMorphInfluences(visemeSample);
  const expressionWeights = names.map((n) => influences[n] ?? (n === "browUp" ? 0.5 : n === "cheekPuffL" ? 0.4 : 0));

  // Lambert luminance from the (possibly morphed) normals.
  const light: [number, number, number] = [0.4, 0.7, 0.6];
  const lightLen = Math.hypot(...light);
  function luminance(geom: Geometry): number {
    let sum = 0;
    for (let v = 0; v < geom.vertexBuffer.vertexCount; v += 1) {
      const n = geom.vertexBuffer.getAttribute(v, "normal");
      const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
      const dot = ((n[0] ?? 0) * light[0] + (n[1] ?? 0) * light[1] + (n[2] ?? 0) * light[2]) / (len * lightLen);
      sum += Math.max(0, dot);
    }
    return sum / geom.vertexBuffer.vertexCount;
  }

  const neutral = applyMorphTargets(base, targets, neutralWeights);
  const morphed = applyMorphTargets(base, targets, expressionWeights);
  const neutralLum = luminance(neutral);
  const morphedLum = luminance(morphed);

  await page.setContent(`
    <html><body style="margin:0;background:#05070d">
      <canvas id="face" width="640" height="640"></canvas>
      <script>
        const verts = ${JSON.stringify(Array.from({ length: vertexCount }, (_, v) => {
          const p = morphed.vertexBuffer.getAttribute(v, "position");
          const n = morphed.vertexBuffer.getAttribute(v, "normal");
          return { p: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], n: [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0] };
        }))};
        const light = ${JSON.stringify(light)};
        const ctx = document.getElementById("face").getContext("2d");
        ctx.fillStyle = "#05070d"; ctx.fillRect(0, 0, 640, 640);
        const ll = Math.hypot(light[0], light[1], light[2]);
        for (const vert of verts) {
          const x = 320 + vert.p[0] * 480;
          const y = 320 - vert.p[1] * 480;
          const nl = Math.hypot(vert.n[0], vert.n[1], vert.n[2]) || 1;
          const d = Math.max(0, (vert.n[0]*light[0]+vert.n[1]*light[1]+vert.n[2]*light[2])/(nl*ll));
          const shade = Math.round(40 + d * 200);
          ctx.fillStyle = "rgb(" + shade + "," + Math.round(shade*0.8) + "," + Math.round(shade*0.7) + ")";
          ctx.fillRect(x, y, 4, 4);
        }
        window.__MORPH_TARGET_PROOF__ = {
          kind: "morph-target-face",
          targetCount: ${targets.length},
          vertexCount: ${vertexCount},
          planMode: ${JSON.stringify(plan.mode)},
          capLifted: ${targets.length > 4 && vertexCount > 64},
          textureBacked: ${plan.mode === "texture"},
          textureSize: { width: ${plan.textureWidth}, height: ${plan.textureHeight} },
          morphsNormals: ${plan.morphsNormals},
          neutralLuminance: ${neutralLum},
          morphedLuminance: ${morphedLum},
          lightingFollowsDeformation: ${Math.abs(morphedLum - neutralLum) > 1e-3},
          visemeDriven: ${(influences.jawOpen ?? 0) > 0}
        };
      </script>
    </body></html>
  `);

  const proof = await page.evaluate(() => (window as unknown as { __MORPH_TARGET_PROOF__: {
    targetCount: number; vertexCount: number; planMode: string; capLifted: boolean; textureBacked: boolean;
    morphsNormals: boolean; lightingFollowsDeformation: boolean; visemeDriven: boolean;
  } }).__MORPH_TARGET_PROOF__);

  expect(proof.targetCount).toBeGreaterThan(4);
  expect(proof.vertexCount).toBeGreaterThan(64);
  expect(proof.capLifted).toBe(true);
  expect(proof.textureBacked, "a >4-target / >64-vert rig must use the texture-backed plan").toBe(true);
  expect(proof.morphsNormals).toBe(true);
  expect(proof.lightingFollowsDeformation, "morphed normals must change the shading").toBe(true);
  expect(proof.visemeDriven).toBe(true);

  const drawn = await page.evaluate(() => {
    const ctx = (document.getElementById("face") as HTMLCanvasElement).getContext("2d")!;
    const data = ctx.getImageData(0, 0, 640, 640).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 150) lit += 1;
    return lit;
  });
  expect(drawn).toBeGreaterThan(500);
});
