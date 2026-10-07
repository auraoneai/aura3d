// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLabelNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";

type AuraLabelOptions = Partial<Omit<AuraLabelNode, "kind" | "label" | "text">>;

type AuraAnchorLabelOptions = Partial<Omit<AuraLabelNode, "kind" | "label" | "text" | "target">>;

export const labels = {
  billboard: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "billboard",
    text,
    color: options.color ?? "#e0f2fe",
    background: options.background ?? "#020617",
    size: options.size ?? 0.42,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  anchor: (text: string, target: string, options: AuraAnchorLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "anchor",
    text,
    target,
    color: options.color ?? "#e0f2fe",
    background: options.background ?? "#020617",
    size: options.size ?? 0.38,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  axisTick: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "axis-tick",
    text,
    color: options.color ?? "#bfdbfe",
    background: options.background ?? "#0f172a",
    size: options.size ?? 0.26,
    collisionAvoidance: options.collisionAvoidance ?? true,
    occlusionAware: options.occlusionAware ?? true,
    ...options
  }),
  callout: (text: string, target: string, options: AuraAnchorLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "callout",
    text,
    target,
    leader: options.leader ?? true,
    color: options.color ?? "#fde68a",
    background: options.background ?? "#111827",
    size: options.size ?? 0.34,
    collisionAvoidance: options.collisionAvoidance ?? true,
    ...options
  }),
  hud: (text: string, options: AuraLabelOptions = {}): AuraNodeBuilder<AuraLabelNode> => new AuraNodeBuilder({
    kind: "label",
    label: "hud",
    text,
    color: options.color ?? "#f8fafc",
    background: options.background ?? "#020617",
    size: options.size ?? 0.32,
    screenAnchor: options.screenAnchor ?? "top-left",
    ...options
  })
} as const;
