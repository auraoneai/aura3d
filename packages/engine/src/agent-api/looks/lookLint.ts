// PRD-13 T1.4/T1.5 — lookLint rule bodies (C-34; PRD §6.2). The registry host
// lives in `contracts/looks.ts`; this module owns the PRD-13 rules plus the
// replaceable defaults for lane-owned codes (`look/ambient-flattens` → prd02,
// `look/fake-effect-names` → prd07, `look/capture-branch` → prd09). The
// `look/evidence-only-feel` code stays reserved for prd08 — no default emits.

import type { AuraColor, AuraEffectNode, AuraLightNode, AuraPrimitiveNode, AuraSceneNode, AuraSceneSnapshot } from "../index.js";
import { groups } from "../index.js";
import type { AuraLookId, AuraLookLintFinding, AuraLookLintRule } from "../../contracts/looks.js";
import {
  lookLintRegisteredCodes,
  registerLookLintDefaults,
  registerLookLintRule,
  setLookLintDefaultsProvider
} from "../../contracts/looks.js";
import { isFakeEffectName } from "./fakeEffectNames.js";
import { lookPresets } from "./lookPresets.js";

const warning = (code: AuraLookLintFinding["code"], message: string, nodes?: readonly string[]): AuraLookLintFinding =>
  ({ code, severity: "warning", message, ...(nodes && nodes.length > 0 ? { nodes } : {}) });

const nodeName = (node: AuraSceneNode): string =>
  ("name" in node && node.name !== undefined ? node.name : undefined) ?? node.kind;

function flatten(snapshot: AuraSceneSnapshot): readonly AuraSceneNode[] {
  return groups.flatten(snapshot.nodes);
}

/** Every node including groups (flatten drops them); fake names hide on either. */
function allNodes(snapshot: AuraSceneSnapshot): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  const walk = (nodes: readonly AuraSceneNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      if (node.kind === "group") walk(node.children);
    }
  };
  walk(snapshot.nodes);
  return out;
}

function hexToSrgb(hex: AuraColor | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}

