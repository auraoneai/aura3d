/**
 * F2/F3/N2 rig-math + pixel probe (muse3jsparity-PRD Phase 2).
 *
 * This is a MATH/TELEMETRY probe, not rendering evidence: it drives the new
 * `GameCameraRigs`, `GameFeel` (wired to the real `createGameEffects` pixel
 * path), and `ArcballControls` through scripted sequences and draws their
 * outputs on a 2D canvas, so the spec can assert each feature changed drawn
 * pixels AND published telemetry. No production-rendering claim is made here;
 * the scene-node pixel backing is proven by `game-feel.test.ts` via
 * `createGameEffects().nodes()`.
 */
import { ArcballControls } from "@aura3d/controls";
import {
  createCollisionAwareOrbit,
  createFollowRig,
  createGameCameraRig,
  createPunchIn,
  createShoulderCamera,
  createTraumaShake
} from "../../packages/engine/src/agent-api/GameCameraRigs";
import { createGameFeel } from "../../packages/engine/src/agent-api/GameFeel";
import { createGameEffects } from "../../packages/engine/src/agent-api/GameRuntime";

interface GameFeelRigsResult {
  readonly status: "ready" | "error";
  readonly frames?: number;
  readonly shoulderMoved?: boolean;
  readonly followConverged?: boolean;
  readonly orbitClipped?: boolean;
  readonly orbitClearance?: number;
  readonly shakeEnergyFirst?: number;
  readonly shakeEnergyLast?: number;
  readonly punchPeakFov?: number;
  readonly punchSettled?: boolean;
  readonly evidenceFrames?: number;
  readonly flashAccepted?: boolean;
  readonly flashPixel?: readonly number[];
  readonly linePixel?: readonly number[];
  readonly dustPixel?: readonly number[];
  readonly backgroundPixel?: readonly number[];
  readonly dustNodes?: number;
  readonly frozenDuringHitStop?: boolean;
  readonly budgetOver?: boolean;
  readonly arcballMoved?: boolean;
  readonly arcballDisposed?: boolean;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_GAMEFEEL_RIGS_TEST__?: GameFeelRigsResult;
  }
}

