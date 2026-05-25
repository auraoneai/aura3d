import type { RenderItem } from "@galileo3d/rendering";
import {
  bool,
  env,
  frame,
  item,
  lights,
  num,
  pushLineGroup,
  type GalleryState,
  type Resources,
  type SceneFrame
} from "./sceneBuilderPrimitives";
import { bounds, clamp, type Vec3 } from "./math";

export function buildReactorPostScene(r: Resources, time: number, state: GalleryState): SceneFrame {
  const items: RenderItem[] = [];
  const paused = bool(state.controls.paused);
  const debug = bool(state.controls.debug);
  const vignette = clamp(num(state.controls.vignette, 0.28), 0, 1);
  const t = paused ? 0 : time;
  const motionPhase = paused ? 0 : state.pulse * 0.42;

  for (let level = 0; level < 2; level += 1) {
    items.push(item(r, "cylinder", level === 0 ? "reactorCoreGlow" : "reactorTrace", [0, level * 0.28 - 0.22, 0], [0.92 + level * 0.2, 0.018, 0.92 + level * 0.2], [0, t * (0.52 + level * 0.1), 0], "energy ring"));
  }
  items.push(item(r, "sphere", "reactorCoreGlow", [0, 0.42 + Math.sin(t * 2) * 0.045, 0], [0.72, 0.72, 0.72], [t * 0.18, t * 0.46, 0], "reactor core"));

  for (let i = 0; i < 2; i += 1) {
    const a = motionPhase * (0.68 + i * 0.08) + i * Math.PI * 0.82;
    items.push(item(
      r,
      "lineX",
      i % 2 === 0 ? "reactorAmberGlass" : "reactorTrace",
      [Math.cos(a) * 0.66, 0.48 + Math.sin(t * 1.15 + i) * 0.1, Math.sin(a) * 0.66],
      [0.6, 1, 1],
      [0.14, -a, 0.28],
      "reactor visible sweep arm"
    ));
  }

  const pulseX = Math.sin(motionPhase * 1.9) * 1.25;
  const pulseY = 0.6 + Math.cos(motionPhase * 1.5) * 0.36;
  items.push(item(
    r,
    "cube",
    "reactorTrace",
    [pulseX, pulseY, 0.05],
    [0.22 + Math.abs(Math.sin(motionPhase * 2.4)) * 0.08, 0.08, 0.04],
    [0.32, motionPhase * 1.6, 0.48],
    "reactor visible pulse marker"
  ));

  if (debug) {
    items.push(item(
      r,
      "sphere",
      "amberGlow",
      [Math.sin(motionPhase * 2.2) * 1.75, 0.82 + Math.cos(motionPhase * 1.7) * 0.28, 1.85],
      [0.28, 0.28, 0.28],
      [0, motionPhase, 0],
      "reactor foreground scan puck"
    ));
  }

  for (let i = 0; i < 16; i += 1) {
    const a = i * Math.PI * 2 / 16;
    if (Math.sin(a) > 0.48) continue;
    const radius = 2.92 + (i % 3) * 0.14;
    items.push(item(r, "cube", i % 4 ? "darkSteel" : "reactorDimPanel", [Math.cos(a) * radius, -0.52 + (i % 4) * 0.2, Math.sin(a) * radius], [0.044, 0.3 + (i % 3) * 0.08, 0.044], [0, -a, 0], "reactor strut"));
  }
  for (let i = 0; i < 4; i += 1) {
    const x = -2.35 + i * 1.56;
    items.push(item(r, "cube", i % 2 ? "reactorPanelGlass" : "reactorDimPanel", [x, 1.14 + Math.sin(t + i) * 0.025, -3.82], [0.34, 0.18, 0.014], [0, 0, 0], "rear holographic panel"));
  }

  if (debug) {
    for (let i = 0; i < 24; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 4);
      const col = i % 4;
      const y = 0.15 + row * 0.42;
      const z = -2.65 + col * 1.65;
      items.push(item(
        r,
        "cube",
        i % 5 === 0 ? "white" : i % 3 === 0 ? "amberGlow" : "cyanGlow",
        [side * 4.25, y, z],
        [0.028, 0.16, 0.36],
        [0, side * Math.PI / 2, 0],
        "high-contrast command wall status strip"
      ));
    }
    for (let i = 0; i < 18; i += 1) {
      const x = -3.4 + i * 0.4;
      items.push(item(
        r,
        "cube",
        i % 4 === 0 ? "white" : "amberGlow",
        [x, 1.86 + Math.sin(time * 0.7 + i) * 0.04, -4.05],
        [0.11, 0.38, 0.026],
        [0.08, 0, 0],
        "reactor rear luminance analyzer"
      ));
    }
  }

  items.push(item(r, "cube", "reactorPanelGlass", [-2.05, 1.18, -4.18], [0.72, 0.74, 0.028], [0, 0, 0], "reactor luminous command wall"));
  items.push(item(r, "cube", "reactorDimPanel", [0, 1.26, -4.2], [0.52, 0.88, 0.028], [0, 0, 0], "reactor luminous command wall"));
  items.push(item(r, "cube", "reactorAmberGlass", [2.05, 1.18, -4.18], [0.72, 0.74, 0.028], [0, 0, 0], "reactor luminous command wall"));

  for (let ring = 0; ring < 1; ring += 1) {
    const radius = 1.92;
    for (let i = 0; i < 6; i += 1) {
      const a = i * Math.PI * 2 / 6 + 0.08;
      const next = a + Math.PI * 2 / 6;
      const mid = (a + next) * 0.5;
      const chord = Math.sin(Math.PI / 6) * radius * 2;
      items.push(item(
        r,
        "lineX",
        "reactorTrace",
        [Math.cos(mid) * radius, -0.42 + ring * 0.025, Math.sin(mid) * radius],
        [chord, 1, 1],
        [0, -mid, 0],
        "etched command floor circuit"
      ));
    }
  }

  addReactorPurposefulDetailLines(r, items);

  if (debug) {
    for (let row = 0; row < 9; row += 1) {
      const z = -3.8 + row * 0.95;
      items.push(item(r, "lineX", row % 2 ? "transparentCyan" : "wire", [0, -0.5, z], [7.2, 1, 1], [0, 0, 0], "illuminated command-floor bus"));
    }
    for (let col = 0; col < 11; col += 1) {
      const x = -4.2 + col * 0.84;
      items.push(item(r, "lineX", col % 2 ? "transparentCyan" : "wire", [x, -0.49, 0], [7.2, 1, 1], [0, Math.PI / 2, 0], "illuminated command-floor bus"));
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const a = i * 0.37 + t * 0.18;
    const radius = 1.4 + (i % 7) * 0.36;
    items.push(item(
      r,
      "lineX",
      i % 4 === 0 ? "reactorAmberGlass" : "reactorTrace",
      [Math.cos(a) * radius, 0.02 + (i % 5) * 0.11, Math.sin(a) * radius],
      [0.28 + (i % 4) * 0.08, 1, 1],
      [0.12, -a, Math.sin(a) * 0.22],
      "reactor scanline shard"
    ));
  }

  if (debug) {
    for (let i = 0; i < 18; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const y = -0.34 + (row % 7) * 0.18;
      const z = -3.5 + Math.floor(row / 7) * 1.18;
      items.push(item(
        r,
        "lineX",
        i % 5 === 0 ? "transparentAmber" : "wire",
        [side * (2.15 + (row % 3) * 0.34), y, z],
        [0.58 + (row % 4) * 0.16, 1, 1],
        [0, side * (Math.PI / 2 + 0.16), 0],
        "sidewall telemetry trace"
      ));
    }
    for (let i = 0; i < 18; i += 1) {
      const a = i * 0.69 + t * 0.24;
      const radius = 1.1 + (i % 6) * 0.5;
      const y = -0.18 + (i % 8) * 0.14;
      items.push(item(
        r,
        "cube",
        i % 4 === 0 ? "white" : i % 3 === 0 ? "amberGlow" : "cyanGlow",
        [Math.cos(a) * radius, y, Math.sin(a) * radius],
        [0.064, 0.064, 0.064],
        [t + i, a, t * 0.4],
        "high-contrast reactor telemetry voxel"
      ));
    }
    for (let i = 0; i < 14; i += 1) {
      const lane = i % 7;
      const band = Math.floor(i / 7);
      const x = -1.42 + lane * 0.42;
      const z = -2.55 + band * 1.95;
      const pulse = (time * 0.7 + lane * 0.11 + band * 0.17) % 1;
      items.push(item(
        r,
        "lineX",
        i % 6 === 0 ? "debug" : i % 4 === 0 ? "transparentAmber" : "wire",
        [x, -0.37 + pulse * 0.24, z],
        [0.18 + pulse * 0.42, 1, 1],
        [0.08, time * 0.18 + lane * 0.06, 0.12],
        "reactor low-density diagnostic trace"
      ));
    }
  }

  for (let i = 0; i < 4; i += 1) {
    const a = i * Math.PI * 2 / 8 + time * 0.28;
    items.push(item(
      r,
      "cube",
      i % 3 === 0 ? "reactorTrace" : "reactorCoreGlow",
      [Math.cos(a) * 0.86, 0.96 + Math.sin(i * 0.7) * 0.18, Math.sin(a) * 0.86],
      [0.026, 0.1, 0.026],
      [time, -a, time * 0.2],
      "reactor crown telemetry marker"
    ));
  }

  if (debug) {
    for (let i = 0; i < 16; i += 1) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const x = -2.2 + col * 0.62;
      const z = -1.58 + row * 1.05;
      const bright = (i + row) % 3 === 0;
      items.push(item(
        r,
        "cube",
        bright ? "white" : "darkSteel",
        [x, -0.46, z],
        [0.115, 0.018, 0.115],
        [0, 0.24 * Math.sin(time + i), 0],
        "reactor high-contrast floor telemetry tile"
      ));
    }
  }

  for (let i = 0; i < 4; i += 1) {
    const a = i * 0.61 + Math.sin(t * 0.22) * 0.08;
    const radius = 2.2 + (i % 5) * 0.34;
    items.push(item(r, "sphere", i % 3 ? "reactorCoreGlow" : "reactorAmberGlass", [Math.cos(a) * radius, 0.12 + (i % 4) * 0.16, Math.sin(a) * radius], [0.026, 0.026, 0.026], [0, 0, 0], "reactor telemetry mote"));
  }

  addParticleHalo(r, items, "reactorTrace", 3, t, 4.8, 2.5);

  return frame(items, bounds([-3.35, -0.96, -3.45], [3.35, 2.58, 2.85]), lights("reactor"), env("reactor"), {
    toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
    bloom: bool(state.controls.bloom, false) ? { threshold: 0.46, intensity: 0.22, radius: 2 } : false,
    colorGrade: { ...reactorGrade(String(state.controls.grade ?? "teal")), vignette, sharpening: 0.04 },
    filmGrain: false,
    fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 }
  }, ["reactor core", "raw/post comparison panels", "tone-map/color-grade/fxaa stack", "bounded bloom toggle", "scan rings"], [
    "Default reactor capture uses measured renderer tone mapping, color grade, vignette, and FXAA; bloom remains opt-in to avoid noisy halo artifacts.",
    "Depth-of-field and motion blur are not enabled as pass/fail features in this bounded route."
  ], ["Core", "Raw input", "Post stack", "Tone map", "Color grade", "FXAA", "Bloom opt-in"]);
}

