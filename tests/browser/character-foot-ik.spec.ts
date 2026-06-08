import { test, expect } from "@playwright/test";
import { createFootIkRig, createHeightFieldGround, type FootLegInput } from "../../packages/animation/src";

// Browser visual proof for T1.2 foot IK + foot-lock: a character walks across uneven ground; each
// foot is grounded to the terrain height under it and held in world space during stance (no foot
// sliding), releasing on lift. The solve runs in Node (the deterministic runtime), is rendered to a
// canvas, and the measured anti-slide telemetry is exposed on window.__FOOT_IK_PROOF__.

test("character foot IK grounds feet on uneven terrain without sliding", async ({ page }) => {
  // Ground rises toward +x (a ramp). Foot IK must drop each foot to the terrain under it.
  const ground = createHeightFieldGround((x) => ({ height: x * 0.25, normal: [-0.25, 1, 0] }));

  // Simulate a stride: the left foot plants (stance) for the first frames while the body advances,
  // then lifts (swing); the right foot mirrors it. During stance the planted world position must
  // not slide even though the source ankle drifts with the body.
  const FRAMES = 24;
  const rig = createFootIkRig({ legs: baseLegs(0), raycaster: ground });
  const frames: Array<{ frame: number; leftPlanted: readonly number[]; leftGrounded: boolean; hipOffset: number }> = [];
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const bodyX = frame * 0.04; // body advances forward
    // Left foot: stance for first half (stays near ground), swing for second half (lifts).
    const leftLift = frame < 12 ? 0 : Math.sin(((frame - 12) / 12) * Math.PI) * 0.18;
    const result = rig.solveFootPlacement({ legs: stridingLegs(bodyX, leftLift, ground) });
    frames.push({
      frame,
      leftPlanted: result.feet[0]!.sample.plantedFoot,
      leftGrounded: result.feet[0]!.sample.grounded,
      hipOffset: result.hipOffset
    });
  }

  // Anti-slide measurement: max horizontal movement of the left planted foot across contiguous
  // stance frames (should be ~0 because foot-lock holds the world position).
  let maxSlide = 0;
  let prev: { x: number; z: number } | undefined;
  let groundedFrames = 0;
  for (const f of frames) {
    if (f.leftGrounded) {
      groundedFrames += 1;
      const p = { x: f.leftPlanted[0]!, z: f.leftPlanted[2]! };
      if (prev) maxSlide = Math.max(maxSlide, Math.hypot(p.x - prev.x, p.z - prev.z));
      prev = p;
    } else {
      prev = undefined; // reset on lift (swing)
    }
  }
  const releasedOnLift = frames.slice(12).some((f) => !f.leftGrounded);

  await page.setContent(`
    <html><body style="margin:0;background:#070b12">
      <canvas id="foot" width="900" height="420"></canvas>
      <script>
        const frames = ${JSON.stringify(frames)};
        const maxSlide = ${maxSlide};
        const groundedFrames = ${groundedFrames};
        const releasedOnLift = ${releasedOnLift};
        const canvas = document.getElementById("foot");
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0a1020"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // ground ramp
        ctx.strokeStyle = "#2c5a4a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 360); ctx.lineTo(900, 240); ctx.stroke();
        // planted-foot markers across the stride
        frames.forEach((f, i) => {
          const x = 60 + i * 32;
          const y = 360 - f.leftPlanted[1] * 200 + f.hipOffset * 200;
          ctx.fillStyle = f.leftGrounded ? "#7fe0ff" : "#e0a36a";
          ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = "#eef4ff"; ctx.font = "16px system-ui";
        ctx.fillText("foot IK: grounded " + groundedFrames + " frames, max slide " + maxSlide.toFixed(4), 24, 34);
        window.__FOOT_IK_PROOF__ = {
          kind: "character-foot-ik",
          frames: frames.length,
          groundedFrames,
          maxSlideDuringStance: maxSlide,
          releasedOnLift,
          noSliding: maxSlide < 0.01
        };
      </script>
    </body></html>
  `);

  const proof = await page.evaluate(() => (window as unknown as { __FOOT_IK_PROOF__: { groundedFrames: number; maxSlideDuringStance: number; releasedOnLift: boolean; noSliding: boolean } }).__FOOT_IK_PROOF__);
  expect(proof.groundedFrames).toBeGreaterThan(6);
  expect(proof.releasedOnLift).toBe(true);
  expect(proof.noSliding, `expected no foot sliding during stance (maxSlide=${proof.maxSlideDuringStance})`).toBe(true);

  // Canvas actually rendered the foot markers (non-empty draw).
  const drawn = await page.evaluate(() => {
    const ctx = (document.getElementById("foot") as HTMLCanvasElement).getContext("2d")!;
    const data = ctx.getImageData(0, 0, 900, 420).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 120) lit += 1;
    return lit;
  });
  expect(drawn).toBeGreaterThan(500);
});

function baseLegs(bodyX: number): FootLegInput[] {
  return [
    { side: "left", hip: [bodyX - 0.18, 1, 0], knee: [bodyX - 0.18, 0.5, 0.05], ankle: [bodyX - 0.18, 0.035, 0], pole: [bodyX - 0.18, 0.5, 1] },
    { side: "right", hip: [bodyX + 0.18, 1, 0], knee: [bodyX + 0.18, 0.5, 0.05], ankle: [bodyX + 0.18, 0.035, 0], pole: [bodyX + 0.18, 0.5, 1] }
  ];
}

function stridingLegs(bodyX: number, leftLift: number, ground: ReturnType<typeof createHeightFieldGround>): FootLegInput[] {
  const ls = baseLegs(bodyX);
  const leftX = ls[0]!.ankle[0];
  const groundY = ground.raycastDown([leftX, leftLift + 1, 0], 4)?.point[1] ?? 0;
  ls[0] = { ...ls[0]!, ankle: [leftX, groundY + 0.035 + leftLift, 0] };
  return ls;
}
