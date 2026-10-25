/**
 * The capture policy as a pure function over `SimState`: the original's own QA autopilot
 * (`qaAutopilotActions`) plus ability extras (form change, clones, Spiralstar, dash). It mirrors
 * the policy in tools/crayon-capture/ninja-runner-lib.ts so the port can re-derive the reference run
 * live (`?autopilot=1`) and a test can prove the two agree.
 */
import { isEnemy, qaAutopilotActions, type Action, type SimState } from "./sim";

export interface PolicyParams {
  useForm: boolean;
  useBeast: boolean;
  beastSpirit: number;
  useClones: boolean;
  useShuriken: boolean;
  useDash: boolean;
  cloneSpirit: number;
  cloneRange: number;
  shurikenSpirit: number;
  shurikenCluster: number;
  shurikenRange: number;
  dashSpirit: number;
  dashRange: number;
}

export const QA_ONLY_POLICY: PolicyParams = {
  useForm: false, useBeast: false, beastSpirit: 150, useClones: false, useShuriken: false, useDash: false,
  cloneSpirit: 200, cloneRange: 22, shurikenSpirit: 150, shurikenCluster: 2, shurikenRange: 30, dashSpirit: 280, dashRange: 14
};

export const DEFAULT_POLICY: PolicyParams = { ...QA_ONLY_POLICY, useForm: true, useBeast: true, useClones: true, useShuriken: true, useDash: true };

/** Actions for this step, in the order the capture applies them. */
export function policyActions(z: SimState, p: PolicyParams): Action[] {
  const actions = qaAutopilotActions(z);
  const fighters = z.entities.filter((t) => t.alive && t.type !== "spirit" && t.type !== "beam" && t.type !== "barrier" && t.s > z.s);
  let nearest: (typeof fighters)[number] | null = null;
  for (const t of fighters) if (nearest === null || t.s < nearest.s) nearest = t;
  const dist = nearest ? nearest.s - z.s : 1e9;
  if (p.useForm && z.s >= 612 && z.form === "base") actions.push("cycleForm");
  if (p.useBeast && z.s >= 1630 && z.form === "sage" && z.spirit >= p.beastSpirit) actions.push("cycleForm");
  if (p.useClones && z.spirit >= p.cloneSpirit && z.clones <= 0 && z.cloneCooldown <= 0 && dist < p.cloneRange) actions.push("clones");
  if (p.useShuriken && z.spirit >= p.shurikenSpirit && z.shurikenCooldown <= 0 && z.attack <= 0 && fighters.filter((t) => t.s - z.s < p.shurikenRange).length >= p.shurikenCluster) actions.push("spiralstar");
  if (p.useDash && z.spirit >= p.dashSpirit && z.dashCooldown <= 0 && z.dash <= 0 && dist < p.dashRange) actions.push("dash");
  return actions;
}

// `isEnemy` is re-exported so renderers can classify entities without importing sim internals twice.
export { isEnemy };
