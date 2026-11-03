import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultFormatRegistry, FormatRegistry } from "../../../packages/assets/src/FormatRegistry";
import { loadRenderableAsset } from "../../../packages/assets/src/loadRenderableAsset";
import { createMD2FormatAdapter, type MD2Asset } from "../../../packages/assets/src/loaders/AnimationFormatLoaders";

afterEach(() => vi.unstubAllGlobals());

const fixtureUrl = "https://assets.test/triangle.md2";
const expectedDiagnostics = [
  { code: "MD2_NORMAL_TABLE", message: "Source normal indices are retained; sampled normals are generated from triangle geometry." },
  { code: "MD2_SOURCE_CONVENTION", message: "Source axes and units are retained; skin paths must be resolved by the caller." }
];
const expectedWarnings = expectedDiagnostics.map(({ code, message }) => `${code}: ${message}`);

/** One independently encoded triangle and frame, with no skins or GL commands. */
function triangleMD2(): ArrayBuffer {
  const headerSize = 68;
  const uvOffset = headerSize;
  const triangleOffset = uvOffset + 3 * 4;
  const frameOffset = triangleOffset + 12;
  const frameSize = 40 + 3 * 4;
  const endOffset = frameOffset + frameSize;
  const bytes = new Uint8Array(endOffset);
  const view = new DataView(bytes.buffer);
  const header = [
    0x32504449, 8, 16, 16, frameSize, // IDP2, version, skin dimensions, frame size
    0, 3, 3, 1, 0, 1, // skins, vertices, UVs, triangles, GL commands, frames
    headerSize, uvOffset, triangleOffset, frameOffset, endOffset, endOffset
  ];
  header.forEach((value, index) => view.setInt32(index * 4, value, true));

  [[0, 0], [16, 0], [0, 16]].forEach(([u, v], index) => {
    view.setInt16(uvOffset + index * 4, u!, true);
    view.setInt16(uvOffset + index * 4 + 2, v!, true);
  });
  [0, 1, 2].forEach((index) => {
    view.setUint16(triangleOffset + index * 2, index, true);
    view.setUint16(triangleOffset + 6 + index * 2, index, true);
    view.setFloat32(frameOffset + index * 4, 1, true); // unit scale; translation stays zero
  });
  bytes.set(new TextEncoder().encode("frame0"), frameOffset + 24);
  bytes.set([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], frameOffset + 40);
  return bytes.buffer;
}

function expectWarningsInOrder(warnings: readonly string[]): void {
  expect(warnings).toEqual(expect.arrayContaining(expectedWarnings));
  expect(warnings.indexOf(expectedWarnings[0]!)).toBeLessThan(warnings.indexOf(expectedWarnings[1]!));
}

describe("MD2 adapter diagnostics", () => {
  it("requires explicit registration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(createDefaultFormatRegistry().list()).not.toContain("md2");
    await expect(loadRenderableAsset(fixtureUrl)).rejects.toThrow(/No native format adapter/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes parser warnings on the lease and loaded asset before building a scene", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== fixtureUrl) throw new Error(`Unexpected asset request: ${String(input)}`);
      return new Response(triangleMD2());
    });
    vi.stubGlobal("fetch", fetchMock);

    const registry = new FormatRegistry();
    const adapter = createMD2FormatAdapter();
    const buildScene = vi.fn(adapter.buildRenderableScene!);
    registry.register({ ...adapter, buildRenderableScene: buildScene });
    const loaded = await loadRenderableAsset(fixtureUrl, {
      formatRegistry: registry,
      formatMetadata: { version: "8" }
    });
    try {
      expect(loaded.kind).toBe("native-format");
      expect(loaded.selectedFormat).toBe("md2");
      const lease = loaded.format;
      expect(lease).toBeDefined();
      if (!lease) throw new Error("MD2 format lease was not returned");
      expect((lease.asset as MD2Asset).diagnostics).toEqual(expect.arrayContaining(expectedDiagnostics));
      expectWarningsInOrder(lease.warnings);
      expectWarningsInOrder(loaded.warnings);
      expect(buildScene).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lease.disposed).toBe(false);
      expect(loaded.dispose).toBeTypeOf("function");
      await loaded.dispose!();
      expect(lease.disposed).toBe(true);
      expect(buildScene).not.toHaveBeenCalled();
      await lease.dispose();
      await loaded.dispose!();
    } finally {
      await loaded.dispose?.();
    }
  });
});
