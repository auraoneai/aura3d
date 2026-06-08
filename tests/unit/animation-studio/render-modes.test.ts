import { describe, expect, it } from "vitest";
import {
  forceOpaqueAcrossRenderItems,
  forceOpaqueIfGhost,
  isRenderMode,
  isRenderStyle,
  RENDER_MODES,
  renderModeNotes,
  resolveRenderMode,
  type GhostFixableMaterial
} from "../../../packages/create-aura3d/templates/animation-studio/src/render-modes";

/**
 * PRD Phase I2 — rendering honesty.
 *  - cel = in-shader material vs CPU post-pass is documented in ONE place (renderModeNotes),
 *  - render modes (toon/wireframe/storyboard) + styles are VERIFIED (no dead flag silently passes),
 *  - the BLEND/alpha ghost fix is GLOBAL (any render item) and is the ghosting visual-defect test.
 */

describe("I2 render-mode resolution + verification", () => {
  it("defaults to toon mode + cel style with cel applied", () => {
    const r = resolveRenderMode({ env: {} });
    expect(r.mode).toBe("toon");
    expect(r.style).toBe("toon");
    expect(r.celApplies).toBe(true);
  });

  it("resolves the three supported modes from AURA_RENDER_MODE", () => {
    for (const mode of RENDER_MODES) {
      expect(resolveRenderMode({ env: { AURA_RENDER_MODE: mode } }).mode).toBe(mode);
    }
  });

  it("PBR style disables cel even in toon mode; wireframe/storyboard never apply cel", () => {
    expect(resolveRenderMode({ env: { AURA_RENDER_STYLE: "pbr" } }).celApplies).toBe(false);
    expect(resolveRenderMode({ env: { AURA_RENDER_MODE: "wireframe" } }).celApplies).toBe(false);
    expect(resolveRenderMode({ env: { AURA_RENDER_MODE: "storyboard" } }).celApplies).toBe(false);
  });

  it("VERIFIES the request — an unknown (dead/legacy) mode or style THROWS, never silently falls back", () => {
    expect(() => resolveRenderMode({ env: { AURA_RENDER_MODE: "claymation" } })).toThrow(/Unknown AURA_RENDER_MODE/);
    expect(() => resolveRenderMode({ env: { AURA_RENDER_STYLE: "watercolor" } })).toThrow(/Unknown AURA_RENDER_STYLE/);
    expect(isRenderMode("toon")).toBe(true);
    expect(isRenderMode("claymation")).toBe(false);
    expect(isRenderStyle("pbr")).toBe(true);
    expect(isRenderStyle("nope")).toBe(false);
  });

  it("clarifies cel = in-shader material vs CPU post-pass in ONE canonical place", () => {
    const notes = renderModeNotes();
    expect(notes.inShaderCel).toMatch(/AnimationToonMaterial/);
    expect(notes.inShaderCel).toMatch(/GPU|geometry/i);
    expect(notes.cpuToonPostPass).toMatch(/captured pixels|2D filter/i);
    expect(notes.cpuToonPostPass).toMatch(/never touches geometry/i);
    // The two descriptions are DISTINCT (not the same mechanism described twice).
    expect(notes.inShaderCel).not.toEqual(notes.cpuToonPostPass);
  });
});

describe("I2 global BLEND/alpha ghost fix (ghosting visual defect)", () => {
  it("forces an opaque-but-BLENDed material opaque (the ghost defect is corrected)", () => {
    // The exact defect: a textured mesh with opacity 1 but alphaMode=BLEND → renders translucent.
    const ghost: GhostFixableMaterial = { opacity: 1, renderState: { blend: true, depthWrite: false, depthTest: false } };
    expect(forceOpaqueIfGhost(ghost)).toBe(true);
    expect(ghost.renderState).toEqual({ blend: false, depthWrite: true, depthTest: true });
  });

  it("LEAVES a genuinely translucent material (opacity < 1) alone", () => {
    const glass: GhostFixableMaterial = { opacity: 0.4, renderState: { blend: true, depthWrite: false, depthTest: true } };
    expect(forceOpaqueIfGhost(glass)).toBe(false);
    expect(glass.renderState?.blend).toBe(true); // still translucent on purpose
  });

  it("is a no-op for an already-opaque material", () => {
    const opaque: GhostFixableMaterial = { opacity: 1, renderState: { blend: false, depthWrite: true, depthTest: true } };
    expect(forceOpaqueIfGhost(opaque)).toBe(false);
  });

  it("applies GLOBALLY across mixed render items (characters, props, set dressing)", () => {
    // A scene's full render-item list: two ghost materials (a character mesh + a prop), one real
    // glass (translucent, must stay), one already-opaque set piece. The fix must touch BOTH ghosts.
    const items = [
      { material: { opacity: 1, renderState: { blend: true } } as GhostFixableMaterial }, // character ghost
      { material: { opacity: 1, renderState: { blend: true } } as GhostFixableMaterial }, // prop ghost
      { material: { opacity: 0.3, renderState: { blend: true } } as GhostFixableMaterial }, // real glass
      { material: { opacity: 1, renderState: { blend: false } } as GhostFixableMaterial } // opaque set piece
    ];
    const fixed = forceOpaqueAcrossRenderItems(items);
    expect(fixed).toBe(2);
    expect(items[0]!.material.renderState!.blend).toBe(false);
    expect(items[1]!.material.renderState!.blend).toBe(false);
    expect(items[2]!.material.renderState!.blend).toBe(true); // glass untouched
  });

  it("tolerates missing materials / render state without throwing", () => {
    expect(forceOpaqueIfGhost(undefined)).toBe(false);
    expect(forceOpaqueIfGhost(null)).toBe(false);
    expect(forceOpaqueIfGhost({})).toBe(false);
  });
});
