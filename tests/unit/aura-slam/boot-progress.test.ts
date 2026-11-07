import { describe, expect, it } from "vitest";
import { createBootProgress } from "../../../examples/aura-slam/shell/bootProgress";
import { labAppOptions } from "../../../examples/aura-slam/main";

function fakeDoc() {
  const classes = new Set<string>();
  const vars = new Map<string, string>();
  const attrs = new Map<string, string>();
  const nodes: Record<string, unknown> = {
    boot: { classList: { add: (c: string) => classes.add(c) } },
    "boot-sub": { dataset: {} as Record<string, string> },
    "boot-progress": {
      style: { setProperty: (k: string, v: string) => vars.set(k, v) },
      setAttribute: (k: string, v: string) => attrs.set(k, v)
    }
  };
  const doc = { getElementById: (id: string) => nodes[id] ?? null } as unknown as Document;
  return { doc, classes, vars, attrs };
}

describe("aura-slam boot progress (A1)", () => {
  it("is monotonic and drives the bar variable", () => {
    const { doc, vars } = fakeDoc();
    const p = createBootProgress(doc);
    p.set(0.5);
    p.set(0.2);
    expect(p.fraction).toBe(0.5);
    expect(vars.get("--aura3d-loading")).toBe("0.5");
  });

  it("lifts the splash only after the first frame settles, and always lifts on rejection", async () => {
    const a = fakeDoc();
    const p = createBootProgress(a.doc);
    let release!: () => void;
    const pending = p.reveal(() => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    expect(a.classes.has("done")).toBe(false);
    release();
    await pending;
    expect(a.classes.has("done")).toBe(true);
    expect(p.fraction).toBe(1);
    expect(a.attrs.get("data-complete")).toBe("true");

    const b = fakeDoc();
    await createBootProgress(b.doc).reveal(() => Promise.reject(new Error("x")));
    expect(b.classes.has("done")).toBe(true);
  });

  it("tolerates a page without the splash", async () => {
    const p = createBootProgress(undefined);
    p.set(0.4);
    await p.reveal();
    expect(p.fraction).toBe(1);
  });

  it("lab flags are off by default and map backend and gamut", () => {
    expect(labAppOptions("")).toEqual({});
    expect(labAppOptions("?backend=webgl2")).toEqual({});
    expect(labAppOptions("?backend=auto&gamut=p3")).toEqual({
      appOptions: { renderer: { backend: "auto", allowFallback: true }, output: { outputColorSpace: "display-p3" } }
    });
  });
});
