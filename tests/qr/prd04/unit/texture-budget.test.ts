/**
 * TextureBudget (PRD-04 §7.3, P1-7): power-of-2 downscale under
 * maxDimension (4096² → 2048² at the Medium tier), KTX2 chains dropping
 * leading mips, and the per-device ledger keeping bytes ≤ maxBytes with
 * largest-first top-mip loss.
 */
import { describe, expect, it } from "vitest";
import {
  applyTextureBudget,
  resetTextureBudgetLedger,
  textureBudgetReport
} from "../../../../packages/rendering/src/textures/TextureBudget";
import type { TextureDescriptor } from "../../../../packages/rendering/src/Texture";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

const MEDIUM = { maxDimension: 2048, maxBytes: 512 * 1024 * 1024 } as const;

function rgba8(width: number, height: number, label: string): TextureDescriptor {
  return { width, height, format: "rgba8", label, data: new Uint8Array(width * height * 4) };
}

function ktx2Chain(base: number, levels: number, label: string): TextureDescriptor {
  const mips = [];
  for (let i = 0; i < levels; i++) {
    const w = Math.max(4, base >> i);
    const h = Math.max(4, base >> i);
    // bc7-rgba-unorm: 16 bytes per 4x4 block
    mips.push({ width: w, height: h, data: new Uint8Array((w / 4) * (h / 4) * 16) });
  }
  return { width: base, height: base, format: "bc7-rgba-unorm", label, mipLevels: mips };
}

describe("applyTextureBudget — maxDimension", () => {
  it("downscales uncompressed 4096² rgba8 to 2048² under the Medium policy", () => {
    const device = new MockRenderDevice();
    resetTextureBudgetLedger(device);
    const out = applyTextureBudget(rgba8(4096, 4096, "albedo"), MEDIUM, device);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
    expect(out.width).toBe(2048);
    expect(out.mipLevels?.[0].width).toBe(2048);
  });

  it("drops leading mip levels on a 5-level KTX2 4096² chain (starts at level 1)", () => {
    const device = new MockRenderDevice();
    resetTextureBudgetLedger(device);
    const out = applyTextureBudget(ktx2Chain(4096, 5, "albedo-ktx2"), MEDIUM, device);
    expect(out.width).toBe(2048);
    expect(out.mipLevels).toHaveLength(4);
    expect(out.mipLevels?.[0].width).toBe(2048);
  });
});

describe("applyTextureBudget — maxBytes ledger", () => {
  it("300 MiB of inputs under 256 MiB: largest lose top mips first, ledger ≤ 256 MiB", () => {
    const device = new MockRenderDevice();
    resetTextureBudgetLedger(device);
    const policy = { maxBytes: 256 * 1024 * 1024, maxDimension: 4096 };
    const MiB = 1024 * 1024;
    // five 60 MiB textures (mip chains: 48 MiB base + 12 MiB of mips)
    for (let i = 0; i < 5; i++) {
      const base = 48 * MiB;
      applyTextureBudget(
        {
          width: 4096,
          height: 4096,
          format: "rgba8",
          label: `tex-${i}`,
          mipLevels: [
            { width: 4096, height: 4096, data: new Uint8Array(base) },
            { width: 2048, height: 2048, data: new Uint8Array(base / 4) }
          ]
        },
        policy,
        device
      );
    }
    const report = textureBudgetReport(device);
    expect(report.textureBytes).toBeLessThanOrEqual(256 * MiB);
    // largest entries dropped their top mip first
    expect(report.downscaled.length).toBeGreaterThanOrEqual(1);
    expect(report.downscaled[0].from).toBe(60 * MiB);
    expect(report.downscaled[0].to).toBe(12 * MiB);
  });

  it("ledgers are per-device (WeakMap) and reported via textureBudgetReport", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    resetTextureBudgetLedger(a);
    resetTextureBudgetLedger(b);
    applyTextureBudget(rgba8(1024, 1024, "only-a"), { maxBytes: 1 << 30 }, a);
    expect(textureBudgetReport(a).textureBytes).toBe(1024 * 1024 * 4);
    expect(textureBudgetReport(b).textureBytes).toBe(0);
  });
});
