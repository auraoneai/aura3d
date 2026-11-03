import { afterEach, describe, expect, it, vi } from "vitest";
import { installEvidenceChannel } from "../../../packages/game/src/evidence/channel";

type FakeWindow = Record<string, unknown> & {
  __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
  __AURA3D_EVIDENCE_OPT_IN__?: boolean;
};

function channel(win: FakeWindow, id: string, owner: string, aliases: readonly string[] = []) {
  return installEvidenceChannel({
    win,
    id,
    builtins: { owner: () => owner },
    legacyGlobals: aliases
  });
}

function owner(value: unknown): string {
  return (value as { sections: { owner: string } }).sections.owner;
}

afterEach(() => vi.restoreAllMocks());

describe("evidence channel ownership", () => {
  it("keeps the newer duplicate id and alias when the older owner disposes", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const first = channel(win, "same", "first", ["__SHARED__"]);
    const second = channel(win, "same", "second", ["__SHARED__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    expect(owner(registry.same)).toBe("second");
    expect(win.__SHARED__).toBe(registry.same);
    first.dispose();
    first.dispose();
    expect(owner(registry.same)).toBe("second");
    expect(win.__SHARED__).toBe(registry.same);
    second.dispose();
    expect(Object.hasOwn(registry, "same")).toBe(false);
    expect(Object.hasOwn(win, "__SHARED__")).toBe(false);
  });

  it("restores the earlier live owner when the newest duplicate id disposes", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const first = channel(win, "same", "first", ["__SHARED__"]);
    const second = channel(win, "same", "second", ["__SHARED__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    second.dispose();
    expect(owner(registry.same)).toBe("first");
    expect(win.__SHARED__).toBe(registry.same);
    second.dispose();
    expect(owner(registry.same)).toBe("first");
    first.dispose();
    expect(Object.hasOwn(registry, "same")).toBe(false);
    expect(Object.hasOwn(win, "__SHARED__")).toBe(false);
  });

  it("preserves shared aliases across games with distinct ids", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const first = channel(win, "first", "first", ["__SHARED__"]);
    const second = channel(win, "second", "second", ["__SHARED__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    first.dispose();
    expect(owner(registry.second)).toBe("second");
    expect(win.__SHARED__).toBe(registry.second);
    second.dispose();
    expect(Object.hasOwn(win, "__SHARED__")).toBe(false);
  });

  it("restores the previous live alias without removing either distinct registry entry", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const first = channel(win, "first", "first", ["__SHARED__"]);
    const second = channel(win, "second", "second", ["__SHARED__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    second.dispose();
    expect(owner(registry.first)).toBe("first");
    expect(win.__SHARED__).toBe(registry.first);
    expect(Object.hasOwn(registry, "second")).toBe(false);
    first.dispose();
  });

  it("routes assignments through the alias owner even when another game reuses the id", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const first = channel(win, "same", "first", ["__FIRST__"]);
    const second = channel(win, "same", "second", ["__SECOND__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    win.__FIRST__ = { score: 17 };
    expect(win.__FIRST__).toMatchObject({ score: 17 });
    expect(registry.same).not.toHaveProperty("score");
    expect(win.__SECOND__).toBe(registry.same);
    second.dispose();
    expect(registry.same).toMatchObject({ score: 17 });
    expect(win.__FIRST__).toBe(registry.same);
    first.dispose();
  });

  it("keeps lazy loaders and route snapshots independent while owners overlap", async () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const firstLoader = vi.fn(async () => ({ route: () => "first-route" }));
    const secondLoader = vi.fn(async () => ({ route: () => "second-route" }));
    const first = installEvidenceChannel({
      win, id: "same", builtins: { owner: () => "first" },
      loader: firstLoader, legacyGlobals: ["__FIRST__"]
    });
    const second = installEvidenceChannel({
      win, id: "same", builtins: { owner: () => "second" },
      loader: secondLoader, legacyGlobals: ["__SECOND__"]
    });
    const registry = win.__AURA3D_GAME_EVIDENCE__!;

    expect(firstLoader).not.toHaveBeenCalled();
    expect(secondLoader).not.toHaveBeenCalled();
    expect(owner(registry.same)).toBe("second");
    expect(secondLoader).toHaveBeenCalledOnce();
    expect(firstLoader).not.toHaveBeenCalled();
    expect(owner(win.__FIRST__)).toBe("first");
    expect(firstLoader).toHaveBeenCalledOnce();
    await Promise.resolve();
    const secondSnapshot = registry.same as { sections: { route: string } };
    expect(secondSnapshot.sections.route).toBe("second-route");
    second.dispose();
    const restored = registry.same as { sections: { route: string } };
    expect(restored.sections.route).toBe("first-route");
    first.dispose();
    await Promise.resolve();
    expect(Object.hasOwn(registry, "same")).toBe(false);
  });

  it("skips disposed owners when restoring a shared id and alias", () => {
    const orders = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    for (const order of orders) {
      const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
      const labels = ["first", "second", "third"];
      const handles = labels.map((label) => channel(win, "same", label, ["__SHARED__"]));
      const registry = win.__AURA3D_GAME_EVIDENCE__!;
      const active = new Set([0, 1, 2]);
      for (const index of order) {
        handles[index]!.dispose();
        active.delete(index);
        const latest = [...active].at(-1);
        if (latest === undefined) {
          expect(Object.hasOwn(registry, "same"), `id after ${order}`).toBe(false);
          expect(Object.hasOwn(win, "__SHARED__"), `alias after ${order}`).toBe(false);
        } else {
          expect(owner(registry.same), `id after ${order}`).toBe(labels[latest]);
          expect(win.__SHARED__, `alias after ${order}`).toBe(registry.same);
        }
      }
    }
  });

  it("preserves descriptors that another owner replaces directly", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const installed = channel(win, "same", "first", ["__SHARED__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;
    const replacement = { external: true };
    Object.defineProperty(registry, "same", { configurable: true, value: replacement });
    Object.defineProperty(win, "__SHARED__", { configurable: true, value: replacement });

    installed.dispose();
    expect(registry.same).toBe(replacement);
    expect(win.__SHARED__).toBe(replacement);
  });

  it("restores pre-existing registry and alias property descriptors", () => {
    const registry: Record<string, unknown> = {};
    const original = { external: true };
    Object.defineProperty(registry, "same", {
      configurable: true, enumerable: false, writable: false, value: original
    });
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true, __AURA3D_GAME_EVIDENCE__: registry };
    Object.defineProperty(win, "__SHARED__", {
      configurable: true, enumerable: true, get: () => original
    });
    const registryDescriptor = Object.getOwnPropertyDescriptor(registry, "same");
    const aliasDescriptor = Object.getOwnPropertyDescriptor(win, "__SHARED__");
    const installed = channel(win, "same", "first", ["__SHARED__", "__SHARED__"]);

    installed.dispose();
    expect(Object.getOwnPropertyDescriptor(registry, "same")).toEqual(registryDescriptor);
    expect(Object.getOwnPropertyDescriptor(win, "__SHARED__")).toEqual(aliasDescriptor);
  });

  it("rolls back prior installations if a legacy alias cannot be defined", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const existing = channel(win, "same", "existing", ["__EXISTING__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;
    Object.defineProperty(win, "__LOCKED__", { configurable: false, value: "locked" });

    expect(() => channel(win, "same", "new", ["__TEMP__", "__LOCKED__"])).toThrow();
    expect(owner(registry.same)).toBe("existing");
    expect(win.__EXISTING__).toBe(registry.same);
    expect(Object.hasOwn(win, "__TEMP__")).toBe(false);
    existing.dispose();
  });

  it.each([
    ["__AURA3D_GAME_EVIDENCE__", 'EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME_EVIDENCE__" is reserved for the evidence channel.'],
    ["__AURA3D_EVIDENCE_OPT_IN__", 'EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_EVIDENCE_OPT_IN__" is reserved for the evidence channel.'],
    ["__AURA3D_GAME__", 'EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.']
  ])(
    "rejects the reserved alias %s without changing the evidence globals",
    (alias, message) => {
      const registry = { existing: { untouched: true } };
      const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true, __AURA3D_GAME_EVIDENCE__: registry };

      expect(() => channel(win, "same", "new", [alias])).toThrowError(message);
      expect(win.__AURA3D_GAME_EVIDENCE__).toBe(registry);
      expect(win.__AURA3D_EVIDENCE_OPT_IN__).toBe(true);
      expect(Object.hasOwn(registry, "same")).toBe(false);
    }
  );

  it("does not create a registry or install earlier aliases on a reserved beacon alias", () => {
    const win: FakeWindow = {};
    expect(() => channel(win, "standalone", "new", ["__PARTIAL_ALIAS__", "__AURA3D_GAME__"]))
      .toThrowError('EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.');
    expect(Reflect.ownKeys(win)).toEqual([]);
  });

  it.each(["explicit window", "global window"] as const)(
    "rejects the game beacon alias before reading or modifying %s",
    (transport) => {
      const readRegistry = vi.fn(() => { throw new Error("registry getter must not run"); });
      const writeRegistry = vi.fn();
      const readBeacon = vi.fn(() => { throw new Error("beacon getter must not run"); });
      const win: FakeWindow = {};
      Object.defineProperty(win, "__AURA3D_GAME_EVIDENCE__", {
        configurable: true, enumerable: true, get: readRegistry, set: writeRegistry
      });
      Object.defineProperty(win, "__AURA3D_GAME__", {
        configurable: true, enumerable: false, get: readBeacon
      });
      const before = Object.getOwnPropertyDescriptors(win);
      const collect = vi.fn();
      const loader = vi.fn(async () => ({}));
      vi.stubGlobal("window", transport === "global window" ? win : undefined);
      let installed: ReturnType<typeof installEvidenceChannel> | undefined;
      try {
        expect(() => {
          installed = installEvidenceChannel({
            ...(transport === "explicit window" ? { win } : {}),
            id: "standalone", builtins: { section: collect }, loader,
            legacyGlobals: ["__PARTIAL_ALIAS__", "__AURA3D_GAME__", "__AFTER_ALIAS__"]
          });
        }).toThrowError('EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.');
        expect(Object.getOwnPropertyDescriptors(win)).toEqual(before);
        expect(readRegistry).not.toHaveBeenCalled();
        expect(writeRegistry).not.toHaveBeenCalled();
        expect(readBeacon).not.toHaveBeenCalled();
        expect(collect).not.toHaveBeenCalled();
        expect(loader).not.toHaveBeenCalled();
      } finally {
        try { installed?.dispose(); } finally { vi.unstubAllGlobals(); }
      }
    }
  );

  it("leaves a channel without a window inert even when a beacon alias is configured", () => {
    const collect = vi.fn();
    const loader = vi.fn(async () => ({}));
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("__AURA3D_GAME__", { owner: "non-window beacon" });
    vi.stubGlobal("__AURA3D_GAME_EVIDENCE__", { owner: "non-window evidence" });
    const beacon = Object.getOwnPropertyDescriptor(globalThis, "__AURA3D_GAME__");
    const registry = Object.getOwnPropertyDescriptor(globalThis, "__AURA3D_GAME_EVIDENCE__");
    try {
      const installed = installEvidenceChannel({
        id: "headless", builtins: { section: collect }, loader, legacyGlobals: ["__AURA3D_GAME__"]
      });
      installed.dispose();
      installed.dispose();
      expect(Object.getOwnPropertyDescriptor(globalThis, "__AURA3D_GAME__")).toEqual(beacon);
      expect(Object.getOwnPropertyDescriptor(globalThis, "__AURA3D_GAME_EVIDENCE__")).toEqual(registry);
      expect(collect).not.toHaveBeenCalled();
      expect(loader).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not even inspect aliases when no window-backed transport exists", () => {
    const readAliases = vi.fn(() => { throw new Error("headless aliases must not be read"); });
    const options = { id: "headless", builtins: {} };
    Object.defineProperty(options, "legacyGlobals", { get: readAliases });
    vi.stubGlobal("window", undefined);
    try {
      const installed = installEvidenceChannel(options);
      installed.dispose();
      expect(readAliases).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("checks an explicit window without changing either it or the ambient window", () => {
    const ambient: FakeWindow = { marker: "ambient" };
    const explicit: FakeWindow = { marker: "explicit" };
    Object.defineProperty(explicit, "__AURA3D_GAME__", {
      configurable: true, enumerable: false, writable: false, value: { external: true }
    });
    const ambientBefore = Object.getOwnPropertyDescriptors(ambient);
    const explicitBefore = Object.getOwnPropertyDescriptors(explicit);
    vi.stubGlobal("window", ambient);
    try {
      expect(() => channel(explicit, "explicit", "new", ["__NORMAL__", "__AURA3D_GAME__"]))
        .toThrowError('EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.');
      expect(Object.getOwnPropertyDescriptors(explicit)).toEqual(explicitBefore);
      expect(Object.getOwnPropertyDescriptors(ambient)).toEqual(ambientBefore);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("allows the beacon name as a registry id and continues to support ordinary aliases", () => {
    const win: FakeWindow = { __AURA3D_EVIDENCE_OPT_IN__: true };
    const installed = channel(win, "__AURA3D_GAME__", "independent", ["__aura3d_game__", "__ORDINARY__"]);
    const registry = win.__AURA3D_GAME_EVIDENCE__!;
    try {
      expect(owner(registry.__AURA3D_GAME__)).toBe("independent");
      expect(win.__aura3d_game__).toBe(registry.__AURA3D_GAME__);
      expect(win.__ORDINARY__).toBe(registry.__AURA3D_GAME__);
      expect(Object.hasOwn(win, "__AURA3D_GAME__")).toBe(false);
    } finally {
      installed.dispose();
    }
    expect(Object.hasOwn(registry, "__AURA3D_GAME__")).toBe(false);
    expect(Object.hasOwn(win, "__aura3d_game__")).toBe(false);
    expect(Object.hasOwn(win, "__ORDINARY__")).toBe(false);
  });
});
