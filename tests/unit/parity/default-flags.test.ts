import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { batched, helpers, instances, lines, points, sprites } from "../../../packages/engine/src/agent-api/index.js";
import { nodeHandlers, resolveNodeHandler } from "../../../packages/engine/src/agent-api/compiler/handlers.js";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { QR_FLAG_STATES } from "../../../packages/rendering/src/contracts/flags.state.js";

// R-17 (docs/workflows/threejs-parity-gaps.md §12): what the A3D_PARITY_* lane
// flags actually gate at their SHIPPED defaults. A default app resolves flags
// with no options, env or URL, so this is what a user gets out of the box.

const shipped = resolveQrFlags({ env: {} });
// Flags explicitly off: the fail-closed behaviour a user gets if they revert a promotion.
const flagsOff = resolveQrFlags({ env: { A3D_PARITY_LINES: "0", A3D_PARITY_BATCHING: "0" } });

const failsClosed = (kind: string, node: unknown): void => {
  const handler = resolveNodeHandler(kind, flagsOff)!;
  expect(handler).toBeDefined();
  try {
    handler.compile(node as never, { flags: flagsOff } as never, {} as never);
    expect.unreachable("compile should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AuraRuntimeError);
    expect((error as AuraRuntimeError).code).toBe("parity-not-implemented");
  }
};

describe("parity flags at shipped defaults", () => {
  it("state table: BATCHING and LINES are default-on (they gate only new opt-in node kinds); the four inert flags stay `dev`", () => {
    for (const lane of ["BATCHING", "LINES"] as const) {
      const name = `A3D_PARITY_${lane}` as const;
      expect(QR_FLAG_STATES[name]).toBe("default-on");
      expect(shipped.on(name)).toBe(true);
    }
    for (const lane of ["SHADING", "GEOMETRY", "TEXTURES", "RUNTIME"] as const) {
      const name = `A3D_PARITY_${lane}` as const;
      expect(QR_FLAG_STATES[name]).toBe("dev");
      expect(shipped.on(name)).toBe(false);
    }
  });

  it("at shipped defaults line / points / sprite / batched resolve their real handlers", () => {
    for (const kind of ["line", "points", "sprite", "batched"]) {
      expect(resolveNodeHandler(kind, shipped)?.owner).toBe("prd11");
    }
  });

  it("line / points / sprite nodes fail closed when A3D_PARITY_LINES is turned off", () => {
    failsClosed("line", lines.line({ points: [[0, 0, 0], [1, 0, 0]] }).toJSON());
    failsClosed("points", points({ positions: [[0, 0, 0]] }).toJSON());
    failsClosed("sprite", sprites.sprite().toJSON());
  });

  it("helpers.* are line nodes, so they fail closed with the same flag off", () => {
    const node = helpers.axes().toJSON() as { kind?: string; children?: readonly { kind?: string }[] };
    const kinds = [node.kind, ...(node.children ?? []).map((c) => c.kind)];
    expect(kinds.some((k) => k === "line" || k === "group")).toBe(true);
    if (kinds.includes("line")) failsClosed("line", node.children?.find((c) => c.kind === "line") ?? node);
  });

  it("instances.mesh and batched.mesh compile to a `batched` node that fails closed when A3D_PARITY_BATCHING is turned off", () => {
    const mesh = instances.mesh("box", undefined, 4);
    expect(mesh.toJSON().kind).toBe("batched");
    failsClosed("batched", mesh.toJSON());
    const mixed = batched.mesh({ maxInstances: 4, maxVertices: 64, maxIndices: 64 });
    expect(mixed.toJSON().kind).toBe("batched");
    failsClosed("batched", mixed.toJSON());
  });

  it("each gated kind resolves its real handler once its flag is on", () => {
    const on = resolveQrFlags({ options: "parity.lines,parity.batching", env: {} });
    for (const kind of ["line", "points", "sprite", "batched"]) {
      expect(resolveNodeHandler(kind, on)?.owner).toBe("prd11");
    }
  });

  it("every other node kind is flag-independent: identical handler with all parity flags on or off", () => {
    const all = resolveQrFlags({ options: "parity.shading,parity.geometry,parity.textures,parity.batching,parity.lines,parity.runtime", env: {} });
    for (const kind of Object.keys(nodeHandlers)) {
      if (["line", "points", "sprite", "batched"].includes(kind)) continue;
      expect(resolveNodeHandler(kind, all)).toBe(resolveNodeHandler(kind, shipped));
    }
  });
});

const sourceRoots = ["packages/engine/src", "packages/rendering/src", "packages/assets/src", "packages/animation/src", "packages/audio/src"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("which parity flags are read by engine code", () => {
  const gate = /(?:flags?\.on|isOn|flagOn)\(\s*["'`](A3D_PARITY_[A-Z]+)["'`]|\bflag:\s*["'`](A3D_PARITY_[A-Z]+)["'`]|(?:L5|L6)_FLAG\s*=\s*["'`](A3D_PARITY_[A-Z]+)["'`]/g;
  const readBy = new Map<string, string[]>();
  for (const root of sourceRoots) {
    for (const file of sourceFiles(join(process.cwd(), root))) {
      if (file.endsWith("flags.state.ts") || file.endsWith("contracts/flags.ts") || file.endsWith("contracts/core.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(gate)) {
        const name = match[1] ?? match[2] ?? match[3]!;
        readBy.set(name, [...(readBy.get(name) ?? []), file.replace(`${process.cwd()}/`, "")]);
      }
    }
  }

  it("only BATCHING and LINES gate code; SHADING, GEOMETRY, TEXTURES and RUNTIME are read nowhere", () => {
    expect([...readBy.keys()].sort()).toEqual(["A3D_PARITY_BATCHING", "A3D_PARITY_LINES"]);
  });

  it("LINES is read only by the line/points/sprite compiler and the renderer's sprite guards; BATCHING by the batched node and the renderer's combined-draw path", () => {
    // 5.0 sprite validation reads LINES too: Renderer.ts assertSpriteFrameCamera
    // checks generated-sprite camera matrices only when LINES is on, and the
    // ForwardPass.ts clipped-sprite guard refuses a clipped sprite unless the
    // LINES-gated generated billboard path is active. Neither renders anything.
    expect([...new Set(readBy.get("A3D_PARITY_LINES"))].sort()).toEqual([
      "packages/engine/src/agent-api/compiler/lines.ts",
      "packages/rendering/src/ForwardPass.ts",
      "packages/rendering/src/Renderer.ts"
    ]);
    // 5.0 native combined draws: the batched node's packed rows are executed by
    // the renderer's multi-draw plan (ForwardPass.ts) and its BATCHING-gated
    // shader features (ParityBatchDraw.ts); all three require the flag on.
    expect([...new Set(readBy.get("A3D_PARITY_BATCHING"))].sort()).toEqual([
      "packages/engine/src/agent-api/nodes/batched.ts",
      "packages/rendering/src/ForwardPass.ts",
      "packages/rendering/src/batching/shaders/ParityBatchDraw.ts"
    ]);
  });
});