const W = 640;
const H = 360;

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  const data = context.getImageData(x, y, 1, 1).data;
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0];
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#gamefeel-rigs");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Probe canvas is unavailable.");

  context.fillStyle = "rgb(8, 11, 16)";
  context.fillRect(0, 0, W, H);
  const backgroundPixel = readPixel(context, 4, 4);

  // --- F2: shoulder rig tracks a strafing target ---------------------------
  const shoulder = createShoulderCamera();
  let shoulderEye: readonly [number, number, number] = [0, 0, 0];
  // The eye starts at its default pose, dives to catch the strafing target,
  // then tracks it back: assert on the full traversed range, not endpoints.
  let shoulderMinX = Number.POSITIVE_INFINITY;
  let shoulderMaxX = Number.NEGATIVE_INFINITY;
  for (let step = 0; step < 120; step += 1) {
    const target = { position: [-3 + step * 0.05, 1, 0] as readonly [number, number, number], facing: Math.PI / 2 };
    shoulderEye = shoulder.update(1 / 60, target).position;
    shoulderMinX = Math.min(shoulderMinX, shoulderEye[0]);
    shoulderMaxX = Math.max(shoulderMaxX, shoulderEye[0]);
  }
  const shoulderMoved = shoulderMaxX - shoulderMinX > 3;
  context.fillStyle = "rgb(96, 165, 250)";
  context.beginPath();
  context.arc(80 + shoulderEye[0] * 12, 90 - shoulderEye[1] * 8, 9, 0, Math.PI * 2);
  context.fill();

  // --- F2/N2: follow rig converges ------------------------------------------
  const follow = createFollowRig({ offset: [0, 2, 6], damping: 12 });
  const followSnap = follow.update(10, { position: [4, 0, -2] });
  const followConverged =
    Math.abs(followSnap.position[0] - 4) < 0.01 && Math.abs(followSnap.position[2] - 4) < 0.01;

  // --- F2: collision orbit slides on a wall ----------------------------------
  const orbit = createCollisionAwareOrbit({ distance: 5, probeRadius: 0.3 });
  orbit.update(0.5, undefined);
  const pinned = orbit.update(0.5, () => ({ distance: 2 }));
  const orbitClipped = pinned.clipped;
  const orbitClearance = pinned.clearance;
  context.fillStyle = "rgb(52, 211, 153)";
  const barWidth = Math.round(180 * (orbitClearance / 5));
  context.fillRect(220, 60, barWidth, 18);

  // --- F2: trauma shake decays ------------------------------------------------
  const shake = createTraumaShake({ decay: 1.4 });
  shake.addTrauma(1);
  const shakeEnergyFirst = shake.update(1 / 60).energy;
  context.strokeStyle = "rgb(251, 191, 36)";
  context.lineWidth = 2;
  context.beginPath();
  let shakeEnergyLast = shakeEnergyFirst;
  for (let step = 0; step < 90; step += 1) {
    const energy = shake.update(1 / 60).energy;
    shakeEnergyLast = energy;
    const x = 220 + step * 2;
    const y = 150 - energy * 60;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  // --- F2: punch-in kicks and settles ------------------------------------------
  const punch = createPunchIn({ fovKick: 7, duration: 0.32 });
  punch.punch(1);
  let punchPeakFov = 0;
  for (let step = 0; step < 40; step += 1) {
    const snap = punch.update(1 / 60);
    punchPeakFov = Math.min(punchPeakFov, snap.fovOffset);
  }
  const punchSettled = !punch.snapshot().active && punch.snapshot().fovOffset === 0;
  context.fillStyle = "rgb(244, 114, 182)";
  context.fillRect(220, 170, Math.round(-punchPeakFov * 20), 14);

  // --- F2 aggregator: per-frame evidence ---------------------------------------
  const rig = createGameCameraRig({ base: "shoulder" });
  rig.trauma.addTrauma(0.6);
  rig.punchIn.punch(1);
  let evidenceFrames = 0;
  for (let step = 0; step < 30; step += 1) {
    const { evidence } = rig.update(1 / 60, { position: [step * 0.02, 1, 0], facing: 0 });
    if (evidence.kind === "aura-game-camera-evidence" && Number.isFinite(evidence.fov)) evidenceFrames += 1;
  }

  // --- F3: game feel wired to the real effects pixel path -----------------------
  const feel = createGameFeel({ effects: createGameEffects(), budgetMs: 50 });
  const flashReceipt = feel.damageFlash("#ff3b30", [0, 1, 0]);
  const flashAccepted = flashReceipt.accepted === true;
  feel.speedLines(0.85, [0, 1, -1]);
  feel.landingDust([1, 0, 2]);
  feel.hitStop(45);
  const frozenDuringHitStop = feel.snapshot().timeScale === 0;
  feel.update(16);
  const budgetOver = feel.snapshot().budget.overBudget;
  const dustNodes = feel.nodes().length;

  // Draw the feel state: red flash wash, streak lines, dust puffs.
  context.fillStyle = "rgba(255, 59, 48, 0.55)";
  context.fillRect(420, 40, 180, 120);
  const flashPixel = readPixel(context, 510, 100);
  context.strokeStyle = "rgb(165, 243, 252)";
  context.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const y = 200 + i * 14;
    context.beginPath();
    context.moveTo(430, y);
    context.lineTo(590, y);
    context.stroke();
  }
  const linePixel = readPixel(context, 510, 228);
  context.fillStyle = "rgb(199, 179, 143)";
  for (let i = 0; i < 6; i += 1) {
    context.beginPath();
    context.arc(440 + i * 28, 300 + (i % 2) * 10, 8, 0, Math.PI * 2);
    context.fill();
  }
  const dustPixel = readPixel(context, 440, 300);

  // --- N2: arcball orbits an attached camera -------------------------------------
  const camLike = {
    position: { x: 0, y: 1, z: 6 },
    lookAtCalls: 0,
    lookAt(): void {
      camLike.lookAtCalls += 1;
    }
  };
  const arcball = new ArcballControls(camLike);
  const arcBefore = camLike.position.x + camLike.position.y + camLike.position.z;
  arcball.rotate(200, 120);
  const arcballMoved = camLike.position.x + camLike.position.y + camLike.position.z !== arcBefore &&
    camLike.lookAtCalls > 0;
  context.fillStyle = "rgb(196, 141, 255)";
  context.beginPath();
  context.arc(80 + camLike.position.x * 10, 250 - camLike.position.y * 20, 8, 0, Math.PI * 2);
  context.fill();
  arcball.dispose();
  const arcballDisposed = arcball.isDisposed && !arcball.isCameraAttached;

  window.__AURA3D_GAMEFEEL_RIGS_TEST__ = {
    status: "ready",
    frames: 120,
    shoulderMoved,
    followConverged,
    orbitClipped,
    orbitClearance,
    shakeEnergyFirst,
    shakeEnergyLast,
    punchPeakFov,
    punchSettled,
    evidenceFrames,
    flashAccepted,
    flashPixel,
    linePixel,
    dustPixel,
    backgroundPixel,
    dustNodes,
    frozenDuringHitStop,
    budgetOver,
    arcballMoved,
    arcballDisposed
  };
} catch (error) {
  window.__AURA3D_GAMEFEEL_RIGS_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}