function addReactorPurposefulDetailLines(r: Resources, items: RenderItem[]): void {
  const floorEtch: Vec3[] = [];
  const evidenceLines: Vec3[] = [];
  const floorY = -0.398;

  for (let row = 0; row < 31; row += 1) {
    const z = -2.42 + row * 0.16;
    pushSegment(floorEtch, [-3.0, floorY, z], [-1.28, floorY, z]);
    pushSegment(floorEtch, [1.28, floorY, z], [3.0, floorY, z]);
  }
  for (let col = 0; col < 25; col += 1) {
    const x = -2.86 + col * 0.238;
    pushSegment(floorEtch, [x, floorY + 0.002, -2.32], [x, floorY + 0.002, -1.36]);
    pushSegment(floorEtch, [x, floorY + 0.002, 0.78], [x, floorY + 0.002, 2.36]);
  }
  for (let bay = 0; bay < 4; bay += 1) {
    const x0 = -2.82 + bay * 1.88;
    const x1 = x0 + 1.24;
    const z0 = -0.95;
    const z1 = 0.62;
    pushSegment(floorEtch, [x0, floorY + 0.004, z0], [x1, floorY + 0.004, z0]);
    pushSegment(floorEtch, [x0, floorY + 0.004, z1], [x1, floorY + 0.004, z1]);
    pushSegment(floorEtch, [x0, floorY + 0.004, z0], [x0, floorY + 0.004, z1]);
    pushSegment(floorEtch, [x1, floorY + 0.004, z0], [x1, floorY + 0.004, z1]);
  }
  for (let accent = 0; accent < 32; accent += 1) {
    const x = -2.78 + accent * 0.2;
    const z = -1.18 + (accent % 7) * 0.52;
    pushSegment(floorEtch, [x, floorY + 0.006, z], [x + 0.22, floorY + 0.006, z + 0.16]);
  }
  for (let i = 0; i < 36; i += 1) {
    const a = i * Math.PI * 2 / 36;
    const inner = 1.08 + (i % 2) * 0.04;
    const outer = 1.45 + (i % 3) * 0.035;
    pushSegment(
      floorEtch,
      [Math.cos(a) * inner, floorY + 0.008, Math.sin(a) * inner],
      [Math.cos(a) * outer, floorY + 0.008, Math.sin(a) * outer]
    );
  }

  for (let panel = 0; panel < 3; panel += 1) {
    const cx = panel === 0 ? -2.08 : panel === 1 ? 0 : 2.08;
    const width = panel === 1 ? 0.74 : 0.92;
    const y0 = panel === 1 ? 0.62 : 0.58;
    for (let tick = 0; tick < 7; tick += 1) {
      const y = y0 + tick * 0.17;
      const span = width * (0.42 + (tick % 3) * 0.08);
      pushSegment(evidenceLines, [cx - span, y, -3.56], [cx + span, y, -3.56]);
    }
    for (let tick = 0; tick < 5; tick += 1) {
      const x = cx - width * 0.48 + tick * width * 0.24;
      pushSegment(evidenceLines, [x, y0 - 0.045, -3.555], [x, y0 + 1.06, -3.555]);
    }
  }
  for (let row = 0; row < 5; row += 1) {
    const y = 0.68 + row * 0.27;
    for (let col = 0; col < 11; col += 1) {
      const x = -2.58 + col * 0.52;
      const halfWidth = 0.09 + ((row + col) % 3) * 0.035;
      pushSegment(evidenceLines, [x - halfWidth, y, -3.535], [x + halfWidth, y, -3.535]);
    }
  }
  for (let lane = 0; lane < 8; lane += 1) {
    const x = -2.62 + lane * 0.75;
    pushSegment(evidenceLines, [x, -0.345, -1.08], [x + 0.34, -0.345, -0.72]);
    pushSegment(evidenceLines, [x + 0.14, -0.34, 1.02], [x + 0.48, -0.34, 1.38]);
  }

  pushLineGroup(r, items, floorEtch, "reactorEtchLine", "reactor purposeful floor etch batch");
  pushLineGroup(r, items, evidenceLines, "reactorEvidenceLine", "reactor postprocess evidence line batch");
}

function addParticleHalo(r: Resources, items: RenderItem[], material: string, count: number, time: number, radius: number, height: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.399 + time * 0.08;
    const y = (i / count - 0.5) * height;
    items.push(item(r, "sphere", material, [Math.cos(a) * radius * (0.35 + (i % 7) * 0.08), y, Math.sin(a) * radius * (0.35 + (i % 11) * 0.06)], [0.03, 0.03, 0.03], [0, 0, 0], "particle halo"));
  }
}

function pushSegment(target: Vec3[], start: Vec3, end: Vec3): void {
  target.push(start, end);
}

function reactorGrade(value: string) {
  if (value === "warm") return { contrast: 1.12, saturation: 1.05, temperature: 0.18 };
  if (value === "mono") return { contrast: 1.22, saturation: 0.42 };
  return { contrast: 1.18, saturation: 1.12, temperature: -0.02 };
}
