import { describe, expect, it } from "vitest";

import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor, type AuraFramePhase, type FrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { classifyFrameDepthRequirements } from "../../../packages/rendering/src/renderer/FrameDepthRequirements";

const FLAG_A = "A3D_QR_TEST_DEPTH_A" as const;
const FLAG_B = "A3D_QR_TEST_DEPTH_B" as const;
const OFF = createTrustedQrFlags({});
const APP_A = createTrustedQrFlags({ [FLAG_A]: true });
const APP_B = createTrustedQrFlags({ [FLAG_B]: true });

function contributor(id: string, flag: typeof FLAG_A | typeof FLAG_B, phase: AuraFramePhase = "after-opaque"): FrameContributor {
  return { id, owner: "prd01", flag, phases: [phase], passes: () => [] };
}

describe("frame depth requirement preflight", () => {
  it("returns no sampled-depth requirement only with trusted flags and a proven depth-free post route", () => {
    expect(classifyFrameDepthRequirements(OFF, "none")).toBe("none");

    // These values can describe a depth reader, an unsupported stage, or
    // unexamined metadata. None certifies a resolved-only consumer.
    for (const post of [undefined, null, false, "before-opaque", "after-opaque", "transparent", "after-output", "resolved-after-opaque", "live-single-sample"]) {
      expect(classifyFrameDepthRequirements(OFF, post)).toBe("live-single-sample");
    }
  });

  it("does not trust or evaluate a custom flag object or a proxy of trusted flags", () => {
    let calls = 0;
    const custom: QrFlags = { values: Object.freeze({}), on: () => { calls += 1; throw new Error("unexpected flag callback"); } };
    expect(classifyFrameDepthRequirements(custom, "none")).toBe("live-single-sample");
    expect(classifyFrameDepthRequirements(new Proxy(OFF, {}), "none")).toBe("live-single-sample");
    expect(calls).toBe(0);
  });

  it("does not inspect or coerce unproven post descriptors", () => {
    let reads = 0;
    const unknownPost = new Proxy({}, { get() { reads += 1; throw new Error("post descriptor read"); } });
    expect(classifyFrameDepthRequirements(OFF, unknownPost)).toBe("live-single-sample");
    expect(reads).toBe(0);
  });

  it("rechecks mixed providers as registry membership changes", () => {
    const removeA = registerFrameContributor(contributor("prd01.depth-requirement-a", FLAG_A));
    const removeB = registerFrameContributor(contributor("prd01.depth-requirement-b", FLAG_B, "transparent"));
    try {
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
      expect(classifyFrameDepthRequirements(APP_B, "none")).toBe("live-single-sample");
      expect(classifyFrameDepthRequirements(OFF, "none")).toBe("none");
      removeA();
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("none");
      expect(classifyFrameDepthRequirements(APP_B, "none")).toBe("live-single-sample");
    } finally {
      removeA();
      removeB();
    }
    expect(classifyFrameDepthRequirements(APP_B, "none")).toBe("none");
  });

  it("does not certify a provider from its id, phases, frozen metadata, or a replacement", () => {
    const phases = Object.freeze(["after-opaque"] as const);
    const first = Object.freeze({ id: "prd01.depth-requirement-known-looking", owner: "prd01" as const, flag: FLAG_A, phases, passes: () => [] });
    const removeFirst = registerFrameContributor(first);
    try {
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
    } finally {
      removeFirst();
    }

    const replacement = Object.freeze({ ...first });
    const removeReplacement = registerFrameContributor(replacement);
    try {
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
    } finally {
      removeReplacement();
    }

    const mutable = contributor("prd01.depth-requirement-mutable", FLAG_A);
    const removeMutable = registerFrameContributor(mutable);
    try {
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
      (mutable.phases as AuraFramePhase[]).push("collect");
      Object.assign(mutable, { flag: FLAG_B, passes: () => { throw new Error("must not be called"); } });
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
    } finally {
      removeMutable();
    }
  });

  it("keeps accessor-backed flag metadata potentially active without invoking any provider code", () => {
    let flagReads = 0;
    let callbacks = 0;
    const entry: FrameContributor = {
      id: "prd01.depth-requirement-accessor", owner: "prd01", phases: ["after-opaque"],
      get flag() { flagReads += 1; return FLAG_A; },
      get passes(): never { callbacks += 1; throw new Error("passes getter"); }
    };
    const remove = registerFrameContributor(entry);
    try {
      expect(classifyFrameDepthRequirements(OFF, "none")).toBe("live-single-sample");
      expect(flagReads).toBe(0);
      expect(callbacks).toBe(0);
    } finally {
      remove();
    }
  });

  it("contains proxy metadata failures at registration and never touches the proxy during preflight", () => {
    let descriptorTraps = 0;
    let laterReads = 0;
    let registered = false;
    const entry = new Proxy(contributor("prd01.depth-requirement-proxy", FLAG_A), {
      getOwnPropertyDescriptor(target, key) {
        if (key === "flag") { descriptorTraps += 1; throw new Error("no descriptor"); }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get(target, key, receiver) {
        if (registered) { laterReads += 1; throw new Error("provider read"); }
        return Reflect.get(target, key, receiver);
      }
    });
    const remove = registerFrameContributor(entry);
    registered = true;
    try {
      expect(classifyFrameDepthRequirements(OFF, "none")).toBe("live-single-sample");
      expect(descriptorTraps).toBe(1);
      expect(laterReads).toBe(0);
    } finally {
      remove();
    }
  });

  it("does not reuse results across app flags, view post routes, frames, or registry changes", () => {
    expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("none");
    expect(classifyFrameDepthRequirements(APP_A, "live-single-sample")).toBe("live-single-sample");
    const remove = registerFrameContributor(contributor("prd01.depth-requirement-frame", FLAG_A, "collect"));
    try {
      expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("live-single-sample");
      expect(classifyFrameDepthRequirements(APP_B, "none")).toBe("none");
      expect(classifyFrameDepthRequirements(APP_B, "resolved-after-opaque")).toBe("live-single-sample");
    } finally {
      remove();
    }
    expect(classifyFrameDepthRequirements(APP_A, "none")).toBe("none");
  });
});
