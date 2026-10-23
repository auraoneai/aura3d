/**
 * The capture policy as a pure function over `SimState`: the original's own QA autopilot
 * (`qaAutopilotActions`) plus ability extras (form change, clones, Rasenshuriken, dash). It mirrors
 * the policy in tools/crayon-capture/ninja-runner-lib.ts so the port can re-derive the reference run
 * live (`?autopilot=1`) and a test can prove the two agree.
 */
import { isEnemy, qaAutopilotActions, type Action, type SimState } from "./sim";

export interface PolicyParams {
  useForm: boolean;
  useKurama: boolean;
  kuramaChakra: number;
  useClones: boolean;
  useShuriken: boolean;
  useDash: boolean;
  cloneChakra: number;
  cloneRange: number;
  shurikenChakra: number;
  shurikenCluster: number;
  shurikenRange: number;
  dashChakra: number;
  dashRange: number;
}

export const QA_ONLY_POLICY: PolicyParams = {
  useForm: false, useKurama: false, kuramaChakra: 150, useClones: false, useShuriken: false, useDash: false,
  cloneChakra: 200, cloneRange: 22, shurikenChakra: 150, shurikenCluster: 2, shurikenRange: 30, dashChakra: 280, dashRange: 14
};

export const DEFAULT_POLICY: PolicyParams = { ...QA_ONLY_POLICY, useForm: true, useKurama: true, useClones: true, useShuriken: true, useDash: true };

/** Actions for this step, in the order the capture applies them. */
export function policyActions(z: SimState, p: PolicyParams): Action[] {
  const actions = qaAutopilotActions(z);
  const fighters = z.entities.filter((t) => t.alive && t.type !== "chakra" && t.type !== "beam" && t.type !== "barrier" && t.s > z.s);
  let nearest: (typeof fighters)[number] | null = null;
  for (const t of fighters) if (nearest === null || t.s < nearest.s) nearest = t;
  const dist = nearest ? nearest.s - z.s : 1e9;
  if (p.useForm && z.s >= 612 && z.form === "base") actions.push("cycleForm");
  if (p.useKurama && z.s >= 1630 && z.form === "sage" && z.chakra >= p.kuramaChakra) actions.push("cycleForm");
  if (p.useClones && z.chakra >= p.cloneChakra && z.clones <= 0 && z.cloneCooldown <= 0 && dist < p.cloneRange) actions.push("clones");
  if (p.useShuriken && z.chakra >= p.shurikenChakra && z.shurikenCooldown <= 0 && z.attack <= 0 && fighters.filter((t) => t.s - z.s < p.shurikenRange).length >= p.shurikenCluster) actions.push("rasenshuriken");
  if (p.useDash && z.chakra >= p.dashChakra && z.dashCooldown <= 0 && z.dash <= 0 && dist < p.dashRange) actions.push("dash");
  return actions;
}

// `isEnemy` is re-exported so renderers can classify entities without importing sim internals twice.
export { isEnemy };
