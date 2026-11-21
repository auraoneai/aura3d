/**
 * GU47 AO-W1 / WP-02: sculpted skyway dressing, all world-anchored and instanced. Segmented sodium aero-gate rings every 30 m
 * mark the sky lane's edges above the piers, a truss-braced interchange span crosses overhead every 600 m above the 24 m flight
 * ceiling, space-frame billboard trusses stand beside the deck every 210 m, cantilevered davit light poles line the shoulders,
 * and each sign gantry carries one SDF label.
 */
import { material, texture, type AuraCustomGeometrySpec, type AuraMaterialSpec, type AuraTextureRef } from "@aura3d/engine";
import { HAZE_FLOOR_Y } from "../art/ground";
import { APEX_PALETTE } from "../art/look";
import {
  buildBeaconRingSpec,
  buildBillboardFrameSpec,
  buildLightLampSpec,
  buildLightPoleSpec,
  buildSpanDeckSpec,
  buildSpanPierSpec
} from "../art/proceduralModels";

export const RING_STRIDE_Z = 30;
export const RING_ROWS = 14;
export const RING_X = 13.4;
export const RING_Y = 9.6;
export const RING_SIZE: readonly [number, number, number] = [2.4, 2.4, 0.12];

export const SPAN_STRIDE_Z = 600;
/** Spans visible from one behind to the far plane: at most two slots. */
export const SPAN_SLOTS = 2;
/** Above the 24 m flight ceiling (constants.ts CEILING) plus the car and a margin, so nothing ever clips through it. */
export const SPAN_DECK_Y = 29.5;
export const SPAN_DECK_SIZE: readonly [number, number, number] = [150, 1.8, 14];
export const SPAN_PIER_X = 52;
export const SPAN_PIER_SIZE: readonly [number, number, number] = [3.2, SPAN_DECK_Y - HAZE_FLOOR_Y, 3.2];

export const BILLBOARD_STRIDE_Z = 210;
export const BILLBOARD_SLOTS = 4;
export const BILLBOARD_X = 19.5;
export const BILLBOARD_Y = 9;
export const BILLBOARD_FRAME_SIZE: readonly [number, number, number] = [9.6, 4.6, 0.5];
export const BILLBOARD_FACE_SIZE: readonly [number, number, number] = [9, 4, 0.12];

/** Gantry label: on the left board's front face (render/gantry.ts board centre x -5.375, y 9.025, front z 0.33). */
export const GANTRY_LABEL_OFFSET: readonly [number, number, number] = [-5.4, 9.55, 0.36];
export const GANTRY_LABELS: readonly string[] = ["SKYWAY 9  CENTRAL", "EXIT 4B  HARBOUR", "SKYWAY 9  TOWERS", "EXIT 5  OLD TOWN", "SKYWAY 9  AIRPORT"];

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** World-anchored rows ahead of the player at world z `pz` (forward is -z), from one behind the camera. */
function rows(pz: number, stride: number, count: number): number[] {
  const base = Math.floor(pz / stride) * stride + stride;
  return Array.from({ length: count }, (_, i) => base - i * stride);
}

export function ringLayout(pz: number): Placement[] {
  const out: Placement[] = [];
  for (const z of rows(pz, RING_STRIDE_Z, RING_ROWS)) out.push({ x: -RING_X, y: RING_Y, z }, { x: RING_X, y: RING_Y, z });
  return out;
}

export function spanLayout(pz: number): { readonly decks: Placement[]; readonly piers: Placement[] } {
  const decks: Placement[] = [];
  const piers: Placement[] = [];
  for (const z of rows(pz, SPAN_STRIDE_Z, SPAN_SLOTS)) {
    decks.push({ x: 0, y: SPAN_DECK_Y, z });
    piers.push({ x: -SPAN_PIER_X, y: (SPAN_DECK_Y + HAZE_FLOOR_Y) / 2, z }, { x: SPAN_PIER_X, y: (SPAN_DECK_Y + HAZE_FLOOR_Y) / 2, z });
  }
  return { decks, piers };
}

export function billboardLayout(pz: number): Placement[] {
  return rows(pz, BILLBOARD_STRIDE_Z, BILLBOARD_SLOTS).map((z) => {
    const side = Math.round(z / BILLBOARD_STRIDE_Z) % 2 === 0 ? -1 : 1;
    return { x: side * BILLBOARD_X, y: BILLBOARD_Y, z };
  });
}

/** Procedural sculpted geometry specs for cantilevered light poles, aero beacon rings, viaduct spans & space-frame billboards. */
export function skywayDressingSpecs(): {
  readonly lightPole: AuraCustomGeometrySpec;
  readonly lightLamp: AuraCustomGeometrySpec;
  readonly beaconRing: AuraCustomGeometrySpec;
  readonly spanDeck: AuraCustomGeometrySpec;
  readonly spanPier: AuraCustomGeometrySpec;
  readonly billboardFrame: AuraCustomGeometrySpec;
} {
  return {
    lightPole: buildLightPoleSpec(),
    lightLamp: buildLightLampSpec(),
    beaconRing: buildBeaconRingSpec(RING_SIZE),
    spanDeck: buildSpanDeckSpec(SPAN_DECK_SIZE),
    spanPier: buildSpanPierSpec(SPAN_PIER_SIZE),
    billboardFrame: buildBillboardFrameSpec(BILLBOARD_FRAME_SIZE)
  };
}

