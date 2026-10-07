/**
 * Lane prd01 Aura adapter index (CONTRACTS.md §3.8). Every entry mounts one
 * lane scene through the public `createAuraApp` path; the scene spec lives in
 * `scenes/prd01` and is shared with the three adapter.
 */

import type { ReadyPayload } from "../../../shared/types";
import { PRD01_SCENE_SPECS } from "../../../scenes/prd01/index";
import { mountAuraLaneScene } from "./common";

export interface LaneSceneAdapter {
  readonly id: string;
  mount(host: HTMLElement): Promise<ReadyPayload>;
}

export const scenes: readonly LaneSceneAdapter[] = Object.keys(PRD01_SCENE_SPECS).map((id) => ({
  id,
  mount: (host: HTMLElement) => mountAuraLaneScene(id, PRD01_SCENE_SPECS[id]!, host)
}));
