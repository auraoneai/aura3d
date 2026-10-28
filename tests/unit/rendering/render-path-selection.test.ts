import { describe, expect, it } from "vitest";
import { effects, lights, material, primitives, scene } from "@aura3d/engine";
import { isQualityMode, resolveRenderPath, withDirectPath, qrCoreOutputOn } from "@aura3d/rendering";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { renderPathBlockers, resolveAppRenderPath, wantsPreservedDrawingBuffer } from "../../../packages/engine/src/agent-api/app/renderPath";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

const coreOn = (): QrFlags => resolveQrFlags({});
const plain = () => scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).toJSON();

describe("render path selection (beat-three.js L-P1)", () => {
  it("is a pure decision: auto without blockers is direct, with blockers is hdr-msaa", () => {
    expect(resolveRenderPath({ quality: undefined, blockers: [] })).toMatchObject({ path: "direct", quality: "auto" });
    const blocked = resolveRenderPath({ quality: "auto", blockers: ['effect "bloom"'] });
    expect(blocked.path).toBe("hdr-msaa");
    expect(blocked.reason).toContain('effect "bloom"');
  });

  it("production and cinematic always use the HDR target; safe-basic always direct", () => {
    expect(resolveRenderPath({ quality: "production", blockers: [] }).path).toBe("hdr-msaa");
    expect(resolveRenderPath({ quality: "cinematic", blockers: [] }).path).toBe("hdr-msaa");
    expect(resolveRenderPath({ quality: "safe-basic", blockers: ["effect \"bloom\""] }).path).toBe("direct");
  });

  it("validates quality names", () => {
    expect(isQualityMode("auto")).toBe(true);
    expect(isQualityMode("ultra")).toBe(false);
  });

  it("withDirectPath pins the output route off and leaves every other flag alone", () => {
    const flags = coreOn();
    expect(qrCoreOutputOn(flags)).toBe(true);
    const direct = withDirectPath(flags);
    expect(qrCoreOutputOn(direct)).toBe(false);
    expect(direct.on("A3D_QR_CORE")).toBe(true);
    expect(direct.on("A3D_QR_LIGHTING")).toBe(flags.on("A3D_QR_LIGHTING"));
  });

  it("a plain scene takes the direct path under auto and keeps the app flags otherwise", () => {
    const flags = coreOn();
    const chosen = resolveAppRenderPath(plain(), { scene: plain() }, flags);
    expect(chosen.report.path).toBe("direct");
    expect(qrCoreOutputOn(chosen.flags)).toBe(false);
    expect(qrCoreOutputOn(flags)).toBe(true);
  });

  it("quality: production reproduces the previous pipeline (same flags object, HDR path)", () => {
    const flags = coreOn();
    const chosen = resolveAppRenderPath(plain(), { scene: plain(), quality: "production" }, flags);
    expect(chosen.report).toMatchObject({ path: "hdr-msaa", quality: "production" });
    expect(chosen.flags).toBe(flags);
  });

  it("the deprecated renderer.qualityProfile does not pin the pipeline", () => {
    const flags = coreOn();
    const chosen = resolveAppRenderPath(plain(), { scene: plain(), renderer: { qualityProfile: "production" } }, flags);
    expect(chosen.report).toMatchObject({ path: "direct", quality: "auto" });
  });

  it("scenes that author post-processing, output control, transmission or custom shaders keep the HDR target", () => {
    const withBloom = scene().add(primitives.box()).add(effects.bloom({ intensity: 0.4 })).toJSON();
    expect(renderPathBlockers(withBloom, { scene: withBloom })).toContain('effect "bloom"');
    expect(resolveAppRenderPath(withBloom, { scene: withBloom }, coreOn()).report.path).toBe("hdr-msaa");

    const glass = scene().add(primitives.sphere({ material: material.pbr({ color: "#fff", transmission: 0.8 }) })).toJSON();
    expect(renderPathBlockers(glass, { scene: glass })).toContain("transmission material");

    expect(renderPathBlockers(plain(), { scene: plain(), output: { toneMapping: "aces" } })).toEqual(["output options (tone mapping, exposure, dithering) are authored"]);
  });

  it("fog alone does not need the HDR target", () => {
    const fogged = scene().add(primitives.box()).add(effects.fog({ density: 0.1 })).toJSON();
    expect(renderPathBlockers(fogged, { scene: fogged })).toEqual([]);
  });

  it("an explicit A3D_QR_CORE_OUTPUT wins over the heuristic", () => {
    const on = resolveQrFlags({ options: { A3D_QR_CORE_OUTPUT: true } });
    const chosen = resolveAppRenderPath(plain(), { scene: plain() }, on);
    expect(chosen.report.path).toBe("hdr-msaa");
    expect(chosen.flags).toBe(on);
    const off = resolveQrFlags({ options: { A3D_QR_CORE_OUTPUT: false } });
    expect(resolveAppRenderPath(plain(), { scene: plain() }, off).report.path).toBe("direct");
  });

  it("an invalid quality name throws instead of silently running auto", () => {
    expect(() => resolveAppRenderPath(plain(), { scene: plain(), quality: "ultra" as never }, coreOn())).toThrow(/QUALITY_OPTION_INVALID/);
  });

  it("preserveDrawingBuffer is false unless asked or in capture/evidence mode", () => {
    expect(wantsPreservedDrawingBuffer({}, "")).toBe(false);
    expect(wantsPreservedDrawingBuffer({}, "?foo=1")).toBe(false);
    expect(wantsPreservedDrawingBuffer({}, "?capture=1")).toBe(true);
    expect(wantsPreservedDrawingBuffer({}, "?qa=1")).toBe(true);
    expect(wantsPreservedDrawingBuffer({}, "?capture=0")).toBe(false);
    expect(wantsPreservedDrawingBuffer({ preserveDrawingBuffer: true }, "")).toBe(true);
    expect(wantsPreservedDrawingBuffer({ preserveDrawingBuffer: false }, "?capture=1")).toBe(false);
  });
});