let cachedBillboardTexture: AuraTextureRef | null = null;

/**
 * Crisp canvas-baked skyway route & sector signage texture for the roadside billboards (replaces the flat blank tan box).
 * Falls back to a deterministic RGBA8 pixel panel in headless Node environments without Canvas 2D.
 */
export function createBillboardSignageTexture(): AuraTextureRef {
  if (cachedBillboardTexture) return cachedBillboardTexture;
  const width = 512;
  const height = 256;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Deep slate-cobalt backing plate with sunset border frame
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#101729");
      grad.addColorStop(0.55, "#16223d");
      grad.addColorStop(1, "#1e273a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle architectural scanlines
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      for (let y = 0; y < height; y += 8) ctx.fillRect(0, y, width, 2);

      // Top tangerine sector header stripe
      ctx.fillStyle = APEX_PALETTE.tangerine;
      ctx.fillRect(14, 14, width - 28, 10);
      ctx.fillStyle = APEX_PALETTE.cyan;
      ctx.fillRect(14, height - 24, 180, 6);
      ctx.fillStyle = APEX_PALETTE.sodium;
      ctx.fillRect(206, height - 24, width - 220, 6);

      // Route badge box
      ctx.fillStyle = "rgba(31, 63, 168, 0.88)";
      ctx.fillRect(24, 42, 134, 86);
      ctx.strokeStyle = APEX_PALETTE.cyan;
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 42, 134, 86);
      ctx.fillStyle = "#eef5ff";
      ctx.font = '700 18px "DIN Pro", "National 2 Narrow", Arial, sans-serif';
      ctx.fillText("SKYWAY", 44, 72);
      ctx.fillStyle = APEX_PALETTE.tangerine;
      ctx.font = '700 46px "DIN Pro", "National 2 Narrow", Arial, sans-serif';
      ctx.fillText("09", 58, 118);

      // Main destination + lane guidance copy
      ctx.fillStyle = "#f4f7fc";
      ctx.font = '700 36px "National 2 Narrow", "DIN Pro", Arial, sans-serif';
      ctx.fillText("BAYSIDE EXPRESS", 178, 80);
      ctx.fillStyle = APEX_PALETTE.cyan;
      ctx.font = '600 22px "DIN Pro", Arial, sans-serif';
      ctx.fillText("SECTOR 04 · AIRLANE 24M CLEAR", 178, 114);

      // Divider rule + bottom telemetry strip
      ctx.fillStyle = "rgba(244, 246, 251, 0.22)";
      ctx.fillRect(24, 146, width - 48, 2);
      ctx.fillStyle = "#d5dfee";
      ctx.font = '600 21px "DIN Pro", Arial, sans-serif';
      ctx.fillText("HARBOUR BRIDGE  2.4 KM", 26, 184);
      ctx.fillStyle = APEX_PALETTE.sodium;
      ctx.fillText("EXIT 4B  >>>", 342, 184);

      // Right-edge directional chevrons
      ctx.strokeStyle = APEX_PALETTE.tangerine;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < 3; i++) {
        const cx = 36 + i * 26;
        ctx.beginPath();
        ctx.moveTo(cx, 200);
        ctx.lineTo(cx + 12, 212);
        ctx.lineTo(cx, 224);
        ctx.stroke();
      }
      ctx.fillStyle = "#9fb4c8";
      ctx.font = '600 16px "DIN Pro", Arial, sans-serif';
      ctx.fillText("TOWER CORRIDOR · EXPRESS LANES OPEN", 124, 218);

      cachedBillboardTexture = texture.canvas({ canvas, colorSpace: "srgb" });
      return cachedBillboardTexture;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const topBar = y >= 14 && y < 24;
    const botBar = y >= height - 24 && y < height - 18;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const badge = x >= 24 && x < 158 && y >= 42 && y < 128;
      const textBand = x >= 178 && x < 476 && ((y >= 54 && y < 80) || (y >= 96 && y < 114) || (y >= 166 && y < 186));
      if (topBar) {
        data[idx] = 255; data[idx + 1] = 138; data[idx + 2] = 61;
      } else if (botBar) {
        data[idx] = x < 200 ? 77 : 255; data[idx + 1] = x < 200 ? 240 : 176; data[idx + 2] = x < 200 ? 255 : 74;
      } else if (badge) {
        data[idx] = 31; data[idx + 1] = 63; data[idx + 2] = 168;
      } else if (textBand && ((x >> 3) % 3 !== 0)) {
        data[idx] = 232; data[idx + 1] = 240; data[idx + 2] = 252;
      } else {
        data[idx] = 20; data[idx + 1] = 30; data[idx + 2] = 52;
      }
      data[idx + 3] = 255;
    }
  }
  cachedBillboardTexture = texture.data({ data, width, height, format: "rgba8", colorSpace: "srgb" });
  return cachedBillboardTexture;
}

/** Illuminated billboard face material bound with route/sector signage (zero blank tan panels). */
export function billboardFaceMaterial(): AuraMaterialSpec {
  const signage = createBillboardSignageTexture();
  return material.pbr({
    color: "#e6edf7",
    texture: signage,
    emissive: "#fff4e6",
    emissiveMap: signage,
    emissiveIntensity: 0.82,
    roughness: 0.36,
    metalness: 0.06,
    practical: true
  });
}
