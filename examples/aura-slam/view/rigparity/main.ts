/**
 * Render-parity harness for the M-POSE rig. One athlete is posed twice per case: once by the REAL original adapter code
 * (the generated module extracted from tests/fixtures/aura-slam-original/adapter/main.ts) and once by the native port; both frames are
 * captured through the same app, camera and lights and compared pixel by pixel. Remote runs only.
 */
import { camera, createAuraApp, effects, game, lights, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { createOriginalRig } from "../__generated__/originalRig.js";
import { buildAthleteNodes, resolveAthleteRig, updateAthleteRig, type AthleteAppearance, type AthleteRigHandles } from "../athleteRig";
import { pose, type PoseActor, type PoseMatchState } from "../pose";

type Win = Window & { __RIG_PARITY__?: unknown; __RIG_PARITY_ERROR__?: string };

const APPEARANCES: Array<AthleteAppearance | undefined> = [undefined, { shirt: "#aa2222", pants: "#223344", skin: "#8a5a3c", shoes: "#eeeeee", racket: "#112233" }];
const resolve = (appearance: unknown): AthleteAppearance | undefined => APPEARANCES[(appearance as number | undefined) ?? 0];
const original = createOriginalRig({ game, material, window: { TennisAppearance: { resolve } } });

const base = {
  moveBlend: 0, stride: 0, vx: 0, vy: 0, splitStep: 0, strokeContactAge: 0.17, swingAge: 0, strokeConnected: false, swing: 0,
  stroke: "forehand", strokeContactZ: 0.5, slideRemaining: 0, slidePoseStatic: false, serveMotion: 0, serveContactPoint: null
};
interface Case { name: string; side: "player" | "ai"; actor: Record<string, unknown>; phase?: string; moon?: boolean; appearance?: number; serveAttempt?: unknown }
const CASES: Case[] = [
  { name: "ready", side: "player", actor: {} },
  { name: "shuffle", side: "player", actor: { moveBlend: 0.3, stride: 1.4, vx: 0.5 } },
  { name: "run-forward", side: "player", actor: { moveBlend: 1, stride: 2.2, vy: -1 } },
  { name: "run-diagonal-ai", side: "ai", actor: { moveBlend: 1, stride: 3.7, vx: 0.8, vy: 0.6 } },
  { name: "split-step", side: "player", actor: { splitStep: 0.11 } },
  { name: "slide", side: "player", actor: { moveBlend: 1, vx: 1, slideRemaining: 0.2, slidePoseStatic: true } },
  { name: "forehand-load", side: "player", actor: { swing: 0.25, swingAge: 0.06, stroke: "forehand" } },
  { name: "forehand-contact", side: "player", actor: { swing: 0.2, swingAge: 0.17, stroke: "forehand", strokeConnected: true } },
  { name: "forehand-follow", side: "ai", actor: { swing: 0.12, swingAge: 0.3, stroke: "forehand", strokeConnected: true } },
  { name: "backhand-contact", side: "player", actor: { swing: 0.2, swingAge: 0.17, stroke: "backhand", strokeConnected: true } },
  { name: "forehand-volley", side: "player", actor: { swing: 0.2, swingAge: 0.12, stroke: "forehand-volley" } },
  { name: "backhand-volley-ai", side: "ai", actor: { swing: 0.2, swingAge: 0.12, stroke: "backhand-volley" } },
  { name: "smash", side: "player", actor: { swing: 0.25, swingAge: 0.17, stroke: "smash", strokeContactZ: 1.1 } },
  { name: "serve-toss", side: "player", actor: {}, phase: "serveToss" },
  {
    name: "serve-windup", side: "player", actor: { serveContactPoint: [0.2, 2.3, -0.1] }, phase: "serveToss",
    serveAttempt: { server: "player", number: 1, tossAt: 0, swingAt: 0.1, contactAt: 0.6, aim: { x: 0, y: 0 }, power: false }
  },
  { name: "serve-motion", side: "player", actor: { serveMotion: 0.2, serveContactPoint: [0.2, 2.3, -0.1] } },
  { name: "moon-run", side: "player", actor: { moveBlend: 1, stride: 1, vy: -1 }, moon: true },
  { name: "custom-appearance", side: "ai", actor: { moveBlend: 0.4, stride: 2 }, appearance: 1 }
];

const POSE_STATE_TIME = 4.2;
const NEUTRAL_KEYS: Array<keyof AthleteRigHandles> = [
  "torso", "collar", "hips", "head", "hairCap", "visorBrim", "apolloHelmet", "apolloPack", "leftUpperLeg", "leftLowerLeg",
  "leftKnee", "leftShoe", "rightUpperLeg", "rightLowerLeg", "rightKnee", "rightShoe", "leftUpperArm", "leftLowerArm",
  "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "racketHandle", "racketThroatLeft", "racketThroatRight",
  "racketHoop", "racketStrings", "shadowDisc"
];

async function boot(): Promise<void> {
  const noShadow = new URLSearchParams(location.search).get("shadow") === "0";
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  canvas.width = 640;
  canvas.height = 360;
  const s = scene()
    .background("#0d2230")
    .camera(camera.perspective({ fov: 32, near: 0.1, far: 80, position: [2.2, 1.7, 4.2], target: [0, 0.95, 0] }))
    .add(lights.ambient({ color: "#dce8f2", intensity: 0.62 }))
    .add(lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 0.72 }))
    .add(lights.directional({ color: "#fff6e5", intensity: 1.95, position: [14, 24, 12], shadow: !noShadow }))
    .add(effects.bloom({ intensity: 0.14, threshold: 0.86, radius: 0.45 }))
    .add(effects.vignette({ intensity: 0.18, smoothness: 0.65 }))
    .add(primitives.plane({ name: "ground", size: [20, 1, 20], material: material.pbr({ color: "#2b678e", roughness: 0.9 }) }).position(0, -0.01, 0))
    .addMany(buildAthleteNodes("player", true));
  const app: AuraApp = createAuraApp(canvas, {
    scene: s,
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    // Fixed tier on purpose: the parity harness must render the same on every runner. Object form, no RENDERER_QUALITY_STRING warning.
    renderer: { quality: { tier: "high" } },
    qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] }
  } as never);
  await app.ready();
  const rig = resolveAthleteRig(app, "player");

  const hide = (): void => {
    for (const k of NEUTRAL_KEYS) rig[k].setPosition(0, -50, 0).setScale([0.0001, 0.0001, 0.0001]).setVisible(false);
  };
  const capture = async (): Promise<Uint8ClampedArray> => {
    app.step(1 / 60);
    app.step(1 / 60);
    const url = canvas.toDataURL("image/png");
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("decode failed")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  };
  const inputsFor = (c: Case): { actor: PoseActor; state: PoseMatchState } => ({
    actor: { ...base, side: c.side, ...c.actor } as unknown as PoseActor,
    state: { phase: c.phase ?? "rally", time: POSE_STATE_TIME, server: c.side, serveAttempt: c.serveAttempt ?? null } as unknown as PoseMatchState
  });
  const compare = async (index: number): Promise<{ name: string; width: number; height: number; differing: number; maxDelta: number; litPixels: number; darker: number; lighter: number }> => {
    const c = CASES[index]!;
    const { actor, state } = inputsFor(c);
    const p = pose(actor, state);
    const isPlayer = c.side === "player";
    const view = { x: 0.1, y: 0.2, end: isPlayer ? 1 : -1, appearance: c.appearance ?? 0 };
    hide();
    const baseline = await capture();
    hide();
    original.updateAthleteRig(rig, view, p, isPlayer, Boolean(c.moon), { lastKey: "" });
    const a = await capture();
    hide();
    updateAthleteRig(rig, view, p, isPlayer, Boolean(c.moon), { lastKey: "" }, resolve);
    const b = await capture();
    let differing = 0, maxDelta = 0, lit = 0, darker = 0, lighter = 0;
    // pixels that differ from the empty-scene baseline = the athlete's footprint (must be non-trivial)
    for (let i = 0; i < a.length; i += 4) {
      let d = 0;
      for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[i + k]! - b[i + k]!));
      if (d > 0) differing++;
      if (d > maxDelta) maxDelta = d;
      let fromBase = 0;
      for (let k = 0; k < 3; k++) fromBase = Math.max(fromBase, Math.abs(a[i + k]! - baseline[i + k]!));
      if (fromBase > 8) lit++;
      const lumaA = a[i]! * 0.3 + a[i + 1]! * 0.59 + a[i + 2]! * 0.11;
      const lumaB = baseline[i]! * 0.3 + baseline[i + 1]! * 0.59 + baseline[i + 2]! * 0.11;
      if (lumaA < lumaB - 8) darker++;
      else if (lumaA > lumaB + 8) lighter++;
    }
    return { name: c.name, width: canvas.width, height: canvas.height, differing, maxDelta, litPixels: lit, darker, lighter };
  };
  (window as Win).__RIG_PARITY__ = { ready: true, count: CASES.length, names: CASES.map((c) => c.name), compare };
}

boot().catch((error) => {
  (window as Win).__RIG_PARITY_ERROR__ = String(error?.stack ?? error);
});
