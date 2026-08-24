import { createAuraText3DGeometry } from "@aura3d/engine";
import {
  Geometry,
  IndexBuffer,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  type RenderItem
} from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";

/**
 * AC-A4 — round ceremony text3D.
 *
 * "ROUND 1" / "ROUND 2" / "K.O." render as in-scene extruded glyph ceremony meshes through the
 * engine's `createAuraText3DGeometry` (bitmap-glyph extrusion — real geometry, not a DOM label).
 * Each phrase merges into ONE geometry, so a visible ceremony is a single extra draw call.
 *
 * This complements the DOM HUD; it never replaces it. The KO line lands while the existing
 * hit-stop freeze holds the fighters, so the poster shot reads as one beat.
 */

export const ROUND_CEREMONY_SUPPORTED_TEXTS = ["ROUND 1", "ROUND 2", "ROUND 3", "K.O.", "DRAW", "WIN"] as const;
export type RoundCeremonyText = (typeof ROUND_CEREMONY_SUPPORTED_TEXTS)[number];

/** Ceremony copy for a 1-based round index. */
export function roundCeremonyTextForRound(roundIndex: number): RoundCeremonyText {
  const clamped = Math.min(ROUND_CEREMONY_SUPPORTED_TEXTS.length - 3, Math.max(1, Math.round(roundIndex)));
  return clamped <= 2 ? (`ROUND ${clamped}` as RoundCeremonyText) : "ROUND 3";
}

/** Map a route callout to its ceremony phrase, or null when no ceremony should show. */
export function roundCeremonyTextForCallout(callout: string, roundIndex: number): RoundCeremonyText | null {
  if (callout === "KO") return "K.O.";
  if (callout === "WIN") return "WIN";
  if (callout === "DRAW") return "DRAW";
  // Round-intro window: the reset lock is the intro beat.
  if (callout === "FIGHT" && roundIndex >= 1) return null;
  return null;
}

function buildGlyphGeometry(text: string): Geometry {
  const built = createAuraText3DGeometry(text, { size: 0.42, depth: 0.09, letterSpacing: 0.05 });
  if (built.unsupportedCharacters.length > 0) {
    throw new Error(`Round ceremony text "${text}" has unsupported glyphs: ${built.unsupportedCharacters.join(", ")}`);
  }
  const spec = built.geometry;
  const vertices = new VertexBuffer(VertexFormat.P3N3, spec.positions.length);
  spec.positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", spec.normals?.[index] ?? [0, 0, 1]);
  });
  return new Geometry(vertices, new IndexBuffer(spec.indices, spec.positions.length), "triangles");
}

export interface RoundCeremony {
  /**
   * Render the ceremony for `text`, or nothing when null. `showSeconds` drives a deterministic
   * pop-in (instant under reduced motion); `elapsedSeconds` feeds a slow float so the poster frame
   * stays alive without any randomness.
   */
  collect(input: {
    readonly text: string | null;
    readonly showSeconds: number;
    readonly elapsedSeconds: number;
    readonly reducedMotion: boolean;
  }): RenderItem[];
}

export function createRoundCeremony(): RoundCeremony {
  const cache = new Map<string, Geometry>();
  const material = new UnlitMaterial({ name: "aura-clash-round-ceremony-glyphs", color: [1, 0.83, 0.24, 1] });
  const koMaterial = new UnlitMaterial({ name: "aura-clash-ko-ceremony-glyphs", color: [1, 0.22, 0.18, 1] });
  return {
    collect({ text, showSeconds, elapsedSeconds, reducedMotion }) {
      if (!text) return [];
      let geometry = cache.get(text);
      if (!geometry) {
        geometry = buildGlyphGeometry(text);
        cache.set(text, geometry);
      }
      // Deterministic pop-in over ~0.14s with a slight overshoot; instant under reduced motion.
      const t = reducedMotion ? 1 : Math.min(1, Math.max(0, showSeconds) / 0.14);
      const overshoot = 1 + Math.sin(Math.PI * Math.min(1, t)) * 0.08;
      const scale = (0.6 + 0.4 * t) * overshoot;
      const floatY = reducedMotion ? 0 : Math.sin(elapsedSeconds * 1.7) * 0.03;
      // Center the merged glyph block around x=0 by measuring the geometry bounds.
      const bounds = geometry.bounds;
      const centerX = ((bounds.min[0] + bounds.max[0]) / 2);
      return [{
        label: `aura-clash-ceremony:${text.replace(/[^A-Z0-9]/gi, "-")}`,
        geometry,
        material: text === "K.O." ? koMaterial : material,
        modelMatrix: composeMat4(
          [-centerX * scale, 2.32 + floatY, -0.12],
          quatFromEuler(0, 0, 0),
          [scale, scale, scale]
        ) as Mat4,
        includeInAutoFrame: false
      }];
    }
  };
}
