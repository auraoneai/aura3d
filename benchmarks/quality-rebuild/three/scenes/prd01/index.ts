/**
 * Lane prd01 three adapter index (CONTRACTS.md §3.8). three@0.185.1 renders the
 * same `scenes/prd01` specs as the Aura adapter.
 */

import type { ReadyPayload } from "../../../shared/types";
import { PRD01_SCENE_SPECS } from "../../../scenes/prd01/index";
import { mountThreeLaneScene } from "./common";

export interface LaneSceneAdapter {
  readonly id: string;
  mount(host: HTMLElement): Promise<ReadyPayload>;
}

export const scenes: readonly LaneSceneAdapter[] = Object.keys(PRD01_SCENE_SPECS).map((id) => ({
  id,
  mount: (host: HTMLElement) => mountThreeLaneScene(id, PRD01_SCENE_SPECS[id]!, host)
}));