/** Rec-709 luma on the sRGB components (same weights as index.ts:3544). */
function srgbLuma(hex: AuraColor | undefined): number | null {
  const rgb = hexToSrgb(hex);
  if (!rgb) return null;
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function srgbSaturationValue(hex: AuraColor): { s: number; v: number } | null {
  const rgb = hexToSrgb(hex);
  if (!rgb) return null;
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

function lightNodes(nodes: readonly AuraSceneNode[]): AuraLightNode[] {
  return nodes.filter((node): node is AuraLightNode => node.kind === "light");
}

/** Look ids authored into the snapshot, in order (v0 groups + v1 look nodes). */
export function authoredLookIds(snapshot: AuraSceneSnapshot): readonly AuraLookId[] {
  const ids: AuraLookId[] = [];
  for (const node of snapshot.nodes) {
    if (node.kind === "group" && typeof node.name === "string" && node.name.startsWith("aura-look:")) {
      const id = node.name.slice("aura-look:".length);
      if (id in lookPresets) ids.push(id as AuraLookId);
    }
    const maybeLook = node as { readonly kind?: string; readonly look?: string };
    if (maybeLook.kind === "look" && typeof maybeLook.look === "string") {
      ids.push(maybeLook.look as AuraLookId);
    }
  }
  return ids;
}

const hasEnvironmentNode = (nodes: readonly AuraSceneNode[]): boolean =>
  nodes.some((node) => node.kind === "environment");

const hasFogNode = (nodes: readonly AuraSceneNode[]): boolean =>
  nodes.some((node) => node.kind === "effect" && (node.effect === "fog" || node.effect === "volumetric-fog"));

const isUntexturedPrimitive = (node: AuraSceneNode): node is AuraPrimitiveNode =>
  node.kind === "primitive" &&
  (node as { readonly visible?: boolean }).visible !== false &&
  !(node.material?.texture);

const SUBJECT_NAME = /subject|hero|player|product|character|car\b|vehicle|fighter|ship|avatar/i;

// ---------------------------------------------------------------------------
// PRD-13-owned rules (§6.2 messages verbatim). Lint is advisory: every finding
// is a warning; the template floor and the agent-eval A3 check decide blocking.
// ---------------------------------------------------------------------------

const prd13Rules: readonly AuraLookLintRule[] = [
  {
    code: "look/no-lights",
    owner: "prd13",
    run: (s) =>
      lightNodes(flatten(s)).length === 0
        ? [warning(
            "look/no-lights",
            'Scene has no authored lighting. Add `looks.preset("outdoor-day")` (or another look) or `environments.preset(...)` plus `lights.directional({ shadow: true })`.'
          )]
        : []
  },
  {
    code: "look/ambient-kills-ibl",
    owner: "prd13",
    run: (s, c) => {
      if (c.capabilities.ambientAdditive) return [];
      const nodes = flatten(s);
      if (hasEnvironmentNode(nodes)) return [];
      const ambient = lightNodes(nodes).filter((node) => node.light === "ambient" && node.intensity > 0);
      return ambient.length > 0
        ? [warning(
            "look/ambient-kills-ibl",
            "`lights.ambient` disables environment reflections in this engine version. Remove it and add a look or `environments.*`.",
            ambient.map(nodeName)
          )]
        : [];
    }
  },
  {
    code: "look/no-ibl",
    owner: "prd13",
    run: (s, c) => {
      const noIbl = c.appliedLook !== undefined
        ? c.appliedLook.environment.specularIntensity === 0
        : !hasEnvironmentNode(flatten(s));
      return noIbl ? [warning("look/no-ibl", "No image-based lighting reached the frame.")] : [];
    }
  },
  {
    code: "look/weak-shadow",
    owner: "prd13",
    run: (s, c) => {
      if (c.appliedLook !== undefined) {
        const shadows = c.appliedLook.shadows;
        const weak = shadows === null || shadows.strength === null || shadows.strength < 0.8 || shadows.casterName === null;
        return weak
          ? [warning("look/weak-shadow", "Key light has no full-strength shadow; set `shadow: true` or use a look.")]
          : [];
      }
      const keys = lightNodes(flatten(s)).filter((node) => node.light === "directional" || node.light === "spot");
      const caster = keys.some(
        (node) => node.shadow === true || (typeof node.shadow === "object" && node.shadow !== null)
      );
      return caster
        ? []
        : [warning("look/weak-shadow", "Key light has no full-strength shadow; set `shadow: true` or use a look.")];
    }
  },
  {
    code: "look/low-dpr",
    owner: "prd13",
    run: (_s, c) =>
      c.appliedLook !== undefined && c.appliedLook.pixelRatio < Math.min(c.devicePixelRatio, c.tierCap) - 0.01
        ? [warning("look/low-dpr", "Rendering below device resolution; remove `pixelRatio`/`qualityProfile` overrides.")]
        : []
  },
  {
    code: "look/solid-void",
    owner: "prd13",
    run: (s) => {
      const nodes = flatten(s);
      const luma = srgbLuma(s.background);
      if (luma === null || luma >= 0.06 || hasFogNode(nodes)) return [];
      // §6.2: `space`/`interior-*` (and every preset's declared exception) exempt.
      if (authoredLookIds(s).some((id) => lookPresets[id].backgroundException)) return [];
      return [warning("look/solid-void", "Background is a flat void; use a look with sky/HDRI background or add fog matched to the background.")];
    }
  },
  {
    code: "look/primitive-subject",
    owner: "prd13",
    run: (s) => {
      const nodes = flatten(s);
      const drawItems = nodes.filter(
        (node) => (node.kind === "primitive" || node.kind === "model") && (node as { visible?: boolean }).visible !== false
      );
      const untextured = drawItems.filter(isUntexturedPrimitive);
      const share = drawItems.length === 0 ? 0 : untextured.length / drawItems.length;
      const subject = drawItems.find(
        (node) => node.kind === "primitive" && typeof node.name === "string" && SUBJECT_NAME.test(node.name)
      );
      return share > 0.6 || subject !== undefined
        ? [warning(
            "look/primitive-subject",
            "Scene is mostly flat primitives; resolve real assets with `assets resolve` and keep primitives for set dressing.",
            [...untextured.map(nodeName), ...(subject ? [nodeName(subject)] : [])]
          )]
        : [];
    }
  },
  {
    code: "look/flat-palette",
    owner: "prd13",
    run: (s) => {
      const primaries = flatten(s)
        .filter((node): node is AuraPrimitiveNode => node.kind === "primitive")
        .filter((node) => {
          const sv = node.material?.color !== undefined ? srgbSaturationValue(node.material.color) : null;
          return sv !== null && sv.s > 0.85 && sv.v > 0.8;
        });
      return primaries.length >= 3
        ? [warning("look/flat-palette", "Pure primary colours read as placeholder art; pick from the look palette.", primaries.map(nodeName))]
        : [];
    }
  },
  {
    code: "look/double-aa",
    owner: "prd13",
    run: (s) => {
      // MSAA lives in renderer options outside the snapshot; the observable
      // form of "FXAA on top of MSAA" is an authored fxaa node alongside
      // another anti-alias node.
      const aa = flatten(s).filter(
        (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "anti-alias"
      );
      const fxaa = aa.filter((node) => (node.mode ?? "fxaa") === "fxaa");
      return fxaa.length > 0 && aa.length > 1
        ? [warning("look/double-aa", "FXAA on MSAA softens twice; use `output` preset AA.")]
        : [];
    }
  },
  {
    code: "look/debug-overlay",
    owner: "prd13",
    run: (s, c) =>
      c.production && s.diagnostics.enabled
        ? [warning("look/debug-overlay", "Diagnostics overlay is on in a shipped build.")]
        : []
  },
  {
    code: "look/multiple-looks",
    owner: "prd13",
    run: (s) => {
      const ids = authoredLookIds(s);
      return ids.length > 1
        ? [warning("look/multiple-looks", `Multiple looks authored in one snapshot; the last one wins (${ids[ids.length - 1]}).`, ids)]
        : [];
    }
  },
  {
    code: "look/expansion-mismatch",
    owner: "prd13",
    run: (s, c) => {
      // A v1 `look` node was authored but the mount produced no applied look —
      // or v0 and v1 expansions coexist — the resolved flags disagreed.
      const hasV1 = s.nodes.some((node) => (node as { kind?: string }).kind === "look");
      const hasV0 = s.nodes.some(
        (node) => node.kind === "group" && typeof node.name === "string" && node.name.startsWith("aura-look:")
      );
      if (hasV1 && (hasV0 || c.appliedLook === undefined)) {
        return [warning("look/expansion-mismatch", "Authored look expansion differs from the flags resolved at mount; align `a3d-qr` with the app's `qualityRebuild.flags`.")];
      }
      return [];
    }
  }
];

// ---------------------------------------------------------------------------
// Replaceable defaults for lane-owned codes (T1.5). The capture-branch default
// is inert at runtime: route source is only visible to the static rule in
// `look/lint-static.ts` (T2.18); registering the code keeps the seat warm so
// PRD 09's registration replaces a placeholder instead of throwing.
// ---------------------------------------------------------------------------

const defaultRules: readonly AuraLookLintRule[] = [
  {
    code: "look/ambient-flattens",
    owner: "prd13",
    run: (s) => {
      const nodes = flatten(s);
      if (!hasEnvironmentNode(nodes)) return [];
      const hot = lightNodes(nodes).filter((node) => node.light === "ambient" && node.intensity > 1);
      return hot.length > 0
        ? [warning("look/ambient-flattens", "Ambient above 1 flattens IBL; use `lights.hemisphere` or lower it.", hot.map(nodeName))]
        : [];
    }
  },
  {
    code: "look/fake-effect-names",
    owner: "prd13",
    run: (s) => {
      const fakes = allNodes(s).filter((node) => isFakeEffectName("name" in node ? node.name : undefined));
      return fakes.length > 0
        ? [warning("look/fake-effect-names", "This node imitates an engine feature; use the real feature.", fakes.map(nodeName))]
        : [];
    }
  },
  {
    code: "look/capture-branch",
    owner: "prd13",
    run: () => []
  }
];

/** Idempotent: installs the PRD-13 rules and the replaceable lane defaults,
 *  skipping every code a lane already registered (its version wins). */
export function installLookLintDefaults(): void {
  const registered = new Set(lookLintRegisteredCodes());
  for (const rule of prd13Rules) {
    if (!registered.has(rule.code)) registerLookLintRule(rule);
  }
  registerLookLintDefaults(defaultRules);
}

setLookLintDefaultsProvider(installLookLintDefaults);
