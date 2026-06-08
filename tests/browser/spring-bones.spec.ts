import { test, expect } from "@playwright/test";
import { createSpringChain, type Vec3 } from "../../packages/animation/src";

// Browser visual proof for T1.3 spring bones: a ponytail/accessory chain reacts to the character's
// motion — it lags as the root accelerates, then settles. The integration runs in Node (the
// deterministic runtime), every frame's chain is rendered to a canvas, and the measured swing/settle
// telemetry is exposed on window.__SPRING_BONES_PROOF__.

test("spring-bone chain reacts to character motion and settles", async ({ page }) => {
  const rest: Vec3[] = [
    [0, 2, 0],
    [0, 1.6, 0],
    [0, 1.2, 0],
    [0, 0.8, 0],
    [0, 0.4, 0]
  ];
  const chain = createSpringChain({ bones: rest, stiffness: 32, damping: 4, gravity: [0, -3, 0] });
  const dt = 1 / 60;

  const frames: Array<{ positions: number[][]; lag: number; energy: number }> = [];
  let maxLag = 0;
  // Phase 1: the character dashes sideways (root accelerates) -> the chain should lag.
  for (let i = 0; i < 40; i += 1) {
    const rootX = Math.min(1.2, i * 0.05);
    chain.integrate(dt, { position: [rootX, 2, 0] });
    const t = chain.telemetry();
    const lag = Math.abs(t.rootPosition[0] - t.tipPosition[0]);
    maxLag = Math.max(maxLag, lag);
    frames.push({ positions: chain.positions().map((p) => [p[0], p[1], p[2]]), lag, energy: t.kineticEnergy });
  }
  const energyDuringMotion = chain.telemetry().kineticEnergy;
  // Phase 2: the character stops -> the chain settles.
  for (let i = 0; i < 700; i += 1) {
    chain.integrate(dt, { position: [1.2, 2, 0] });
    const t = chain.telemetry();
    frames.push({ positions: chain.positions().map((p) => [p[0], p[1], p[2]]), lag: Math.abs(t.rootPosition[0] - t.tipPosition[0]), energy: t.kineticEnergy });
  }
  const settledEnergy = chain.telemetry().kineticEnergy;

  await page.setContent(`
    <html><body style="margin:0;background:#06080f">
      <canvas id="spring" width="860" height="460"></canvas>
      <script>
        const frames = ${JSON.stringify(frames)};
        const maxLag = ${maxLag};
        const energyDuringMotion = ${energyDuringMotion};
        const settledEnergy = ${settledEnergy};
        const canvas = document.getElementById("spring");
        const ctx = canvas.getContext("2d");
        const project = (p) => [430 + p[0] * 180, 420 - p[1] * 170];
        let f = 0;
        function draw() {
          ctx.fillStyle = "#070b14"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          const frame = frames[Math.min(f, frames.length - 1)];
          ctx.strokeStyle = "#9b7bff"; ctx.lineWidth = 6; ctx.lineCap = "round";
          ctx.beginPath();
          frame.positions.forEach((p, i) => {
            const [x, y] = project(p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
          frame.positions.forEach((p) => { const [x, y] = project(p); ctx.fillStyle = "#d9ccff"; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); });
          ctx.fillStyle = "#eef"; ctx.font = "15px system-ui";
          ctx.fillText("spring bones: max lag " + maxLag.toFixed(3) + ", settles " + (settledEnergy < 1e-2), 20, 30);
          f += 4;
          if (f < frames.length) requestAnimationFrame(draw);
        }
        draw();
        window.__SPRING_BONES_PROOF__ = {
          kind: "spring-bones",
          frames: frames.length,
          maxLag,
          reactedToMotion: maxLag > 0.05,
          energyDuringMotion,
          settledEnergy,
          settled: settledEnergy < 1e-2
        };
      </script>
    </body></html>
  `);

  const proof = await page.evaluate(() => (window as unknown as { __SPRING_BONES_PROOF__: { maxLag: number; reactedToMotion: boolean; settled: boolean; energyDuringMotion: number; settledEnergy: number } }).__SPRING_BONES_PROOF__);
  expect(proof.reactedToMotion, `chain should lag under root motion (maxLag=${proof.maxLag})`).toBe(true);
  expect(proof.settled, `chain should settle after motion stops (energy=${proof.settledEnergy})`).toBe(true);
  expect(proof.settledEnergy).toBeLessThan(proof.energyDuringMotion);

  // Wait a few frames then confirm the canvas actually rendered the chain.
  await page.waitForTimeout(200);
  const drawn = await page.evaluate(() => {
    const ctx = (document.getElementById("spring") as HTMLCanvasElement).getContext("2d")!;
    const data = ctx.getImageData(0, 0, 860, 460).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 120) lit += 1;
    return lit;
  });
  expect(drawn).toBeGreaterThan(500);
});
